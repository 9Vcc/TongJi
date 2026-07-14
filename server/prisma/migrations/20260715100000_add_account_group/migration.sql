-- CreateTable
CREATE TABLE `AccountGroup` (
  `id` INTEGER NOT NULL AUTO_INCREMENT,
  `accountId` INTEGER NOT NULL,
  `groupId` INTEGER NOT NULL,
  `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

  PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4;

-- CreateIndex
CREATE UNIQUE INDEX `AccountGroup_accountId_groupId_key` ON `AccountGroup`(`accountId`, `groupId`);

-- CreateIndex
CREATE INDEX `AccountGroup_groupId_idx` ON `AccountGroup`(`groupId`);

-- AddForeignKey
ALTER TABLE `AccountGroup` ADD CONSTRAINT `AccountGroup_accountId_fkey` FOREIGN KEY (`accountId`) REFERENCES `Account`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `AccountGroup` ADD CONSTRAINT `AccountGroup_groupId_fkey` FOREIGN KEY (`groupId`) REFERENCES `BranchGroup`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
