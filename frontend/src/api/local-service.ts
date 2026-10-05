import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  AlarmUnresolvedItem,
  BatchMarkResult,
  EntryRow,
  ModuleMeta,
  OverviewResult,
  PageResult,
  ReceiptFilters,
  ReceiptResult,
  ReceiptRow,
  ReceiptTag,
  ViewerScope,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

// 预警发布模块的接收单位字段：单位范围过滤、待分派归集都围绕它。
const ALARM_KEY = 'alarm'
const UNIT_FIELD = '接收单位'
// 缺接收单位的旧通知不隐藏，统一进入「待分派」。
export const PENDING_DISPATCH = '待分派'
// 发布超过 24 小时仍未响应视为超时响应。
export const RESPONSE_TIMEOUT_HOURS = 24
const RESPONSE_TIMEOUT_MS = RESPONSE_TIMEOUT_HOURS * 60 * 60 * 1000

// 一条通知命中多个回执标签时的优先级：结论类（误报/已解除）先于过程类，
// 已发布未回执的里面，缺接收单位的先进待分派，再看是否超时，最后是普通未响应。
const RECEIPT_TAG_PRIORITY: ReceiptTag[] = [
  '误报',
  '已解除',
  '已响应',
  '待发布',
  '待分派',
  '超时响应',
  '未响应',
]

export const RECEIPT_TAGS: ReceiptTag[] = [...RECEIPT_TAG_PRIORITY]

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

