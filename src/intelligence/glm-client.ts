/**
 * 智谱 GLM API 客户端
 * 支持速率限制、重试和错误处理
 */

import axios from 'axios'
import { GlmMessage, GlmRequest, GlmResponse } from './types'

interface GlmClientConfig {
  apiKey: string
  baseUrl: string
  model: string
  maxTokens: number
  temperature: number
}

const DEFAULT_CONFIG: Omit<GlmClientConfig, 'apiKey'> = {
  baseUrl: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
  model: 'glm-4-flash',
  maxTokens: 2048,
  temperature: 0.7
}

export class GlmClient {
  private config: GlmClientConfig
  private requestCount = 0
  private lastRequestTime = 0
  private readonly minInterval = 200 // 最小请求间隔200ms

  constructor(config: Partial<GlmClientConfig> & { apiKey: string }) {
    this.config = { ...DEFAULT_CONFIG, ...config }
  }

  /**
   * 发送聊天请求
   */
  async chat(
    systemPrompt: string,
    userPrompt: string,
    options?: { temperature?: number; maxTokens?: number }
  ): Promise<string> {
    await this.enforceRateLimit()

    const messages: GlmMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ]

    const body: GlmRequest = {
      model: this.config.model,
      messages,
      temperature: options?.temperature ?? this.config.temperature,
      max_tokens: options?.maxTokens ?? this.config.maxTokens
    }

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await axios.post<GlmResponse>(
          this.config.baseUrl,
          body,
          {
            headers: {
              'Authorization': `Bearer ${this.config.apiKey}`,
              'Content-Type': 'application/json'
            },
            timeout: 60000
          }
        )

        const content = response.data?.choices?.[0]?.message?.content
        if (!content) {
          throw new Error('GLM返回空内容')
        }

        return content.trim()
      } catch (error) {
        if (attempt < 2) {
          const delay = 1000 * (attempt + 1)
          console.log(`  GLM请求失败，${delay}ms后重试 (${attempt + 1}/3)`)
          await this.sleep(delay)
          continue
        }
        throw error
      }
    }

    throw new Error('GLM请求失败: 超过最大重试次数')
  }

  /**
   * 发送JSON格式请求（要求AI返回结构化JSON）
   */
  async chatJson<T>(
    systemPrompt: string,
    userPrompt: string
  ): Promise<T> {
    const jsonSystemPrompt = `${systemPrompt}\n\n你必须返回合法的JSON格式，不要包含任何markdown标记、注释或额外文本。`
    const raw = await this.chat(jsonSystemPrompt, userPrompt, {
      temperature: 0.3
    })

    // 清理可能的markdown代码块标记
    const cleaned = raw
      .replace(/```json\s*/g, '')
      .replace(/```\s*/g, '')
      .trim()

    try {
      return JSON.parse(cleaned) as T
    } catch {
      throw new Error(`GLM返回内容无法解析为JSON: ${cleaned.substring(0, 200)}`)
    }
  }

  /**
   * 速率限制
   */
  private async enforceRateLimit(): Promise<void> {
    const now = Date.now()
    const elapsed = now - this.lastRequestTime
    if (elapsed < this.minInterval) {
      await this.sleep(this.minInterval - elapsed)
    }
    this.lastRequestTime = Date.now()
    this.requestCount++
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  getRequestCount(): number {
    return this.requestCount
  }
}
