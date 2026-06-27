import axios from 'axios'
import type {
  User,
  LoginResponse,
  Branch,
  Personnel,
  DataRecord,
  DataHistory,
  RewardRule,
  Notification,
  RankingItem,
  DashboardSummary,
  DashboardCompare,
  ImportResult,
  CreateAccountInput,
  UpdateAccountInput,
  CreatePersonnelInput,
  CreateRecordInput,
  UpdateRecordInput,
  UpdateRewardRuleInput,
  WeekCompareItem,
  DataLogItem,
  LoginRecord,
  NamingLevel,
} from '../types'

const request = axios.create({
  // 相对路径，由 Vite proxy / 反向代理转发到后端，避免硬编码 localhost 导致公网访问失败
  baseURL: '/api',
  timeout: 30000,
})

// 请求拦截器：附加 token
request.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error) => Promise.reject(error)
)

// 响应拦截器：401 跳转登录
request.interceptors.response.use(
  (response) => response.data,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('token')
      // 避免在登录页循环跳转
      if (window.location.pathname !== '/login') {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

// 统一错误消息提取
export function getErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.message || '请求失败'
  }
  if (error instanceof Error) return error.message
  return '未知错误'
}

// ============ 认证 ============
export const authApi = {
  login(username: string, password: string) {
    return request.post<unknown, LoginResponse>('/auth/login', {
      username,
      password,
    })
  },
  getMe() {
    return request.get<unknown, User>('/auth/me')
  },
  seed() {
    return request.post<unknown, { message: string; user: User }>(
      '/seed'
    )
  },
}

// ============ 账户管理 ============
export const accountsApi = {
  list() {
    return request.get<unknown, User[]>('/accounts')
  },
  create(data: CreateAccountInput) {
    return request.post<unknown, User>('/accounts', data)
  },
  update(id: number, data: UpdateAccountInput) {
    return request.put<unknown, User>(`/accounts/${id}`, data)
  },
  updateStatus(id: number, status: 'ACTIVE' | 'DISABLED') {
    return request.patch<unknown, User>(`/accounts/${id}/status`, { status })
  },
  delete(id: number) {
    return request.delete<unknown, { message: string }>(`/accounts/${id}`)
  },
}

// ============ 厅管理 ============
export const branchesApi = {
  list() {
    return request.get<unknown, Branch[]>('/branches')
  },
  create(name: string, statCycle?: 'WEEK' | 'MONTH') {
    return request.post<unknown, Branch>('/branches', { name, statCycle })
  },
  update(id: number, data: { name?: string; statCycle?: 'WEEK' | 'MONTH' }) {
    return request.put<unknown, Branch>(`/branches/${id}`, data)
  },
  delete(id: number, password: string) {
    return request.delete<unknown, { message: string }>(`/branches/${id}`, {
      data: { password },
    })
  },
}

// ============ 人员管理 ============
export const personnelApi = {
  list(branchId?: number) {
    return request.get<unknown, Personnel[]>('/personnel', {
      params: branchId ? { branchId } : undefined,
    })
  },
  create(data: CreatePersonnelInput) {
    return request.post<unknown, Personnel>('/personnel', data)
  },
  delete(id: number, branchId: number) {
    return request.delete<unknown, { message: string }>(`/personnel/${id}`, {
      params: { branchId },
    })
  },
}

// ============ 数据录入 ============
export const dataRecordsApi = {
  list(params?: { weekStart?: string; branchId?: number }) {
    return request.get<unknown, DataRecord[]>('/data-records', { params })
  },
  create(data: CreateRecordInput) {
    return request.post<unknown, DataRecord>('/data-records', data)
  },
  importExcel(file: File, branchId?: number) {
    const formData = new FormData()
    formData.append('file', file)
    if (branchId) formData.append('branchId', String(branchId))
    return request.post<unknown, ImportResult>(
      '/data-records/import-excel',
      formData,
      { headers: { 'Content-Type': 'multipart/form-data' } }
    )
  },
  importPaste(data: string, branchId?: number) {
    return request.post<unknown, ImportResult>('/data-records/import-paste', {
      data,
      branchId,
    })
  },
  update(id: number, data: UpdateRecordInput) {
    return request.put<unknown, DataRecord>(`/data-records/${id}`, data)
  },
  delete(id: number) {
    return request.delete<unknown, { message: string }>(`/data-records/${id}`)
  },
  getHistory(id: number) {
    return request.get<unknown, DataHistory[]>(`/data-records/${id}/history`)
  },
}

// ============ 数据查询 ============
export const dataQueryApi = {
  listByWeek(weekStart?: string, branchId?: number) {
    return request.get<unknown, DataRecord[]>('/data-records', {
      params: { weekStart, branchId },
    })
  },
  getWeeks(branchId?: number) {
    return request.get<unknown, string[]>('/weeks', {
      params: branchId ? { branchId } : undefined,
    })
  },
  compare(week1: string, week2: string, branchId?: number) {
    return request.get<unknown, WeekCompareItem[]>('/data-records/compare', {
      params: { week1, week2, branchId },
    })
  },
}

