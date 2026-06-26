-- CreateTable
CREATE TABLE `Account` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(191) NOT NULL,
    `passwordHash` VARCHAR(191) NOT NULL,
    `role` ENUM('HUIZHANG', 'CHAOGUAN', 'GUANLI') NOT NULL,
    `branchId` INTEGER NULL,
    `status` ENUM('ACTIVE', 'DISABLED') NOT NULL DEFAULT 'ACTIVE',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `Account_username_key`(`username`),
    INDEX `Account_branchId_idx`(`branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Branch` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `statCycle` ENUM('WEEK', 'MONTH') NOT NULL DEFAULT 'WEEK',
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Personnel` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `name` VARCHAR(191) NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `PersonnelBranch` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `personnelId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `PersonnelBranch_branchId_idx`(`branchId`),
    UNIQUE INDEX `PersonnelBranch_personnelId_branchId_key`(`personnelId`, `branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DataRecord` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `personnelId` INTEGER NOT NULL,
    `branchId` INTEGER NOT NULL,
    `weekStart` DATETIME(3) NOT NULL,
    `sg` INTEGER NOT NULL DEFAULT 0,
    `mx` INTEGER NOT NULL DEFAULT 0,
    `qm` INTEGER NOT NULL DEFAULT 0,
    `createdBy` INTEGER NOT NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `DataRecord_personnelId_idx`(`personnelId`),
    INDEX `DataRecord_branchId_idx`(`branchId`),
    INDEX `DataRecord_weekStart_idx`(`weekStart`),
    INDEX `DataRecord_createdBy_idx`(`createdBy`),
    INDEX `DataRecord_weekStart_branchId_idx`(`weekStart`, `branchId`),
    INDEX `DataRecord_weekStart_branchId_personnelId_idx`(`weekStart`, `branchId`, `personnelId`),
    INDEX `DataRecord_branchId_personnelId_idx`(`branchId`, `personnelId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `DataHistory` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `recordId` INTEGER NULL,
    `modifierId` INTEGER NOT NULL,
    `modifyTime` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `action` ENUM('UPDATE', 'DELETE') NOT NULL,
    `field` VARCHAR(191) NULL,
    `oldValue` VARCHAR(191) NULL,
    `newValue` VARCHAR(191) NULL,

    INDEX `DataHistory_recordId_idx`(`recordId`),
    INDEX `DataHistory_modifierId_idx`(`modifierId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `RewardRule` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `sgRatio` INTEGER NOT NULL DEFAULT 3,
    `qmRatio` INTEGER NOT NULL DEFAULT 3,
    `rank1Reward` INTEGER NOT NULL DEFAULT 100,
    `rank2Reward` INTEGER NOT NULL DEFAULT 80,
    `rank3Reward` INTEGER NOT NULL DEFAULT 60,
    `maixuThreshold` INTEGER NOT NULL DEFAULT 40,
    `maixuReward` INTEGER NOT NULL DEFAULT 52,
    `maixuMinStandard` INTEGER NOT NULL DEFAULT 0,
    `maixuMinEnabled` BOOLEAN NOT NULL DEFAULT false,
    `sgEnabled` BOOLEAN NOT NULL DEFAULT true,
    `qmEnabled` BOOLEAN NOT NULL DEFAULT true,
    `rankEnabled` BOOLEAN NOT NULL DEFAULT true,
    `maixuEnabled` BOOLEAN NOT NULL DEFAULT true,
    `stackRankAndMaixu` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    UNIQUE INDEX `RewardRule_branchId_key`(`branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `Notification` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `branchId` INTEGER NOT NULL,
    `type` ENUM('RANK_PUBLISH', 'RULE_CHANGE', 'DATA_CHANGE') NOT NULL,
    `content` VARCHAR(191) NOT NULL,
    `isRead` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `Notification_branchId_idx`(`branchId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Account` ADD CONSTRAINT `Account_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PersonnelBranch` ADD CONSTRAINT `PersonnelBranch_personnelId_fkey` FOREIGN KEY (`personnelId`) REFERENCES `Personnel`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `PersonnelBranch` ADD CONSTRAINT `PersonnelBranch_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataRecord` ADD CONSTRAINT `DataRecord_personnelId_fkey` FOREIGN KEY (`personnelId`) REFERENCES `Personnel`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataRecord` ADD CONSTRAINT `DataRecord_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataRecord` ADD CONSTRAINT `DataRecord_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `Account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataHistory` ADD CONSTRAINT `DataHistory_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `DataRecord`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `DataHistory` ADD CONSTRAINT `DataHistory_modifierId_fkey` FOREIGN KEY (`modifierId`) REFERENCES `Account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `RewardRule` ADD CONSTRAINT `RewardRule_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `Notification` ADD CONSTRAINT `Notification_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
