// 角色枚举
export type Role = 'HUIZHANG' | 'CHAOGUAN' | 'GUANLI'

// 账户状态
export type AccountStatus = 'ACTIVE' | 'DISABLED'

// 通知类型（与后端 NotificationType 枚举一致）
export type NotificationType = 'RANK_PUBLISH' | 'RULE_CHANGE' | 'DATA_CHANGE'

// 历史操作类型
export type HistoryAction = 'UPDATE' | 'DELETE'

// 统计周期
export type StatCycle = 'WEEK' | 'MONTH'

// 用户/账户
export interface User {
  id: number
  username: string
  nickname?: string | null
  role: Role
  branchId: number | null
  // 主合厅组 ID（超管主厅为合厅组时设置，此时 branchId 可为 null）
  mainGroupId?: number | null
  // 主合厅组详情
  mainGroup?: { id: number; name: string } | null
  branchIds?: number[]
  // 授权合厅组 ID 列表（仅超管有值）
  groupIds?: number[]
  // 授权合厅组详情
  groups?: { id: number; name: string }[]
  status: AccountStatus
  createdAt?: string
  branch?: { id: number; name: string } | null
  branches?: { id: number; name: string }[]
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
  closed?: boolean
  createdAt: string
  personnelCount?: number
  dataRecordCount?: number
}

// 合厅组（多个厅的持久化分组）
export interface BranchGroup {
  id: number
  name: string
  createdAt: string
  branches: {
    id: number
    name: string
    statCycle: StatCycle
    closed: boolean
  }[]
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
  branches?: { id: number; name: string; statCycle?: StatCycle }[]
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
  zcDays: number
  createdBy: number
  createdAt: string
  personnel?: { id: number; name: string }
  branch?: { id: number; name: string }
  // 查询接口返回的扩展字段
  personnelName?: string
  branchName?: string
  welfare?: number
  // 福利扣减（按周期独立存储，与 DataRecord 解耦）
  deduction?: number
  // 最终福利 = welfare - deduction
  finalWelfare?: number
  // 冠名明细（按月统计厅返回）
  namings?: NamingItem[]
  // 最近一次录入/修改的备注（覆盖式存储）
  remark?: string | null
  // 最后更新时间（用于按最近修改排序）
  updatedAt?: string
}

// 福利扣减记录
export interface Deduction {
  id: number
  branchId: number
  personnelId: number
  periodStart: string
  amount: number
  createdBy: number
  createdAt: string
  updatedAt: string
  personnel?: { id: number; name: string }
}

// 冠名等级
export interface NamingLevel {
  id: number
  branchId: number
  name: string
  threshold: number
  reward: number
  sortOrder: number
  createdAt: string
  branch?: { id: number; name: string }
}

// 冠名明细项（数据记录 / 排名项通用）
export interface NamingItem {
  levelId: number
  levelName: string
  count: number
  reward: number
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
  stackRankAndMaixu: boolean
  zcEnabled: boolean
  zcDayReward: number
  mxSlotEnabled: boolean
  branch?: { id: number; name: string }
}

// 时间段倍率配置
export interface TimeSlotMultiplier {
  slotIndex: number
  slotLabel: string
  multiplier: number
}

// 时间段录入记录项
export interface SlotRecordItem {
  personnelId: number
  sg: number
  rawMx: number
  qm: number
  zcDays: number
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
  zcDays: number
  baseWelfare: number
  zcWelfare: number
  rankReward: number
  totalWelfare: number
  // 冠名福利总额
  namingWelfare: number
  // 福利扣减
  deduction: number
  // 冠名明细
  namings: NamingItem[]
}

// 公开人员查询项（人员-厅扁平化）
export interface PublicPersonnelItem {
  personnelId: number
  personnelName: string
  branchId: number
  branchName: string
  statCycle: StatCycle
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
    zcDays: number
    welfare: number
  } | null
  week2: {
    id: number
    sg: number
    mx: number
    qm: number
    zcDays: number
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
  // 导入时自动创建的人员姓名列表
  createdPersons?: string[]
}

// 创建账户入参
export interface CreateAccountInput {
  username: string
  nickname?: string
  password: string
  role: Role
  branchId?: number
  branchIds?: number[]
  // 授权合厅组 ID 列表（仅超管角色）
  groupIds?: number[]
  // 主合厅组 ID（超管主厅为合厅组时设置）
  mainGroupId?: number | null
}

// 更新账户入参
export interface UpdateAccountInput {
  username?: string
  nickname?: string | null
  password?: string
  role?: Role
  branchId?: number | null
  branchIds?: number[]
  // 授权合厅组 ID 列表（仅超管角色）
  groupIds?: number[]
  // 主合厅组 ID（null 表示清除主合厅组）
  mainGroupId?: number | null
}

// 创建人员入参
export interface CreatePersonnelInput {
  name: string
  branchId: number
}

// 批量导入人员结果
export interface PersonnelBatchResult {
  success: number
  failed: number
  createdPersons: string[]
  failures: { name: string; reason: string }[]
}

// 数据记录入参
export interface CreateRecordInput {
  personnelId: number
  branchId: number
  sg: number
  mx: number
  qm: number
  zcDays: number
  // 录入目标周的周一（YYYY-MM-DD）
  // 不传则由后端使用服务器当前周（不推荐，存在时区 bug）
  // 周统计厅：传用户查看的周；月统计厅：传当前周的周一
  weekStart?: string
  // 录入备注（覆盖式存储到 DataRecord.remark）
  remark?: string
}

// 更新数据记录入参
export interface UpdateRecordInput {
  sg?: number
  mx?: number
  qm?: number
  zcDays?: number
  personnelId?: number
  // 冠名数量（覆盖语义）：传入即覆盖该记录所有等级的冠名数量
  namings?: { levelId: number; count: number }[]
  // 修改备注（覆盖式存储到 DataRecord.remark）
  remark?: string
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
  stackRankAndMaixu?: boolean
  zcEnabled?: boolean
  zcDayReward?: number
  mxSlotEnabled?: boolean
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
  zcDays?: number
  // 修改操作：变更前后的结构化数值（type=update 时使用）
  before?: { sg?: number; mx?: number; qm?: number; zcDays?: number; personnelId?: number } | null
  after?: { sg?: number; mx?: number; qm?: number; zcDays?: number; personnelId?: number } | null
  // 操作备注（DataRecord.remark 或 DataHistory.remark）
  remark?: string | null
}

// 登录记录
export interface LoginRecord {
  id: number
  accountId: number
  loginTime: string
  userAgent: string | null
  account: {
    id: number
    username: string
    role: Role
    branchId: number | null
  }
}
