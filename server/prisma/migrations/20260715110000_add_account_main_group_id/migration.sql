-- AlterTable: 为 Account 表添加 mainGroupId 字段（主合厅组）
ALTER TABLE `Account` ADD COLUMN `mainGroupId` INTEGER NULL;

-- AddForeignKey: mainGroupId 关联 BranchGroup，删除时 SetNull
ALTER TABLE `Account` ADD CONSTRAINT `Account_mainGroupId_fkey` FOREIGN KEY (`mainGroupId`) REFERENCES `BranchGroup`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
