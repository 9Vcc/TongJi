-- 1. DataRecord.mx 从 INTEGER 改为 FLOAT（支持时间段倍率换算后的小数）
ALTER TABLE `DataRecord` MODIFY COLUMN `mx` DOUBLE NOT NULL DEFAULT 0;

-- 2. RewardRule 新增 mxSlotEnabled 字段（时间段倍率功能开关）
ALTER TABLE `RewardRule` ADD COLUMN `mxSlotEnabled` BOOLEAN NOT NULL DEFAULT false;

-- 3. 新增 TimeSlotMultiplier 表（每厅12个时间段的麦序倍率配置）
CREATE TABLE `TimeSlotMultiplier` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `slotIndex` INTEGER NOT NULL,
    `multiplier` DOUBLE NOT NULL DEFAULT 1,
    PRIMARY KEY (`id`),
    UNIQUE INDEX `TimeSlotMultiplier_branchId_slotIndex_key` (`branchId`, `slotIndex`),
    INDEX `TimeSlotMultiplier_branchId_idx` (`branchId`),
    CONSTRAINT `TimeSlotMultiplier_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 4. 新增 MxTimeSlotRecord 表（时间段录入明细，存储倍率快照）
CREATE TABLE `MxTimeSlotRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recordId` INTEGER NOT NULL,
    `slotDate` DATETIME NOT NULL,
    `slotIndex` INTEGER NOT NULL,
    `rawMx` INTEGER NOT NULL DEFAULT 0,
    `multiplier` DOUBLE NOT NULL DEFAULT 1,
    `convertedMx` DOUBLE NOT NULL DEFAULT 0,
    `sg` INTEGER NOT NULL DEFAULT 0,
    `qm` INTEGER NOT NULL DEFAULT 0,
    `zcDays` INTEGER NOT NULL DEFAULT 0,
    `createdBy` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (`id`),
    INDEX `MxTimeSlotRecord_recordId_idx` (`recordId`),
    INDEX `MxTimeSlotRecord_slotDate_idx` (`slotDate`),
    INDEX `MxTimeSlotRecord_recordId_slotDate_slotIndex_idx` (`recordId`, `slotDate`, `slotIndex`),
    CONSTRAINT `MxTimeSlotRecord_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `DataRecord`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT `MxTimeSlotRecord_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `Account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
