/**
 * PDF生成器
 * 使用 Playwright 将 Markdown 转为精美 PDF
 * 支持封面页、优先级颜色编码、页码页脚
 */

import { chromium, Browser } from 'playwright'
import { PDFDocument } from 'pdf-lib'
import * as fs from 'fs'
import * as path from 'path'
import { IntelligenceBriefing, Priority } from './types'

const COVER_STYLES = `
body {
  margin: 0; padding: 0;
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
}
.cover {
  width: 100%; height: 100vh;
  background: linear-gradient(160deg, #0a1628 0%, #0f2847 40%, #163a5f 100%);
  display: flex; flex-direction: column;
  justify-content: center; align-items: center;
  color: #fff; position: relative; overflow: hidden;
}
.cover::before {
  content: ''; position: absolute;
  top: 0; left: 0; right: 0; height: 4px;
  background: linear-gradient(90deg, #c9a84c, #f0d78c, #c9a84c);
}
.cover::after {
  content: ''; position: absolute;
  bottom: 0; left: 0; right: 0; height: 4px;
  background: linear-gradient(90deg, #c9a84c, #f0d78c, #c9a84c);
}
.cover-title { font-size: 36px; font-weight: 700; letter-spacing: 8px; margin-bottom: 12px; }
.cover-subtitle { font-size: 14px; letter-spacing: 4px; color: #94a3b8; margin-bottom: 40px; }
.cover-date { font-size: 22px; font-weight: 300; color: #f0d78c; letter-spacing: 3px; margin-bottom: 24px; }
.cover-stats { display: flex; gap: 32px; margin-top: 20px; }
.cover-stat { text-align: center; }
.cover-stat-value { font-size: 28px; font-weight: 700; color: #38bdf8; }
.cover-stat-label { font-size: 11px; color: #64748b; margin-top: 4px; letter-spacing: 1px; }
.cover-divider { width: 60px; height: 1px; background: linear-gradient(90deg, transparent, #c9a84c, transparent); margin: 28px auto; }
.cover-footer { position: absolute; bottom: 36px; text-align: center; color: #475569; font-size: 11px; letter-spacing: 1px; }
`

const BODY_STYLES = `
@page { size: A4; margin: 18mm 16mm 26mm 16mm; }
body {
  font-family: 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', sans-serif;
  color: #1e293b; line-height: 1.75; font-size: 17px; letter-spacing: 0.5px;
}
h2 { display: none; }
h3 {
  font-size: 17px; margin-top: 22px; margin-bottom: 10px;
  padding: 6px 0 6px 12px; border-radius: 4px;
}
h3.must-read { color: #dc2626; background: #fef2f2; border-left: 4px solid #dc2626; }
h3.recommended { color: #1d4ed8; background: #eff6ff; border-left: 4px solid #2563eb; }
h3.reference { color: #6b7280; background: #f9fafb; border-left: 4px solid #9ca3af; }
p { margin: 6px 0; }
strong { color: #0f172a; font-size: 17.5px; }
blockquote {
  margin: 8px 0 14px; padding: 10px 14px;
  border-radius: 0 6px 6px 0; page-break-inside: avoid;
}
blockquote.must-read { background: #fff5f5; border-left: 4px solid #dc2626; }
blockquote.recommended { background: #f0f7ff; border-left: 4px solid #2563eb; }
blockquote.reference { background: #f8f9fa; border-left: 4px solid #d1d5db; }
blockquote p { margin: 3px 0; }
a { color: #1d4ed8; text-decoration: none; border-bottom: 1px solid #bfdbfe; }
hr { border: none; height: 1px; background: linear-gradient(90deg, transparent, #cbd5e1, transparent); margin: 18px 0; }
em { color: #64748b; font-size: 11px; }
.header-banner { display: none; }
.article-empty { text-align: center; padding: 40px 0; color: #94a3b8; font-size: 15px; }

.page-footer {
  position: fixed; bottom: -20mm; left: 0; right: 0;
  height: 14mm; display: flex; justify-content: space-between; align-items: center;
  padding: 0 16mm; font-size: 7.5pt; color: #94a3b8;
  border-top: 0.5px solid #e2e8f0;
}
.page-footer span { display: inline-block; }
`

export class PdfGenerator {
  private archiveDir: string

  constructor(archiveDir: string) {
    this.archiveDir = archiveDir
  }

