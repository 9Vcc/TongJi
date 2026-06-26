-- 移除 LoginRecord 表的 ip 字段（不再记录登录 IP）

-- AlterTable
ALTER TABLE `LoginRecord` DROP COLUMN `ip`;
