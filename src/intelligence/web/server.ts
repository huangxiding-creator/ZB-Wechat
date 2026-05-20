/**
 * 总包公号情报系统 - Web 可视化界面服务器
 * 提供 REST API + SSE 实时推送
 */

import express from 'express'
import { EventEmitter } from 'events'
import * as path from 'path'
import * as fs from 'fs'
import { exec } from 'child_process'
import { IntelligenceConfigManager } from '../config'
import { IntelligenceSystem } from '../index'
import { IntelligenceConfig, IntelligenceRunStats } from '../types'

export interface ScanProgress {
  phase: 'idle' | 'scanning' | 'analyzing' | 'generating' | 'publishing' | 'complete' | 'error'
  accountsScanned: number
  accountsTotal: number
  articlesScanned: number
  articlesAnalyzed: number
  dryGoodsFound: number
  currentAccount: string
  errors: number
  message: string
}

export interface SystemStatus {
  mode: 'idle' | 'scanning' | 'scheduled'
  isScanning: boolean
  isSchedulerRunning: boolean
  lastScanTime: string | null
  nextScanTime: string | null
  lastScanStats: IntelligenceRunStats | null
  currentProgress: ScanProgress | null
}

const eventEmitter = new EventEmitter()
eventEmitter.setMaxListeners(100)

let systemStatus: SystemStatus = {
  mode: 'idle',
  isScanning: false,
  isSchedulerRunning: false,
  lastScanTime: null,
  nextScanTime: null,
  lastScanStats: null,
  currentProgress: null
}

let intelligenceSystem: IntelligenceSystem | null = null
let configManager: IntelligenceConfigManager | null = null

function broadcastEvent(event: string, data: unknown): void {
  eventEmitter.emit('update', { event, data, timestamp: Date.now() })
}

function updateProgress(progress: Partial<ScanProgress>): void {
  systemStatus.currentProgress = {
    ...systemStatus.currentProgress ?? {
      phase: 'idle',
      accountsScanned: 0,
      accountsTotal: 0,
      articlesScanned: 0,
      articlesAnalyzed: 0,
      dryGoodsFound: 0,
      currentAccount: '',
      errors: 0,
      message: ''
    },
    ...progress
  } as ScanProgress
  broadcastEvent('scan-progress', systemStatus.currentProgress)
}

