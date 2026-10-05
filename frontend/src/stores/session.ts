import { defineStore } from 'pinia'

// 县级指挥中心可以查看全部单位；其他单位（跨单位人员）只能查看本区。
export const CENTRAL_UNIT = '县应急指挥中心'

export const useSessionStore = defineStore('session', {
  state: () => ({
    operator: '值班管理员',
    shiftLabel: '白班 08:00-20:00',
    scope: '地质灾害隐患点监测防治管理系统',
    unit: CENTRAL_UNIT,
  }),
  getters: {
    canOperate: (state) => state.operator.length > 0,
    isCentral: (state) => state.unit === CENTRAL_UNIT,
  },
  actions: {
    setShift(label: string) {
      this.shiftLabel = label
    },
    setUnit(unit: string) {
      this.unit = unit
    },
  },
})
