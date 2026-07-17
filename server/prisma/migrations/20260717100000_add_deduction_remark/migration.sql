-- 给 Deduction 表添加 remark 字段（扣减备注，覆盖式存储）
ALTER TABLE `Deduction` ADD COLUMN `remark` VARCHAR(100) NULL;