export function createIntelligenceWebServer(
  system: IntelligenceSystem,
  cfgManager: IntelligenceConfigManager,
  port: number = 8080
): express.Application {
  intelligenceSystem = system
  configManager = cfgManager

  const app = express()
  app.use(express.json({ limit: '10mb' }))
  app.use(express.static(path.join(__dirname, 'public')))

  // SSE endpoint
  app.get('/api/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    })

    const handler = (data: { event: string; data: unknown; timestamp: number }) => {
      res.write(`event: ${data.event}\ndata: ${JSON.stringify(data.data)}\n\n`)
    }

    eventEmitter.on('update', handler)
    res.write(`event: status\ndata: ${JSON.stringify(systemStatus)}\n\n`)

    req.on('close', () => {
      eventEmitter.off('update', handler)
    })
  })

  // Config CRUD
  app.get('/api/config', (_req, res) => {
    res.json(configManager!.get())
  })

  app.put('/api/config', (req, res) => {
    const updated = configManager!.update(req.body as Partial<IntelligenceConfig>)
    broadcastEvent('config-updated', updated)
    res.json(updated)
  })

  app.post('/api/config/reset', (_req, res) => {
    configManager!.reset()
    broadcastEvent('config-updated', configManager!.get())
    res.json({ ok: true })
  })

  // Account list
  app.get('/api/accounts', (_req, res) => {
    const content = configManager!.loadAccountList()
    const cfg = configManager!.get()
    res.json({ content, path: cfg.accountListFile })
  })

  app.put('/api/accounts', (req, res) => {
    const { content } = req.body as { content: string }
    configManager!.saveAccountList(content)
    broadcastEvent('accounts-updated', {})
    res.json({ ok: true })
  })

  // Keywords
  app.get('/api/keywords', (_req, res) => {
    const content = configManager!.loadKeywords()
    const cfg = configManager!.get()
    res.json({ content, path: cfg.keywordsFile })
  })

  app.put('/api/keywords', (req, res) => {
    const { content } = req.body as { content: string }
    configManager!.saveKeywords(content)
    broadcastEvent('keywords-updated', {})
    res.json({ ok: true })
  })

  // Run control
  app.post('/api/run/scan', (_req, res) => {
    if (systemStatus.isScanning) {
      res.status(400).json({ error: '扫描正在进行中' })
      return
    }

    systemStatus.isScanning = true
    systemStatus.mode = 'scanning'
    updateProgress({ phase: 'scanning', message: '初始化...', accountsScanned: 0, articlesScanned: 0, articlesAnalyzed: 0, dryGoodsFound: 0, errors: 0, currentAccount: '' })
    broadcastEvent('status', systemStatus)

    void intelligenceSystem!.runOnce().then((stats) => {
      systemStatus.isScanning = false
      systemStatus.mode = 'idle'
      systemStatus.lastScanTime = new Date().toISOString()
      systemStatus.lastScanStats = stats
      updateProgress({ phase: 'complete', message: '扫描完成' })
      broadcastEvent('scan-complete', stats)
      broadcastEvent('status', systemStatus)
    }).catch((err) => {
      systemStatus.isScanning = false
      systemStatus.mode = 'idle'
      updateProgress({ phase: 'error', message: (err as Error).message })
      broadcastEvent('status', systemStatus)
    })

    res.json({ message: '扫描已启动' })
  })

  app.post('/api/scheduler/start', (_req, res) => {
    if (systemStatus.isSchedulerRunning) {
      res.status(400).json({ error: '调度器已在运行' })
      return
    }
    intelligenceSystem!.startScheduled()
    systemStatus.isSchedulerRunning = true
    systemStatus.mode = 'scheduled'
    broadcastEvent('status', systemStatus)
    res.json({ message: '调度器已启动' })
  })

  app.post('/api/scheduler/stop', (_req, res) => {
    if (!systemStatus.isSchedulerRunning) {
      res.status(400).json({ error: '调度器未运行' })
      return
    }
    systemStatus.isSchedulerRunning = false
    systemStatus.mode = 'idle'
    broadcastEvent('status', systemStatus)
    res.json({ message: '调度器已停止' })
  })

  app.get('/api/status', (_req, res) => {
    res.json(systemStatus)
  })

  // Archives
  app.get('/api/archives', (_req, res) => {
    const cfg = configManager!.get()
    const archiveDir = path.resolve(cfg.archiveDir)
    if (!fs.existsSync(archiveDir)) {
      res.json({ files: [] })
      return
    }

    const files = fs.readdirSync(archiveDir)
      .filter(f => f.endsWith('.md'))
      .map(f => {
        const filePath = path.join(archiveDir, f)
        const stat = fs.statSync(filePath)
        return {
          name: f,
          date: f.match(/(\d{4}-\d{2}-\d{2})/)?.[1] || '',
          size: stat.size,
          modified: stat.mtime.toISOString()
        }
      })
      .sort((a, b) => b.modified.localeCompare(a.modified))

    res.json({ files })
  })

  app.get('/api/archives/:filename', (req, res) => {
    const cfg = configManager!.get()
    const archiveDir = path.resolve(cfg.archiveDir)
    const filePath = path.join(archiveDir, req.params.filename!)

    if (!filePath.startsWith(archiveDir)) {
      res.status(403).json({ error: '非法路径' })
      return
    }

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: '文件不存在' })
      return
    }

    const content = fs.readFileSync(filePath, 'utf-8')
    res.json({ content, name: req.params.filename })
  })

  // Auto-open browser
  app.listen(port, () => {
    const url = `http://localhost:${port}`
    console.log(`\n  总包公号情报系统 Web UI 已启动: ${url}`)
    const command = process.platform === 'win32'
      ? `cmd /c start "" "${url}"`
      : process.platform === 'darwin'
        ? `open "${url}"`
        : `xdg-open "${url}"`
    exec(command, (err) => {
      if (err) console.log(`  请手动打开浏览器访问: ${url}`)
    })
  })

  return app
}
