-- 冠名等级表（每厅独立配置）
CREATE TABLE `NamingLevel` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `branchId` INT NOT NULL,
  `name` VARCHAR(191) NOT NULL,
  `threshold` INT NOT NULL,
  `reward` INT NOT NULL DEFAULT 0,
  `sortOrder` INT NOT NULL DEFAULT 0,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  INDEX `NamingLevel_branchId_idx` (`branchId`),
  CONSTRAINT `NamingLevel_branchId_fkey` FOREIGN KEY (`branchId`) REFERENCES `Branch`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 数据记录-冠名关联表
CREATE TABLE `DataRecordNaming` (
  `id` INT NOT NULL AUTO_INCREMENT,
  `recordId` INT NOT NULL,
  `levelId` INT NOT NULL,
  `count` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  UNIQUE INDEX `DataRecordNaming_recordId_levelId_key` (`recordId`, `levelId`),
  INDEX `DataRecordNaming_recordId_idx` (`recordId`),
  INDEX `DataRecordNaming_levelId_idx` (`levelId`),
  CONSTRAINT `DataRecordNaming_recordId_fkey` FOREIGN KEY (`recordId`) REFERENCES `DataRecord`(`id`) ON DELETE CASCADE,
  CONSTRAINT `DataRecordNaming_levelId_fkey` FOREIGN KEY (`levelId`) REFERENCES `NamingLevel`(`id`) ON DELETE CASCADE
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
