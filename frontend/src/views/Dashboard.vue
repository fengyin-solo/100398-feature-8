<template>
  <section class="page">
    <header class="page-head">
      <div>
        <h2>运营概览</h2>
        <p class="page-desc">汇总各业务模块的关键指标，先看总量再看异常。</p>
      </div>
      <div class="page-actions">
        <button class="btn" type="button" @click="refresh">重新统计</button>
      </div>
    </header>
    <div class="stat-row">
      <article v-for="card in cards" :key="card.label" class="stat-card">
        <span class="stat-label">{{ card.label }}</span>
        <strong class="stat-value">{{ card.value }}</strong>
      </article>
    </div>
    <table class="data-table">
      <thead>
        <tr><th>业务模块</th><th>今日新增</th><th>待处理</th><th>异常量</th></tr>
      </thead>
      <tbody>
        <tr v-for="row in moduleRows" :key="row.name">
          <td>{{ row.name }}</td>
          <td>{{ row.created }}</td>
          <td>{{ row.pending }}</td>
          <td>{{ row.abnormal }}</td>
        </tr>
      </tbody>
    </table>

    <h3 class="detail-title">预警未解除明细</h3>
    <p v-if="!store.isCentral" class="scope-hint">跨单位人员仅显示本区（{{ store.unit }}）的未解除通知。</p>
    <table class="data-table">
      <thead>
        <tr>
          <th>通知编号</th>
          <th>预警等级</th>
          <th>接收单位</th>
          <th>发布时间</th>
          <th>当前状态</th>
          <th>回执标签</th>
          <th>处理批次</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in unreleased" :key="row.id">
          <td>{{ row.noticeNo }}</td>
          <td>{{ row.level }}</td>
          <td>
            <span :class="{ unassigned: row.unit === unassignedUnit }">{{ row.unit }}</span>
          </td>
          <td>{{ row.publishTime || '—' }}</td>
          <td>{{ row.status }}</td>
          <td><span class="receipt-tag" :data-tag="row.tag">{{ row.tag }}</span></td>
          <td>{{ row.batch }}</td>
        </tr>
        <tr v-if="!unreleased.length">
          <td colspan="7" class="empty-state">当前没有未解除的预警通知</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

import { loadOverview } from '@/api/local-service'
import { UNASSIGNED_UNIT } from '@/data/alarm-receipts'
import { useSessionStore } from '@/stores/session'
import type { OverviewResult } from '@/data/types'

const store = useSessionStore()
const unassignedUnit = UNASSIGNED_UNIT

const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const unreleased = ref<OverviewResult['unreleasedAlarms']>([])

function refresh() {
  // 跨单位人员只能查看本区，概览与未解除明细都按值班单位收窄。
  const payload = loadOverview(store.isCentral ? {} : { unit: store.unit })
  cards.value = payload.cards
  moduleRows.value = payload.modules
  unreleased.value = payload.unreleasedAlarms
}

onMounted(refresh)
</script>
