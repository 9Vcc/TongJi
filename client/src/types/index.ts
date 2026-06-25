// 角色枚举
export type Role = 'HUIZHANG' | 'CHAOGUAN' | 'GUANLI'

// 账户状态
export type AccountStatus = 'ACTIVE' | 'DISABLED'

// 通知类型
export type NotificationType = 'RULE_CHANGE' | 'DATA_UPDATE' | 'SYSTEM'

// 历史操作类型
export type HistoryAction = 'UPDATE' | 'DELETE'

// 统计周期
export type StatCycle = 'WEEK' | 'MONTH'

// 用户/账户
export interface User {
  id: number
  username: string
  role: Role
  branchId: number | null
  status: AccountStatus
  createdAt?: string
  branch?: { id: number; name: string } | null
}

// 登录响应
export interface LoginResponse {
  token: string
  user: User
}

// 分部
export interface Branch {
  id: number
  name: string
  statCycle: StatCycle
  createdAt: string
  personnelCount?: number
  dataRecordCount?: number
}

// 人员本周数据
export interface PersonnelWeekData {
  id: number
  personnelId: number
  branchId: number
  weekStart: string
  sg: number
  mx: number
  qm: number
}

// 人员
export interface Personnel {
  id: number
  name: string
  createdAt: string
  branches?: { id: number; name: string }[]
  hasDataThisWeek?: boolean
  weekData?: PersonnelWeekData[]
}

// 数据记录
export interface DataRecord {
  id: number
  personnelId: number
  branchId: number
  weekStart: string
  sg: number
  mx: number
  qm: number
  createdBy: number
  createdAt: string
  personnel?: { id: number; name: string }
  branch?: { id: number; name: string }
  // 查询接口返回的扩展字段
  personnelName?: string
  branchName?: string
  welfare?: number
}

// 数据修改历史
export interface DataHistory {
  id: number
  recordId: number
  modifierId: number
  modifyTime: string
  action: HistoryAction
  field: string | null
  oldValue: string | null
  newValue: string | null
  modifier?: { id: number; username: string }
}

// 奖励规则
export interface RewardRule {
  id: number
  branchId: number
  sgRatio: number
  qmRatio: number
  rank1Reward: number
  rank2Reward: number
  rank3Reward: number
  maixuThreshold: number
  maixuReward: number
  maixuMinStandard: number
  maixuMinEnabled: boolean
  sgEnabled: boolean
  qmEnabled: boolean
  rankEnabled: boolean
  maixuEnabled: boolean
  branch?: { id: number; name: string }
}

// 通知
export interface Notification {
  id: number
  branchId: number
  type: NotificationType
  content: string
  isRead: boolean
  createdAt: string
  branch?: { id: number; name: string }
}

// 排名项
export interface RankingItem {
  rank: number
  personnelId: number
  personnelName: string
  branchId: number
  branchName: string
  sg: number
  mx: number
  qm: number
  baseWelfare: number
  rankReward: number
  totalWelfare: number
}

// 看板汇总
export interface DashboardSummary {
  personnelCount: number
  totalSG: number
  totalMX: number
  totalQM: number
  totalWelfare: number
}

// 周对比
export interface WeekCompareItem {
  personnelId: number
  personnelName: string
  branchId: number
  branchName: string
  week1: {
    id: number
    sg: number
    mx: number
    qm: number
    welfare: number
  } | null
  week2: {
    id: number
    sg: number
    mx: number
    qm: number
    welfare: number
  } | null
}

// 看板周对比
export interface DashboardCompare {
  thisWeek: {
    weekStart: string
    personnelCount: number
    totalSG: number
    totalMX: number
    totalQM: number
    totalWelfare: number
  }
  lastWeek: {
    weekStart: string
    personnelCount: number
    totalSG: number
    totalMX: number
    totalQM: number
    totalWelfare: number
  }
}

// 导入结果
export interface ImportResult {
  success: number
  failed: number
  failures: { row: number; name: string; reason: string }[]
}

// 创建账户入参
export interface CreateAccountInput {
  username: string
  password: string
  role: Role
  branchId?: number
}

// 更新账户入参
export interface UpdateAccountInput {
  username?: string
  password?: string
  role?: Role
  branchId?: number | null
}

// 创建人员入参
export interface CreatePersonnelInput {
  name: string
  branchId: number
}

// 数据记录入参
export interface CreateRecordInput {
  personnelId: number
  branchId: number
  sg: number
  mx: number
  qm: number
}

// 更新数据记录入参
export interface UpdateRecordInput {
  sg?: number
  mx?: number
  qm?: number
  personnelId?: number
}

// 更新奖励规则入参
export interface UpdateRewardRuleInput {
  sgRatio?: number
  qmRatio?: number
  rank1Reward?: number
  rank2Reward?: number
  rank3Reward?: number
  maixuThreshold?: number
  maixuReward?: number
  maixuMinStandard?: number
  sgEnabled?: boolean
  qmEnabled?: boolean
  rankEnabled?: boolean
  maixuEnabled?: boolean
  maixuMinEnabled?: boolean
}

// 录入历史记录日志项（创建/修改/删除统一结构）
export type DataLogType = 'create' | 'update' | 'delete'

export interface DataLogItem {
  id: number
  type: DataLogType
  time: string
  personnelId: number
  personnelName: string
  branchId: number
  branchName: string
  weekStart: string
  operatorId: number
  operatorName: string
  action?: HistoryAction
  field?: string | null
  oldValue?: string | null
  newValue?: string | null
  recordId: number | null
  // 创建/当前记录的数值（type=create 时使用）
  sg?: number
  mx?: number
  qm?: number
}
