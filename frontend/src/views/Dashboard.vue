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

    <section class="receipt-console">
      <header class="console-head">
        <div>
          <h3>预警未解除明细</h3>
          <p class="page-desc">
            共 {{ unresolved.total }} 条未解除通知（已解除、误报视为已有结论，不再列出）；回执筛选台标记处理批次后，这里的状态同步更新。
            <span v-if="session.role === 'unit'">当前为单位视角，仅显示「{{ session.unit }}」。</span>
          </p>
        </div>
      </header>
      <table class="data-table">
        <thead>
          <tr>
            <th>通知编号</th>
            <th>预警等级</th>
            <th>接收单位</th>
            <th>发布时间</th>
            <th>当前状态</th>
            <th>回执标签</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in unresolved.items" :key="row.id">
            <td>{{ row.通知编号 }}</td>
            <td>{{ row.预警等级 }}</td>
            <td>{{ row.接收单位 || '待分派' }}</td>
            <td>{{ row.发布时间 }}</td>
            <td>{{ row.status }}</td>
            <td>{{ row.tag }}</td>
          </tr>
          <tr v-if="!unresolved.items.length">
            <td colspan="6" class="empty-state">当前没有未解除的预警通知</td>
          </tr>
        </tbody>
      </table>
    </section>

    <footer class="page-foot">
      <span>数据保存在本机浏览器里，换浏览器或清缓存会回到示例数据</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { onMounted, ref, watch } from 'vue'

import { loadOverview } from '@/api/local-service'
import type { OverviewResult } from '@/data/types'
import { useSessionStore } from '@/stores/session'

const session = useSessionStore()
const cards = ref<OverviewResult['cards']>([])
const moduleRows = ref<OverviewResult['modules']>([])
const unresolved = ref<OverviewResult['alarmUnresolved']>({ total: 0, items: [] })

function refresh() {
  const payload = loadOverview(session.viewerScope)
  cards.value = payload.cards
  moduleRows.value = payload.modules
  unresolved.value = payload.alarmUnresolved
}

watch(() => [session.role, session.unit], refresh)

onMounted(refresh)
</script>
