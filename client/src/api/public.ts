import axios from 'axios'
import type { RankingItem, RewardRule, Branch, PublicPersonnelItem } from '../types'

/**
 * 公开 API 客户端：不附加 token，用于无需登录的公开页面
 * 与主 request 实例隔离，避免 401 跳转登录影响访客
 */
const publicRequest = axios.create({
  baseURL: '/api/public',
  timeout: 30000,
})

// 响应拦截器：仅解包 data，不处理 401 跳转
publicRequest.interceptors.response.use(
  (response) => response.data,
  (error) => Promise.reject(error)
)

export function getPublicErrorMessage(error: unknown): string {
  if (axios.isAxiosError(error)) {
    return error.response?.data?.error || error.message || '请求失败'
  }
  if (error instanceof Error) return error.message
  return '未知错误'
}

export const publicApi = {
  listBranches() {
    return publicRequest.get<unknown, Branch[]>('/branches')
  },
  listWeeks(branchId?: number) {
    return publicRequest.get<unknown, string[]>('/weeks', {
      params: branchId ? { branchId } : undefined,
    })
  },
  getRanking(weekStart?: string, branchId?: number, cycle?: 'WEEK' | 'MONTH') {
    return publicRequest.get<unknown, RankingItem[]>('/ranking', {
      params: { weekStart, branchId, cycle },
    })
  },
  getRewardRules(branchId?: number) {
    return publicRequest.get<unknown, RewardRule[]>('/reward-rules', {
      params: branchId ? { branchId } : undefined,
    })
  },
  listPersonnel() {
    return publicRequest.get<unknown, PublicPersonnelItem[]>('/personnel')
  },
}
