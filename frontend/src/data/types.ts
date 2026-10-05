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
  /** 跨单位取数时按这个字段限定本区范围（如预警发布的「接收单位」）。 */
  unitField?: string
}

/** 取数范围：跨单位人员只能查看本区，传入接收单位后列表只保留该单位的数据。 */
export type ListScope = {
  unit?: string
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

/** 批量标记处理批次的结果：除 ok/message 外带回各类跳过数量，方便页面提示。 */
export type BatchMarkResult = ActionResult & {
  batch: string
  marked: number
  skippedReleased: number
  skippedBatched: number
  skippedOutOfScope: number
}

/** 运营概览里的未解除预警明细行。 */
export type UnreleasedAlarm = {
  id: number
  noticeNo: string
  level: string
  unit: string
  publishTime: string
  status: string
  tag: string
  batch: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
  unreleasedAlarms: UnreleasedAlarm[]
}
