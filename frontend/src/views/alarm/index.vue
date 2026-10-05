<template>
  <section class="page" data-module="alarm">
    <header class="page-head">
      <div>
        <h2>预警发布管理</h2>
        <p class="page-desc">维护预警通知，围绕通知编号、隐患点编号、预警等级、触发条件做登记、筛选与状态流转。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记预警通知</button>
        <button class="btn" type="button" @click="exportRows">导出预警发布清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <section class="receipt-panel">
      <div class="receipt-head">
        <h3>回执筛选台</h3>
        <label class="unit-switch">
          <span>值班单位</span>
          <select v-model="unitChoice">
            <option v-for="unit in unitOptions" :key="unit" :value="unit">
              {{ unit === centralUnit ? `${unit}（全部单位）` : unit }}
            </option>
          </select>
        </label>
      </div>
      <p v-if="!session.isCentral" class="scope-hint">
        跨单位人员仅可查看本区（{{ session.unit }}）的通知与回执，缺接收单位的旧通知由县应急指挥中心统一分派。
      </p>

      <div class="tag-row">
        <button
          v-for="chip in tagChips"
          :key="chip.label"
          type="button"
          class="tag-chip"
          :class="{ active: receiptFilters.tag === chip.value }"
          @click="toggleTag(chip.value)"
        >
          {{ chip.label }}（{{ chip.count }}）
        </button>
      </div>

      <form class="filter-bar" @submit.prevent>
        <label class="filter-item">
          <span>预警等级</span>
          <select v-model="receiptFilters.level">
            <option value="">全部等级</option>
            <option v-for="level in levelOptions" :key="level" :value="level">{{ level }}</option>
          </select>
        </label>
        <label v-if="session.isCentral" class="filter-item">
          <span>接收单位</span>
          <select v-model="receiptFilters.unit">
            <option value="">全部单位</option>
            <option :value="unassignedUnit">待分派（缺接收单位）</option>
            <option v-for="unit in receivingUnitOptions" :key="unit" :value="unit">{{ unit }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>发布时间起</span>
          <input v-model="receiptFilters.publishFrom" type="date" />
        </label>
        <label class="filter-item">
          <span>发布时间止</span>
          <input v-model="receiptFilters.publishTo" type="date" />
        </label>
        <label class="filter-item">
          <span>响应状态</span>
          <select v-model="receiptFilters.tag">
            <option value="">全部状态</option>
            <option v-for="tag in allReceiptTags" :key="tag" :value="tag">{{ tag }}</option>
          </select>
        </label>
        <button class="btn ghost" type="button" @click="resetReceiptFilters">清空回执条件</button>
      </form>

      <div class="batch-bar">
        <button
          class="btn primary"
          type="button"
          :disabled="!selectedIds.length"
          @click="markBatch"
        >
          标记处理批次（已选 {{ selectedIds.length }} 条）
        </button>
        <span class="hint">已解除的结论与已入批次的通知不参与批量标记</span>
        <span v-if="batchMessage" class="batch-message">{{ batchMessage }}</span>
      </div>
    </section>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th>
            <input
              type="checkbox"
              title="全选当前筛选结果"
              :checked="allEligibleSelected"
              @change="toggleSelectAll"
            />
          </th>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>回执标签</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in receiptRows" :key="String(row.id)">
          <td>
            <input
              type="checkbox"
              :disabled="!batchEligible(row)"
              :checked="selectedIds.includes(Number(row.id))"
              @change="toggleSelect(Number(row.id))"
            />
          </td>
          <td v-for="column in columns" :key="column">
            <span v-if="column === '接收单位' && !row[column]" class="unassigned">待分派</span>
            <template v-else>{{ row[column] || '—' }}</template>
          </td>
          <td><span class="receipt-tag" :data-tag="tagOf(row)">{{ tagOf(row) }}</span></td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!receiptRows.length">
          <td :colspan="columns.length + 4" class="empty-state">当前条件下没有预警通知，可调整回执筛选台条件</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>筛选后 {{ receiptRows.length }} 条 / 共 {{ total }} 条预警发布记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  markAlarmBatch,
  moduleMeta,
  receivingUnits,
  runAction as applyAction,
} from '@/api/local-service'
import {
  ALL_RECEIPT_TAGS,
  QUICK_RECEIPT_TAGS,
  UNASSIGNED_UNIT,
  filterReceiptRows,
  isUnreleased,
  receiptTag,
} from '@/data/alarm-receipts'
import { CENTRAL_UNIT, useSessionStore } from '@/stores/session'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('alarm')
const columns = meta.fields
const actions = meta.actions
const statuses = meta.statuses
const centralUnit = CENTRAL_UNIT
const unassignedUnit = UNASSIGNED_UNIT
const allReceiptTags = ALL_RECEIPT_TAGS

