-- 创建违规项目配置表
CREATE TABLE `ViolationItem` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `deductionAmount` INTEGER NOT NULL DEFAULT 0,
    `thresholdCount` INTEGER NOT NULL DEFAULT 0,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `ViolationItem_branchId_name_key`(`branchId`, `name`),
    INDEX `ViolationItem_branchId_idx`(`branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 添加外键约束（Branch 表）
ALTER TABLE `ViolationItem` ADD CONSTRAINT `ViolationItem_branchId_fkey`
    FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- 创建违规记录表
CREATE TABLE `ViolationRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `personnelId` INTEGER NOT NULL,
    `violationItemId` INTEGER NOT NULL,
    `violationDate` DATETIME NOT NULL,
    `periodStart` DATETIME NOT NULL,
    `remark` VARCHAR(191) NULL,
    `createdBy` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `ViolationRecord_branchId_periodStart_idx`(`branchId`, `periodStart`),
    INDEX `ViolationRecord_personnelId_idx`(`personnelId`),
    INDEX `ViolationRecord_violationItemId_idx`(`violationItemId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 添加外键约束
ALTER TABLE `ViolationRecord` ADD CONSTRAINT `ViolationRecord_branchId_fkey`
    FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ViolationRecord` ADD CONSTRAINT `ViolationRecord_personnelId_fkey`
    FOREIGN KEY (`personnelId`) REFERENCES `Personnel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ViolationRecord` ADD CONSTRAINT `ViolationRecord_violationItemId_fkey`
    FOREIGN KEY (`violationItemId`) REFERENCES `ViolationItem`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE `ViolationRecord` ADD CONSTRAINT `ViolationRecord_createdBy_fkey`
    FOREIGN KEY (`createdBy`) REFERENCES `Account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