// 跨单位人员只能查看本区：有接收单位字段的模块按单位过滤，中心值班不过滤。
function scopeRows(key: string, rows: EntryRow[], scope?: ViewerScope): EntryRow[] {
  if (!scope || scope.role !== 'unit') {
    return rows
  }
  const meta = MODULE_BY_KEY.get(key)
  if (!meta || !meta.fields.includes(UNIT_FIELD)) {
    return rows
  }
  return rows.filter((row) => String(row[UNIT_FIELD] ?? '').trim() === scope.unit)
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(
  key: string,
  filters: Record<string, string> = {},
  scope?: ViewerScope,
): PageResult {
  const matched = filterRows(scopeRows(key, listRows(key), scope), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  if (current === target) {
    return { ok: false, message: `${meta.entity}已经是「${target}」，不用重复操作` }
  }
  const lastStatus = meta.statuses[meta.statuses.length - 1]
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: target !== lastStatus,
    abnormal: NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb)),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `\uFEFF${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

// ---------- 预警回执筛选台 ----------

function parsePublishTime(value: unknown): number | null {
  const text = String(value ?? '').trim()
  if (!text) {
    return null
  }
  const time = new Date(text.replace(' ', 'T')).getTime()
  return Number.isNaN(time) ? null : time
}

function formatDateTime(time: number): string {
  const d = new Date(time)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 计算一条预警通知的回执标签，命中多个时按 RECEIPT_TAG_PRIORITY 取先。 */
export function receiptTag(row: EntryRow, now: number = Date.now()): ReceiptTag {
  const status = String(row.status)
  if (status === '误报') {
    return '误报'
  }
  if (status === '已解除') {
    return '已解除'
  }
  if (status === '已响应') {
    return '已响应'
  }
  if (status === '待发布') {
    return '待发布'
  }
  // 已发布但未回执：缺接收单位的旧通知进待分派，不隐藏。
  if (String(row[UNIT_FIELD] ?? '').trim() === '') {
    return '待分派'
  }
  const published = parsePublishTime(row['发布时间'])
  if (published !== null && now - published > RESPONSE_TIMEOUT_MS) {
    return '超时响应'
  }
  return '未响应'
}

function toReceiptRow(row: EntryRow, now: number): ReceiptRow {
  const tag = receiptTag(row, now)
  const published = parsePublishTime(row['发布时间'])
  const overdueHours =
    tag === '超时响应' && published !== null
      ? Math.floor((now - published - RESPONSE_TIMEOUT_MS) / (60 * 60 * 1000))
      : 0
  return {
    id: Number(row.id),
    通知编号: String(row['通知编号'] ?? ''),
    预警等级: String(row['预警等级'] ?? ''),
    接收单位: String(row[UNIT_FIELD] ?? '').trim(),
    发布时间: String(row['发布时间'] ?? ''),
    status: String(row.status),
    tag,
    batch: String(row['处理批次'] ?? ''),
    respondedAt: String(row['响应时间'] ?? ''),
    overdueHours,
  }
}

function matchReceipt(row: ReceiptRow, filters: ReceiptFilters): boolean {
  if (filters.level && row.预警等级 !== filters.level) {
    return false
  }
  if (filters.unit === PENDING_DISPATCH && row.接收单位 !== '') {
    return false
  }
  if (filters.unit && filters.unit !== PENDING_DISPATCH && row.接收单位 !== filters.unit) {
    return false
  }
  const published = parsePublishTime(row.发布时间)
  if (filters.from) {
    const from = parsePublishTime(filters.from)
    if (from !== null && (published === null || published < from)) {
      return false
    }
  }
  if (filters.to) {
    // 截止日期按当天 23:59:59 收口，包含当天发布的通知。
    const to = parsePublishTime(filters.to)
    if (to !== null && (published === null || published > to + 24 * 60 * 60 * 1000 - 1)) {
      return false
    }
  }
  return true
}

/** 回执筛选台：等级、接收单位、发布时间、响应状态组合定位；标签统计在标签过滤之前算。 */
export function listReceipts(
  filters: ReceiptFilters,
  scope?: ViewerScope,
  now: number = Date.now(),
): ReceiptResult {
  const rows = scopeRows(ALARM_KEY, listRows(ALARM_KEY), scope).map((row) =>
    toReceiptRow(row, now),
  )
  const matched = rows.filter((row) => matchReceipt(row, filters))
  const tagCounts: Partial<Record<ReceiptTag, number>> = {}
  for (const row of matched) {
    tagCounts[row.tag] = (tagCounts[row.tag] ?? 0) + 1
  }
  const items = filters.tag ? matched.filter((row) => row.tag === filters.tag) : matched
  return { items, total: items.length, tagCounts }
}

/** 预警等级 / 接收单位的可选值，供筛选台下拉与单位切换用。 */
export function alarmFacets(scope?: ViewerScope): { levels: string[]; units: string[] } {
  const rows = scopeRows(ALARM_KEY, listRows(ALARM_KEY), scope)
  const levels = new Set<string>()
  const units = new Set<string>()
  for (const row of rows) {
    const level = String(row['预警等级'] ?? '').trim()
    if (level) {
      levels.add(level)
    }
    const unit = String(row[UNIT_FIELD] ?? '').trim()
    if (unit) {
      units.add(unit)
    }
  }
  return { levels: [...levels], units: [...units] }
}

// 处理批次连续编号：PC-日期-序号，序号在当天已有批次上递增。
function nextBatchId(rows: EntryRow[], now: number): string {
  const d = new Date(now)
  const pad = (n: number) => String(n).padStart(2, '0')
  const prefix = `PC-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-`
  let max = 0
  for (const row of rows) {
    const value = String(row['处理批次'] ?? '')
    if (value.startsWith(prefix)) {
      const seq = Number(value.slice(prefix.length))
      if (Number.isFinite(seq)) {
        max = Math.max(max, seq)
      }
    }
  }
  return `${prefix}${String(max + 1).padStart(2, '0')}`
}

/**
 * 标记连续处理批次：把选中的已发布通知批量登记响应并打上连续批次号。
 * 已解除、误报属于已有结论，批量标记不能覆盖；非本单位的通知也不能动。
 */
export function markReceiptBatch(
  ids: number[],
  scope?: ViewerScope,
  operator: string = '值班管理员',
  now: number = Date.now(),
): BatchMarkResult {
  const empty = { batch: '', marked: 0, skipped: [] as BatchMarkResult['skipped'] }
  if (ids.length === 0) {
    return { ok: false, ...empty, message: '请先勾选要标记处理批次的预警通知' }
  }
  const rows = listRows(ALARM_KEY)
  const scopedIds = new Set(scopeRows(ALARM_KEY, rows, scope).map((row) => Number(row.id)))
  const skipped: BatchMarkResult['skipped'] = []
  const targets: number[] = []
  for (const id of ids) {
    const row = rows.find((item) => Number(item.id) === id)
    if (!row) {
      skipped.push({ id, reason: '通知不存在' })
      continue
    }
    if (!scopedIds.has(id)) {
      skipped.push({ id, reason: '非本单位通知' })
      continue
    }
    const status = String(row.status)
    if (status === '已解除' || status === '误报') {
      skipped.push({ id, reason: `已${status === '误报' ? '定性误报' : '解除'}，结论不覆盖` })
      continue
    }
    if (status === '已响应') {
      skipped.push({ id, reason: '已登记过响应' })
      continue
    }
    if (status !== '已发布') {
      skipped.push({ id, reason: `当前状态「${status}」不能登记响应` })
      continue
    }
    targets.push(id)
  }
  if (targets.length === 0) {
    return { ok: false, ...empty, skipped, message: '所选通知没有可登记响应的，批次未生成' }
  }
  const batch = nextBatchId(rows, now)
  const targetSet = new Set(targets)
  const next = rows.map((row) =>
    targetSet.has(Number(row.id))
      ? {
          ...row,
          status: '已响应',
          pending: true,
          处理批次: batch,
          响应时间: formatDateTime(now),
          回执人: operator,
        }
      : row,
  )
  saveRows(ALARM_KEY, next)
  const skipText = skipped.length ? `，跳过 ${skipped.length} 条（结论或权限保护）` : ''
  return {
    ok: true,
    batch,
    marked: targets.length,
    skipped,
    message: `批次 ${batch} 已登记响应 ${targets.length} 条${skipText}`,
  }
}

/** 预警发布页头部指标：本月预警数 / 已响应数 / 未解除数（未解除不含误报）。 */
export function alarmStats(scope?: ViewerScope): { label: string; value: number }[] {
  const rows = scopeRows(ALARM_KEY, listRows(ALARM_KEY), scope)
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const isUnresolved = (row: EntryRow) => !['已解除', '误报'].includes(String(row.status))
  return [
    {
      label: '本月预警数',
      value: rows.filter((row) => String(row['发布时间'] ?? '').startsWith(month)).length,
    },
    { label: '已响应数', value: rows.filter((row) => String(row.status) === '已响应').length },
    { label: '未解除数', value: rows.filter(isUnresolved).length },
  ]
}

export function loadOverview(scope?: ViewerScope): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = scopeRows(meta.key, rows[meta.key] ?? [], scope)
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  // 未解除明细：已解除、误报都算已有结论，剩下的逐条列出，批次处理后这里跟着变。
  const alarmUnresolvedItems: AlarmUnresolvedItem[] = scopeRows(
    ALARM_KEY,
    rows[ALARM_KEY] ?? [],
    scope,
  )
    .filter((row) => !['已解除', '误报'].includes(String(row.status)))
    .map((row) => ({
      id: Number(row.id),
      通知编号: String(row['通知编号'] ?? ''),
      预警等级: String(row['预警等级'] ?? ''),
      接收单位: String(row[UNIT_FIELD] ?? '').trim(),
      发布时间: String(row['发布时间'] ?? ''),
      status: String(row.status),
      tag: receiptTag(row),
    }))
  return {
    cards,
    modules,
    alarmUnresolved: { total: alarmUnresolvedItems.length, items: alarmUnresolvedItems },
  }
}
