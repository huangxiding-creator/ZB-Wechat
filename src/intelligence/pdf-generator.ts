/**
 * PDF生成器
 * 使用 Playwright 将 Markdown 转为精美 PDF
 */

import { chromium } from 'playwright'
import { marked } from 'marked'
import * as fs from 'fs'
import * as path from 'path'
import { IntelligenceBriefing } from './types'

const PDF_STYLES = `
@page {
  size: A4;
  margin: 25mm 20mm 25mm 20mm;
}
body {
  font-family: -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
  color: #1a1a2e;
  line-height: 1.8;
  font-size: 14px;
}
h2 {
  font-size: 22px;
  color: #0f3460;
  border-bottom: 3px solid #38bdf8;
  padding-bottom: 8px;
  margin-bottom: 16px;
  letter-spacing: 2px;
}
h3 {
  font-size: 17px;
  color: #e94560;
  margin-top: 24px;
  margin-bottom: 12px;
  padding-left: 10px;
  border-left: 4px solid #e94560;
}
p {
  margin: 6px 0;
}
strong {
  color: #0f3460;
  font-size: 15px;
}
blockquote {
  background: #f0f9ff;
  border-left: 4px solid #38bdf8;
  margin: 10px 0;
  padding: 10px 14px;
  border-radius: 0 6px 6px 0;
  color: #334155;
  font-size: 13px;
}
blockquote p {
  margin: 3px 0;
}
a {
  color: #3b82f6;
  text-decoration: none;
}
hr {
  border: none;
  height: 1px;
  background: linear-gradient(90deg, transparent, #94a3b8, transparent);
  margin: 20px 0;
}
em {
  color: #64748b;
  font-size: 12px;
}
.header-banner {
  text-align: center;
  padding: 20px 0 16px;
  background: linear-gradient(135deg, #0f3460, #16213e);
  color: #fff;
  border-radius: 10px;
  margin-bottom: 20px;
}
.header-banner h2 {
  color: #fff;
  border-bottom: 2px solid #38bdf8;
  font-size: 24px;
}
.header-banner p {
  color: #94a3b8;
  font-size: 13px;
}
.article-card {
  background: #fafbfc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 12px 16px;
  margin: 10px 0;
  page-break-inside: avoid;
}
`

export class PdfGenerator {
  private archiveDir: string

  constructor(archiveDir: string) {
    this.archiveDir = archiveDir
  }

  async generate(briefing: IntelligenceBriefing): Promise<string | null> {
    try {
      const html = this.buildHtml(briefing)
      const pdfPath = await this.renderPdf(html, briefing.date)

      if (pdfPath) {
        console.log(`  [PDF] 已生成: ${pdfPath}`)
      }
      return pdfPath
    } catch (error) {
      console.error(`  [PDF] 生成失败: ${(error as Error).message}`)
      return null
    }
  }

  private buildHtml(briefing: IntelligenceBriefing): string {
    const bodyHtml = marked(briefing.markdown) as string

    return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<style>${PDF_STYLES}</style>
</head>
<body>
<div class="header-banner">
  <h2>总包公号情报</h2>
  <p>${briefing.date} | 扫描${briefing.totalScanned}篇 | 干货${briefing.totalDryGood}篇</p>
</div>
${bodyHtml}
</body>
</html>`
  }

  private async renderPdf(html: string, date: string): Promise<string | null> {
    if (!fs.existsSync(this.archiveDir)) {
      fs.mkdirSync(this.archiveDir, { recursive: true })
    }

    const filename = `总包公号情报_${date.replace(/\//g, '-')}.pdf`
    const filePath = path.resolve(this.archiveDir, filename)

    let browser
    try {
      browser = await chromium.launch({ headless: true })
      const page = await browser.newPage()
      await page.setContent(html, { waitUntil: 'networkidle' })
      await page.pdf({
        path: filePath,
        format: 'A4',
        margin: { top: '20mm', bottom: '20mm', left: '18mm', right: '18mm' },
        printBackground: true
      })
      return filePath
    } finally {
      if (browser) await browser.close()
    }
  }
}
