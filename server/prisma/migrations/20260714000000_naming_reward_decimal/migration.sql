-- 将 NamingLevel.reward 从 INT 改为 DECIMAL(10,2)，支持冠名福利设置两位小数
ALTER TABLE `NamingLevel` MODIFY COLUMN `reward` DECIMAL(10,2) NOT NULL DEFAULT 0;
