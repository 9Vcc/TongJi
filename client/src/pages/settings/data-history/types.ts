import type { DataLogType } from '../../../types'

// 数据字段类型
export type FieldKey = 'sg' | 'mx' | 'qm' | 'zcDays'

// 四级交互视图状态
export type ViewState =
  | { level: 'type' }
  | { level: 'personnel'; type: DataLogType }
  | { level: 'field'; type: DataLogType; personnelId: number }
  | {
      level: 'detail'
      type: DataLogType
      personnelId: number
      field: FieldKey
    }

// 人员聚合项：用于 Level 2 人员卡片展示
export interface PersonnelAgg {
  personnelId: number
  personnelName: string
  branchName: string
  count: number
  lastTime: string
}

// 字段聚合项：用于 Level 3 字段卡片展示
export interface FieldAgg {
  field: FieldKey
  label: string
  color: string
  count: number
  lastTime: string
}

// 面包屑项
export interface BreadcrumbItem {
  label: string
  onClick?: () => void
}

// 分页大小
export const DETAIL_PAGE_SIZE = 10
export const PERSONNEL_PAGE_SIZE = 24
