/**
 * 校验值是否为非负整数
 */
export function isNonNegInt(v: unknown): boolean {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0
}
