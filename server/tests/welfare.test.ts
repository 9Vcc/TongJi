import { describe, it, expect } from 'vitest'
import { computeBaseWelfare, computeRankReward } from '../src/utils/welfare'

// 与 schema 默认值一致的奖励规则（所有开关默认开启，maixuMinEnabled 默认关闭，叠加默认开启）
const defaultRule = {
  sgRatio: 3,
  qmRatio: 3,
  rank1Reward: 100,
  rank2Reward: 80,
  rank3Reward: 60,
  maixuThreshold: 40,
  maixuReward: 52,
  maixuMinStandard: 0,
  sgEnabled: true,
  qmEnabled: true,
  rankEnabled: true,
  maixuEnabled: true,
  maixuMinEnabled: false,
  stackRankAndMaixu: true,
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

  describe('排名奖励计算（排名奖金 + 麦序达标奖励）', () => {
    it('第1名且麦序达标：rank1Reward(100) + maixuReward(52) = 152', () => {
      expect(computeRankReward(1, 50, defaultRule)).toBe(152)
    })

    it('第2名且麦序达标：rank2Reward(80) + maixuReward(52) = 132', () => {
      expect(computeRankReward(2, 45, defaultRule)).toBe(132)
    })

    it('第3名且麦序达标：rank3Reward(60) + maixuReward(52) = 112', () => {
      expect(computeRankReward(3, 42, defaultRule)).toBe(112)
    })

    it('前3名麦序低于阈值时仅拿排名奖金，不叠加麦序达标奖励', () => {
      // 第1名麦序低于阈值，仅获得 rank1Reward
      expect(computeRankReward(1, 10, defaultRule)).toBe(100)
      // 第3名麦序低于阈值，仅获得 rank3Reward
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

  describe('开关控制（两个开关独立）', () => {
    it('rankEnabled=false 时仅关闭排名奖金，麦序达标奖励仍发放', () => {
      const rule = { ...defaultRule, rankEnabled: false }
      // 第1名达标：仅拿 maixuReward(52)，不拿 rank1Reward
      expect(computeRankReward(1, 50, rule)).toBe(52)
      // 第3名达标：仅拿 maixuReward(52)，不拿 rank3Reward
      expect(computeRankReward(3, 42, rule)).toBe(52)
      // 第4名达标：拿 maixuReward(52)
      expect(computeRankReward(4, 50, rule)).toBe(52)
    })

    it('rankEnabled=false 且麦序未达标时无任何排名奖励', () => {
      const rule = { ...defaultRule, rankEnabled: false }
      // 第1名未达标：既无排名奖金也无麦序达标奖励
      expect(computeRankReward(1, 10, rule)).toBe(0)
    })

    it('maixuEnabled=false 时不发放麦序达标奖励，前3名仅拿排名奖金', () => {
      const rule = { ...defaultRule, maixuEnabled: false }
      // 第1名仅拿 rank1Reward
      expect(computeRankReward(1, 50, rule)).toBe(100)
      // 第4名达标也无麦序奖励
      expect(computeRankReward(4, 50, rule)).toBe(0)
    })

    it('两个开关都关闭时排名奖励为0', () => {
      const rule = { ...defaultRule, rankEnabled: false, maixuEnabled: false }
      expect(computeRankReward(1, 50, rule)).toBe(0)
    })
  })

  describe('叠加开关 stackRankAndMaixu', () => {
    it('开启叠加（默认）：前3名达标时排名奖金 + 麦序达标奖励', () => {
      // 第1名达标：100 + 52 = 152
      expect(computeRankReward(1, 50, defaultRule)).toBe(152)
      // 第3名达标：60 + 52 = 112
      expect(computeRankReward(3, 42, defaultRule)).toBe(112)
    })

    it('关闭叠加：前3名达标时只拿排名奖金，不叠加麦序达标奖励', () => {
      const rule = { ...defaultRule, stackRankAndMaixu: false }
      // 第1名达标：仅 rank1Reward(100)，不叠加 maixuReward
      expect(computeRankReward(1, 50, rule)).toBe(100)
      // 第2名达标：仅 rank2Reward(80)
      expect(computeRankReward(2, 45, rule)).toBe(80)
      // 第3名达标：仅 rank3Reward(60)
      expect(computeRankReward(3, 42, rule)).toBe(60)
    })

    it('关闭叠加：前3名未达标时仍只拿排名奖金', () => {
      const rule = { ...defaultRule, stackRankAndMaixu: false }
      // 第1名未达标：仅 rank1Reward
      expect(computeRankReward(1, 10, rule)).toBe(100)
    })

    it('关闭叠加：第4名及以后达标仍拿麦序达标奖励（不受叠加开关影响）', () => {
      const rule = { ...defaultRule, stackRankAndMaixu: false }
      // 第4名达标：maixuReward(52)
      expect(computeRankReward(4, 50, rule)).toBe(52)
      // 第5名达标：maixuReward(52)
      expect(computeRankReward(5, 50, rule)).toBe(52)
    })

    it('关闭叠加 + rankEnabled=false：前3名仅拿麦序达标奖励', () => {
      const rule = {
        ...defaultRule,
        stackRankAndMaixu: false,
        rankEnabled: false,
      }
      // 第1名达标：仅 maixuReward(52)
      expect(computeRankReward(1, 50, rule)).toBe(52)
    })
  })

  describe('总福利计算（基础福利 + 排名奖励）', () => {
    it('第1名且达标：基础福利 + rank1Reward + maixuReward', () => {
      const base = computeBaseWelfare(10, 5, defaultRule) // 45
      const reward = computeRankReward(1, 50, defaultRule) // 152
      expect(base + reward).toBe(197)
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
