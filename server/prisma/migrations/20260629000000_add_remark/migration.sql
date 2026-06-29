-- 数据记录表添加 remark 字段：存储最近一次录入/修改的备注
-- 前端数据录入页搜索框后显示该字段（当前周最近一条录入备注）
ALTER TABLE `DataRecord` ADD COLUMN `remark` VARCHAR(191) NULL;

-- 修改历史表添加 remark 字段：每次操作的备注（历史记录展示）
ALTER TABLE `DataHistory` ADD COLUMN `remark` VARCHAR(191) NULL;
