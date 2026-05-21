/**
 * 邮件发送器
 * 通过QQ邮箱SMTP发送PDF附件
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

  async sendPdf(pdfPath: string, date: string): Promise<boolean> {
    if (!fs.existsSync(pdfPath)) {
      console.error('  [邮件] PDF文件不存在:', pdfPath)
      return false
    }

    try {
      const filename = pdfPath.split(/[/\\]/).pop() || 'briefing.pdf'
      await this.transporter.sendMail({
        from: `"总包公号情报系统" <${this.from}>`,
        to: this.to,
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
      console.log(`  [邮件] 已发送PDF到 ${this.to}`)
      return true
    } catch (error) {
      console.error(`  [邮件] 发送失败: ${(error as Error).message}`)
      return false
    }
  }
}
