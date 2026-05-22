/**
 * 邮件发送器
 * 通过QQ邮箱SMTP发送PDF附件，支持批量发送
 */

import * as nodemailer from 'nodemailer'
import * as fs from 'fs'

export interface EmailConfig {
  host: string
  port: number
  user: string
  pass: string
  to: string
}

const EMAIL_LIST_FILE = '接收情报的邮箱列表.txt'
const SEND_INTERVAL_MS = 5000

export class EmailSender {
  private transporter: nodemailer.Transporter
  private to: string
  private from: string

  constructor(config: EmailConfig) {
    this.to = config.to
    this.from = config.user
    this.transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.port === 465,
      auth: {
        user: config.user,
        pass: config.pass
      }
    })
  }

  /**
   * 加载邮箱列表文件，返回有效邮箱数组
   */
  static loadEmailList(filePath?: string): string[] {
    const target = filePath || EMAIL_LIST_FILE
    if (!fs.existsSync(target)) return []
    const content = fs.readFileSync(target, 'utf-8')
    return content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
  }

  /**
   * 批量发送PDF到所有收件人
   */
  async sendPdfToAllRecipients(pdfPath: string, date: string): Promise<{ sent: number; failed: number }> {
    if (!fs.existsSync(pdfPath)) {
      console.error('  [邮件] PDF文件不存在:', pdfPath)
      return { sent: 0, failed: 0 }
    }

    const recipients = EmailSender.loadEmailList()
    if (recipients.length === 0) {
      console.log('  [邮件] 邮箱列表为空，使用配置中的默认收件人')
      const result = await this.sendPdf(pdfPath, date)
      return { sent: result ? 1 : 0, failed: result ? 0 : 1 }
    }

    console.log(`  [邮件] 共 ${recipients.length} 个收件人`)
    let sent = 0
    let failed = 0

    for (let i = 0; i < recipients.length; i++) {
      const email = recipients[i]!
      const ok = await this.sendPdf(pdfPath, date, email)
      if (ok) {
        sent++
      } else {
        failed++
      }
      if (i < recipients.length - 1) {
        await new Promise(r => setTimeout(r, SEND_INTERVAL_MS))
      }
    }

    return { sent, failed }
  }

  /**
   * 发送PDF到指定收件人（或默认收件人）
   */
  async sendPdf(pdfPath: string, date: string, recipient?: string): Promise<boolean> {
    const to = recipient || this.to
    if (!to) {
      console.error('  [邮件] 无收件人地址')
      return false
    }

    if (!fs.existsSync(pdfPath)) {
      console.error('  [邮件] PDF文件不存在:', pdfPath)
      return false
    }

    try {
      const filename = pdfPath.split(/[/\\]/).pop() || 'briefing.pdf'
      await this.transporter.sendMail({
        from: `"总包公号情报系统" <${this.from}>`,
        to,
        subject: `总包公号情报 ${date}`,
        text: `附件为${date}的"总包公号情报"PDF版本。\n\n— 总包公号情报系统自动发送`,
        attachments: [
          {
            filename,
            path: pdfPath,
            contentType: 'application/pdf'
          }
        ]
      })
      console.log(`  [邮件] 已发送PDF到 ${to}`)
      return true
    } catch (error) {
      console.error(`  [邮件] 发送失败 (${to}): ${(error as Error).message}`)
      return false
    }
  }
}
