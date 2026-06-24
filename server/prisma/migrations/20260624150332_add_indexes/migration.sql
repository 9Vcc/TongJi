-- CreateIndex
CREATE INDEX "DataRecord_weekStart_branchId_idx" ON "DataRecord"("weekStart", "branchId");

-- CreateIndex
CREATE INDEX "DataRecord_weekStart_branchId_personnelId_idx" ON "DataRecord"("weekStart", "branchId", "personnelId");

-- CreateIndex
CREATE INDEX "DataRecord_branchId_personnelId_idx" ON "DataRecord"("branchId", "personnelId");
