/**
 * 情报系统配置管理器
 * 优先级: intelligence.json > .env > 硬编码默认值
 */

import * as fs from 'fs'
import * as path from 'path'
import { IntelligenceConfig } from './types'

const CONFIG_FILE = 'intelligence.json'

const DEFAULT_CONFIG: IntelligenceConfig = {
  scheduleCron: '0 20 * * *',
  scanHours: 24,
  minScore: 8,
  maxSelectedArticles: 10,
  mustReadThreshold: 17,
  recommendedThreshold: 14,
  articlesPerAccount: 20,
  interAccountDelayMin: 3000,
  interAccountDelayMax: 2000,
  contentTruncation: 6000,
  interAnalysisDelay: 500,
  accountListFile: '公众号监控列表.txt',
  keywordsFile: '关注的领域.txt',
  archiveDir: 'archives',
  glm: {
    apiKey: '',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    model: 'glm-4-flash',
    maxTokens: 2048,
    temperature: 0.7,
    minRequestInterval: 200,
    maxRetries: 3
  },
  wecom: {
    webhookUrl: '',
    maxMessageLength: 3800,
    maxRetries: 2,
    messageDelay: 1000
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function deepMerge<T>(target: T, source: Partial<T>): T {
  const result = { ...target } as Record<string, any>
  const src = source as Record<string, any>
  for (const key of Object.keys(src)) {
    if (src[key] !== undefined && src[key] !== null && typeof src[key] === 'object' && !Array.isArray(src[key]) &&
        result[key] !== null && result[key] !== undefined && typeof result[key] === 'object' && !Array.isArray(result[key])) {
      result[key] = deepMerge(result[key], src[key])
    } else if (src[key] !== undefined) {
      result[key] = src[key]
    }
  }
  return result as T
}

function loadEnvOverrides(): Partial<IntelligenceConfig> {
  const env: Partial<IntelligenceConfig> = {}
  const glm: Partial<IntelligenceConfig['glm']> = {}
  const wecom: Partial<IntelligenceConfig['wecom']> = {}

  if (process.env.GLM_API_KEY) glm.apiKey = process.env.GLM_API_KEY
  if (process.env.GLM_BASE_URL) glm.baseUrl = process.env.GLM_BASE_URL
  if (process.env.GLM_MODEL) glm.model = process.env.GLM_MODEL
  if (process.env.WEWORK_WEBHOOK_URL) wecom.webhookUrl = process.env.WEWORK_WEBHOOK_URL

  if (Object.keys(glm).length > 0) env.glm = glm as IntelligenceConfig['glm']
  if (Object.keys(wecom).length > 0) env.wecom = wecom as IntelligenceConfig['wecom']

  return env
}

export class IntelligenceConfigManager {
  private config: IntelligenceConfig
  private configPath: string

  constructor(projectRoot?: string) {
    this.configPath = path.resolve(projectRoot || process.cwd(), CONFIG_FILE)
    this.config = this.load()
  }

  private load(): IntelligenceConfig {
    let config = { ...DEFAULT_CONFIG }

    const envOverrides = loadEnvOverrides()
    config = deepMerge(config, envOverrides)

    if (fs.existsSync(this.configPath)) {
      try {
        const raw = fs.readFileSync(this.configPath, 'utf-8')
        const fileConfig = JSON.parse(raw) as Partial<IntelligenceConfig>
        config = deepMerge(config, fileConfig)
      } catch (e) {
        console.error(`[配置] 读取 ${CONFIG_FILE} 失败: ${(e as Error).message}`)
      }
    }

    return config
  }

  get(): IntelligenceConfig {
    return { ...this.config }
  }

  update(partial: Partial<IntelligenceConfig>): IntelligenceConfig {
    this.config = deepMerge(this.config, partial)
    this.save()
    return this.get()
  }

  reset(): void {
    this.config = { ...DEFAULT_CONFIG }
    this.save()
  }

  reload(): void {
    this.config = this.load()
  }

  private save(): void {
    try {
      const dir = path.dirname(this.configPath)
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }
      fs.writeFileSync(this.configPath, JSON.stringify(this.config, null, 2), 'utf-8')
    } catch (e) {
      console.error(`[配置] 保存 ${CONFIG_FILE} 失败: ${(e as Error).message}`)
    }
  }

  loadAccountList(): string {
    const filePath = path.resolve(this.config.accountListFile)
    if (!fs.existsSync(filePath)) return ''
    return fs.readFileSync(filePath, 'utf-8')
  }

  saveAccountList(content: string): void {
    const filePath = path.resolve(this.config.accountListFile)
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  loadKeywords(): string {
    const filePath = path.resolve(this.config.keywordsFile)
    if (!fs.existsSync(filePath)) return ''
    return fs.readFileSync(filePath, 'utf-8')
  }

  saveKeywords(content: string): void {
    const filePath = path.resolve(this.config.keywordsFile)
    fs.writeFileSync(filePath, content, 'utf-8')
  }

  static getDefault(): IntelligenceConfig {
    return { ...DEFAULT_CONFIG }
  }
}