const session = useSessionStore()

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const batchMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const selectedIds = ref<number[]>([])

const receiptFilters = ref({
  level: '',
  unit: '',
  tag: '',
  publishFrom: '',
  publishTo: '',
})

// 跨单位人员只能查看本区：取数时带上本单位范围。
const scope = computed(() => (session.isCentral ? {} : { unit: session.unit }))

// 值班单位切换只影响当前会话；中心看全部，其他单位看本区。
const unitChoice = computed({
  get: () => session.unit,
  set: (unit: string) => {
    session.setUnit(unit)
    receiptFilters.value.unit = ''
    selectedIds.value = []
    reload()
  },
})

const unitOptions = computed(() => [centralUnit, ...receivingUnits()])
const receivingUnitOptions = computed(() => receivingUnits())
const levelOptions = computed(() =>
  [...new Set(rows.value.map((row) => String(row['预警等级'] ?? '')).filter(Boolean))].sort(),
)

const stats = computed(() => {
  const now = new Date()
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  return [
    { label: '本月预警数', value: rows.value.filter((row) => String(row['发布时间'] ?? '').startsWith(month)).length },
    { label: '已响应数', value: rows.value.filter((row) => String(row.status) === '已响应').length },
    { label: '未解除数', value: rows.value.filter(isUnreleased).length },
  ]
})

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

// 先按等级/接收单位/发布时间收窄，再按响应状态标签定位；标签计数跟随前一组条件。
const baseRows = computed(() =>
  filterReceiptRows(rows.value, {
    level: receiptFilters.value.level,
    unit: receiptFilters.value.unit,
    publishFrom: receiptFilters.value.publishFrom,
    publishTo: receiptFilters.value.publishTo,
  }),
)
const receiptRows = computed(() =>
  filterReceiptRows(baseRows.value, { tag: receiptFilters.value.tag }),
)
const tagChips = computed(() => [
  { value: '', label: '全部', count: baseRows.value.length },
  ...QUICK_RECEIPT_TAGS.map((tag) => ({
    value: tag as string,
    label: tag as string,
    count: baseRows.value.filter((row) => receiptTag(row) === tag).length,
  })),
])

const eligibleIds = computed(() =>
  receiptRows.value.filter(batchEligible).map((row) => Number(row.id)),
)
const allEligibleSelected = computed(
  () => eligibleIds.value.length > 0 && eligibleIds.value.every((id) => selectedIds.value.includes(id)),
)

function tagOf(row: EntryRow) {
  return receiptTag(row)
}

// 已解除的结论不被批量覆盖，已入批次的通知不重复入批。
function batchEligible(row: EntryRow) {
  return String(row.status) !== '已解除' && !String(row['处理批次'] ?? '').trim()
}

function toggleTag(tag: string) {
  receiptFilters.value.tag = receiptFilters.value.tag === tag ? '' : tag
}

function resetReceiptFilters() {
  receiptFilters.value = { level: '', unit: '', tag: '', publishFrom: '', publishTo: '' }
}

function toggleSelect(id: number) {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((item) => item !== id)
    : [...selectedIds.value, id]
}

function toggleSelectAll() {
  selectedIds.value = allEligibleSelected.value
    ? selectedIds.value.filter((id) => !eligibleIds.value.includes(id))
    : [...new Set([...selectedIds.value, ...eligibleIds.value])]
}

function markBatch() {
  batchMessage.value = ''
  const result = markAlarmBatch(selectedIds.value, session.operator, scope.value)
  batchMessage.value = result.message
  if (result.ok) {
    selectedIds.value = []
    reload()
  }
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '预警通知登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  selectedIds.value = []
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value, scope.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '预警发布列表读取失败'
  }
}

onMounted(reload)
</script>
