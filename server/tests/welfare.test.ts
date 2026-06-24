import { describe, it, expect } from 'vitest'
import { computeBaseWelfare, computeRankReward } from '../src/utils/welfare'

// 与 schema 默认值一致的奖励规则
const defaultRule = {
  sgRatio: 3,
  qmRatio: 3,
  rank1Reward: 100,
  rank2Reward: 80,
  rank3Reward: 60,
  maixuThreshold: 40,
  maixuReward: 52,
}

describe('福利计算', () => {
  describe('基础福利计算（收光 × 比例 + 全麦 × 比例）', () => {
    it('默认规则：sg=10, qm=5 => 10*3 + 5*3 = 45', () => {
      expect(computeBaseWelfare(10, 5, defaultRule)).toBe(45)
    })

    it('零值：sg=0, qm=0 => 0', () => {
      expect(computeBaseWelfare(0, 0, defaultRule)).toBe(0)
    })

    it('仅收光：sg=20, qm=0 => 20*3 = 60', () => {
      expect(computeBaseWelfare(20, 0, defaultRule)).toBe(60)
    })

    it('仅全麦：sg=0, qm=15 => 15*3 = 45', () => {
      expect(computeBaseWelfare(0, 15, defaultRule)).toBe(45)
    })

    it('自定义比例：sgRatio=5, qmRatio=2, sg=4, qm=10 => 4*5 + 10*2 = 40', () => {
      const rule = { ...defaultRule, sgRatio: 5, qmRatio: 2 }
      expect(computeBaseWelfare(4, 10, rule)).toBe(40)
    })
  })

  describe('排名奖励计算', () => {
    it('第1名获得 rank1Reward（100）', () => {
      expect(computeRankReward(1, 50, defaultRule)).toBe(100)
    })

    it('第2名获得 rank2Reward（80）', () => {
      expect(computeRankReward(2, 45, defaultRule)).toBe(80)
    })

    it('第3名获得 rank3Reward（60）', () => {
      expect(computeRankReward(3, 42, defaultRule)).toBe(60)
    })

    it('前3名不受麦序达标阈值影响', () => {
      // 第1名即使麦序低于阈值也获得 rank1Reward
      expect(computeRankReward(1, 10, defaultRule)).toBe(100)
      // 第3名即使麦序低于阈值也获得 rank3Reward
      expect(computeRankReward(3, 5, defaultRule)).toBe(60)
    })
  })

  describe('麦序达标奖励', () => {
    it('第4名且麦序刚好等于阈值（40）算达标，获得 maixuReward（52）', () => {
      expect(computeRankReward(4, 40, defaultRule)).toBe(52)
    })

    it('第5名且麦序超过阈值（50）获得 maixuReward（52）', () => {
      expect(computeRankReward(5, 50, defaultRule)).toBe(52)
    })

    it('第4名且麦序低于阈值（39）不达标，无奖励', () => {
      expect(computeRankReward(4, 39, defaultRule)).toBe(0)
    })

    it('第10名且麦序为0，无奖励', () => {
      expect(computeRankReward(10, 0, defaultRule)).toBe(0)
    })

    it('自定义阈值：maixuThreshold=30，麦序=30 算达标', () => {
      const rule = { ...defaultRule, maixuThreshold: 30, maixuReward: 30 }
      expect(computeRankReward(4, 30, rule)).toBe(30)
    })

    it('自定义阈值：maixuThreshold=30，麦序=29 不达标', () => {
      const rule = { ...defaultRule, maixuThreshold: 30, maixuReward: 30 }
      expect(computeRankReward(4, 29, rule)).toBe(0)
    })
  })

  describe('总福利计算（基础福利 + 排名奖励）', () => {
    it('第1名：基础福利 + rank1Reward', () => {
      const base = computeBaseWelfare(10, 5, defaultRule) // 45
      const reward = computeRankReward(1, 50, defaultRule) // 100
      expect(base + reward).toBe(145)
    })

    it('第4名且达标：基础福利 + maixuReward', () => {
      const base = computeBaseWelfare(8, 4, defaultRule) // 36
      const reward = computeRankReward(4, 45, defaultRule) // 52
      expect(base + reward).toBe(88)
    })

    it('第4名且未达标：仅基础福利', () => {
      const base = computeBaseWelfare(8, 4, defaultRule) // 36
      const reward = computeRankReward(4, 10, defaultRule) // 0
      expect(base + reward).toBe(36)
    })
  })
})
