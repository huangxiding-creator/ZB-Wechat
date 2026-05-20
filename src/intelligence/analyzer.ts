/**
 * AI内容分析器
 * 使用GLM进行：干货识别、核心观点提炼、多维度评分、话题分类
 */

import { GlmClient } from './glm-client'
import { AnalyzedArticle, ScannedArticle, ArticleScore, EpcTopic, Priority } from './types'

interface AnalysisResult {
  isDryGood: boolean
  coreInsight: string
  score: {
    technicalDepth: number
    practicalValue: number
    novelty: number
    epcRelevance: number
  }
  topics: string[]
}

const SYSTEM_PROMPT = `你是一位拥有20年以上工程总承包实战经验的资深专家。你的任务是分析工程领域公众号文章，判断其是否为有实质干货分享的内容，并提炼出能让读者直接获益的核心洞见。

## 干货判断标准
以下类型属于非干货，必须标记为 isDryGood=false：
- 纯新闻报道（人事变动、会议报道、领导视察）
- 营销推广和广告
- 培训课程推广
- 招聘信息
- 纯活动通知
- 转发新闻无原创分析
- 节日问候/企业文化宣传

以下类型属于干货，标记为 isDryGood=true：
- 工程技术方法与经验分享
- 合同管理与风险分析
- 招投标策略与案例
- 索赔实务与案例分析
- 项目管理经验总结
- 法律法规深度解读
- 造价管理与成本控制经验
- 设计管理与优化案例
- 数字化转型实践经验
- 行业趋势深度分析
- 标准规范对比解读

## coreInsight 洞见提炼规则（极其重要）

coreInsight 是本系统最核心的输出，直接决定用户是否还需要阅读原文。必须遵守以下规则：

1. **禁止写概述**：绝对不要写成"本文介绍了...""文章分析了...""本文通过..."这种空洞的概述
2. **必须提炼硬核观点**：把文章中最有价值的结论、判断、方法、教训或反常识认知，用一句话直接说出来
3. **要有信息增量**：用户看完这句话就能直接获得可操作的知识或认知升级，无需再看原文
4. **优先提炼反常识或颠覆认知的内容**：如果文章中有打破常规认知的观点，必须提炼出来
5. **要有实操指导性**：如果文章提供了具体的方法、策略、判例结论，直接说结论

### 好的 coreInsight 示例（必须这样写）：
- "EPC合同中约定'竣工验收合格后付款'的，承包人可依据《建工司法解释》第27条主张从提交竣工验收报告之日起算利息，不以实际付款审批完成为前提"
- "当凿槽实际规格与定额不一致时，应按实际施工规格套用最近似定额子目并乘以换算系数，而非直接套用定额规格子目——这是大部分造价人员容易踩的坑"
- "联合体模式下，联合体牵头人对分包合同承担连带责任，但可在联合体协议中约定内部追偿比例以规避风险"
- "建设工程争议评审委员会（DAB）的裁决具有临时约束力，28天内未提出异议即生效，这比诉讼保全效率高得多"

### 糟的 coreInsight 示例（绝对不能这样写）：
- "本文介绍了工程总承包合同管理的要点和注意事项"
- "文章通过案例分析探讨了施工合同纠纷的处理方式"
- "对建设工程领域的数字化转型进行了深入探讨"

6. **长度限制**：不超过100字，但信息密度要高

## 评分标准（1-5分）
- technicalDepth: 技术深度，文章是否涉及具体的技术细节和方法论
- practicalValue: 实操价值，读者能否直接在工作中应用
- novelty: 新颖度，是否提供了新的视角、方法或案例
- epcRelevance: EPC相关度，与工程总承包业务的关联程度

## 话题分类（可多选，从以下选项中选择最相关的1-3个）
合同管理、招投标、索赔与争议、设计管理、采购管理、施工技术、安全管理、质量控制、造价管理、法律法规、项目管理、数字化转型、综合前沿

## 输出格式
严格返回JSON，不要包含任何其他文本：
{
  "isDryGood": true/false,
  "coreInsight": "一句话直接说出文章最硬核的观点、结论或反常识洞见，让读者看完就获得信息增量，无需再看原文（不超过100字）",
  "score": {
    "technicalDepth": 1-5,
    "practicalValue": 1-5,
    "novelty": 1-5,
    "epcRelevance": 1-5
  },
  "topics": ["话题1", "话题2"]
}`

export class ContentAnalyzer {
  private glm: GlmClient
  private minScore: number

  constructor(glm: GlmClient, minScore: number) {
    this.glm = glm
    this.minScore = minScore
  }

