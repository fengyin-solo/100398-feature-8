import { defineStore } from 'pinia'

import type { ViewerScope } from '@/data/types'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '地质灾害隐患点监测防治管理系统',
    // center=中心值班（看全部），unit=跨单位人员（只看本单位）
    role: 'center' as ViewerScope['role'],
    unit: '',
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
    viewerScope: (state): ViewerScope => ({ role: state.role, unit: state.unit }),
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setRole(role: ViewerScope['role']) {
      this.role = role
      if (role === 'center') {
        this.unit = ''
      }
    },
    setUnit(unit: string) {
      this.unit = unit
    },
  },
})
