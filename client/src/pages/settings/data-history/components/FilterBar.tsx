import { motion } from 'framer-motion'
import { Filter, RefreshCw, Calendar, Building2, User } from 'lucide-react'
import DatePicker from '../../../../components/DatePicker'
import GroupedSelect from '../../../../components/GroupedSelect'
import SearchableSelect from '../../../../components/SearchableSelect'
import { formatDate } from '../../../../utils'
import type { Branch, Personnel } from '../../../../types'

interface FilterBarProps {
  filterDate: string
  filterBranchId: string
  filterPersonnelId: string
  branches: Branch[]
  personnel: Personnel[]
  isHuizhang: boolean
  hasFilter: boolean
  onDateChange: (v: string) => void
  onBranchChange: (v: string) => void
  onPersonnelChange: (v: string) => void
  onReset: () => void
}

/**
 * 筛选条件区域
 * 现代化设计：图标标签、边框聚焦、卡片化布局
 */
export default function FilterBar({
  filterDate,
  filterBranchId,
  filterPersonnelId,
  branches,
  personnel,
  isHuizhang,
  hasFilter,
  onDateChange,
  onBranchChange,
  onPersonnelChange,
  onReset,
}: FilterBarProps) {
  const personnelOptions = personnel.map((p) => ({
    value: String(p.id),
    label: p.name,
  }))

  return (
    <motion.div
      className="art-card p-4 relative overflow-hidden"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
    >
      {/* 装饰性背景 */}
      <div className="absolute -right-8 -top-8 opacity-[0.03] pointer-events-none">
        <Filter size={80} strokeWidth={1.5} />
      </div>

      <div className="relative">
        {/* 标题栏 */}
        <div className="flex items-center gap-2 mb-3">
          <div className="p-1.5 rounded-lg bg-surface">
            <Filter size={14} className="text-textSecondary" />
          </div>
          <span className="text-sm font-medium text-textPrimary">筛选条件</span>
          <span className="text-xs text-textMuted">按条件缩小查询范围</span>
          {hasFilter && (
            <button
              onClick={onReset}
              className="ml-auto flex items-center gap-1 px-2 py-1 rounded-md text-xs text-textMuted hover:text-primary hover:bg-primary/5 transition-all duration-200 cursor-pointer"
            >
              <RefreshCw size={11} />
              <span>重置</span>
            </button>
          )}
        </div>

        {/* 筛选项网格 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* 操作日期 */}
          <FilterItem icon={<Calendar size={12} />} label="操作日期">
            <DatePicker
              value={filterDate}
              onChange={onDateChange}
              fullWidth
              allowClear
              showYear
              maxDate={formatDate(new Date())}
              placeholder="选择日期"
            />
          </FilterItem>

          {/* 厅（仅会长可见） */}
          {isHuizhang && (
            <FilterItem icon={<Building2 size={12} />} label="厅">
              <GroupedSelect
                value={filterBranchId}
                onChange={onBranchChange}
                fullWidth
                topOption={{ value: '', label: '全部' }}
                options={branches.map((b) => ({
                  value: String(b.id),
                  label: b.name,
                }))}
              />
            </FilterItem>
          )}

          {/* 人员 */}
          <FilterItem icon={<User size={12} />} label="人员">
            <SearchableSelect
              value={filterPersonnelId}
              onChange={onPersonnelChange}
              options={personnelOptions}
              placeholder="搜索人员..."
              emptyText="无匹配人员"
            />
          </FilterItem>
        </div>
      </div>
    </motion.div>
  )
}

// 筛选项包装组件
function FilterItem({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode
  label: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="flex items-center gap-1 mb-1.5 text-xs text-textSecondary font-medium">
        <span className="text-textMuted">{icon}</span>
        <span>{label}</span>
      </label>
      {children}
    </div>
  )
}
