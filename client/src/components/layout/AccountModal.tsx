import { useEffect, useState } from 'react'
import { LogOut } from 'lucide-react'
import { authApi, getErrorMessage } from '../../api'
import { useAuth } from '../../hooks/useAuth'
import { useToast } from '../../hooks/useToast'
import Modal from '../Modal'
import { Spinner } from '../Skeleton'

interface AccountModalProps {
  open: boolean
  onClose: () => void
  onLoggedOut: () => void
}

export default function AccountModal({
  open,
  onClose,
  onLoggedOut,
}: AccountModalProps) {
  const { user, refreshUser } = useAuth()
  const toast = useToast()
  const [accountTab, setAccountTab] = useState<'nickname' | 'password' | 'logout'>('nickname')

  // 编辑昵称
  const [nicknameInput, setNicknameInput] = useState('')
  const [nicknameSubmitting, setNicknameSubmitting] = useState(false)

  // 修改密码
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [passwordSubmitting, setPasswordSubmitting] = useState(false)

  // 打开时预填昵称（保持原行为：仅 nickname tab 预填，其他 tab 字段为空）
  useEffect(() => {
    if (open) {
      setAccountTab('nickname')
      setNicknameInput(user?.nickname ?? '')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
    }
  }, [open, user?.nickname])

  const handleNicknameSubmit = async () => {
    setNicknameSubmitting(true)
    try {
      await authApi.updateMe({ nickname: nicknameInput.trim() })
      await refreshUser()
      toast.success('昵称已更新')
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setNicknameSubmitting(false)
    }
  }

  const handlePasswordSubmit = async () => {
    // 前端校验
    if (!currentPassword) {
      toast.error('请输入当前密码')
      return
    }
    if (!newPassword) {
      toast.error('请输入新密码')
      return
    }
    if (newPassword.length < 6 || newPassword.length > 50) {
      toast.error('新密码长度需为 6-50 位')
      return
    }
    if (currentPassword === newPassword) {
      toast.error('新密码不能与当前密码相同')
      return
    }
    if (newPassword !== confirmPassword) {
      toast.error('两次输入的新密码不一致')
      return
    }
    setPasswordSubmitting(true)
    try {
      await authApi.changePassword(currentPassword, newPassword)
      toast.success('密码修改成功')
      onClose()
    } catch (err) {
      toast.error(getErrorMessage(err))
    } finally {
      setPasswordSubmitting(false)
    }
  }

  return (
    <Modal open={open} title="账户管理" onClose={onClose}>
      {/* 标签切换 */}
      <div className="flex border-b border-border mb-4 -mt-1">
        {([
          { key: 'nickname', label: '编辑昵称' },
          { key: 'password', label: '修改密码' },
          { key: 'logout', label: '退出登录' },
        ] as const).map((tab) => (
          <button
            key={tab.key}
            onClick={() => setAccountTab(tab.key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors duration-200 cursor-pointer ${
              accountTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-textSecondary hover:text-textPrimary'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 编辑昵称 */}
      {accountTab === 'nickname' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              用户名
              <span className="ml-1 text-[10px] text-textMuted">（不可修改）</span>
            </label>
            <input
              type="text"
              value={user?.username ?? ''}
              disabled
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-surface text-textMuted cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              昵称
              <span className="ml-1 text-[10px] text-textMuted">（选填，仅展示用）</span>
            </label>
            <input
              type="text"
              maxLength={50}
              value={nicknameInput}
              onChange={(e) => setNicknameInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !nicknameSubmitting) {
                  handleNicknameSubmit()
                }
              }}
              placeholder="可选，最多 50 字"
              autoFocus
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={nicknameSubmitting}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handleNicknameSubmit}
              disabled={nicknameSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {nicknameSubmitting && <Spinner className="h-4 w-4" />}
              {nicknameSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      {/* 修改密码 */}
      {accountTab === 'password' && (
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              当前密码
            </label>
            <input
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="请输入当前密码"
              autoFocus
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
            />
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              新密码
              <span className="ml-1 text-[10px] text-textMuted">（6-50 位）</span>
            </label>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="请输入新密码"
              maxLength={50}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
            />
          </div>
          <div>
            <label className="block text-xs text-textSecondary mb-1">
              确认新密码
            </label>
            <input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !passwordSubmitting) {
                  handlePasswordSubmit()
                }
              }}
              placeholder="请再次输入新密码"
              maxLength={50}
              className="w-full px-3 py-2 border border-border rounded-lg text-sm bg-card text-textPrimary focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/15 transition-colors duration-200"
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              disabled={passwordSubmitting}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={handlePasswordSubmit}
              disabled={passwordSubmitting}
              className="flex items-center gap-1.5 px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium hover:bg-primary-hover disabled:opacity-60 disabled:cursor-not-allowed transition-colors duration-200 cursor-pointer"
            >
              {passwordSubmitting && <Spinner className="h-4 w-4" />}
              {passwordSubmitting ? '保存中...' : '保存'}
            </button>
          </div>
        </div>
      )}

      {/* 退出登录 */}
      {accountTab === 'logout' && (
        <div className="space-y-4">
          <div className="flex items-start gap-3 p-3 bg-danger/10 rounded-lg">
            <LogOut size={20} className="text-danger shrink-0 mt-0.5" />
            <div className="text-sm text-textPrimary">
              确认退出当前账户？
              <div className="text-xs text-textMuted mt-1">
                退出后需重新登录才能访问后台管理功能。
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-border rounded-lg text-sm text-textSecondary hover:text-textPrimary hover:border-primary transition-colors duration-200 cursor-pointer"
            >
              取消
            </button>
            <button
              onClick={onLoggedOut}
              className="flex items-center gap-1.5 px-4 py-2 bg-danger text-white rounded-lg text-sm font-medium hover:bg-danger/90 transition-colors duration-200 cursor-pointer"
            >
              <LogOut size={16} />
              确认退出
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
