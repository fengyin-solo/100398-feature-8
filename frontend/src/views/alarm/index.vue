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
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
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
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无预警发布数据，可先登记预警通知</td>
        </tr>
      </tbody>
    </table>

    <section class="receipt-console">
      <header class="console-head">
        <div>
          <h3>回执筛选台</h3>
          <p class="page-desc">
            按等级、接收单位、发布时间和响应状态组合定位回执；发布超过 {{ timeoutHours }} 小时未响应记为超时响应，缺接收单位的旧通知进入待分派。
            <span v-if="isUnitViewer">当前为单位视角，仅显示「{{ session.unit }}」的通知。</span>
          </p>
        </div>
      </header>

      <form class="filter-bar" @submit.prevent="reloadReceipts">
        <label class="filter-item">
          <span>预警等级</span>
          <select v-model="receiptFilters.level">
            <option value="">全部等级</option>
            <option v-for="level in facets.levels" :key="level" :value="level">{{ level }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>接收单位</span>
          <select v-model="receiptFilters.unit" :disabled="isUnitViewer">
            <option value="">全部单位</option>
            <option :value="pendingDispatch">{{ pendingDispatch }}</option>
            <option v-for="unit in facets.units" :key="unit" :value="unit">{{ unit }}</option>
          </select>
        </label>
        <label class="filter-item">
          <span>发布时间起</span>
          <input v-model="receiptFilters.from" type="date" />
        </label>
        <label class="filter-item">
          <span>发布时间止</span>
          <input v-model="receiptFilters.to" type="date" />
        </label>
        <label class="filter-item">
          <span>响应状态</span>
          <select v-model="receiptFilters.tag">
            <option value="">全部状态</option>
            <option v-for="tag in receiptTags" :key="tag" :value="tag">{{ tag }}</option>
          </select>
        </label>
        <button class="btn" type="submit">查询</button>
        <button class="btn ghost" type="button" @click="resetReceiptFilters">重置条件</button>
      </form>

      <p class="status-legend">
        <span
          v-for="tag in receiptTags"
          :key="tag"
          class="legend-item tag-chip"
          :class="tagClass(tag)"
        >
          {{ tag }}：{{ receiptTagCounts[tag] ?? 0 }}
        </span>
      </p>

      <table class="data-table">
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                :checked="allSelected"
                :disabled="!receiptRows.length"
                @change="toggleSelectAll"
              />
            </th>
            <th>通知编号</th>
            <th>预警等级</th>
            <th>接收单位</th>
            <th>发布时间</th>
            <th>通知状态</th>
            <th>回执标签</th>
            <th>处理批次</th>
            <th>响应时间</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in receiptRows" :key="row.id">
            <td>
              <input
                type="checkbox"
                :checked="selectedIds.has(row.id)"
                :disabled="row.tag === '已解除' || row.tag === '误报'"
                @change="toggleSelect(row.id)"
              />
            </td>
            <td>{{ row.通知编号 }}</td>
            <td>{{ row.预警等级 }}</td>
            <td>{{ row.接收单位 || pendingDispatch }}</td>
            <td>{{ row.发布时间 }}</td>
            <td>{{ row.status }}</td>
            <td>
              <span class="tag-chip" :class="tagClass(row.tag)">
                {{ row.tag }}<template v-if="row.tag === '超时响应'">（超 {{ row.overdueHours }} 小时）</template>
              </span>
            </td>
            <td>{{ row.batch || '—' }}</td>
            <td>{{ row.respondedAt || '—' }}</td>
          </tr>
          <tr v-if="!receiptRows.length">
            <td colspan="9" class="empty-state">当前筛选条件下没有回执记录</td>
          </tr>
        </tbody>
      </table>

      <div class="batch-bar">
        <span>已选 {{ selectedIds.size }} 条</span>
        <button class="btn primary" type="button" @click="markBatch">标记处理批次（批量登记响应）</button>
        <span v-if="batchMessage" class="batch-message" :class="{ 'error-text': batchFailed }">
          {{ batchMessage }}
        </span>
      </div>
    </section>

    <footer class="page-foot">
      <span>共 {{ total }} 条预警发布记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'

import {
  PENDING_DISPATCH,
  RECEIPT_TAGS,
  RESPONSE_TIMEOUT_HOURS,
  alarmFacets,
  alarmStats,
  downloadEntries,
  listEntries,
  listReceipts,
  markReceiptBatch,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow, ReceiptFilters, ReceiptRow, ReceiptTag } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const meta = moduleMeta('alarm')
const columns = ["通知编号", "隐患点编号", "预警等级", "触发条件", "发布时间", "接收单位", "发布人", "通知状态"]
const actions = ["确认发布", "登记响应", "解除预警"]
const statuses = ["待发布", "已发布", "已响应", "已解除", "误报"]

const session = useSessionStore()
const scope = computed(() => session.viewerScope)
const isUnitViewer = computed(() => session.role === 'unit')

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const stats = ref<{ label: string; value: number }[]>([])
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

// ---------- 回执筛选台 ----------
const pendingDispatch = PENDING_DISPATCH
const timeoutHours = RESPONSE_TIMEOUT_HOURS
const receiptTags = RECEIPT_TAGS
const receiptFilters = reactive<ReceiptFilters>({ level: '', unit: '', from: '', to: '', tag: '' })
const receiptRows = ref<ReceiptRow[]>([])
const receiptTagCounts = ref<Partial<Record<ReceiptTag, number>>>({})
const facets = ref<{ levels: string[]; units: string[] }>({ levels: [], units: [] })
const selectedIds = reactive(new Set<number>())
const batchMessage = ref('')
const batchFailed = ref(false)

const allSelected = computed(
  () => receiptRows.value.length > 0 && receiptRows.value.every((row) => selectedIds.has(row.id)),
)

const TAG_CLASS: Record<ReceiptTag, string> = {
  误报: 'tag-muted',
  已解除: 'tag-done',
  已响应: 'tag-ok',
  待发布: 'tag-muted',
  待分派: 'tag-dispatch',
  超时响应: 'tag-danger',
  未响应: 'tag-warn',
}

function tagClass(tag: ReceiptTag): string {
  return TAG_CLASS[tag] ?? ''
}

function toggleSelect(id: number) {
  if (selectedIds.has(id)) {
    selectedIds.delete(id)
  } else {
    selectedIds.add(id)
  }
}

function toggleSelectAll() {
  if (allSelected.value) {
    selectedIds.clear()
    return
  }
  for (const row of receiptRows.value) {
    if (row.tag !== '已解除' && row.tag !== '误报') {
      selectedIds.add(row.id)
    }
  }
}

function markBatch() {
  batchMessage.value = ''
  batchFailed.value = false
  const result = markReceiptBatch([...selectedIds], scope.value, session.operator)
  batchMessage.value = result.message
  batchFailed.value = !result.ok
  if (result.ok) {
    selectedIds.clear()
  }
  reload()
}

function resetReceiptFilters() {
  receiptFilters.level = ''
  receiptFilters.unit = isUnitViewer.value ? session.unit : ''
  receiptFilters.from = ''
  receiptFilters.to = ''
  receiptFilters.tag = ''
  reloadReceipts()
}

function reloadReceipts() {
  const payload = listReceipts(receiptFilters, scope.value)
  receiptRows.value = payload.items
  receiptTagCounts.value = payload.tagCounts
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
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value, scope.value)
    rows.value = payload.items
    total.value = payload.total
    stats.value = alarmStats(scope.value)
    facets.value = alarmFacets()
    if (isUnitViewer.value) {
      // 单位视角下接收单位固定为本单位，避免误以为能看别区。
      receiptFilters.unit = session.unit
    }
    reloadReceipts()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '预警发布列表读取失败'
  }
}

watch(() => [session.role, session.unit], reload)

onMounted(reload)
</script>
