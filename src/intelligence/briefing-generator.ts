/**
 * 快报生成器
 * 生成Markdown格式的"总包公号情报"快报
 */

import { AnalyzedArticle, IntelligenceBriefing, EpcTopic, Priority } from './types'

export class BriefingGenerator {
  /**
   * 生成完整快报
   */
  generate(
    articles: AnalyzedArticle[],
    totalScanned: number,
    date: string,
    accountsScanned: number
  ): IntelligenceBriefing {
    // 只保留干货文章，并按URL去重
    const dryGoods = articles.filter(a => a.isDryGood)
    const seenUrls = new Set<string>()
    const unique = dryGoods.filter(a => {
      if (seenUrls.has(a.originalUrl)) return false
      seenUrls.add(a.originalUrl)
      return true
    })

    // 按优先级排序：必读 > 推荐 > 参考
    const sorted = this.sortByPriority(unique)

    // 计算热门话题（保留数据，不再在快报中展示标签）
    const trendingTopics = this.calculateTrendingTopics(sorted)

    // 生成Markdown（用于PDF和存档）
    const markdown = this.generateMarkdown(sorted, totalScanned, date, accountsScanned)

    return {
      date,
      generatedAt: new Date().toLocaleString('zh-CN'),
      accountsScanned,
      totalScanned,
      totalDryGood: sorted.length,
      articles: sorted,
      trendingTopics,
      markdown
    }
  }

  /**
   * 生成企业微信纯文本格式（复制转发到个人微信也美观）
   */
  generatePlainText(briefing: IntelligenceBriefing): string {
    const lines: string[] = []

    lines.push('总包公号情报')
    lines.push(briefing.date)
    lines.push('')
    lines.push(`扫描${briefing.accountsScanned}个公众号 | 阅读${briefing.totalScanned}篇 | 干货${briefing.totalDryGood}篇`)

    const mustRead = briefing.articles.filter(a => a.priority === Priority.MUST_READ)
    const recommended = briefing.articles.filter(a => a.priority === Priority.RECOMMENDED)
    const reference = briefing.articles.filter(a => a.priority === Priority.REFERENCE)

    const formatSection = (icon: string, title: string, articles: AnalyzedArticle[]) => {
      if (articles.length === 0) return
      lines.push('')
      lines.push(`${icon}${title}(${articles.length}篇)`)
      for (const a of articles) {
        lines.push('')
        lines.push(`◆ ${a.title}`)
        lines.push(`${a.accountName} | ${a.publishTime}`)
        const insight = a.coreInsight.length > 60
          ? a.coreInsight.substring(0, 57) + '...'
          : a.coreInsight
        lines.push(`${insight}`)
        lines.push(`▸ ${a.originalUrl}`)
      }
    }

    formatSection('🔥', '必读', mustRead)
    formatSection('⭐', '推荐', recommended)
    formatSection('📌', '参考', reference)

    if (briefing.articles.length === 0) {
      lines.push('')
      lines.push('今日暂无高价值干货文章。')
      lines.push('监控的公众号在过去24小时内未发布与关注领域相关的实质性干货。')
    }

    lines.push('')
    lines.push('总包圈AI | 每日精选EPC干货')
    lines.push('总包学园：https://epcschool.top')

    return lines.join('\n')
  }

  /**
   * 按优先级排序文章
   */
  private sortByPriority(articles: AnalyzedArticle[]): AnalyzedArticle[] {
    const priorityOrder: Record<string, number> = {
      [Priority.MUST_READ]: 3,
      [Priority.RECOMMENDED]: 2,
      [Priority.REFERENCE]: 1
    }

    return [...articles].sort((a, b) => {
      const pa = priorityOrder[a.priority] ?? 0
      const pb = priorityOrder[b.priority] ?? 0
      if (pb !== pa) return pb - pa
      return b.score.total - a.score.total
    })
  }

  /**
   * 计算热门话题
   */
  private calculateTrendingTopics(articles: AnalyzedArticle[]): Array<{
    topic: EpcTopic
    count: number
  }> {
    const topicCounts = new Map<EpcTopic, number>()

    for (const article of articles) {
      for (const topic of article.topics) {
        topicCounts.set(topic, (topicCounts.get(topic) || 0) + 1)
      }
    }

    return Array.from(topicCounts.entries())
      .map(([topic, count]) => ({ topic, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)
  }

  /**
   * 生成Markdown快报内容
   */
  private generateMarkdown(
    articles: AnalyzedArticle[],
    totalScanned: number,
    date: string,
    accountsScanned: number
  ): string {
    const lines: string[] = []

    // 头部
    lines.push(`## 总包公号情报`)
    lines.push('')
    lines.push(`**日期**: ${date}`)
    lines.push(`**扫描**: ${accountsScanned}个公众号 | ${totalScanned}篇文章 | 干货${articles.length}篇`)
    lines.push('')
    lines.push('---')
    lines.push('')

    // 按优先级分组
    const mustRead = articles.filter(a => a.priority === Priority.MUST_READ)
    const recommended = articles.filter(a => a.priority === Priority.RECOMMENDED)
    const reference = articles.filter(a => a.priority === Priority.REFERENCE)

    if (mustRead.length > 0) {
      lines.push(`### 🔥 必读 (${mustRead.length}篇)`)
      lines.push('')
      for (const article of mustRead) {
        lines.push(this.formatArticle(article))
      }
    }

    if (recommended.length > 0) {
      lines.push(`### ⭐ 推荐 (${recommended.length}篇)`)
      lines.push('')
      for (const article of recommended) {
        lines.push(this.formatArticle(article))
      }
    }

    if (reference.length > 0) {
      lines.push(`### 📌 参考 (${reference.length}篇)`)
      lines.push('')
      for (const article of reference) {
        lines.push(this.formatArticle(article))
      }
    }

    if (articles.length === 0) {
      lines.push('今日暂无高价值干货文章。')
      lines.push('')
      lines.push('> 所监控的公众号在过去24小时内没有发布与关注领域相关的实质性干货内容。')
      lines.push('> 这是一个好迹象，您可以安心处理其他重要事务。')
    }

    lines.push('---')
    lines.push('*总包生态圈AI | 每日为您精选EPC行业干货*')

    return lines.join('\n')
  }

  /**
   * 格式化单篇文章
   */
  private formatArticle(article: AnalyzedArticle): string {
    const lines: string[] = []

    lines.push(`**${article.title}**`)
    lines.push(`> 来源: ${article.accountName} | ${article.publishTime}`)
    lines.push(`> 核心洞见: ${article.coreInsight}`)
    lines.push(`> [查看原文](${article.originalUrl})`)
    lines.push('')

    return lines.join('\n')
  }
}
