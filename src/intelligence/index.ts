#!/usr/bin/env node
/**
 * 总包公号情报系统 - 主入口
 *
 * 功能:
 * 1. 定时扫描监控公众号列表中的最新文章
 * 2. AI驱动的干货筛选、核心观点提炼、多维度评分
 * 3. 智能话题分类与优先级排序
 * 4. 生成"总包公号情报"Markdown快报
 * 5. 推送企业微信 + 本地存档
 */

import * as dotenv from 'dotenv'
dotenv.config()

import * as path from 'path'
import * as fs from 'fs'
import chalk from 'chalk'
import { WeChatAPI } from '../api'
import { GlmClient } from './glm-client'
import { ArticleScanner } from './scanner'
import { ContentAnalyzer } from './analyzer'
import { BriefingGenerator } from './briefing-generator'
import { Publisher, PublisherOptions } from './publisher'
import { Scheduler } from './scheduler'
import { IntelligenceConfigManager } from './config'
import {
  IntelligenceConfig,
  IntelligenceRunStats,
  IntelligenceBriefing
} from './types'

const VERSION = '1.1.0'

class IntelligenceSystem {
  private config: IntelligenceConfig
  private scheduler: Scheduler | null = null

  constructor(config?: Partial<IntelligenceConfig>) {
    const cfgManager = new IntelligenceConfigManager()
    const loaded = cfgManager.get()
    this.config = { ...loaded, ...config }
    if (config?.glm) this.config.glm = { ...loaded.glm, ...config.glm }
    if (config?.wecom) this.config.wecom = { ...loaded.wecom, ...config.wecom }
    this.validateConfig()
  }

  /**
   * 验证配置
   */
  private validateConfig(): void {
    if (!this.config.glm.apiKey) {
      throw new Error('GLM API Key未配置。请在 .env 文件中设置 GLM_API_KEY')
    }
    if (!this.config.wecom.webhookUrl) {
      console.log(chalk.yellow('  企业微信Webhook未配置，将跳过推送'))
    }
  }

