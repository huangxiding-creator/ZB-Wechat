# ZB-Wechat: 总包公号情报系统

[![npm version](https://badge.fury.io/js/wechat-article-exporter.svg)](https://badge.fury.io/js/wechat-article-exporter)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js Version](https://img.shields.io/node/v/wechat-article-exporter.svg)](https://nodejs.org)

**AI驱动的工程总承包行业情报中枢 — 每日自动扫描、智能分析、精选推送**

## 项目简介

总包公号情报系统是一位拥有20年以上工程总承包实战经验的"AI老专家"每天自动运行，为您：

1. **扫描监控** — 定时扫描33+个工程总承包相关公众号的最新文章
2. **智能筛选** — AI自动过滤新闻/广告/活动等非干货内容，只保留有实质价值的文章
3. **深度分析** — 多维度评分（技术深度、实操价值、新颖度、EPC相关度）+ 智能话题分类
4. **情报快报** — 生成"总包公号情报"Markdown快报，推送至企业微信

每天为您节省2-3小时的刷手机时间，同时不遗漏任何关键行业动态。

## 核心特性

| 特性 | 说明 |
|------|------|
| AI干货筛选 | 基于智谱GLM-4-Flash大模型，模拟20年EPC专家经验判断文章价值 |
| 多维度评分 | 技术深度/实操价值/新颖度/EPC相关度四维评分，量化文章质量 |
| 智能分类 | 自动归类到合同管理、招投标、索赔等12个EPC核心领域 |
| 优先级排序 | 必读 > 推荐 > 参考，让您先看最重要的内容 |
| 热点追踪 | 自动识别当日热门话题，一目了然 |
| 定时运行 | 内置cron调度，默认每天20:00自动运行 |
| 企业微信推送 | 通过Webhook直接推送快报到企业微信群 |
| 本地存档 | 每日快报自动保存为Markdown文件，方便回溯 |
| 用户可配置 | 监控列表、关键词、运行时间均可自定义 |

## 快速开始

### 前提条件

- Node.js 18.0 或更高版本
- 微信公众号API密钥（从 [down.mptext.top](https://down.mptext.top) 获取）
- 智谱AI API Key（从 [open.bigmodel.cn](https://open.bigmodel.cn) 获取，免费）
- 企业微信群机器人Webhook（可选）

### 安装

```bash
# 克隆仓库
git clone https://github.com/huangxiding-creator/ZB-Wechat.git
cd ZB-Wechat

# 安装依赖
npm install

# 安装Playwright浏览器（用于API密钥自动获取）
npx playwright install chromium
```

### 配置

1. **创建环境配置**

   ```bash
   cp .env.example .env
   ```

   编辑 `.env` 文件：

   ```env
   # 智谱AI GLM API配置
   GLM_API_KEY=你的智谱API密钥
   GLM_BASE_URL=https://open.bigmodel.cn/api/paas/v4/chat/completions
   GLM_MODEL=glm-4-flash

   # 企业微信通知配置
   WEWORK_WEBHOOK_URL=https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的Webhook密钥
   ```

2. **配置监控公众号列表**

   编辑 `公众号监控列表.txt`（每行一个公众号名称）：

   ```text
   中建三局总承包公司
   中建四局总承包公司
   建纬律师
   工程金说
   # 以#开头的行为注释
   ```

3. **配置关注领域关键词**

   编辑 `关注的领域.txt`（每行一个关键词，已预置105个EPC关键词）：

   ```text
   # 合同管理
   工程总承包合同
   EPC合同
   合同索赔
   # 造价管理
   工程造价
   工程量清单
   ```

4. **获取微信公众号API密钥**

   ```bash
   # 方式1: 自动浏览器获取
   npx ts-node src/index.ts

   # 方式2: 手动输入
   npx ts-node src/index.ts --manual
   ```

### 运行

```bash
# 执行一次情报采集（推荐首次使用）
npm run intelligence

# 启动定时调度模式（每天20:00自动运行）
npm run intelligence:schedule

# 构建生产版本
npm run build
```

### 自定义运行时间

```bash
# 指定cron表达式（例如每天早上8:30）
npx ts-node src/intelligence/index.ts schedule --cron="30 8 * * *"
```

Cron表达式格式: `分 时 日 月 星期`

常用示例：
- `0 20 * * *` — 每天20:00（默认）
- `30 8 * * *` — 每天08:30
- `0 9,18 * * *` — 每天09:00和18:00各一次
- `0 8 * * 1-5` — 工作日08:00

## 快报示例

推送至企业微信的快报效果：

```markdown
## 总包公号情报

**日期**: 2026/05/20
**扫描**: 4 篇 | **干货**: 2 篇

**热点**: 索赔与争议(2) | 合同管理(2) | 造价管理(1)

---

### ⭐ 推荐 (2篇)

**争议案例分享—凿槽规格与定额规格不符的计价争议**
> 来源: 广东省建设工程标准定额站订阅号 | 索赔与争议 造价管理
> 发布: 2026/05/19 17:44
> 核心洞见: 通过实际案例分析了凿槽规格与定额规格不符的计价争议处理方案。
> [查看原文](https://mp.weixin.qq.com/s/xxx)

---

*总包生态圈AI | 每日为您精选EPC行业干货*
```

## 项目结构

```text
ZB-Wechat/
├── src/
│   ├── intelligence/          # 情报系统核心模块
│   │   ├── index.ts           # 主入口 & 编排器
│   │   ├── types.ts           # 类型定义
│   │   ├── glm-client.ts      # 智谱AI客户端
│   │   ├── scanner.ts         # 公众号文章扫描器
│   │   ├── analyzer.ts        # AI内容分析器
│   │   ├── briefing-generator.ts  # 快报生成器
│   │   ├── publisher.ts       # 企业微信+存档发布器
│   │   └── scheduler.ts       # 定时调度器
│   ├── api.ts                 # 微信API客户端
│   ├── browser.ts             # 浏览器自动化
│   ├── config.ts              # 配置管理
│   ├── downloader.ts          # 文章下载器
│   ├── notification.ts        # 通知服务
│   ├── rate-limiter.ts        # 速率限制 & 断路器
│   ├── structured-logger.ts   # 结构化日志
│   └── index.ts               # 文章导出器入口
├── 公众号监控列表.txt           # 监控的公众号列表（可编辑）
├── 关注的领域.txt               # 关键词列表（可编辑）
├── archives/                  # 快报本地存档目录
├── .env                       # 环境变量配置
└── .api-key                   # 微信API密钥
```

## 工作流程

```text
┌─────────────┐     ┌──────────────┐     ┌──────────────┐
│  定时调度器   │────>│  文章扫描器   │────>│  AI内容分析器  │
│  (node-cron) │     │  (Scanner)   │     │  (Analyzer)  │
└─────────────┘     └──────────────┘     └──────────────┘
                           │                      │
                    读取监控列表            GLM-4-Flash分析
                    关键词匹配过滤          干货判断+评分+分类
                           │                      │
                           v                      v
                    ┌──────────────┐     ┌──────────────┐
                    │  快报生成器   │────>│   发布器      │
                    │  (Generator) │     │  (Publisher)  │
                    └──────────────┘     └──────────────┘
                                                │
                                         企业微信推送
                                         本地Markdown存档
```

## 评分体系

每篇干货文章从四个维度进行评分（1-5分）：

| 维度 | 1分 | 3分 | 5分 |
|------|-----|-----|-----|
| 技术深度 | 泛泛而谈 | 有具体方法 | 深入技术细节 |
| 实操价值 | 纯理论 | 有一定参考 | 可直接应用 |
| 新颖度 | 常规常识 | 有新视角 | 独创性见解 |
| EPC相关度 | 间接相关 | 较相关 | 高度相关 |

优先级判定：
- **🔥必读**: 总分≥16 或 任一维度=5分
- **⭐推荐**: 总分≥12
- **📌参考**: 总分≥8

## 话题分类

系统自动将文章归类到以下12个EPC核心领域：

1. 合同管理 | 2. 招投标 | 3. 索赔与争议
4. 设计管理 | 5. 采购管理 | 6. 施工技术
7. 安全管理 | 8. 质量控制 | 9. 造价管理
10. 法律法规 | 11. 项目管理 | 12. 数字化转型

## 技术栈

- **运行时**: Node.js 18+
- **语言**: TypeScript
- **AI引擎**: 智谱 GLM-4-Flash（免费）
- **调度**: node-cron
- **数据源**: 微信公众号API (down.mptext.top)
- **推送**: 企业微信 Webhook
- **浏览器自动化**: Playwright

## 开发

```bash
# 安装依赖
npm install

# 类型检查
npm run typecheck

# 构建
npm run build

# 运行测试
npm run test

# 代码格式化
npm run format

# 代码检查
npm run lint
```

## 常见问题

**Q: 智谱API Key怎么获取？**
A: 访问 [open.bigmodel.cn](https://open.bigmodel.cn)，注册账号后在API密钥页面创建即可。GLM-4-Flash模型免费使用。

**Q: 微信API Key怎么获取？**
A: 访问 [down.mptext.top](https://down.mptext.top)，扫码登录后在API密钥页面获取。

**Q: 可以不推送到企业微信吗？**
A: 可以。不配置 `WEWORK_WEBHOOK_URL` 即可跳过推送，快报仍会保存在 `archives/` 目录。

**Q: 为什么有些公众号没有匹配到文章？**
A: 可能原因：1) 该公众号24小时内没有发布新文章；2) 新文章不包含 `关注的领域.txt` 中的关键词；3) 关键词列表需要更新。

**Q: 怎么添加/删除监控的公众号？**
A: 直接编辑 `公众号监控列表.txt`，每行一个公众号名称。下次运行时自动生效。

**Q: 怎么自定义关注领域？**
A: 直接编辑 `关注的领域.txt`，每行一个关键词，`#` 开头的行为注释。

## 许可证

MIT License - 详见 [LICENSE](LICENSE) 文件

## 致谢

- [智谱AI](https://open.bigmodel.cn) - 提供免费的GLM-4-Flash大模型API
- [node-cron](https://github.com/node-cron/node-cron) - 定时调度
- [Playwright](https://playwright.dev/) - 浏览器自动化

---

**如果这个项目对您有帮助，请给一个 Star!**
