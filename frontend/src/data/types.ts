/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

/** 查看人范围：中心值班看全部，跨单位人员只看本单位（本区）。 */
export type ViewerScope = {
  role: 'center' | 'unit'
  unit: string
}

/** 回执标签：一条通知命中多个标签时按此优先级取第一个（见 local-service.receiptTag）。 */
export type ReceiptTag = '误报' | '已解除' | '已响应' | '待发布' | '待分派' | '超时响应' | '未响应'

export type ReceiptRow = {
  id: number
  通知编号: string
  预警等级: string
  接收单位: string
  发布时间: string
  status: string
  tag: ReceiptTag
  batch: string
  respondedAt: string
  overdueHours: number
}

export type ReceiptFilters = {
  level: string
  unit: string
  from: string
  to: string
  tag: string
}

export type ReceiptResult = {
  items: ReceiptRow[]
  total: number
  tagCounts: Partial<Record<ReceiptTag, number>>
}

export type BatchSkip = { id: number; reason: string }

export type BatchMarkResult = {
  ok: boolean
  batch: string
  marked: number
  skipped: BatchSkip[]
  message: string
}

export type AlarmUnresolvedItem = {
  id: number
  通知编号: string
  预警等级: string
  接收单位: string
  发布时间: string
  status: string
  tag: ReceiptTag
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
  alarmUnresolved: { total: number; items: AlarmUnresolvedItem[] }
}
