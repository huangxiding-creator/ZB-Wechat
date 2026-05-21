/**
 * 快报发布器
 * 企业微信Webhook推送 + PDF生成 + 邮件发送 + 本地文件存档
 */

import axios from 'axios'
import * as fs from 'fs'
import * as path from 'path'
import { IntelligenceBriefing } from './types'
import { BriefingGenerator } from './briefing-generator'
import { PdfGenerator } from './pdf-generator'
import { EmailSender, EmailConfig } from './email-sender'

export interface PublisherOptions {
  maxRetries?: number
  messageDelay?: number
  emailConfig?: EmailConfig
}

export class Publisher {
  private webhookUrl: string
  private archiveDir: string
  private maxMessageLength: number
  private maxRetries: number
  private messageDelay: number
  private emailConfig?: EmailConfig

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
    this.emailConfig = options?.emailConfig
  }

  /**
   * 发布快报（企业微信 + PDF + 邮件 + 本地存档）
   */
  async publish(
    briefing: IntelligenceBriefing,
    generator: BriefingGenerator
  ): Promise<{
    messagesSent: number
    archived: boolean
    pdfGenerated: boolean
    emailSent: boolean
  }> {
    // 1. 本地存档（Markdown）
    const archived = this.archive(briefing)

    // 2. 生成PDF
    let pdfGenerated = false
    let emailSent = false
    try {
      const pdfGen = new PdfGenerator(this.archiveDir)
      const pdfPath = await pdfGen.generate(briefing)
      if (pdfPath) {
        pdfGenerated = true
        // 3. 发送邮件
        if (this.emailConfig) {
          const sender = new EmailSender(this.emailConfig)
          emailSent = await sender.sendPdf(pdfPath, briefing.date)
        }
      }
    } catch (error) {
      console.error(`  [发布器] PDF/邮件处理出错: ${(error as Error).message}`)
    }

    // 4. 推送企业微信（使用纯文本格式，转发到个人微信也美观）
    const plainText = generator.generatePlainText(briefing)
    const messagesSent = await this.pushToWeChat(plainText)

    return { messagesSent, archived, pdfGenerated, emailSent }
  }

  /**
   * 推送到企业微信（text类型，纯文本格式）
   */
  private async pushToWeChat(plainText: string): Promise<number> {
    if (!this.webhookUrl) {
      console.log('  [发布器] 企业微信Webhook未配置，跳过推送')
      return 0
    }

    const messages = this.splitMessage(plainText)
    let sentCount = 0

    for (const msg of messages) {
      let delivered = false

      for (let attempt = 0; attempt < this.maxRetries && !delivered; attempt++) {
        try {
          const response = await axios.post(
            this.webhookUrl,
            {
              msgtype: 'text',
              text: { content: msg }
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
   * 拆分消息
   */
  private splitMessage(text: string): string[] {
    if (Buffer.byteLength(text, 'utf-8') <= this.maxMessageLength) {
      return [text]
    }

    const messages: string[] = []
    const lines = text.split('\n')
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

    if (messages.length > 1) {
      messages[0] = `${messages[0]}\n\n(第1/${messages.length}部分)`
      for (let i = 1; i < messages.length; i++) {
        messages[i] = `总包公号情报（续 第${i + 1}/${messages.length}部分）\n\n${messages[i]}`
      }
    }

    return messages
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
