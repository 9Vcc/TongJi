-- DataRecord 表新增主持天数字段
ALTER TABLE `DataRecord` ADD COLUMN `zcDays` INTEGER NOT NULL DEFAULT 0;

-- RewardRule 表新增主持天数福利配置
ALTER TABLE `RewardRule` ADD COLUMN `zcEnabled` BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE `RewardRule` ADD COLUMN `zcDayReward` INTEGER NOT NULL DEFAULT 0;
