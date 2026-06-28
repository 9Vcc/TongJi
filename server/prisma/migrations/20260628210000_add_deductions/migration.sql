-- 福利扣减表
-- 按周期记录每个人员的福利扣减金额，最终福利 = 原福利 - deduction
-- periodStart：周统计厅=该周周一，月统计厅=该月1号
-- 与 DataRecord 解耦，避免月统计厅按周累加扣减
CREATE TABLE `Deduction` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `branchId` INT NOT NULL,
  `personnelId` INT NOT NULL,
  `periodStart` DATETIME(3) NOT NULL,
  `amount` INT NOT NULL DEFAULT 0,
  `createdBy` INT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `Deduction_branchId_personnelId_periodStart_key` (`branchId`, `personnelId`, `periodStart`),
  INDEX `Deduction_branchId_periodStart_idx` (`branchId`, `periodStart`),
  INDEX `Deduction_personnelId_idx` (`personnelId`),
  CONSTRAINT `Deduction_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE,
  CONSTRAINT `Deduction_personnelId_fkey` FOREIGN KEY (`personnelId`) REFERENCES `Personnel`(`id`) ON DELETE CASCADE,
  CONSTRAINT `Deduction_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `Account`(`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