// ============ 奖励规则 ============
export const rewardRulesApi = {
  get(branchId?: number) {
    return request.get<unknown, RewardRule[]>('/reward-rules', {
      params: branchId ? { branchId } : undefined,
    })
  },
  update(branchId: number, data: UpdateRewardRuleInput) {
    return request.put<unknown, RewardRule>(`/reward-rules/${branchId}`, data)
  },
}

// ============ 冠名等级 ============
export const namingLevelsApi = {
  get(branchId?: number) {
    return request.get<unknown, NamingLevel[]>('/naming-levels', {
      params: branchId ? { branchId } : undefined,
    })
  },
  create(data: {
    branchId: number
    name: string
    threshold: number
    reward?: number
    sortOrder?: number
  }) {
    return request.post<unknown, NamingLevel>('/naming-levels', data)
  },
  update(
    id: number,
    data: {
      name?: string
      threshold?: number
      reward?: number
      sortOrder?: number
    }
  ) {
    return request.put<unknown, NamingLevel>(`/naming-levels/${id}`, data)
  },
  remove(id: number) {
    return request.delete<unknown, { message: string }>(`/naming-levels/${id}`)
  },
}

// ============ 排名 ============
export const rankingApi = {
  getRanking(
    weekStart?: string,
    branchId?: number,
    cycle?: 'WEEK' | 'MONTH',
    viewAll?: boolean
  ) {
    return request.get<unknown, RankingItem[]>('/ranking', {
      params: { weekStart, branchId, cycle, viewAll: viewAll ? 'true' : undefined },
    })
  },
}

// ============ 看板 ============
export const dashboardApi = {
  getSummary(
    weekStart?: string,
    branchId?: number,
    cycle?: 'WEEK' | 'MONTH',
    viewAll?: boolean
  ) {
    return request.get<unknown, DashboardSummary>('/dashboard/summary', {
      params: { weekStart, branchId, cycle, viewAll: viewAll ? 'true' : undefined },
    })
  },
  getTop3(
    weekStart?: string,
    branchId?: number,
    cycle?: 'WEEK' | 'MONTH',
    viewAll?: boolean
  ) {
    return request.get<unknown, RankingItem[]>('/dashboard/top3', {
      params: { weekStart, branchId, cycle, viewAll: viewAll ? 'true' : undefined },
    })
  },
  getCompare(
    weekStart?: string,
    branchId?: number,
    cycle?: 'WEEK' | 'MONTH',
    viewAll?: boolean
  ) {
    return request.get<unknown, DashboardCompare>('/dashboard/compare', {
      params: { weekStart, branchId, cycle, viewAll: viewAll ? 'true' : undefined },
    })
  },
}

// ============ 导出 ============
export const exportApi = {
  exportExcel(weekStart?: string, branchId?: number, cycle?: 'WEEK' | 'MONTH') {
    return request.get<unknown, Blob>('/export/excel', {
      params: { weekStart, branchId, cycle },
      responseType: 'blob',
    })
  },
  exportCSV(weekStart?: string, branchId?: number, cycle?: 'WEEK' | 'MONTH') {
    return request.get<unknown, Blob>('/export/csv', {
      params: { weekStart, branchId, cycle },
      responseType: 'blob',
    })
  },
}

// ============ 录入历史记录 ============
export const dataHistoryApi = {
  list(params?: {
    date?: string
    weekStart?: string
    branchId?: number
    personnelId?: number
    modifierId?: number
    type?: 'create' | 'update' | 'delete'
    limit?: number
  }) {
    return request.get<unknown, DataLogItem[]>('/data-history', {
      params: { ...params, limit: params?.limit ?? 50 },
    })
  },
}

// ============ 登录记录 ============
export const loginRecordsApi = {
  list(params?: { accountId?: number; date?: string; limit?: number }) {
    return request.get<unknown, LoginRecord[]>('/login-records', {
      params: { ...params, limit: params?.limit ?? 50 },
    })
  },
}

// ============ 通知 ============
export const notificationsApi = {
  list(params?: {
    branchId?: number
    type?: 'RANK_PUBLISH' | 'RULE_CHANGE' | 'DATA_CHANGE'
    isRead?: boolean
    limit?: number
  }) {
    return request.get<unknown, Notification[]>('/notifications', {
      params: {
        ...params,
        isRead: params?.isRead === undefined ? undefined : String(params.isRead),
      },
    })
  },
  markRead(id: number) {
    return request.patch<unknown, Notification>(`/notifications/${id}/read`)
  },
  markAllRead(branchId?: number) {
    return request.patch<unknown, { message: string; count: number }>(
      '/notifications/read-all',
      { params: branchId ? { branchId } : undefined }
    )
  },
  remove(id: number) {
    return request.delete<unknown, { message: string }>(`/notifications/${id}`)
  },
  clearRead(branchId?: number) {
    return request.delete<unknown, { message: string; count: number }>(
      '/notifications',
      { params: branchId ? { branchId } : undefined }
    )
  },
}

export default request
