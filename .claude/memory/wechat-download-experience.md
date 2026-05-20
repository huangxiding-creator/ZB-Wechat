# 微信公众号历史文章批量下载经验总结

## 项目概述
- **目标**: 下载 17 个微信公众号的所有历史文章
- **结果**: 成功下载 35,988 篇文章，生成 127 个合并文件
- **工具**: TypeScript + Node.js + Playwright

## 技术方案

### 1. API 接入
- 使用 `mptext.top` 第三方 API 服务
- 需要 `X-Auth-Key` 认证头
- API 地址: `https://api.mptext.top/api/public/v1/`

### 2. 核心功能模块
```
src/
├── api.ts        # API 客户端（含重试、预热）
├── browser.ts    # Playwright 浏览器自动化
├── downloader.ts # 下载管理器（含记录、合并）
├── index.ts      # 主入口
└── types.ts      # 类型定义
```

## 关键问题与解决方案

### 问题 1: Cloudflare 冷启动超时
**现象**: 首次 API 请求经常超时
**原因**: Cloudflare CDN 冷启动延迟
**解决**: 添加 `warmup()` 方法预热连接
```typescript
async warmup(): Promise<void> {
  for (let i = 0; i < 3; i++) {
    try {
      await this.client.get('/api/public/v1/account', {
        params: { keyword: 'test', begin: 0, size: 1 },
        timeout: 15000
      })
      this.warmupDone = true
      return
    } catch (e) {
      await new Promise(r => setTimeout(r, 2000))
    }
  }
}
```

### 问题 2: API 速率限制
**现象**: 请求过快导致 429 错误
**解决**:
- 请求间隔设置为 5 秒
- 实现指数退避重试机制
- 最大重试 6 次

### 问题 3: 下载记录管理
**需求**: 支持断点续传，跳过已下载文章
**解决**:
- 使用 `.download-record.json` 存储已下载 URL
- 每个 URL 作为 Set 元素存储
- 启动时加载记录，完成后保存

### 问题 4: 文件合并
**需求**: 每 300 篇文章合并为一个文件
**解决**:
- `MERGE_SIZE = 300`
- 合并文件存放在 `merged/` 子目录
- 命名格式: `{公众号名}+合并{序号}.md`

### 问题 5: 跳过已完成账号
**需求**: 避免重复下载已完成的公众号
**解决**:
```typescript
private isAccountCompleted(accountName: string): boolean {
  const record = this.downloadRecords.get(accountName)
  if (!record) return false

  const mdFiles = fs.readdirSync(accountDir)
    .filter(name => name.endsWith('.md') && !name.includes('+合并'))

  // 超过100个文件且记录数匹配则认为完成
  if (mdFiles.length > 100 && record.downloadedArticles.size >= mdFiles.length - 10) {
    return true
  }
  return false
}
```

## 最佳实践

### 1. 运行模式
```bash
# 首次运行（需要登录获取 API Key）
node dist/index.js

# 后续运行（跳过浏览器）
node dist/index.js --skip-browser
```

### 2. 进度监控
- 使用 `process.stdout.write()` 实现行内进度显示
- 定期输出当前下载进度 `[n/total]`

### 3. 错误处理
- 单篇文章下载失败不影响整体流程
- 记录失败文章的 URL
- 支持重试机制

### 4. 文件组织
```
项目根目录/
├── Downloads/
│   ├── 公众号A/
│   │   ├── 文章1.md
│   │   └── 文章2.md
│   └── .download-record.json
└── Merge/
    ├── 公众号A+合并1.md
    ├── 公众号A+合并2.md
    └── 公众号B+合并1.md
```

**说明**: 所有合并文件统一放置在 `Merge/` 目录，便于统一管理

## 性能数据

| 指标 | 数值 |
|------|------|
| 总文章数 | 35,988 篇 |
| 公众号数 | 17 个 |
| 合并文件数 | 127 个 |
| 最大单账号文章数 | 7,387 篇 (勘察设计前沿) |
| 请求间隔 | 5 秒 |
| 最大重试次数 | 6 次 |

## 注意事项

1. **API Key 安全**: 存储在 `.api-key` 文件中，不要提交到 Git
2. **网络稳定性**: 使用 axios-retry 处理网络波动
3. **磁盘空间**: 确保有足够空间存储文章
4. **合法合规**: 遵守微信公众号使用条款

## 未来改进

1. [x] 支持并发下载（控制并发数）✅ 已实现 3 并发
2. [ ] 添加下载统计报表
3. [x] 支持增量更新（只下载新文章）✅ 通过下载记录实现
4. [ ] 添加 Web UI 进度展示
5. [ ] 支持导出为 PDF/EPUB 格式

---

## Super-Skill V3.10 集成改进 (2026-03-20)

### 新增模块

基于 Super-Skill 框架的 `error-recovery` 和 `performance-optimization` 技能，新增以下模块：

| 模块 | 文件 | 功能 |
|------|------|------|
| 智能速率限制器 | `rate-limiter.ts` | Token Bucket 算法 + 滑动窗口 |
| 断路器 | `rate-limiter.ts` | CLOSED/OPEN/HALF_OPEN 状态机 |
| 结构化日志 | `structured-logger.ts` | 分级日志 + 文件输出 |
| 配置管理 | `config.ts` | 环境变量覆盖 + 配置文件 |

### 断路器模式

```typescript
// 状态转换: CLOSED → OPEN → HALF_OPEN → CLOSED
const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,    // 连续5次失败后断开
  successThreshold: 3,    // 连续3次成功后恢复
  timeout: 30000          // 30秒后尝试半开
})

// 使用
if (circuitBreaker.canExecute()) {
  try {
    const result = await operation()
    circuitBreaker.reportSuccess()
  } catch (error) {
    circuitBreaker.reportFailure()
    throw error
  }
}
```

### 智能速率限制

```typescript
const rateLimiter = new RateLimiter({
  maxRequests: 30,        // 每分钟30个请求
  windowMs: 60000,        // 1分钟窗口
  minDelay: 500,          // 最小500ms延迟
  maxDelay: 10000         // 最大10秒延迟
})

// 自适应调整
await rateLimiter.waitForSlot()
// 成功: rateLimiter.reportSuccess() → 延迟减少
// 429: rateLimiter.report429() → 延迟翻倍
```

### 性能优化效果

| 优化项 | 优化前 | 优化后 | 提升 |
|--------|--------|--------|------|
| 列表请求延迟 | 5秒 | 2秒 | **2.5x** |
| 文章下载 | 串行 | 3并发 | **3x** |
| 限流恢复 | 手动 | 自动 | - |
| 错误隔离 | 无 | 断路器 | - |

### API 健康检查

```typescript
const health = await api.healthCheck()
// {
//   status: 'healthy' | 'degraded' | 'unhealthy',
//   circuitBreaker: 'CLOSED' | 'OPEN' | 'HALF_OPEN',
//   rateLimiter: { delay: 2000, consecutive429: 0 },
//   latency: 150
// }
```

### 配置优先级

```
环境变量 > 配置文件 > 默认值
```

关键环境变量：
- `API_BASE_URL` - API 基础地址
- `DOWNLOAD_CONCURRENCY` - 并发数
- `RATE_LIMIT_MAX` - 最大请求数/分钟
- `LOG_LEVEL` - 日志级别 (debug/info/warn/error)
- `WEBHOOK_URL` - 企业微信通知地址
