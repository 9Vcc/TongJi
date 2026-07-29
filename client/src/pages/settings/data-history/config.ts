import {
  Plus,
  Pencil,
  Trash2,
} from 'lucide-react'
import type { DataLogType } from '../../../types'
import type { FieldKey } from './types'

// 操作类型板块配置：标题、图标、配色、描述
// 采用更现代的配色方案：使用主题变量 + 半透明叠加
export const SECTION_CONFIG: Record<
  DataLogType,
  {
    label: string
    icon: typeof Plus
    iconCls: string
    badgeCls: string
    cardCls: string
    gradientCls: string
    desc: string
  }
> = {
  create: {
    label: '录入',
    icon: Plus,
    iconCls: 'text-success',
    badgeCls: 'bg-success/10 text-success border border-success/20',
    cardCls: 'hover:border-success/40 hover:bg-success/5 hover:shadow-[0_8px_24px_-12px_rgba(16,185,129,0.25)]',
    gradientCls: 'from-success/10 to-transparent',
    desc: '查看所有录入操作记录',
  },
  update: {
    label: '修改',
    icon: Pencil,
    iconCls: 'text-warning',
    badgeCls: 'bg-warning/10 text-warning border border-warning/20',
    cardCls: 'hover:border-warning/40 hover:bg-warning/5 hover:shadow-[0_8px_24px_-12px_rgba(245,158,11,0.25)]',
    gradientCls: 'from-warning/10 to-transparent',
    desc: '查看所有修改操作记录',
  },
  delete: {
    label: '删除',
    icon: Trash2,
    iconCls: 'text-danger',
    badgeCls: 'bg-danger/10 text-danger border border-danger/20',
    cardCls: 'hover:border-danger/40 hover:bg-danger/5 hover:shadow-[0_8px_24px_-12px_rgba(239,68,68,0.25)]',
    gradientCls: 'from-danger/10 to-transparent',
    desc: '查看所有删除操作记录',
  },
}

// 数据字段中文名映射及配色
export const FIELD_LABELS: { key: FieldKey; label: string; color: string; bgCls: string }[] = [
  { key: 'sg', label: '收光', color: 'text-primary', bgCls: 'bg-primary/10 border-primary/20' },
  { key: 'mx', label: '麦序', color: 'text-warning', bgCls: 'bg-warning/10 border-warning/20' },
  { key: 'qm', label: '全麦', color: 'text-success', bgCls: 'bg-success/10 border-success/20' },
  { key: 'zcDays', label: '主持', color: 'text-info', bgCls: 'bg-info/10 border-info/20' },
]

// 操作类型顺序
export const TYPE_ORDER: DataLogType[] = ['create', 'update', 'delete']
