-- CreateTable: 合厅组表，用于将多个厅合并为一组进行统一管理
CREATE TABLE `BranchGroup` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `name` VARCHAR(191) NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AlterTable: 为 Branch 表添加 groupId 字段，关联所属合厅组（可空）
ALTER TABLE `Branch` ADD COLUMN `groupId` INTEGER NULL;

-- CreateIndex: 为 Branch.groupId 添加索引，便于按合厅组查询成员厅
CREATE INDEX `Branch_groupId_idx` ON `Branch`(`groupId`);

-- AddForeignKey: Branch.groupId 关联 BranchGroup.id
ALTER TABLE `Branch` ADD CONSTRAINT `Branch_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `BranchGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
