import prisma from '../lib/prisma'
import { NotificationType } from '../../generated/prisma/client'

/**
 * 创建系统通知
 * @param branchId 分部ID
 * @param type 通知类型
 * @param content 通知内容
 */
export async function createNotification(
  branchId: number,
  type: NotificationType,
  content: string
) {
  return prisma.notification.create({
    data: {
      branchId,
      type,
      content,
    },
  })
}

export default { createNotification }
