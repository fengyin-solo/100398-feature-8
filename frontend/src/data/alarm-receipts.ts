import type { EntryRow } from './types'

// 预警发布·回执筛选台的领域规则：标签推导、组合筛选、连续批次号都放在这里，
// 页面只负责渲染，规则改动不用动视图。

/** 回执响应时限：发布后 24 小时内未登记响应即视为超时响应。 */
export const RESPONSE_SLA_HOURS = 24

/** 旧通知缺接收单位时不隐藏，统一归入「待分派」展示与筛选。 */
export const UNASSIGNED_UNIT = '待分派'

// 回执标签优先级（同一通知命中多个标签时取排在前面的）：
//   误报 > 已解除 > 待分派 > 超时响应 > 未响应 > 正常响应 > 待发布
// 误报、已解除是已下结论的状态，优先展示结论；
// 缺接收单位的通知无法送达响应，先分派再谈响应，所以排在时间类标签之前。
export type ReceiptTag = '误报' | '已解除' | '待分派' | '超时响应' | '未响应' | '正常响应' | '待发布'

/** 回执筛选台快捷查看的标签（全部标签见 ALL_RECEIPT_TAGS）。 */
export const QUICK_RECEIPT_TAGS: ReceiptTag[] = ['待分派', '未响应', '超时响应', '误报']

export const ALL_RECEIPT_TAGS: ReceiptTag[] = [
  '待分派',
  '未响应',
  '超时响应',
  '正常响应',
  '误报',
  '已解除',
  '待发布',
]

/** 发布时间/响应时间允许写成「2026-10-05 08:30」或「2026-10-05T08:30」。 */
export function parseAlarmTime(value: unknown): number | null {
  const text = String(value ?? '').trim()
  if (!text) {
    return null
  }
  const time = new Date(text.replace(' ', 'T')).getTime()
  return Number.isNaN(time) ? null : time
}

/** 推导通知的回执标签，优先级见文件顶部说明。 */
export function receiptTag(row: EntryRow, now: Date = new Date()): ReceiptTag {
  const status = String(row.status ?? '')
  if (status === '误报') {
    return '误报'
  }
  if (status === '已解除') {
    return '已解除'
  }
  if (!String(row['接收单位'] ?? '').trim()) {
    return '待分派'
  }
  if (status === '已发布') {
    const publishedAt = parseAlarmTime(row['发布时间'])
    if (publishedAt !== null && now.getTime() - publishedAt > RESPONSE_SLA_HOURS * 3600 * 1000) {
      return '超时响应'
    }
    return '未响应'
  }
  if (status === '已响应') {
    const publishedAt = parseAlarmTime(row['发布时间'])
    const respondedAt = parseAlarmTime(row['响应时间'])
    if (
      publishedAt !== null &&
      respondedAt !== null &&
      respondedAt - publishedAt > RESPONSE_SLA_HOURS * 3600 * 1000
    ) {
      return '超时响应'
    }
    return '正常响应'
  }
  // 待发布及未识别的状态都还没有回执可言，按待发布处理。
  return '待发布'
}

/** 未解除 = 还没有下结论的通知（已解除、误报都算已办结）。 */
export function isUnreleased(row: EntryRow): boolean {
  return !['已解除', '误报'].includes(String(row.status ?? ''))
}

export type ReceiptCriteria = {
  level?: string
  unit?: string
  tag?: string
  publishFrom?: string
  publishTo?: string
}

/** 回执筛选台组合定位：等级、接收单位、发布时间区间、响应状态四个条件取交集。 */
export function filterReceiptRows(
  rows: EntryRow[],
  criteria: ReceiptCriteria,
  now: Date = new Date(),
): EntryRow[] {
  const level = (criteria.level ?? '').trim()
  const unit = (criteria.unit ?? '').trim()
  const tag = (criteria.tag ?? '').trim()
  const from = criteria.publishFrom ? new Date(`${criteria.publishFrom}T00:00:00`).getTime() : null
  const to = criteria.publishTo ? new Date(`${criteria.publishTo}T23:59:59.999`).getTime() : null
  return rows.filter((row) => {
    if (level && String(row['预警等级'] ?? '') !== level) {
      return false
    }
    if (unit) {
      const rowUnit = String(row['接收单位'] ?? '').trim()
      if (unit === UNASSIGNED_UNIT ? rowUnit !== '' : rowUnit !== unit) {
        return false
      }
    }
    if (from !== null || to !== null) {
      const publishedAt = parseAlarmTime(row['发布时间'])
      if (publishedAt === null) {
        return false
      }
      if (from !== null && publishedAt < from) {
        return false
      }
      if (to !== null && publishedAt > to) {
        return false
      }
    }
    if (tag && receiptTag(row, now) !== tag) {
      return false
    }
    return true
  })
}

/** 连续处理批次：在已有批次号基础上顺延，保证批次编号连续不重号。 */
export function nextBatchLabel(rows: EntryRow[]): string {
  let max = 0
  for (const row of rows) {
    const match = /^批次-(\d+)$/.exec(String(row['处理批次'] ?? '').trim())
    if (match) {
      max = Math.max(max, Number(match[1]))
    }
  }
  return `批次-${String(max + 1).padStart(4, '0')}`
}
