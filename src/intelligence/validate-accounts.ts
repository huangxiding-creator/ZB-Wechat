import * as dotenv from 'dotenv'
dotenv.config()

import * as fs from 'fs'
import { WeChatAPI } from '../api'

const API_KEY = fs.readFileSync('.api-key', 'utf-8').trim()
const api = new WeChatAPI(API_KEY)

const content = fs.readFileSync('公众号监控列表.txt', 'utf-8')
const lines = content.split('\n')

const allAccounts: string[] = []
for (const line of lines) {
  const trimmed = line.trim()
  if (trimmed && !trimmed.startsWith('#')) {
    allAccounts.push(trimmed)
  }
}

const unique = [...new Set(allAccounts)]
console.log(`原始: ${allAccounts.length}, 去重后: ${unique.length}`)

// Load checkpoint
const checkpointFile = '.validate-checkpoint.json'
let valid: string[] = []
let notFound: string[] = []
let invalid: string[] = []
let startIndex = 0

if (fs.existsSync(checkpointFile)) {
  const cp = JSON.parse(fs.readFileSync(checkpointFile, 'utf-8'))
  valid = cp.valid || []
  notFound = cp.notFound || []
  invalid = cp.invalid || []
  startIndex = cp.nextIndex || 0
  console.log(`从断点恢复: 已验证 ${startIndex}, 有效 ${valid.length}, 未找到 ${notFound.length}`)
}

async function checkAccount(name: string): Promise<'valid' | 'invalid' | 'notfound'> {
  try {
    const result = await api.searchAccount(name)
    if (!result || !result.list || result.list.length === 0) return 'notfound'
    const exact = result.list.find(r => r.nickname === name)
    if (exact) return 'valid'
    const partial = result.list.find(r => r.nickname.includes(name) || name.includes(r.nickname))
    if (partial) return 'valid'
    return 'notfound'
  } catch (e) {
    return 'invalid'
  }
}

function saveCheckpoint(nextIndex: number) {
  fs.writeFileSync(checkpointFile, JSON.stringify({
    valid, notFound, invalid, nextIndex
  }, null, 2), 'utf-8')
}

async function main() {
  console.log(`验证 ${unique.length - startIndex} 个公众号 (从 ${startIndex} 开始)...`)

  for (let i = startIndex; i < unique.length; i++) {
    const name = unique[i]!
    const status = await checkAccount(name)

    if (status === 'valid') valid.push(name)
    else if (status === 'notfound') notFound.push(name)
    else invalid.push(name)

    if ((i + 1) % 20 === 0) {
      console.log(`进度: ${i + 1}/${unique.length} (有效: ${valid.length}, 未找到: ${notFound.length})`)
      saveCheckpoint(i + 1)
    }

    await new Promise(r => setTimeout(r, 800))
  }

  saveCheckpoint(unique.length)

  console.log(`\n===== 最终结果 =====`)
  console.log(`有效: ${valid.length}`)
  console.log(`未找到: ${notFound.length}`)
  console.log(`API错误: ${invalid.length}`)

  if (notFound.length > 0) {
    console.log(`\n--- 未找到的公众号 ---`)
    for (const n of notFound) console.log(`  ${n}`)
  }
  if (invalid.length > 0) {
    console.log(`\n--- API错误的公众号 ---`)
    for (const n of invalid) console.log(`  ${n}`)
  }

  fs.writeFileSync('.valid-accounts.txt', valid.join('\n'), 'utf-8')
  console.log(`\n有效账号已保存到 .valid-accounts.txt`)
}

main().catch(e => console.error('Error:', e))
