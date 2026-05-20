/**
 * 定时调度器
 * 使用node-cron实现定时运行
 */

import * as cron from 'node-cron'

export class Scheduler {
  private task: cron.ScheduledTask | null = null
  private cronExpression: string
  private handler: () => Promise<void>
  private isRunning = false

  constructor(cronExpression: string, handler: () => Promise<void>) {
    this.cronExpression = cronExpression
    this.handler = handler
  }

  /**
   * 启动定时任务
   */
  start(): void {
    if (this.task) {
      console.log('  [调度器] 定时任务已在运行中')
      return
    }

    if (!cron.validate(this.cronExpression)) {
      throw new Error(`无效的cron表达式: ${this.cronExpression}`)
    }

    this.task = cron.schedule(this.cronExpression, async () => {
      if (this.isRunning) {
        console.log('  [调度器] 上一轮任务仍在运行，跳过本次触发')
        return
      }

      this.isRunning = true
      try {
        console.log(`\n  [调度器] 定时任务触发: ${new Date().toLocaleString('zh-CN')}`)
        await this.handler()
      } catch (error) {
        console.error('  [调度器] 定时任务执行失败:', error)
      } finally {
        this.isRunning = false
      }
    }, {
      timezone: 'Asia/Shanghai'
    })

    const nextTime = this.getNextRun()
    console.log(`  [调度器] 定时任务已启动`)
    console.log(`  [调度器] Cron: ${this.cronExpression}`)
    console.log(`  [调度器] 下次执行: ${nextTime}`)
  }

  /**
   * 停止定时任务
   */
  stop(): void {
    if (this.task) {
      this.task.stop()
      this.task = null
      console.log('  [调度器] 定时任务已停止')
    }
  }

  /**
   * 手动触发一次运行
   */
  async runNow(): Promise<void> {
    if (this.isRunning) {
      console.log('  [调度器] 任务正在运行中，请等待完成')
      return
    }

    this.isRunning = true
    try {
      console.log(`\n  [调度器] 手动触发: ${new Date().toLocaleString('zh-CN')}`)
      await this.handler()
    } finally {
      this.isRunning = false
    }
  }

  /**
   * 获取下次执行时间
   */
  private getNextRun(): string {
    try {
      // 简单显示cron表达式含义
      const parts = this.cronExpression.split(' ')
      if (parts.length === 5) {
        const [minute, hour] = parts
        if (minute && hour && hour !== '*') {
          return `每天 ${hour}:${minute} (Asia/Shanghai)`
        }
      }
      return `按cron表达式: ${this.cronExpression}`
    } catch {
      return this.cronExpression
    }
  }

  getIsRunning(): boolean {
    return this.isRunning
  }
}
