-- 罚款人员表（独立于数据录入人员，不与厅同步）
CREATE TABLE `FinePersonnel` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `FinePersonnel_name_idx` (`name`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 罚款记录表
CREATE TABLE `Fine` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `personnelId` INTEGER NOT NULL,
  `amount` INTEGER NOT NULL,
  `fineDate` DATETIME(3) NOT NULL,
  `reasonType` VARCHAR(191) NOT NULL DEFAULT 'OTHER',
  `remark` VARCHAR(191) NULL,
  `createdBy` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updatedAt` DATETIME(3) NOT NULL,
  INDEX `Fine_personnelId_idx` (`personnelId`),
  INDEX `Fine_fineDate_idx` (`fineDate`),
  INDEX `Fine_reasonType_idx` (`reasonType`),
  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 添加外键约束
ALTER TABLE `Fine` ADD CONSTRAINT `Fine_personnelId_fkey` FOREIGN KEY (`personnelId`) REFERENCES `FinePersonnel`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `Fine` ADD CONSTRAINT `Fine_createdBy_fkey` FOREIGN KEY (`createdBy`) REFERENCES `Account`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
