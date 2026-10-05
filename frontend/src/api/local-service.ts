import { MODULE_BY_KEY } from '@/data/modules'
import {
  UNASSIGNED_UNIT,
  isUnreleased,
  nextBatchLabel,
  receiptTag,
} from '@/data/alarm-receipts'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  BatchMarkResult,
  EntryRow,
  ListScope,
  ModuleMeta,
  OverviewResult,
  PageResult,
} from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
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

// 跨单位人员只能查看本区：模块登记了 unitField 且调用方给了单位时，先按单位收窄再筛选。
function applyScope(rows: EntryRow[], meta: ModuleMeta, scope: ListScope): EntryRow[] {
  if (!scope.unit || !meta.unitField) {
    return rows
  }
  const field = meta.unitField
  return rows.filter((row) => String(row[field] ?? '').trim() === scope.unit)
}

export function listEntries(
  key: string,
  filters: Record<string, string> = {},
  scope: ListScope = {},
): PageResult {
  const meta = moduleMeta(key)
  const matched = filterRows(applyScope(listRows(key), meta, scope), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

/** 预警通知的接收单位清单（不含空值），给回执筛选台和值班单位切换用。 */
export function receivingUnits(): string[] {
  const units = new Set<string>()
  for (const row of listRows('alarm')) {
    const unit = String(row['接收单位'] ?? '').trim()
    if (unit) {
      units.add(unit)
    }
  }
  return [...units].sort()
}

// 批量标记连续处理批次：批次号在现有基础上顺延；已解除的结论不被批量覆盖，
// 已入批次的通知不重复入批，跨单位人员只能标记本区的通知。
export function markAlarmBatch(ids: number[], operator: string, scope: ListScope = {}): BatchMarkResult {
  const key = 'alarm'
  const meta = moduleMeta(key)
  const rows = listRows(key)
  const wanted = new Set(ids.map(Number))
  const batch = nextBatchLabel(rows)
  let marked = 0
  let skippedReleased = 0
  let skippedBatched = 0
  let skippedOutOfScope = 0
  const next = rows.map((row) => {
    if (!wanted.has(Number(row.id))) {
      return row
    }
    if (scope.unit && meta.unitField && String(row[meta.unitField] ?? '').trim() !== scope.unit) {
      skippedOutOfScope += 1
      return row
    }
    if (String(row.status) === '已解除') {
      skippedReleased += 1
      return row
    }
    if (String(row['处理批次'] ?? '').trim()) {
      skippedBatched += 1
      return row
    }
    marked += 1
    return { ...row, 处理批次: batch }
  })
  const skippedText = `跳过已解除 ${skippedReleased} 条、已在批次 ${skippedBatched} 条、超出本单位范围 ${skippedOutOfScope} 条`
  if (marked === 0) {
    return {
      ok: false,
      message: `没有可入批次的${meta.entity}（${skippedText}）`,
      batch: '',
      marked,
      skippedReleased,
      skippedBatched,
      skippedOutOfScope,
    }
  }
  saveRows(key, next)
  return {
    ok: true,
    message: `${operator} 已把 ${marked} 条${meta.entity}标记为「${batch}」，${skippedText}`,
    batch,
    marked,
    skippedReleased,
    skippedBatched,
    skippedOutOfScope,
  }
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

export function loadOverview(scope: ListScope = {}): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  // 未解除明细跟随 alarm 取数路径：处理批次、状态流转后重新统计即可看到最新结果。
  const alarmMeta = moduleMeta('alarm')
  const unreleasedAlarms = applyScope(rows[alarmMeta.key] ?? [], alarmMeta, scope)
    .filter(isUnreleased)
    .map((row) => ({
      id: Number(row.id),
      noticeNo: String(row['通知编号'] ?? ''),
      level: String(row['预警等级'] ?? ''),
      unit: String(row['接收单位'] ?? '').trim() || UNASSIGNED_UNIT,
      publishTime: String(row['发布时间'] ?? ''),
      status: String(row.status ?? ''),
      tag: receiptTag(row),
      batch: String(row['处理批次'] ?? '').trim() || '未入批次',
    }))
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
    { label: '未解除预警', value: unreleasedAlarms.length },
  ]
  return { cards, modules, unreleasedAlarms }
}
