-- 主持流水功能相关迁移
-- 1. RewardRule 添加 flowMultiplier 和 flowZeroCount 字段
-- 2. PersonnelBranch 添加 isHost 字段
-- 3. 新建 HostFlowRecord 表

-- 1. RewardRule 添加主持流水福利倍率（百分比，如10表示10%）
ALTER TABLE `RewardRule` ADD COLUMN `flowMultiplier` INT NOT NULL DEFAULT 0;
-- 主持流水输入时自动追加末尾 0 的数量（默认 2，按万位计算场景使用）
ALTER TABLE `RewardRule` ADD COLUMN `flowZeroCount` INT NOT NULL DEFAULT 2;

-- 2. PersonnelBranch 添加主持标记（按厅独立，同一人员在不同厅可有不同主持身份）
ALTER TABLE `PersonnelBranch` ADD COLUMN `isHost` BOOLEAN NOT NULL DEFAULT false;

-- 3. 主持流水记录表
-- 按月记录每个主持的总流水金额，导出时流水福利 = 总流水 × 厅倍率(RewardRule.flowMultiplier) / 100
-- periodStart 固定为月初1日（无论周/月统计厅，流水福利均按月计算）
CREATE TABLE `HostFlowRecord` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `branchId` INT NOT NULL,
  `personnelId` INT NOT NULL,
  `periodStart` DATETIME(3) NOT NULL,
  `totalFlow` DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  `createdBy` INT NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `HostFlowRecord_branchId_personnelId_periodStart_key` (`branchId`, `personnelId`, `periodStart`),
  INDEX `HostFlowRecord_branchId_periodStart_idx` (`branchId`, `periodStart`),
  INDEX `HostFlowRecord_personnelId_idx` (`personnelId`),
  CONSTRAINT `HostFlowRecord_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `HostFlowRecord_personnelId_fkey` FOREIGN KEY (`personnelId`) REFERENCES `Personnel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `HostFlowRecord_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `Account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