  /**
   * 执行一次情报采集
   */
  async runOnce(): Promise<IntelligenceRunStats> {
    const startTime = Date.now()
    console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════╗'))
    console.log(chalk.bold.cyan('║     总包公号情报系统 v' + VERSION + '                  ║'))
    console.log(chalk.bold.cyan('╚══════════════════════════════════════════════╝\n'))

    const stats: IntelligenceRunStats = {
      startTime,
      endTime: 0,
      durationMs: 0,
      accountsScanned: 0,
      articlesScanned: 0,
      articlesAnalyzed: 0,
      dryGoodsFound: 0,
      messagesSent: 0,
      errors: []
    }

    try {
      // 1. 初始化组件
      const apiKey = this.loadWeChatApiKey()
      const wechatApi = new WeChatAPI(apiKey)
      const glmClient = new GlmClient({
        apiKey: this.config.glm.apiKey,
        baseUrl: this.config.glm.baseUrl,
        model: this.config.glm.model,
        maxTokens: this.config.glm.maxTokens,
        temperature: this.config.glm.temperature
      })

      const scanner = new ArticleScanner(
        wechatApi,
        this.config.keywordsFile,
        this.config.scanHours,
        {
          articlesPerAccount: this.config.articlesPerAccount,
          interAccountDelayMin: this.config.interAccountDelayMin,
          interAccountDelayMax: this.config.interAccountDelayMax
        }
      )
      const analyzer = new ContentAnalyzer(glmClient, this.config.minScore, {
        contentTruncation: this.config.contentTruncation,
        interAnalysisDelay: this.config.interAnalysisDelay,
        mustReadThreshold: this.config.mustReadThreshold,
        recommendedThreshold: this.config.recommendedThreshold
      })
      const generator = new BriefingGenerator(this.config.maxSelectedArticles)

      const pubOptions: PublisherOptions = {
        maxRetries: this.config.wecom.maxRetries,
        messageDelay: this.config.wecom.messageDelay
      }

      const emailUser = process.env.EMAIL_USER || ''
      const emailPass = process.env.EMAIL_PASS || ''
      const emailTo = process.env.EMAIL_TO || ''
      if (emailUser && emailPass && emailTo) {
        pubOptions.emailConfig = {
          host: process.env.EMAIL_HOST || 'smtp.qq.com',
          port: parseInt(process.env.EMAIL_PORT || '465', 10),
          user: emailUser,
          pass: emailPass,
          to: emailTo
        }
      }

      const publisher = new Publisher(
        this.config.wecom.webhookUrl,
        this.config.archiveDir,
        this.config.wecom.maxMessageLength,
        pubOptions
      )

      // 2. 加载公众号列表
      console.log(chalk.cyan('📋 加载配置...'))
      const accountNames = scanner.loadAccountList(this.config.accountListFile)
      stats.accountsScanned = accountNames.length

      // 3. 扫描文章
      console.log(chalk.cyan('\n🔍 开始扫描公众号最新文章...'))
      const scanResult = await scanner.scanAll(accountNames)
      stats.articlesScanned = scanResult.articles.length
      stats.errors.push(...scanResult.errors)

      if (scanResult.articles.length === 0) {
        console.log(chalk.yellow('\n  未发现与关注领域相关的新文章'))
        console.log(chalk.yellow('  跳过推送（无文章时不发送空快报）'))

        // 仅存档，不推送企业微信/邮件/PDF
        const briefing = generator.generate([], 0, this.getToday(), stats.accountsScanned)
        const archiveDir = this.config.archiveDir
        const archivePath = path.join(archiveDir, `总包公号情报_${briefing.date.replace(/\//g, '-')}.md`)
        if (!fs.existsSync(archiveDir)) fs.mkdirSync(archiveDir, { recursive: true })
        fs.writeFileSync(archivePath, briefing.markdown, 'utf-8')
        console.log(chalk.gray(`  已存档: ${archivePath}`))

        stats.endTime = Date.now()
        stats.durationMs = stats.endTime - startTime
        return stats
      }

      console.log(chalk.green(`\n  扫描到 ${scanResult.articles.length} 篇相关文章`))

      // 4. AI分析
      console.log(chalk.cyan('\n🤖 AI分析文章内容...'))
      const analysisResult = await analyzer.analyzeBatch(
        scanResult.articles,
        async (article) => scanner.fetchFullContent(article)
      )
      stats.articlesAnalyzed = analysisResult.analyzed.length
      stats.dryGoodsFound = analysisResult.analyzed.filter(a => a.isDryGood).length

      for (const err of analysisResult.errors) {
        stats.errors.push({ account: err.title, error: err.error })
      }

      console.log(chalk.green(`\n  分析完成: ${stats.dryGoodsFound} 篇干货 (共${stats.articlesAnalyzed}篇)`))

      // 5. 生成快报
      console.log(chalk.cyan('\n📝 生成情报快报...'))
      const briefing: IntelligenceBriefing = generator.generate(
        analysisResult.analyzed,
        stats.articlesScanned,
        this.getToday(),
        stats.accountsScanned
      )

      if (stats.dryGoodsFound > briefing.totalDryGood) {
        console.log(chalk.yellow(`  精选裁剪: ${stats.dryGoodsFound}篇干货 → ${briefing.totalDryGood}篇精选`))
      }

      // 6. 发布（企业微信 + PDF + 邮件 + 存档）
      console.log(chalk.cyan('\n📡 发布快报...'))
      const publishResult = await publisher.publish(briefing, generator)
      stats.messagesSent = publishResult.messagesSent

      console.log(chalk.bold.green('\n✨ 情报采集完成!'))
      console.log(chalk.gray(`  扫描公众号: ${stats.accountsScanned} 个`))
      console.log(chalk.gray(`  相关文章: ${stats.articlesScanned} 篇`))
      console.log(chalk.gray(`  干货文章: ${stats.dryGoodsFound} 篇 → 精选 ${briefing.totalDryGood} 篇`))
      console.log(chalk.gray(`  消息推送: ${stats.messagesSent} 条`))
      console.log(chalk.gray(`  GLM调用: ${glmClient.getRequestCount()} 次`))

      if (stats.errors.length > 0) {
        console.log(chalk.yellow(`  错误: ${stats.errors.length} 个`))
        for (const err of stats.errors) {
          console.log(chalk.gray(`    - ${err.account}: ${err.error}`))
        }
      }

    } catch (error) {
      console.error(chalk.red('\n❌ 情报采集失败:'), error)
      stats.errors.push({
        account: '系统',
        error: error instanceof Error ? error.message : String(error)
      })
    }

    stats.endTime = Date.now()
    stats.durationMs = stats.endTime - startTime
    const durationSec = Math.floor(stats.durationMs / 1000)
    console.log(chalk.gray(`\n  耗时: ${durationSec}秒\n`))

    return stats
  }

