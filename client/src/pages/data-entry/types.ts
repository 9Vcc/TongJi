import type { NamingItem } from "../../types";

// 编辑弹窗表单数据结构
export type RecordForm = {
  personnelId: string;
  sg: string;
  mx: string;
  qm: string;
  // 主持天数（字符串便于输入控制）
  zcDays: string;
  // 冠名数量：levelId -> count（字符串便于输入控制）
  namings: Record<string, string>;
  // 福利扣减金额（字符串便于输入控制）
  deduction: string;
  // 操作备注（覆盖式存储到 DataRecord.remark）
  remark: string;
};

export const emptyForm: RecordForm = {
  personnelId: "",
  sg: "",
  mx: "",
  qm: "",
  zcDays: "",
  namings: {},
  deduction: "",
  remark: "",
};

// handleEdit 实际使用的记录字段子集，避免对完整 DataRecord 的类型断言
export type EditableRecord = {
  id: number;
  personnelId: number;
  sg: number;
  mx: number;
  qm: number;
  zcDays?: number;
  namings?: NamingItem[];
  deduction?: number;
};

// 表格行数据：已录入的记录 + 未录入的人员占位行
export type DisplayRow = {
  key: string;
  id: number;
  personnelId: number;
  branchId?: number;
  personnelName: string;
  branchName?: string;
  sg: number;
  mx: number;
  qm: number;
  zcDays: number;
  welfare?: number;
  deduction?: number;
  finalWelfare?: number;
  createdAt?: string;
  isRecorded: boolean;
  namings?: NamingItem[];
};

// 构造行 key 的辅助函数：用 `${branchId}:${personnelId}` 区分多厅下的同一人员
export const rowKey = (
  branchId: number | undefined,
  personnelId: number,
) => `${branchId ?? 0}:${personnelId}`;
