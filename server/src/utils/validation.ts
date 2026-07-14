/**
 * 校验值是否为非负整数
 */
export function isNonNegInt(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}

/**
 * 校验值是否为非负数（最多两位小数）
 */
export function isNonNegDecimal2(v: unknown): boolean {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < 0) return false
  return /^\d+(\.\d{1,2})?$/.test(String(v))
}

/**
 * 保留两位小数精度（仅消除浮点运算误差，不丢失两位小数以内的精度）
 * 例：0.1 + 0.2 = 0.30000000000000004 → 0.3
 */
export function toDecimal2(x: number): number {
  return Number(x.toFixed(2))
}
