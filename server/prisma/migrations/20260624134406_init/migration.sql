-- CreateTable
CREATE TABLE "Account" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "branchId" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Account_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Branch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Personnel" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "PersonnelBranch" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "personnelId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PersonnelBranch_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PersonnelBranch_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataRecord" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "personnelId" INTEGER NOT NULL,
    "branchId" INTEGER NOT NULL,
    "weekStart" DATETIME NOT NULL,
    "sg" INTEGER NOT NULL DEFAULT 0,
    "mx" INTEGER NOT NULL DEFAULT 0,
    "qm" INTEGER NOT NULL DEFAULT 0,
    "createdBy" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "DataRecord_personnelId_fkey" FOREIGN KEY ("personnelId") REFERENCES "Personnel" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DataRecord_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DataRecord_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DataHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recordId" INTEGER NOT NULL,
    "modifierId" INTEGER NOT NULL,
    "modifyTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    CONSTRAINT "DataHistory_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "DataRecord" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "DataHistory_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "RewardRule" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "branchId" INTEGER NOT NULL,
    "sgRatio" INTEGER NOT NULL DEFAULT 3,
    "qmRatio" INTEGER NOT NULL DEFAULT 3,
    "rank1Reward" INTEGER NOT NULL DEFAULT 100,
    "rank2Reward" INTEGER NOT NULL DEFAULT 80,
    "rank3Reward" INTEGER NOT NULL DEFAULT 60,
    "maixuThreshold" INTEGER NOT NULL DEFAULT 40,
    "maixuReward" INTEGER NOT NULL DEFAULT 52,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RewardRule_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "branchId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "Branch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_username_key" ON "Account"("username");

-- CreateIndex
CREATE INDEX "Account_branchId_idx" ON "Account"("branchId");

-- CreateIndex
CREATE INDEX "PersonnelBranch_branchId_idx" ON "PersonnelBranch"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonnelBranch_personnelId_branchId_key" ON "PersonnelBranch"("personnelId", "branchId");

-- CreateIndex
CREATE INDEX "DataRecord_personnelId_idx" ON "DataRecord"("personnelId");

-- CreateIndex
CREATE INDEX "DataRecord_branchId_idx" ON "DataRecord"("branchId");

-- CreateIndex
CREATE INDEX "DataRecord_weekStart_idx" ON "DataRecord"("weekStart");

-- CreateIndex
CREATE INDEX "DataRecord_createdBy_idx" ON "DataRecord"("createdBy");

-- CreateIndex
CREATE INDEX "DataHistory_recordId_idx" ON "DataHistory"("recordId");

-- CreateIndex
CREATE INDEX "DataHistory_modifierId_idx" ON "DataHistory"("modifierId");

-- CreateIndex
CREATE UNIQUE INDEX "RewardRule_branchId_key" ON "RewardRule"("branchId");

-- CreateIndex
CREATE INDEX "Notification_branchId_idx" ON "Notification"("branchId");