  async generate(briefing: IntelligenceBriefing): Promise<string | null> {
    try {
      if (!fs.existsSync(this.archiveDir)) {
        fs.mkdirSync(this.archiveDir, { recursive: true })
      }

      const filename = `总包公号情报_${briefing.date.replace(/\//g, '-')}.pdf`
      const filePath = path.resolve(this.archiveDir, filename)

      let browser: Browser | null = null
      try {
        browser = await chromium.launch({ headless: true })
        const page = await browser.newPage()

        // 1. Render cover page
        await page.setContent(this.buildCoverHtml(briefing), { waitUntil: 'networkidle' })
        const coverBytes = await page.pdf({
          format: 'A4',
          margin: { top: '0', bottom: '0', left: '0', right: '0' },
          printBackground: true
        })

        // 2. Render body pages with footer
        await page.setContent(this.buildBodyHtml(briefing), { waitUntil: 'networkidle' })
        const bodyBytes = await page.pdf({
          format: 'A4',
          margin: { top: '18mm', bottom: '26mm', left: '16mm', right: '16mm' },
          printBackground: true
        })

        // 3. Merge cover + body using pdf-lib
        const mergedDoc = await PDFDocument.create()

        const coverDoc = await PDFDocument.load(coverBytes)
        const coverPages = await mergedDoc.copyPages(coverDoc, coverDoc.getPageIndices())
        for (const p of coverPages) mergedDoc.addPage(p)

        const bodyDoc = await PDFDocument.load(bodyBytes)
        const bodyPages = await mergedDoc.copyPages(bodyDoc, bodyDoc.getPageIndices())
        for (const p of bodyPages) mergedDoc.addPage(p)

        const finalBytes = await mergedDoc.save()
        fs.writeFileSync(filePath, finalBytes)
      } finally {
        if (browser) await browser.close()
      }

      console.log(`  [PDF] 已生成: ${filePath}`)
      return filePath
    } catch (error) {
      console.error(`  [PDF] 生成失败: ${(error as Error).message}`)
      return null
    }
  }

  private buildCoverHtml(briefing: IntelligenceBriefing): string {
    return `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><style>${COVER_STYLES}</style></head>
<body>
<div class="cover">
  <div class="cover-subtitle">AI驱动的EPC行业情报</div>
  <div class="cover-title">总包公号情报</div>
  <div class="cover-divider"></div>
  <div class="cover-date">${briefing.date}</div>
  <div class="cover-stats">
    <div class="cover-stat">
      <div class="cover-stat-value">${briefing.accountsScanned}</div>
      <div class="cover-stat-label">公众号扫描</div>
    </div>
    <div class="cover-stat">
      <div class="cover-stat-value">${briefing.totalScanned}</div>
      <div class="cover-stat-label">文章阅读</div>
    </div>
    <div class="cover-stat">
      <div class="cover-stat-value">${briefing.totalDryGood}</div>
      <div class="cover-stat-label">干货精选</div>
    </div>
  </div>
  <div class="cover-footer">
    总包圈AI | 每日精选EPC干货<br>epcschool.top
  </div>
</div>
</body></html>`
  }

  private buildBodyHtml(briefing: IntelligenceBriefing): string {
    const sections = this.organizeByPriority(briefing)
    let html = `<!DOCTYPE html>
<html lang="zh-CN">
<head><meta charset="UTF-8"><style>${BODY_STYLES}</style></head>
<body>
<div class="page-footer">
  <span>总包公号情报 | ${briefing.date}</span>
  <span>总包圈AI出品</span>
</div>\n`

    for (const section of sections) {
      html += `<h3 class="${section.cssClass}">${section.icon} ${section.title} (${section.articles.length}篇)</h3>\n`
      for (const a of section.articles) {
        html += `<blockquote class="${section.cssClass}">
<p><strong>${this.esc(a.title)}</strong></p>
<p>来源: ${this.esc(a.accountName)} | ${this.esc(a.publishTime)}</p>
<p>核心洞见: ${this.esc(a.coreInsight)}</p>
<p><a href="${a.originalUrl}">\u{25B8} 查看原文</a></p>
</blockquote>\n`
      }
    }

    if (sections.length === 0) {
      html += '<div class="article-empty">今日暂无高价值干货文章</div>\n'
    }

    html += '</body></html>'
    return html
  }

  private organizeByPriority(briefing: IntelligenceBriefing): Array<{
    title: string; icon: string; cssClass: string
    articles: typeof briefing.articles
  }> {
    const groups = new Map<string, typeof briefing.articles>()
    for (const article of briefing.articles) {
      const list = groups.get(article.priority) || []
      list.push(article)
      groups.set(article.priority, list)
    }

    const order: Array<{ priority: Priority; title: string; icon: string; cssClass: string }> = [
      { priority: Priority.MUST_READ, title: '必读', icon: '\u{1F525}', cssClass: 'must-read' },
      { priority: Priority.RECOMMENDED, title: '推荐', icon: '⭐', cssClass: 'recommended' },
      { priority: Priority.REFERENCE, title: '参考', icon: '\u{1F4CC}', cssClass: 'reference' }
    ]

    const result: Array<{
      title: string; icon: string; cssClass: string
      articles: typeof briefing.articles
    }> = []

    for (const cfg of order) {
      const articles = groups.get(cfg.priority)
      if (articles && articles.length > 0) {
        result.push({ title: cfg.title, icon: cfg.icon, cssClass: cfg.cssClass, articles })
      }
    }

    return result
  }

  private esc(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
  }
}
