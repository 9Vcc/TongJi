-- Alter HistoryAction enum to add CREATE value
ALTER TABLE `DataHistory` MODIFY COLUMN `action` ENUM('CREATE', 'UPDATE', 'DELETE') NOT NULL;
