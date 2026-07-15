/**
 * 登录页 SVG 插画 — 数据可视化主题
 * 展示仪表盘卡片 + 柱状图 + 折线 + 浮动统计卡片
 * 使用主题色变量适配亮/暗模式
 */
export default function LoginIllustration() {
  return (
    <svg
      viewBox="0 0 420 340"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="login-illustration"
      role="img"
      aria-label="数据统计仪表盘"
    >
      {/* 主卡片窗口 */}
      <g className="ill-card">
        {/* 卡片背景 */}
        <rect
          x="70"
          y="50"
          width="280"
          height="230"
          rx="16"
          fill="var(--color-card)"
          stroke="var(--color-border)"
          strokeWidth="1.5"
        />
        {/* 窗口栏圆点 */}
        <circle cx="88" cy="70" r="4" fill="#FF6B6B" />
        <circle cx="102" cy="70" r="4" fill="#FFD93D" />
        <circle cx="116" cy="70" r="4" fill="#6BCB77" />
        {/* 分割线 */}
        <line
          x1="70"
          y1="88"
          x2="350"
          y2="88"
          stroke="var(--color-border)"
          strokeWidth="1"
        />
      </g>

      {/* 卡片标题 + 数值 */}
      <g className="ill-header">
        <rect x="88" y="104" width="80" height="8" rx="4" fill="color-mix(in srgb, var(--color-text-secondary) 40%, transparent)" />
        <rect x="88" y="120" width="120" height="10" rx="5" fill="var(--color-primary)" />
        <rect x="300" y="108" width="34" height="34" rx="8" fill="color-mix(in srgb, var(--color-primary) 15%, transparent)" />
        <path
          d="M310 126 L316 132 L326 120"
          stroke="var(--color-primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </g>

      {/* 柱状图 */}
      <g className="ill-bars">
        <rect x="100" y="210" width="24" height="48" rx="4" fill="color-mix(in srgb, var(--color-primary) 25%, transparent)">
          <animate attributeName="height" from="0" to="48" dur="0.6s" begin="0.3s" fill="freeze" />
          <animate attributeName="y" from="258" to="210" dur="0.6s" begin="0.3s" fill="freeze" />
        </rect>
        <rect x="140" y="186" width="24" height="72" rx="4" fill="color-mix(in srgb, var(--color-primary) 35%, transparent)">
          <animate attributeName="height" from="0" to="72" dur="0.6s" begin="0.4s" fill="freeze" />
          <animate attributeName="y" from="258" to="186" dur="0.6s" begin="0.4s" fill="freeze" />
        </rect>
        <rect x="180" y="162" width="24" height="96" rx="4" fill="color-mix(in srgb, var(--color-primary) 55%, transparent)">
          <animate attributeName="height" from="0" to="96" dur="0.6s" begin="0.5s" fill="freeze" />
          <animate attributeName="y" from="258" to="162" dur="0.6s" begin="0.5s" fill="freeze" />
        </rect>
        <rect x="220" y="198" width="24" height="60" rx="4" fill="color-mix(in srgb, var(--color-primary) 45%, transparent)">
          <animate attributeName="height" from="0" to="60" dur="0.6s" begin="0.6s" fill="freeze" />
          <animate attributeName="y" from="258" to="198" dur="0.6s" begin="0.6s" fill="freeze" />
        </rect>
        <rect x="260" y="174" width="24" height="84" rx="4" fill="color-mix(in srgb, var(--color-primary) 65%, transparent)">
          <animate attributeName="height" from="0" to="84" dur="0.6s" begin="0.7s" fill="freeze" />
          <animate attributeName="y" from="258" to="174" dur="0.6s" begin="0.7s" fill="freeze" />
        </rect>
        <rect x="300" y="150" width="24" height="108" rx="4" fill="var(--color-primary)">
          <animate attributeName="height" from="0" to="108" dur="0.6s" begin="0.8s" fill="freeze" />
          <animate attributeName="y" from="258" to="150" dur="0.6s" begin="0.8s" fill="freeze" />
        </rect>
      </g>

      {/* 折线图叠加 */}
      <path
        className="ill-line"
        d="M112 222 L152 198 L192 174 L232 210 L272 186 L312 162"
        stroke="var(--color-accent)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        strokeDasharray="300"
        strokeDashoffset="300"
      >
        <animate attributeName="stroke-dashoffset" from="300" to="0" dur="1s" begin="1s" fill="freeze" />
      </path>
      {/* 折线节点 */}
      <g className="ill-dots">
        <circle cx="112" cy="222" r="3.5" fill="var(--color-accent)" opacity="0">
          <animate attributeName="opacity" from="0" to="1" dur="0.2s" begin="1.4s" fill="freeze" />
        </circle>
        <circle cx="152" cy="198" r="3.5" fill="var(--color-accent)" opacity="0">
          <animate attributeName="opacity" from="0" to="1" dur="0.2s" begin="1.5s" fill="freeze" />
        </circle>
        <circle cx="192" cy="174" r="3.5" fill="var(--color-accent)" opacity="0">
          <animate attributeName="opacity" from="0" to="1" dur="0.2s" begin="1.6s" fill="freeze" />
        </circle>
        <circle cx="232" cy="210" r="3.5" fill="var(--color-accent)" opacity="0">
          <animate attributeName="opacity" from="0" to="1" dur="0.2s" begin="1.7s" fill="freeze" />
        </circle>
        <circle cx="272" cy="186" r="3.5" fill="var(--color-accent)" opacity="0">
          <animate attributeName="opacity" from="0" to="1" dur="0.2s" begin="1.8s" fill="freeze" />
        </circle>
        <circle cx="312" cy="162" r="3.5" fill="var(--color-accent)" opacity="0">
          <animate attributeName="opacity" from="0" to="1" dur="0.2s" begin="1.9s" fill="freeze" />
        </circle>
      </g>

      {/* 浮动小卡片 - 左上：百分比增长 */}
      <g className="ill-float-card float-card-1">
        <rect x="20" y="130" width="72" height="48" rx="10" fill="var(--color-card)" stroke="var(--color-border)" strokeWidth="1.5" />
        <rect x="32" y="142" width="24" height="6" rx="3" fill="color-mix(in srgb, var(--color-text-muted) 50%, transparent)" />
        <path d="M32 162 L40 154 L48 160 L58 148" stroke="var(--color-primary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />
        <circle cx="58" cy="148" r="2.5" fill="var(--color-primary)" />
        <text x="64" y="166" fontSize="9" fill="var(--color-primary)" fontWeight="600">+24%</text>
      </g>

      {/* 浮动小卡片 - 右下：圆环进度 */}
      <g className="ill-float-card float-card-2">
        <rect x="328" y="220" width="72" height="48" rx="10" fill="var(--color-card)" stroke="var(--color-border)" strokeWidth="1.5" />
        <circle cx="346" cy="244" r="12" fill="none" stroke="var(--color-border)" strokeWidth="3" />
        <circle cx="346" cy="244" r="12" fill="none" stroke="var(--color-primary)" strokeWidth="3" strokeLinecap="round" strokeDasharray="75" strokeDashoffset="20" transform="rotate(-90 346 244)" />
        <rect x="364" y="238" width="28" height="6" rx="3" fill="color-mix(in srgb, var(--color-text-secondary) 40%, transparent)" />
        <rect x="364" y="250" width="20" height="5" rx="2.5" fill="color-mix(in srgb, var(--color-text-muted) 40%, transparent)" />
      </g>

      {/* 底部基线 */}
      <line x1="88" y1="262" x2="336" y2="262" stroke="var(--color-border)" strokeWidth="1" />
      {/* 底部刻度 */}
      <g className="ill-axis" opacity="0.5">
        <rect x="104" y="270" width="16" height="4" rx="2" fill="color-mix(in srgb, var(--color-text-muted) 40%, transparent)" />
        <rect x="144" y="270" width="16" height="4" rx="2" fill="color-mix(in srgb, var(--color-text-muted) 40%, transparent)" />
        <rect x="184" y="270" width="16" height="4" rx="2" fill="color-mix(in srgb, var(--color-text-muted) 40%, transparent)" />
        <rect x="224" y="270" width="16" height="4" rx="2" fill="color-mix(in srgb, var(--color-text-muted) 40%, transparent)" />
        <rect x="264" y="270" width="16" height="4" rx="2" fill="color-mix(in srgb, var(--color-text-muted) 40%, transparent)" />
        <rect x="304" y="270" width="16" height="4" rx="2" fill="color-mix(in srgb, var(--color-text-muted) 40%, transparent)" />
      </g>
    </svg>
  )
}
