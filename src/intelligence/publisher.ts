/**
 * 快报发布器
 * 企业微信Webhook推送 + 本地文件存档
 */

import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { IntelligenceBriefing } from './types'

export interface PublisherOptions {
  maxRetries?: number
  messageDelay?: number
}

export class Publisher {
  private webhookUrl: string
  private archiveDir: string
  private maxMessageLength: number
  private maxRetries: number
  private messageDelay: number

  constructor(
    webhookUrl: string,
    archiveDir: string,
    maxMessageLength: number = 3800,
    options?: PublisherOptions
  ) {
    this.webhookUrl = webhookUrl
    this.archiveDir = archiveDir
    this.maxMessageLength = maxMessageLength
    this.maxRetries = options?.maxRetries ?? 2
    this.messageDelay = options?.messageDelay ?? 1000
  }

  /**
   * 发布快报（企业微信 + 本地存档）
   */
  async publish(briefing: IntelligenceBriefing): Promise<{
    messagesSent: number
    archived: boolean
  }> {
    // 1. 本地存档
    const archived = this.archive(briefing)

    // 2. 推送企业微信
    const messagesSent = await this.pushToWeChat(briefing.markdown)

    return { messagesSent, archived }
  }

  /**
   * 推送到企业微信
   */
  private async pushToWeChat(markdown: string): Promise<number> {
    if (!this.webhookUrl) {
      console.log('  [发布器] 企业微信Webhook未配置，跳过推送')
      return 0
    }

    // 拆分长消息
    const messages = this.splitMessage(markdown)
    let sentCount = 0

    for (const msg of messages) {
      let delivered = false

      for (let attempt = 0; attempt < this.maxRetries && !delivered; attempt++) {
        try {
          const response = await axios.post(
            this.webhookUrl,
            {
              msgtype: 'markdown',
              markdown: { content: msg }
            },
            {
              timeout: 15000,
              headers: { 'Content-Type': 'application/json' }
            }
          )

          if (response.data?.errcode === 0) {
            sentCount++
            delivered = true
            console.log(`  [发布器] 企业微信消息 ${sentCount}/${messages.length} 发送成功`)
          } else {
            console.error(`  [发布器] 企业微信发送失败: ${response.data?.errmsg}`)
          }
        } catch (error) {
          if (attempt === 0) {
            console.log(`  [发布器] 推送失败，2秒后重试...`)
            await this.sleep(2000)
          } else {
            console.error(`  [发布器] 推送企业微信出错(已重试): ${(error as Error).message}`)
          }
        }
      }

      // 消息间隔，避免被限流
      if (messages.length > 1) {
        await this.sleep(this.messageDelay)
      }
    }

    return sentCount
  }

  /**
   * 本地文件存档
   */
  private archive(briefing: IntelligenceBriefing): boolean {
    try {
      if (!fs.existsSync(this.archiveDir)) {
        fs.mkdirSync(this.archiveDir, { recursive: true })
      }

      const filename = `总包公号情报_${briefing.date.replace(/\//g, '-')}.md`
      const filePath = path.join(this.archiveDir, filename)

      fs.writeFileSync(filePath, briefing.markdown, 'utf-8')
      console.log(`  [发布器] 已存档: ${filePath}`)
      return true
    } catch (error) {
      console.error(`  [发布器] 存档失败: ${(error as Error).message}`)
      return false
    }
  }

  /**
   * 拆分消息（企业微信单条消息字节限制）
   */
  private splitMessage(markdown: string): string[] {
    if (Buffer.byteLength(markdown, 'utf-8') <= this.maxMessageLength) {
      return [markdown]
    }

    const messages: string[] = []
    const lines = markdown.split('\n')
    let current = ''

    for (const line of lines) {
      const test = current ? `${current}\n${line}` : line

      if (Buffer.byteLength(test, 'utf-8') > this.maxMessageLength) {
        if (current) {
          messages.push(current)
          current = line
        } else {
          const chars = Math.floor(this.maxMessageLength / 3)
          messages.push(line.substring(0, chars))
        }
      } else {
        current = test
      }
    }

    if (current) {
      messages.push(current)
    }

    // 为续篇消息添加序号
    if (messages.length > 1) {
      messages[0] = `${messages[0]}\n\n> (第1/${messages.length}部分)`
      for (let i = 1; i < messages.length; i++) {
        messages[i] = `> 总包公号情报（续 第${i + 1}/${messages.length}部分）\n\n${messages[i]}`
      }
    }

    return messages
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
