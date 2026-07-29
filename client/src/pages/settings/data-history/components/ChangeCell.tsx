import { ArrowRight } from 'lucide-react'
import type { DataLogItem } from '../../../../types'
import { FIELD_LABELS } from '../config'
import type { FieldKey } from '../types'

interface ChangeCellProps {
  log: DataLogItem
  personnelMap: Map<number, string>
  filterField?: FieldKey
}

/**
 * 变更内容单元格：create/update/delete 三种场景统一展示
 * - create：显示录入的字段及数值（绿色徽标）
 * - delete：显示删除的字段及数值（红色徽标 + 删除线）
 * - update：显示 before → after 对比（琥珀色徽标）
 */
export default function ChangeCell({ log, personnelMap, filterField }: ChangeCellProps) {
  if (log.type === 'create') {
    return <CreateChangeCell log={log} filterField={filterField} />
  }

  if (log.type === 'delete') {
    return <DeleteChangeCell log={log} filterField={filterField} />
  }

  return <UpdateChangeCell log={log} personnelMap={personnelMap} filterField={filterField} />
}

// ============ 录入变更 ============
function CreateChangeCell({ log, filterField }: { log: DataLogItem; filterField?: FieldKey }) {
  const fields = FIELD_LABELS.filter(
    (f) => log[f.key] !== undefined && log[f.key] !== 0,
  )

  // 仅显示指定字段
  if (filterField) {
    const f = fields.find((x) => x.key === filterField)
    if (!f) return <span className="text-textMuted text-xs">-</span>
    return (
      <Badge tone="success">
        {f.label} {log[f.key]}
      </Badge>
    )
  }

  if (fields.length === 0) {
    return <span className="text-textMuted text-xs">无变更数据</span>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {fields.map((f) => (
        <Badge key={f.key} tone="success">
          {f.label} {log[f.key]}
        </Badge>
      ))}
    </div>
  )
}

// ============ 删除变更 ============
function DeleteChangeCell({ log, filterField }: { log: DataLogItem; filterField?: FieldKey }) {
  let parsed: { sg?: number; mx?: number; qm?: number; zcDays?: number } = {}
  try {
    parsed = JSON.parse(log.oldValue || '{}')
  } catch {
    parsed = {}
  }

  const fields = FIELD_LABELS.filter((f) => parsed[f.key] !== undefined)

  if (filterField) {
    const f = fields.find((x) => x.key === filterField)
    if (!f) return <span className="text-textMuted text-xs">-</span>
    return (
      <Badge tone="danger" strike>
        {f.label} {parsed[f.key]}
      </Badge>
    )
  }

  if (fields.length === 0) {
    return <span className="text-textMuted text-xs">-</span>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {fields.map((f) => (
        <Badge key={f.key} tone="danger" strike>
          {f.label} {parsed[f.key]}
        </Badge>
      ))}
    </div>
  )
}

// ============ 修改变更 ============
function UpdateChangeCell({
  log,
  personnelMap,
  filterField,
}: {
  log: DataLogItem
  personnelMap: Map<number, string>
  filterField?: FieldKey
}) {
  const before = log.before
  const after = log.after

  if (!before || !after) {
    // 兼容旧数据
    let oldParsed: NonNullable<typeof before> = {}
    let newParsed: NonNullable<typeof after> = {}
    try {
      oldParsed = JSON.parse(log.oldValue || '{}')
    } catch {
      oldParsed = {}
    }
    try {
      newParsed = JSON.parse(log.newValue || '{}')
    } catch {
      newParsed = {}
    }
    return <UpdateComparison before={oldParsed} after={newParsed} personnelMap={personnelMap} filterField={filterField} />
  }

  return <UpdateComparison before={before} after={after} personnelMap={personnelMap} filterField={filterField} />
}

// 修改对比展示
function UpdateComparison({
  before,
  after,
  personnelMap,
  filterField,
}: {
  before: { sg?: number; mx?: number; qm?: number; zcDays?: number; personnelId?: number } | null
  after: { sg?: number; mx?: number; qm?: number; zcDays?: number; personnelId?: number } | null
  personnelMap: Map<number, string>
  filterField?: FieldKey
}) {
  if (!before || !after) {
    return <span className="text-textMuted text-xs">-</span>
  }

  const changes: { label: string; oldVal: string; newVal: string; key: string }[] = []
  for (const f of FIELD_LABELS) {
    const oldV = before[f.key]
    const newV = after[f.key]
    if (oldV !== newV) {
      changes.push({
        label: f.label,
        oldVal: String(oldV ?? 0),
        newVal: String(newV ?? 0),
        key: f.key,
      })
    }
  }

  // 人员变更
  if (before.personnelId !== undefined && after.personnelId !== undefined && before.personnelId !== after.personnelId) {
    const oldName = personnelMap.get(before.personnelId) || `ID:${before.personnelId}`
    const newName = personnelMap.get(after.personnelId) || `ID:${after.personnelId}`
    changes.push({
      label: '人员',
      oldVal: oldName,
      newVal: newName,
      key: 'personnel',
    })
  }

  let displayChanges = changes
  if (filterField) {
    displayChanges = changes.filter((c) => c.key === filterField)
  }

  if (displayChanges.length === 0) {
    return <span className="text-textMuted text-xs">无变更</span>
  }

  return (
    <div className="flex flex-wrap gap-1.5">
      {displayChanges.map((c, idx) => (
        <span
          key={idx}
          className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs bg-warning/10 text-warning font-mono"
        >
          <span className="opacity-70">{c.label}</span>
          <span className="line-through opacity-60">{c.oldVal}</span>
          <ArrowRight size={10} className="opacity-70" />
          <span className="font-semibold">{c.newVal}</span>
        </span>
      ))}
    </div>
  )
}

// ============ 通用徽标 ============
function Badge({
  children,
  tone,
  strike,
}: {
  children: React.ReactNode
  tone: 'success' | 'danger'
  strike?: boolean
}) {
  const cls = tone === 'success' ? 'bg-success/10 text-success' : 'bg-danger/10 text-danger'
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-mono ${cls} ${strike ? 'line-through' : ''}`}
    >
      {children}
    </span>
  )
}
