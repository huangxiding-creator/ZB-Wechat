/**
 * 总包公号情报系统 - 类型定义
 */

/** 文章维度评分 */
export interface ArticleScore {
  technicalDepth: number    // 技术深度 1-5
  practicalValue: number    // 实操价值 1-5
  novelty: number           // 新颖度 1-5
  epcRelevance: number      // EPC相关度 1-5
  total: number             // 总分
}

/** EPC话题分类枚举 */
export enum EpcTopic {
  CONTRACT = '合同管理',
  BIDDING = '招投标',
  CLAIMS = '索赔与争议',
  DESIGN = '设计管理',
  PROCUREMENT = '采购管理',
  CONSTRUCTION = '施工技术',
  SAFETY = '安全管理',
  QUALITY = '质量控制',
  COST = '造价管理',
  LEGAL = '法律法规',
  PROJECT_MGMT = '项目管理',
  DIGITAL = '数字化转型',
  OTHER = '综合前沿'
}

/** 文章优先级 */
export enum Priority {
  MUST_READ = '🔥必读',
  RECOMMENDED = '⭐推荐',
  REFERENCE = '📌参考'
}

/** 分析后的文章结果 */
export interface AnalyzedArticle {
  accountName: string
  title: string
  publishTime: string
  originalUrl: string
  coreInsight: string
  score: ArticleScore
  priority: Priority
  topics: EpcTopic[]
  isDryGood: boolean
}

/** 扫描到的原始文章 */
export interface ScannedArticle {
  accountName: string
  fakeid: string
  title: string
  link: string
  digest: string
  createTime: number
  fullContent?: string
}

/** 情报快报 */
export interface IntelligenceBriefing {
  date: string
  generatedAt: string
  totalScanned: number
  totalDryGood: number
  articles: AnalyzedArticle[]
  trendingTopics: Array<{
    topic: EpcTopic
    count: number
  }>
  markdown: string
}

/** 情报系统配置 */
export interface IntelligenceConfig {
  /** 运行时间（cron表达式） */
  scheduleCron: string
  /** 扫描时间范围（小时） */
  scanHours: number
  /** 最低推送分数阈值 */
  minScore: number
  /** 公众号监控列表文件路径 */
  accountListFile: string
  /** 关注领域关键词文件路径 */
  keywordsFile: string
  /** 本地存档目录 */
  archiveDir: string
  /** GLM API配置 */
  glm: {
    apiKey: string
    baseUrl: string
    model: string
    maxTokens: number
    temperature: number
  }
  /** 企业微信Webhook */
  wecom: {
    webhookUrl: string
    maxMessageLength: number
  }
}

/** GLM API请求格式 */
export interface GlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

export interface GlmRequest {
  model: string
  messages: GlmMessage[]
  temperature: number
  max_tokens: number
}

export interface GlmResponse {
  id: string
  choices: Array<{
    index: number
    message: {
      role: string
      content: string
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}

/** 运行结果统计 */
export interface IntelligenceRunStats {
  startTime: number
  endTime: number
  durationMs: number
  accountsScanned: number
  articlesScanned: number
  articlesAnalyzed: number
  dryGoodsFound: number
  messagesSent: number
  errors: Array<{
    account: string
    error: string
  }>
}
