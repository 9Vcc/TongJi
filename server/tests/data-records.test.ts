import { describe, it, expect } from 'vitest'
import { normalizeRemark, buildColumnMap } from '../src/routes/data-records'

/**
 * 数据录入相关纯函数测试
 *
 * 覆盖 Task 13（N+1 修复）与 Task 6（权限修复）涉及的纯函数：
 * - normalizeRemark：备注字段标准化（trim、限 100 字、空值处理）
 * - buildColumnMap：Excel/粘贴导入的表头列索引映射
 *
 * 这些纯函数不依赖数据库，仅做数据转换与校验，便于快速回归测试。
 */

describe('normalizeRemark 备注标准化', () => {
  describe('空值与边界处理', () => {
    it('undefined 输入返回 null', () => {
      expect(normalizeRemark(undefined)).toBeNull()
    })

    it('null 输入返回 null', () => {
      expect(normalizeRemark(null)).toBeNull()
    })

    it('空字符串返回 null', () => {
      expect(normalizeRemark('')).toBeNull()
    })

    it('仅包含空白字符的字符串返回 null', () => {
      expect(normalizeRemark('   ')).toBeNull()
      expect(normalizeRemark('\t\n')).toBeNull()
      expect(normalizeRemark(' \t \n ')).toBeNull()
    })
  })

  describe('trim 行为', () => {
    it('去除首尾空白后返回内容', () => {
      expect(normalizeRemark('  hello  ')).toBe('hello')
    })

    it('保留中间空白，仅去首尾', () => {
      expect(normalizeRemark('  a b c  ')).toBe('a b c')
    })

    it('数字会被转为字符串', () => {
      // normalizeRemark 接受 unknown，内部 String(v) 转换
      expect(normalizeRemark(123 as unknown)).toBe('123')
    })
  })

  describe('长度限制（100 字）', () => {
    it('恰好 100 字的字符串原样返回', () => {
      const s = 'a'.repeat(100)
      expect(normalizeRemark(s)).toBe(s)
      expect(normalizeRemark(s)?.length).toBe(100)
    })

    it('超过 100 字的字符串被截断为 100 字', () => {
      const s = 'a'.repeat(150)
      const result = normalizeRemark(s)
      expect(result?.length).toBe(100)
      expect(result).toBe('a'.repeat(100))
    })

    it('超长字符串 trim 后截断（先 trim 再截断）', () => {
      // trim 后 120 字，应截断为 100
      const s = '  ' + 'b'.repeat(120) + '  '
      const result = normalizeRemark(s)
      expect(result?.length).toBe(100)
      expect(result).toBe('b'.repeat(100))
    })

    it('中文字符按 UTF-16 码元计数（每个中文占 1 个 length）', () => {
      // JS String.length 按 UTF-16 码元计数，常用中文占 1 码元
      const s = '测'.repeat(101)
      expect(s.length).toBe(101)
      const result = normalizeRemark(s)
      expect(result?.length).toBe(100)
    })
  })

  describe('正常输入', () => {
    it('普通文本原样返回', () => {
      expect(normalizeRemark('本周数据已核对')).toBe('本周数据已核对')
    })

    it('带特殊字符的文本', () => {
      expect(normalizeRemark('备注：sg=10, qm=5')).toBe('备注：sg=10, qm=5')
    })
  })
})

