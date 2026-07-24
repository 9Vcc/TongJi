-- 无福利标记表
-- 标记某人员在某周期内福利清零（不管多少麦序/收光/冠名，福利均为0，扣减仍生效）
-- periodStart：周统计厅=该周周一，月统计厅=该月1号（与 Deduction 一致）
-- 标记后 totalWelfare = max(0, 0 - deduction) = 0
CREATE TABLE `NoWelfareMark` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `branchId` INT NOT NULL,
  `personnelId` INT NOT NULL,
  `periodStart` DATETIME(3) NOT NULL,
  `remark` VARCHAR(191) NULL,
  `createdBy` INT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `NoWelfareMark_branchId_personnelId_periodStart_key` (`branchId`, `personnelId`, `periodStart`),
  INDEX `NoWelfareMark_branchId_periodStart_idx` (`branchId`, `periodStart`),
  INDEX `NoWelfareMark_personnelId_idx` (`personnelId`),
  CONSTRAINT `NoWelfareMark_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `NoWelfareMark_personnelId_fkey` FOREIGN KEY (`personnelId`) REFERENCES `Personnel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `NoWelfareMark_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `Account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