  /**
   * 启动定时调度模式
   */
  startScheduled(): void {
    console.log(chalk.bold.cyan('\n╔══════════════════════════════════════════════╗'))
    console.log(chalk.bold.cyan('║     总包公号情报系统 v' + VERSION + ' (定时模式)      ║'))
    console.log(chalk.bold.cyan('╚══════════════════════════════════════════════╝\n'))

    this.scheduler = new Scheduler(
      this.config.scheduleCron,
      async () => { await this.runOnce() }
    )

    this.scheduler.start()

    console.log(chalk.gray('\n  按 Ctrl+C 退出\n'))

    // 保持进程运行
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n  正在停止...'))
      if (this.scheduler) {
        this.scheduler.stop()
      }
      process.exit(0)
    })

    process.on('SIGTERM', () => {
      if (this.scheduler) {
        this.scheduler.stop()
      }
      process.exit(0)
    })
  }

  /**
   * 加载微信API Key
   */
  private loadWeChatApiKey(): string {
    const apiKeyFile = path.resolve('.api-key')
    if (fs.existsSync(apiKeyFile)) {
      const key = fs.readFileSync(apiKeyFile, 'utf-8').trim()
      if (key && key.length >= 20) {
        return key
      }
    }

    const envKey = process.env.WECHAT_API_KEY
    if (envKey && envKey.length >= 20) {
      return envKey
    }

    throw new Error(
      '微信API Key未找到。请确保 .api-key 文件存在或设置 WECHAT_API_KEY 环境变量'
    )
  }

  private getToday(): string {
    const now = new Date()
    return `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')}`
  }
}

// CLI入口
async function main() {
  const args = process.argv.slice(2)

  // UI mode
  if (args.includes('--ui')) {
    const portIdx = args.indexOf('--port')
    const port = portIdx >= 0 && args[portIdx + 1]
      ? parseInt(args[portIdx + 1]!, 10)
      : 8080

    const cfgManager = new IntelligenceConfigManager()
    const system = new IntelligenceSystem(cfgManager.get())

    const { createIntelligenceWebServer } = require('./web/server')
    createIntelligenceWebServer(system, cfgManager, port)

    console.log(chalk.gray('\n  按 Ctrl+C 退出\n'))
    process.on('SIGINT', () => {
      console.log(chalk.yellow('\n  正在停止...'))
      process.exit(0)
    })
    return
  }

  // CLI mode
  const mode = args[0] || 'once'
  const cronArg = args.find(a => a.startsWith('--cron='))

  const config: Partial<IntelligenceConfig> = {}
  if (cronArg) {
    config.scheduleCron = cronArg.split('=')[1] || '0 20 * * *'
  }

  const system = new IntelligenceSystem(config)

  switch (mode) {
    case 'schedule':
    case 'scheduled':
    case 'daemon':
      system.startScheduled()
      break
    case 'once':
    default:
      await system.runOnce()
      break
  }
}

// 导出供外部使用
export { IntelligenceSystem, IntelligenceConfig }

// 直接运行
if (require.main === module) {
  main().catch(error => {
    console.error(chalk.red('启动失败:'), error)
    process.exit(1)
  })
}
