import {
  type InputHTMLAttributes,
  type ReactNode,
  forwardRef,
  useId,
} from 'react'

/**
 * 输入框组件（参考 art-design-pro ElInput 风格）
 * - label: 顶部标签
 * - error: 错误信息（显示红色边框 + 提示文字）
 * - hint: 帮助文字
 * - prefix/suffix: 前缀/后缀（图标或文字）
 */
interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'prefix'> {
  label?: string
  error?: string
  hint?: string
  prefix?: ReactNode
  suffix?: ReactNode
  /** 标记必填（label 后加红色 *） */
  required?: boolean
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      error,
      hint,
      prefix,
      suffix,
      required = false,
      className = '',
      id,
      ...rest
    },
    ref,
  ) => {
    const autoId = useId()
    const inputId = id ?? autoId
    const hasError = Boolean(error)

    return (
      <div className="w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="block mb-1.5 text-sm font-medium text-textPrimary"
          >
            {label}
            {required && <span className="ml-0.5 text-danger">*</span>}
          </label>
        )}
        <div
          className={`flex items-center bg-card border rounded-custom-sm tad-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15 ${
            hasError
              ? 'border-danger focus-within:border-danger focus-within:ring-danger/15'
              : 'border-border'
          } ${className}`}
        >
          {prefix && (
            <span className="pl-3 text-textMuted flex-c">{prefix}</span>
          )}
          <input
            ref={ref}
            id={inputId}
            className={`flex-1 min-w-0 bg-transparent px-3 py-2 text-sm text-textPrimary placeholder:text-textMuted outline-none ${
              prefix ? 'pl-2' : ''
            } ${suffix ? 'pr-2' : ''}`}
            aria-invalid={hasError}
            {...rest}
          />
          {suffix && (
            <span className="pr-3 text-textMuted flex-c">{suffix}</span>
          )}
        </div>
        {hasError ? (
          <p className="mt-1 text-xs text-danger">{error}</p>
        ) : hint ? (
          <p className="mt-1 text-xs text-textMuted">{hint}</p>
        ) : null}
      </div>
    )
  },
)

Input.displayName = 'Input'
export default Input
