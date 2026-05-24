/**
 * 文章扫描器
 * V3.0 - 账号缓存 + 静默限流检测 + 智能重试
 */

import * as fs from 'fs'
import * as path from 'path'
import { WeChatAPI } from '../api'
import { ScannedArticle } from './types'

export interface ScannerOptions {
  articlesPerAccount?: number
  interAccountDelayMin?: number
  interAccountDelayMax?: number
  notFoundRetryDelay?: number
  maxConsecutiveEmpty?: number
}

interface AccountCache {
  [accountName: string]: {
    fakeid: string
    nickname: string
    cachedAt: number
  }
}

const CACHE_FILE = '.account-cache.json'
const CACHE_TTL = 7 * 24 * 3600 * 1000 // 7天过期

export class ArticleScanner {
  private api: WeChatAPI
  private keywords: string[]
  private scanHours: number
  private articlesPerAccount: number
  private interAccountDelayMin: number
  private interAccountDelayMax: number
  private notFoundRetryDelay: number
  private maxConsecutiveEmpty: number
  private accountCache: AccountCache

  constructor(
    api: WeChatAPI,
    keywordsFile: string,
    scanHours: number,
    options?: ScannerOptions
  ) {
    this.api = api
    this.scanHours = scanHours
    this.articlesPerAccount = options?.articlesPerAccount ?? 20
    this.interAccountDelayMin = options?.interAccountDelayMin ?? 3000
    this.interAccountDelayMax = options?.interAccountDelayMax ?? 2000
    this.notFoundRetryDelay = options?.notFoundRetryDelay ?? 60000
    this.maxConsecutiveEmpty = options?.maxConsecutiveEmpty ?? 8
    this.keywords = this.loadKeywords(keywordsFile)
    this.accountCache = this.loadCache()
  }

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

