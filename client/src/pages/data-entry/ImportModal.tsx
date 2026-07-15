import { useState } from "react";
import { FileSpreadsheet, ClipboardPaste } from "lucide-react";
import { dataRecordsApi, getErrorMessage } from "../../api";
import { useToast } from "../../hooks/useToast";
import Modal from "../../components/Modal";
import { Spinner } from "../../components/Skeleton";
import type { ImportResult } from "../../types";

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  effectiveBranchId: number | undefined;
  recordWeekStart: string;
  isHuizhang: boolean;
  onImported: () => void | Promise<void>;
}

export default function ImportModal({
  open,
  onClose,
  effectiveBranchId,
  recordWeekStart,
  isHuizhang,
  onImported,
}: ImportModalProps) {
  const toast = useToast();
  const [importTab, setImportTab] = useState<"excel" | "paste">("excel");
  const [excelFile, setExcelFile] = useState<File | null>(null);
  const [pasteData, setPasteData] = useState("");
  const [importing, setImporting] = useState(false);
  const [importRemark, setImportRemark] = useState("");

  const handleImport = async () => {
    if (!effectiveBranchId) {
      toast.error(isHuizhang ? "请选择厅" : "当前账户未关联厅");
      return;
    }
    // 备注必填
    if (!importRemark.trim()) {
      toast.error("请填写备注");
      return;
    }
    setImporting(true);
    try {
      let result: ImportResult;
      if (importTab === "excel") {
        if (!excelFile) {
          toast.error("请选择Excel文件");
          setImporting(false);
          return;
        }
        result = await dataRecordsApi.importExcel(
          excelFile,
          effectiveBranchId,
          recordWeekStart,
          importRemark.trim() || undefined,
        );
      } else {
        if (!pasteData.trim()) {
          toast.error("请粘贴数据");
          setImporting(false);
          return;
        }
        result = await dataRecordsApi.importPaste(
          pasteData,
          effectiveBranchId,
          recordWeekStart,
          importRemark.trim() || undefined,
        );
      }
      toast.success(
        `导入完成：成功 ${result.success} 条，失败 ${result.failed} 条`,
      );
      if (result.createdPersons && result.createdPersons.length > 0) {
        toast.info(
          `已自动创建 ${result.createdPersons.length} 名人员：${result.createdPersons.join("、")}`,
        );
      }
      if (result.failures.length > 0) {
        console.warn("导入失败详情：", result.failures);
      }
      onClose();
      setExcelFile(null);
      setPasteData("");
      setImportRemark("");
      await onImported();
    } catch (err) {
      toast.error(getErrorMessage(err));
    } finally {
      setImporting(false);
    }
  };

  return (
    <Modal
      open={open}
      title="导入数据"
      onClose={onClose}
      footer={
        <>
          <button
            onClick={onClose}
            className="px-4 py-2 border border-border rounded-custom-sm text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
          >
            取消
          </button>
          <button
            onClick={handleImport}
            disabled={importing}
            className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-custom-sm text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
          >
            {importing && <Spinner className="h-4 w-4" />}
            {importing ? "导入中..." : "开始导入"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Tab 切换 */}
        <div className="flex border-b border-border">
          <button
            onClick={() => setImportTab("excel")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors duration-200 cursor-pointer ${
              importTab === "excel"
                ? "border-primary text-primary"
                : "border-transparent text-textSecondary hover:text-textPrimary"
            }`}
          >
            <FileSpreadsheet size={16} />
            Excel上传
          </button>
          <button
            onClick={() => setImportTab("paste")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors duration-200 cursor-pointer ${
              importTab === "paste"
                ? "border-primary text-primary"
                : "border-transparent text-textSecondary hover:text-textPrimary"
            }`}
          >
            <ClipboardPaste size={16} />
            表格粘贴
          </button>
        </div>

        {/* 导入备注（共用，覆盖原有备注） */}
        <div>
          <label className="block text-xs text-textSecondary mb-1">
            备注
            <span className="text-danger ml-0.5">*</span>
            <span className="ml-1 text-[10px] text-textMuted">（共用，覆盖原有备注）</span>
          </label>
          <input
            type="text"
            maxLength={100}
            value={importRemark}
            onChange={(e) => setImportRemark(e.target.value)}
            placeholder="必填，最多 100 字"
            className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
          />
        </div>

        {importTab === "excel" ? (
          <div>
            <input
              type="file"
              accept=".xlsx,.xls"
              onChange={(e) => setExcelFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-textSecondary file:mr-3 file:py-2 file:px-4 file:rounded-custom-sm file:border-0 file:bg-primary file:text-white file:text-sm file:font-medium hover:file:bg-primary-hover cursor-pointer"
            />
            {excelFile && (
              <p className="mt-2 text-xs text-textSecondary">
                已选择：{excelFile.name}
              </p>
            )}
            <p className="mt-3 text-xs text-textMuted">
              Excel
              格式：第一列为姓名，第二列收光，第三列麦序，第四列全麦。第一行为表头将被跳过。数据列可留空（仅导入人员名单）。
            </p>
          </div>
        ) : (
          <div>
            <textarea
              value={pasteData}
              onChange={(e) => setPasteData(e.target.value)}
              placeholder={
                "姓名\t收光\t麦序\t全麦\n张三\t10\t40\t5\n李四\t8\t35\t3"
              }
              rows={8}
              className="w-full px-3 py-2 border border-border rounded-custom-sm text-sm font-mono bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200 resize-y"
            />
            <p className="mt-2 text-xs text-textMuted">
              支持Tab分隔或逗号分隔，第一行若包含"姓名"将被视为表头跳过。
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
