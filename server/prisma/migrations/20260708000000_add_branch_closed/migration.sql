-- AlterTable: 为 Branch 表添加 closed 字段，用于厅关闭功能
ALTER TABLE `Branch` ADD COLUMN `closed` BOOLEAN NOT NULL DEFAULT false;