  loadAccountList(accountListFile: string): string[] {
    const resolvedPath = path.resolve(accountListFile)
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`公众号监控列表文件不存在: ${resolvedPath}`)
    }
    const content = fs.readFileSync(resolvedPath, 'utf-8')
    const rawAccounts = content
      .split('\n')
      .map(line => line.trim())
      .filter(line => line.length > 0 && !line.startsWith('#'))
    const accounts = [...new Set(rawAccounts)]
    console.log(`  [扫描器] 加载了 ${accounts.length} 个监控公众号`)
    return accounts
  }

  private loadCache(): AccountCache {
    const cachePath = path.resolve(CACHE_FILE)
    if (fs.existsSync(cachePath)) {
      try {
        const raw = fs.readFileSync(cachePath, 'utf-8')
        const cache = JSON.parse(raw) as AccountCache
        const now = Date.now()
        const valid: AccountCache = {}
        let expired = 0
        for (const [name, info] of Object.entries(cache)) {
          if (now - info.cachedAt < CACHE_TTL) {
            valid[name] = info
          } else {
            expired++
          }
        }
        if (expired > 0) {
          console.log(`  [缓存] 过期 ${expired} 条，保留 ${Object.keys(valid).length} 条`)
        }
        return valid
      } catch {
        return {}
      }
    }
    return {}
  }

  private saveCache(): void {
    const cachePath = path.resolve(CACHE_FILE)
    fs.writeFileSync(cachePath, JSON.stringify(this.accountCache, null, 2), 'utf-8')
  }

  async scanAll(accountNames: string[]): Promise<{
    articles: ScannedArticle[]
    errors: Array<{ account: string; error: string }>
  }> {
    const cutoffTime = Date.now() / 1000 - this.scanHours * 3600

    await this.api.warmup()

    const cachedCount = accountNames.filter(n => this.accountCache[n]).length
    console.log(`  [缓存] 命中 ${cachedCount}/${accountNames.length} 个账号`)

    // 第一轮扫描
    const { articles, notFound, errors } = await this.scanPass(accountNames, cutoffTime, '第一轮')

    this.saveCache()

    // 重试未找到的账号
    if (notFound.length > 0) {
      console.log(`\n  [扫描器] ${notFound.length} 个账号未找到，${this.notFoundRetryDelay / 1000}s 后重试...`)
      await this.sleep(this.notFoundRetryDelay)

      const retryResult = await this.scanPass(notFound, cutoffTime, '重试')
      articles.push(...retryResult.articles)
      errors.push(...retryResult.errors)
      this.saveCache()

      if (retryResult.notFound.length > 0 && retryResult.notFound.length !== notFound.length) {
        // 第二轮重试后仍有失败，再做最后一轮
        if (retryResult.notFound.length > 0) {
          console.log(`\n  [扫描器] 重试后仍有 ${retryResult.notFound.length} 个未找到，${this.notFoundRetryDelay / 1000}s 后最后一轮...`)
          await this.sleep(this.notFoundRetryDelay)
          const finalResult = await this.scanPass(retryResult.notFound, cutoffTime, '最终轮')
          articles.push(...finalResult.articles)
          errors.push(...finalResult.errors)
          this.saveCache()

          if (finalResult.notFound.length > 0) {
            console.log(`\n  [扫描器] 最终仍有 ${finalResult.notFound.length} 个公众号未找到`)
          }
        }
      }
    }

    // 按URL和标题去重
    const seenUrls = new Set<string>()
    const seenTitles = new Set<string>()
    const uniqueArticles = articles.filter(a => {
      if (seenUrls.has(a.link)) return false
      const normalizedTitle = a.title.replace(/\s+/g, '').toLowerCase()
      if (seenTitles.has(normalizedTitle)) return false
      seenUrls.add(a.link)
      seenTitles.add(normalizedTitle)
      return true
    })

    const dedupCount = articles.length - uniqueArticles.length
    if (dedupCount > 0) {
      console.log(`  [扫描器] 去重: ${articles.length} → ${uniqueArticles.length} (移除${dedupCount}篇重复)`)
    }
    console.log(`\n  [扫描器] 全部完成: ${uniqueArticles.length} 篇相关文章, ${errors.length} 个错误`)
    return { articles: uniqueArticles, errors }
  }

  private async scanPass(
    accountNames: string[],
    cutoffTime: number,
    passLabel: string
  ): Promise<{
    articles: ScannedArticle[]
    notFound: string[]
    errors: Array<{ account: string; error: string }>
  }> {
    const articles: ScannedArticle[] = []
    const notFound: string[] = []
    const errors: Array<{ account: string; error: string }> = []
    let consecutiveEmpty = 0

    console.log(`\n  [扫描器] ${passLabel}: ${accountNames.length} 个公众号`)

    for (let i = 0; i < accountNames.length; i++) {
      const name = accountNames[i]!

      if ((i + 1) % 10 === 0) {
        console.log(`  [扫描器] ${passLabel}进度: ${i + 1}/${accountNames.length} (文章: ${articles.length}, 未找到: ${notFound.length})`)
      }

      try {
        const result = await this.scanAccount(name, cutoffTime)

        if (result === 'not_found') {
          notFound.push(name)
          consecutiveEmpty++

          if (consecutiveEmpty >= this.maxConsecutiveEmpty) {
            const backoffTime = Math.min(consecutiveEmpty * 5000, 120000)
            console.log(`  [扫描器] ⚠️ 连续 ${consecutiveEmpty} 个未找到，冷却 ${backoffTime / 1000}s...`)
            await this.sleep(backoffTime)
            consecutiveEmpty = 0
          }
        } else {
          articles.push(...result)
          if (result.length > 0) {
            consecutiveEmpty = 0
          }
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error)
        errors.push({ account: name, error: msg })
        console.log(`  [扫描器] "${name}" 失败: ${msg}`)
      }

      await this.sleep(this.interAccountDelayMin + Math.random() * this.interAccountDelayMax)
    }

    console.log(`  [扫描器] ${passLabel}完成: ${articles.length} 篇文章, ${notFound.length} 未找到`)
    return { articles, notFound, errors }
  }

  private async scanAccount(
    accountName: string,
    cutoffTime: number
  ): Promise<ScannedArticle[] | 'not_found'> {
    console.log(`  [扫描器] 扫描: ${accountName}`)

    // 优先使用缓存
    let fakeid: string | undefined
    const cached = this.accountCache[accountName]
    if (cached) {
      fakeid = cached.fakeid
      console.log(`  [扫描器] 使用缓存: ${cached.nickname}`)
    } else {
      // 搜索公众号
      const account = await this.api.searchAccountWithFuzzyMatch(accountName)
      if (!account) {
        console.log(`  [扫描器] 未找到: ${accountName}`)
        return 'not_found'
      }
      fakeid = account.fakeid
      // 缓存结果
      this.accountCache[accountName] = {
        fakeid: account.fakeid,
        nickname: account.nickname,
        cachedAt: Date.now()
      }
    }

    // 获取文章
    const result = await this.api.getArticles(fakeid, 0, this.articlesPerAccount)
    if (!result.articles || result.articles.length === 0) {
      return []
    }

    // 过滤
    const matched: ScannedArticle[] = []
    for (const article of result.articles) {
      if (!article || !article.create_time) continue
      if (article.create_time < cutoffTime) continue

      const titleAndDigest = `${article.title} ${article.digest}`
      const isRelevant = this.keywords.length === 0 ||
        this.keywords.some(kw => titleAndDigest.includes(kw))
      if (!isRelevant) continue

      matched.push({
        accountName,
        fakeid,
        title: article.title,
        link: article.link,
        digest: article.digest || '',
        createTime: article.create_time
      })
    }

    if (matched.length > 0) {
      console.log(`  [扫描器] ${accountName}: ${matched.length} 篇匹配`)
    }
    return matched
  }

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
