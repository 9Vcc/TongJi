-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_DataHistory" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "recordId" INTEGER,
    "modifierId" INTEGER NOT NULL,
    "modifyTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "action" TEXT NOT NULL,
    "field" TEXT,
    "oldValue" TEXT,
    "newValue" TEXT,
    CONSTRAINT "DataHistory_recordId_fkey" FOREIGN KEY ("recordId") REFERENCES "DataRecord" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "DataHistory_modifierId_fkey" FOREIGN KEY ("modifierId") REFERENCES "Account" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_DataHistory" ("action", "field", "id", "modifierId", "modifyTime", "newValue", "oldValue", "recordId") SELECT "action", "field", "id", "modifierId", "modifyTime", "newValue", "oldValue", "recordId" FROM "DataHistory";
DROP TABLE "DataHistory";
ALTER TABLE "new_DataHistory" RENAME TO "DataHistory";
CREATE INDEX "DataHistory_recordId_idx" ON "DataHistory"("recordId");
CREATE INDEX "DataHistory_modifierId_idx" ON "DataHistory"("modifierId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
