/**
 * 文章扫描器
 * 扫描监控公众号列表，获取最近发布的相关文章
 */

import * as fs from 'fs'
import * as path from 'path'
import { WeChatAPI } from '../api'
import { ScannedArticle } from './types'

export class ArticleScanner {
  private api: WeChatAPI
  private keywords: string[]
  private scanHours: number

  constructor(api: WeChatAPI, keywordsFile: string, scanHours: number) {
    this.api = api
    this.scanHours = scanHours
    this.keywords = this.loadKeywords(keywordsFile)
  }

  /**
   * 从文件加载关键词列表
   */
  private loadKeywords(filePath: string): string[] {
    const resolvedPath = path.resolve(filePath)
    if (!fs.existsSync(resolvedPath)) {
      console.log(`  [扫描器] 关键词文件不存在: ${resolvedPath}，将不过滤关键词`)
      return []
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8')
    const keywords = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'))

    console.log(`  [扫描器] 加载了 ${keywords.length} 个关键词`)
    return keywords
  }

  /**
   * 加载公众号监控列表
   */
  loadAccountList(accountListFile: string): string[] {
    const resolvedPath = path.resolve(accountListFile)
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`公众号监控列表文件不存在: ${resolvedPath}`)
    }

    const content = fs.readFileSync(resolvedPath, 'utf-8')
    const accounts = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'))

    console.log(`  [扫描器] 加载了 ${accounts.length} 个监控公众号`)
    return accounts
  }

  /**
   * 扫描所有公众号的最新文章
   */
  async scanAll(accountNames: string[]): Promise<{
    articles: ScannedArticle[]
    errors: Array<{ account: string; error: string }>
  }> {
    const allArticles: ScannedArticle[] = []
    const errors: Array<{ account: string; error: string }> = []
    const cutoffTime = Date.now() / 1000 - this.scanHours * 3600

    // 预热API连接
    await this.api.warmup()

    for (const name of accountNames) {
      try {
        const articles = await this.scanAccount(name, cutoffTime)
        allArticles.push(...articles)
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        errors.push({ account: name, error: msg })
        console.log(`  [扫描器] 扫描公众号 "${name}" 失败: ${msg}`)
      }

      // 账号间延迟，避免触发限流
      await this.sleep(1500 + Math.random() * 1000)
    }

    console.log(`  [扫描器] 扫描完成: ${allArticles.length} 篇相关文章, ${errors.length} 个错误`)
    return { articles: allArticles, errors }
  }

  /**
   * 扫描单个公众号的最新文章
   */
  private async scanAccount(
    accountName: string,
    cutoffTime: number
  ): Promise<ScannedArticle[]> {
    console.log(`  [扫描器] 扫描: ${accountName}`)

    // 搜索公众号
    const account = await this.api.searchAccountWithFuzzyMatch(accountName)
    if (!account) {
      console.log(`  [扫描器] 未找到公众号: ${accountName}`)
      return []
    }

    // 获取最近的文章（只取第一页，通常20篇足够覆盖24小时）
    const result = await this.api.getArticles(account.fakeid, 0, 20)

    if (!result.articles || result.articles.length === 0) {
      return []
    }

    // 过滤：时间范围 + 关键词匹配
    const matched: ScannedArticle[] = []

    for (const article of result.articles) {
      if (!article || !article.create_time) continue

      // 时间过滤
      if (article.create_time < cutoffTime) continue

      // 关键词过滤（标题或摘要匹配）
      const titleAndDigest = `${article.title} ${article.digest}`
      const isRelevant = this.keywords.length === 0 ||
        this.keywords.some(kw => titleAndDigest.includes(kw))

      if (!isRelevant) continue

      matched.push({
        accountName,
        fakeid: account.fakeid,
        title: article.title,
        link: article.link,
        digest: article.digest || '',
        createTime: article.create_time
      })
    }

    console.log(`  [扫描器] ${accountName}: ${matched.length} 篇匹配`)
    return matched
  }

  /**
   * 获取文章全文内容
   */
  async fetchFullContent(article: ScannedArticle): Promise<string> {
    try {
      const content = await this.api.downloadArticle(article.link, {
        format: 'markdown'
      })
      return content || ''
    } catch (error) {
      console.log(`  [扫描器] 获取全文失败 "${article.title}": ${(error as Error).message}`)
      return article.digest
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