  /**
   * 分析单篇文章
   */
  async analyze(article: ScannedArticle, fullContent: string): Promise<AnalyzedArticle | null> {
    const inputText = this.truncateContent(fullContent || article.digest)

    const userPrompt = `请分析以下公众号文章：

【公众号】${article.accountName}
【标题】${article.title}
【内容】${inputText}`

    try {
      const raw = await this.glm.chatJson<unknown>(SYSTEM_PROMPT, userPrompt)
      const result = this.validateAnalysisResult(raw)

      const clamp = (v: number) => Math.max(1, Math.min(5, Math.round(v)))
      const score: ArticleScore = {
        technicalDepth: clamp(result.score.technicalDepth),
        practicalValue: clamp(result.score.practicalValue),
        novelty: clamp(result.score.novelty),
        epcRelevance: clamp(result.score.epcRelevance),
        total: 0
      }
      score.total = score.technicalDepth + score.practicalValue +
                    score.novelty + score.epcRelevance

      // 非干货直接返回标记
      if (!result.isDryGood) {
        return {
          accountName: article.accountName,
          title: article.title,
          publishTime: this.formatTime(article.createTime),
          originalUrl: article.link,
          coreInsight: '',
          score,
          priority: Priority.REFERENCE,
          topics: this.mapTopics(result.topics),
          isDryGood: false
        }
      }

      // 低于分数阈值也标记
      if (score.total < this.minScore) {
        return {
          accountName: article.accountName,
          title: article.title,
          publishTime: this.formatTime(article.createTime),
          originalUrl: article.link,
          coreInsight: result.coreInsight,
          score,
          priority: Priority.REFERENCE,
          topics: this.mapTopics(result.topics),
          isDryGood: true
        }
      }

      const priority = this.determinePriority(score)

      return {
        accountName: article.accountName,
        title: article.title,
        publishTime: this.formatTime(article.createTime),
        originalUrl: article.link,
        coreInsight: result.coreInsight,
        score,
        priority,
        topics: this.mapTopics(result.topics),
        isDryGood: true
      }
    } catch (error) {
      console.log(`  [分析器] 分析失败 "${article.title}": ${(error as Error).message}`)
      return null
    }
  }

  /**
   * 批量分析文章
   */
  async analyzeBatch(
    articles: ScannedArticle[],
    contentFetcher: (article: ScannedArticle) => Promise<string>
  ): Promise<{
    analyzed: AnalyzedArticle[]
    errors: Array<{ title: string; error: string }>
  }> {
    const analyzed: AnalyzedArticle[] = []
    const errors: Array<{ title: string; error: string }> = []

    for (const article of articles) {
      try {
        // 获取全文
        const fullContent = await contentFetcher(article)

        // AI分析
        const result = await this.analyze(article, fullContent)

        if (result) {
          analyzed.push(result)
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        errors.push({ title: article.title, error: msg })
      }

      // 分析间隔，避免API限流
      await this.sleep(500)
    }

    return { analyzed, errors }
  }

  /**
   * 确定文章优先级
   */
  private determinePriority(score: ArticleScore): Priority {
    const maxDimension = Math.max(
      score.technicalDepth,
      score.practicalValue,
      score.novelty,
      score.epcRelevance
    )

    if (score.total >= 16 || maxDimension === 5) {
      return Priority.MUST_READ
    }
    if (score.total >= 12) {
      return Priority.RECOMMENDED
    }
    return Priority.REFERENCE
  }

  /**
   * 映射话题字符串到枚举
   */
  private mapTopics(topics: string[]): EpcTopic[] {
    const topicMap: Record<string, EpcTopic> = {
      '合同管理': EpcTopic.CONTRACT,
      '招投标': EpcTopic.BIDDING,
      '索赔与争议': EpcTopic.CLAIMS,
      '设计管理': EpcTopic.DESIGN,
      '采购管理': EpcTopic.PROCUREMENT,
      '施工技术': EpcTopic.CONSTRUCTION,
      '安全管理': EpcTopic.SAFETY,
      '质量控制': EpcTopic.QUALITY,
      '造价管理': EpcTopic.COST,
      '法律法规': EpcTopic.LEGAL,
      '项目管理': EpcTopic.PROJECT_MGMT,
      '数字化转型': EpcTopic.DIGITAL,
      '综合前沿': EpcTopic.OTHER
    }

    return topics
      .map(t => topicMap[t])
      .filter((t): t is EpcTopic => t !== undefined)
  }

  /**
   * 验证AI返回的分析结果结构
   */
  private validateAnalysisResult(raw: unknown): AnalysisResult {
    const r = raw as Record<string, unknown>
    if (!r || typeof r !== 'object') {
      throw new Error('AI返回无效的分析结果')
    }

    const rawScore = (r.score ?? {}) as Record<string, unknown>

    return {
      isDryGood: typeof r.isDryGood === 'boolean' ? r.isDryGood : false,
      coreInsight: typeof r.coreInsight === 'string' ? r.coreInsight : '无法提取核心观点',
      score: {
        technicalDepth: typeof rawScore.technicalDepth === 'number'
          ? rawScore.technicalDepth : 3,
        practicalValue: typeof rawScore.practicalValue === 'number'
          ? rawScore.practicalValue : 3,
        novelty: typeof rawScore.novelty === 'number'
          ? rawScore.novelty : 3,
        epcRelevance: typeof rawScore.epcRelevance === 'number'
          ? rawScore.epcRelevance : 3
      },
      topics: Array.isArray(r.topics)
        ? (r.topics as unknown[]).filter((t): t is string => typeof t === 'string')
        : []
    }
  }

  /**
   * 截断过长内容（GLM token限制）
   */
  private truncateContent(content: string, maxLength: number = 6000): string {
    if (content.length <= maxLength) return content
    return content.substring(0, maxLength) + '...(内容已截断)'
  }

  private formatTime(timestamp: number): string {
    const date = new Date(timestamp * 1000)
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    })
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