describe('buildColumnMap 表头列索引映射', () => {
  describe('无表头（简单格式）判定', () => {
    it('第一列非"姓名"也非"排名"时返回 null（视为无表头）', () => {
      // 第一列是数据，不是表头
      expect(buildColumnMap(['张三', 10, 5, 3, 2])).toBeNull()
      expect(buildColumnMap(['', '收光', '麦序'])).toBeNull()
      expect(buildColumnMap([null, '姓名'])).toBeNull()
    })

    it('空表头行返回 null', () => {
      expect(buildColumnMap([])).toBeNull()
    })
  })

  describe('简单格式（第一列为"姓名"）', () => {
    it('第一列为"姓名"时返回固定列索引映射', () => {
      const map = buildColumnMap(['姓名', '收光', '麦序', '全麦', '主持天数'])
      expect(map).not.toBeNull()
      // 姓名(0), 收光(1), 麦序(2), 全麦(3), 主持天数(4)
      expect(map!.name).toBe(0)
      expect(map!.sg).toBe(1)
      expect(map!.mx).toBe(2)
      expect(map!.qm).toBe(3)
      expect(map!.zcDays).toBe(4)
      expect(map!.namings.size).toBe(0)
    })

    it('简单格式不解析其他表头名称，固定列顺序', () => {
      // 即使后续列名不匹配，简单格式仍按固定位置映射
      const map = buildColumnMap(['姓名', '随便什么', 'xxx', 'yyy', 'zzz'])
      expect(map).not.toBeNull()
      expect(map!.name).toBe(0)
      expect(map!.sg).toBe(1)
      expect(map!.mx).toBe(2)
      expect(map!.qm).toBe(3)
      expect(map!.zcDays).toBe(4)
    })

    it('"姓名"前后有空白仍能识别（trim 处理）', () => {
      const map = buildColumnMap(['  姓名  ', '收光', '麦序'])
      expect(map).not.toBeNull()
      expect(map!.name).toBe(0)
      expect(map!.sg).toBe(1)
    })
  })

  describe('导出格式（第一列为"排名"）', () => {
    it('完整导出格式表头解析', () => {
      // 模拟导出 Excel 的表头：排名、姓名、分部、收光、麦序、全麦、主持天数
      const map = buildColumnMap([
        '排名',
        '姓名',
        '分部',
        '收光',
        '麦序',
        '全麦',
        '主持天数',
      ])
      expect(map).not.toBeNull()
      expect(map!.name).toBe(1)
      expect(map!.sg).toBe(3)
      expect(map!.mx).toBe(4)
      expect(map!.qm).toBe(5)
      expect(map!.zcDays).toBe(6)
    })

    it('缺失全麦和主持天数列时 qm/zcDays 为 null', () => {
      // 仅含排名、姓名、收光、麦序
      const map = buildColumnMap(['排名', '姓名', '收光', '麦序'])
      expect(map).not.toBeNull()
      expect(map!.name).toBe(1)
      expect(map!.sg).toBe(2)
      expect(map!.mx).toBe(3)
      expect(map!.qm).toBeNull()
      expect(map!.zcDays).toBeNull()
    })

    it('导出格式中其余列顺序打乱时仍能按表头名称正确定位', () => {
      // "排名" 必须为第一列（用于判定导出格式），其余列顺序可任意
      const map = buildColumnMap(['排名', '麦序', '全麦', '姓名', '收光'])
      expect(map).not.toBeNull()
      expect(map!.name).toBe(3)
      expect(map!.sg).toBe(4)
      expect(map!.mx).toBe(1)
      expect(map!.qm).toBe(2)
    })

    it('表头有前后空白时仍能匹配（trim 处理）', () => {
      const map = buildColumnMap(['排名', '  姓名  ', ' 收光 ', ' 麦序 '])
      expect(map).not.toBeNull()
      expect(map!.name).toBe(1)
      expect(map!.sg).toBe(2)
      expect(map!.mx).toBe(3)
    })
  })

  describe('冠名列解析', () => {
    it('识别"冠名·XXX"格式的列并写入 namings Map', () => {
      const map = buildColumnMap([
        '排名',
        '姓名',
        '收光',
        '麦序',
        '全麦',
        '主持天数',
        '冠名·周冠',
        '冠名·月冠',
      ])
      expect(map).not.toBeNull()
      expect(map!.namings.size).toBe(2)
      expect(map!.namings.get('冠名·周冠')).toBe(6)
      expect(map!.namings.get('冠名·月冠')).toBe(7)
    })

    it('无冠名列时 namings 为空 Map', () => {
      const map = buildColumnMap(['排名', '姓名', '收光'])
      expect(map).not.toBeNull()
      expect(map!.namings.size).toBe(0)
    })

    it('"冠名"前缀不带"·"的不识别为冠名列', () => {
      // 仅 "冠名·" 前缀才识别
      const map = buildColumnMap(['排名', '姓名', '收光', '冠名（不带点）'])
      expect(map).not.toBeNull()
      expect(map!.namings.size).toBe(0)
    })
  })

  describe('必需列缺失校验', () => {
    it('导出格式缺少"姓名"列时返回 null', () => {
      // 排名 + 收光，但无姓名
      const map = buildColumnMap(['排名', '收光', '麦序'])
      // name 仍为 -1，应返回 null
      expect(map).toBeNull()
    })

    it('导出格式缺少"收光"列时返回 null', () => {
      // 排名 + 姓名，但无收光
      const map = buildColumnMap(['排名', '姓名', '麦序'])
      // sg 仍为 -1，应返回 null
      expect(map).toBeNull()
    })

    it('导出格式同时缺少姓名和收光时返回 null', () => {
      const map = buildColumnMap(['排名', '麦序', '全麦'])
      expect(map).toBeNull()
    })
  })
})
