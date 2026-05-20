/**
 * 快报生成器
 * 生成Markdown格式的"总包公号情报"快报
 */

import { AnalyzedArticle, IntelligenceBriefing, EpcTopic, Priority } from './types'

const TOPIC_EMOJI: Record<string, string> = {
  [EpcTopic.CONTRACT]: '📋',
  [EpcTopic.BIDDING]: '🎯',
  [EpcTopic.CLAIMS]: '⚖️',
  [EpcTopic.DESIGN]: '📐',
  [EpcTopic.PROCUREMENT]: '🛒',
  [EpcTopic.CONSTRUCTION]: '🏗️',
  [EpcTopic.SAFETY]: '🛡️',
  [EpcTopic.QUALITY]: '✅',
  [EpcTopic.COST]: '💰',
  [EpcTopic.LEGAL]: '📜',
  [EpcTopic.PROJECT_MGMT]: '📊',
  [EpcTopic.DIGITAL]: '💻',
  [EpcTopic.OTHER]: '🌐'
}

export class BriefingGenerator {
  /**
   * 生成完整快报
   */
  generate(
    articles: AnalyzedArticle[],
    totalScanned: number,
    date: string
  ): IntelligenceBriefing {
    // 只保留干货文章
    const dryGoods = articles.filter(a => a.isDryGood)

    // 按优先级排序：必读 > 推荐 > 参考
    const sorted = this.sortByPriority(dryGoods)

    // 计算热门话题
    const trendingTopics = this.calculateTrendingTopics(sorted)

    // 生成Markdown
    const markdown = this.generateMarkdown(sorted, totalScanned, date, trendingTopics)

    return {
      date,
      generatedAt: new Date().toLocaleString('zh-CN'),
      totalScanned,
      totalDryGood: sorted.length,
      articles: sorted,
      trendingTopics,
      markdown
    }
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
    trendingTopics: Array<{ topic: EpcTopic; count: number }>
  ): string {
    const lines: string[] = []

    // 头部
    lines.push(`## 总包公号情报`)
    lines.push('')
    lines.push(`**日期**: ${date}`)
    lines.push(`**扫描**: ${totalScanned} 篇 | **干货**: ${articles.length} 篇`)

    // 热门话题标签
    if (trendingTopics.length > 0) {
      lines.push('')
      lines.push(`**热点**: ${trendingTopics
        .map(t => `${TOPIC_EMOJI[t.topic] || ''}${t.topic}(${t.count})`)
        .join(' | ')}`)
    }

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

    const topicTags = article.topics
      .map(t => `${TOPIC_EMOJI[t] || ''}${t}`)
      .join(' ')

    lines.push(`**${article.title}**`)
    lines.push(`> 来源: ${article.accountName} | ${topicTags}`)
    lines.push(`> 发布: ${article.publishTime}`)
    lines.push(`> 核心洞见: ${article.coreInsight}`)
    lines.push(`> [查看原文](${article.originalUrl})`)
    lines.push('')

    return lines.join('\n')
  }
}
