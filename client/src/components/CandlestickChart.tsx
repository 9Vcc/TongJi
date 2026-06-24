import { useEffect, useMemo, useRef, useState } from 'react'
import {
  createChart,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  ColorType,
  CrosshairMode,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
  type MouseEventParams,
  type CandlestickData,
  type HistogramData,
  type LineData,
} from 'lightweight-charts'
import { Activity } from 'lucide-react'
import { dashboardApi, dataQueryApi, getErrorMessage } from '../api'
import { useTheme } from '../hooks/useTheme'
import { useToast } from '../hooks/useToast'
import { getWeekStart, formatDate } from '../utils'
import { ChartSkeleton } from './Skeleton'

type RangeKey = '1w' | '2w' | '1m' | '3m'

const RANGE_OPTIONS: { key: RangeKey; label: string; weeks: number }[] = [
  { key: '1w', label: '1周', weeks: 4 },
  { key: '2w', label: '2周', weeks: 8 },
  { key: '1m', label: '1月', weeks: 12 },
  { key: '3m', label: '3月', weeks: 24 },
]

const MA_PERIODS = [
  { period: 5, color: '#F59E0B' },
  { period: 10, color: '#3B82F6' },
  { period: 20, color: '#A855F7' },
]

interface CandlePoint {
  time: UTCTimestamp
  open: number
  high: number
  low: number
  close: number
  volume: number
  weekStart: string
}

interface TooltipData {
  visible: boolean
  x: number
  y: number
  time: string
  open: number
  high: number
  low: number
  close: number
  volume: number
  change: number
}

interface CandlestickChartProps {
  branchId?: number
}

/** 计算移动平均线 */
function calcMA(
  data: CandlePoint[],
  period: number
): LineData[] {
  const result: LineData[] = []
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) continue
    let sum = 0
    for (let j = 0; j < period; j++) {
      sum += data[i - j].close
    }
    result.push({
      time: data[i].time,
      value: sum / period,
    })
  }
  return result
}

export default function CandlestickChart({ branchId }: CandlestickChartProps) {
  const { resolvedTheme } = useTheme()
  const toast = useToast()
  const containerRef = useRef<HTMLDivElement>(null)
  const chartRef = useRef<IChartApi | null>(null)
  const candleSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null)
  const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null)
  const maSeriesRef = useRef<Map<number, ISeriesApi<'Line'>>>(new Map())

  const [range, setRange] = useState<RangeKey>('1m')
  const [maEnabled, setMaEnabled] = useState<Record<number, boolean>>({
    5: true,
    10: false,
    20: false,
  })
  const [data, setData] = useState<CandlePoint[]>([])
  const [loading, setLoading] = useState(true)
  const [tooltip, setTooltip] = useState<TooltipData>({
    visible: false,
    x: 0,
    y: 0,
    time: '',
    open: 0,
    high: 0,
    low: 0,
    close: 0,
    volume: 0,
    change: 0,
  })

  const isDark = resolvedTheme === 'dark'
  const rangeWeeks = useMemo(
    () => RANGE_OPTIONS.find((r) => r.key === range)?.weeks ?? 12,
    [range]
  )

  // 拉取多周数据并转换为K线
  useEffect(() => {
    let cancelled = false
    setLoading(true)

    async function load() {
      try {
        // 获取可用周列表
        const weeks = await dataQueryApi.getWeeks(branchId)
        // 按时间倒序，取最近 rangeWeeks 周
        const sorted = [...weeks].sort().reverse().slice(0, rangeWeeks)
        if (sorted.length === 0) {
          // 没有历史周，用当前周兜底
          const current = formatDate(getWeekStart())
          sorted.push(current)
        }
        // 正序展示
        sorted.reverse()

        const summaries = await Promise.all(
          sorted.map((w) => dashboardApi.getSummary(w, branchId))
        )

        const points: CandlePoint[] = sorted.map((weekStart, i) => {
          const s = summaries[i]
          const close = s?.totalWelfare ?? 0
          const prevClose = i > 0 ? summaries[i - 1]?.totalWelfare ?? 0 : close
          const open = i === 0 ? close : prevClose
          const high = Math.max(open, close) * 1.02
          const low = Math.min(open, close) * 0.98
          const volume = (s?.totalSG ?? 0) + (s?.totalMX ?? 0)
          return {
            time: (new Date(weekStart).getTime() / 1000) as UTCTimestamp,
            open: Math.round(open),
            high: Math.round(high),
            low: Math.round(low),
            close: Math.round(close),
            volume,
            weekStart,
          }
        })

        if (!cancelled) {
          setData(points)
        }
      } catch (err) {
        if (!cancelled) {
          toast.error(getErrorMessage(err))
          setData([])
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchId, rangeWeeks])

  // 创建图表
  useEffect(() => {
    if (!containerRef.current) return

    const gridColor = isDark ? 'rgba(148, 163, 184, 0.15)' : 'rgba(107, 114, 128, 0.15)'
    const textColor = isDark ? '#CBD5E1' : '#4B5563'
    const bgColor = isDark ? '#1E293B' : '#FFFFFF'

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: bgColor },
        textColor,
        fontFamily: 'Fira Code, monospace',
      },
      grid: {
        vertLines: { color: gridColor },
        horzLines: { color: gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          color: isDark ? '#64748B' : '#9CA3AF',
          width: 1,
          style: 2,
          labelBackgroundColor: isDark ? '#334155' : '#E5E7EB',
        },
        horzLine: {
          color: isDark ? '#64748B' : '#9CA3AF',
          width: 1,
          style: 2,
          labelBackgroundColor: isDark ? '#334155' : '#E5E7EB',
        },
      },
      rightPriceScale: {
        borderColor: gridColor,
      },
      timeScale: {
        borderColor: gridColor,
        timeVisible: false,
      },
      autoSize: true,
    })

    chartRef.current = chart

    // K线主系列
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#26A69A',
      downColor: '#EF5350',
      borderUpColor: '#26A69A',
      borderDownColor: '#EF5350',
      wickUpColor: '#26A69A',
      wickDownColor: '#EF5350',
    })
    candleSeriesRef.current = candleSeries

    // 成交量系列（独立 pane）
    const volumeSeries = chart.addSeries(
      HistogramSeries,
      {
        priceFormat: { type: 'volume' },
        priceScaleId: 'volume',
      },
      1
    )
    chart.priceScale('volume', 1).applyOptions({
      scaleMargins: { top: 0.7, bottom: 0 },
    })
    volumeSeriesRef.current = volumeSeries

    // 十字光标 tooltip
    const crosshairHandler = (param: MouseEventParams) => {
      if (!param.time || !param.point || !candleSeriesRef.current) {
        setTooltip((t) => ({ ...t, visible: false }))
        return
      }
      const data = param.seriesData.get(candleSeriesRef.current) as
        | CandlestickData
        | undefined
      const volData = volumeSeriesRef.current
        ? (param.seriesData.get(volumeSeriesRef.current) as
            | HistogramData
            | undefined)
        : undefined
      if (!data) {
        setTooltip((t) => ({ ...t, visible: false }))
        return
      }
      const change =
        data.open !== 0
          ? ((data.close - data.open) / data.open) * 100
          : 0
      const timeStr =
        typeof param.time === 'string'
          ? param.time
          : new Date((param.time as number) * 1000)
              .toISOString()
              .slice(0, 10)
      setTooltip({
        visible: true,
        x: param.point.x,
        y: param.point.y,
        time: timeStr,
        open: data.open,
        high: data.high,
        low: data.low,
        close: data.close,
        volume: volData?.value ?? 0,
        change,
      })
    }
    chart.subscribeCrosshairMove(crosshairHandler)

    return () => {
      chart.unsubscribeCrosshairMove(crosshairHandler)
      chart.remove()
      chartRef.current = null
      candleSeriesRef.current = null
      volumeSeriesRef.current = null
      maSeriesRef.current.clear()
    }
  }, [isDark])

  // 更新数据
  useEffect(() => {
    const candleSeries = candleSeriesRef.current
    const volumeSeries = volumeSeriesRef.current
    const chart = chartRef.current
    if (!candleSeries || !volumeSeries || !chart) return

    const candleData: CandlestickData[] = data.map((d) => ({
      time: d.time,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }))
    const volumeData: HistogramData[] = data.map((d) => ({
      time: d.time,
      value: d.volume,
      color: d.close >= d.open ? 'rgba(38, 166, 154, 0.4)' : 'rgba(239, 83, 80, 0.4)',
    }))

    candleSeries.setData(candleData)
    volumeSeries.setData(volumeData)

    // 更新 MA 线
    maSeriesRef.current.forEach((series) => {
      chart.removeSeries(series)
    })
    maSeriesRef.current.clear()

    for (const { period, color } of MA_PERIODS) {
      if (!maEnabled[period]) continue
      const maData = calcMA(data, period)
      if (maData.length === 0) continue
      const maSeries = chart.addSeries(LineSeries, {
        color,
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: false,
        crosshairMarkerVisible: false,
      })
      maSeries.setData(maData)
      maSeriesRef.current.set(period, maSeries)
    }

    chart.timeScale().fitContent()
  }, [data, maEnabled])

  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <Activity size={18} className="text-primary" />
          <h3 className="text-base font-semibold text-textPrimary">
            福利趋势 K线图
          </h3>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* MA 切换 */}
          <div className="flex items-center gap-1">
            <span className="text-xs text-textMuted mr-1">MA</span>
            {MA_PERIODS.map(({ period, color }) => (
              <button
                key={period}
                onClick={() =>
                  setMaEnabled((prev) => ({ ...prev, [period]: !prev[period] }))
                }
                aria-label={`切换MA${period}`}
                aria-pressed={maEnabled[period]}
                className={`px-2 py-1 text-xs rounded border transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  maEnabled[period]
                    ? 'border-transparent text-white'
                    : 'border-border text-textMuted hover:text-textPrimary'
                }`}
                style={
                  maEnabled[period] ? { backgroundColor: color } : undefined
                }
              >
                {period}
              </button>
            ))}
          </div>
          {/* 时间范围 */}
          <div className="flex items-center gap-1 border border-border rounded-lg p-0.5">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                onClick={() => setRange(opt.key)}
                aria-label={`时间范围 ${opt.label}`}
                className={`px-2.5 py-1 text-xs rounded-md transition-colors duration-200 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50 ${
                  range === opt.key
                    ? 'bg-primary text-white'
                    : 'text-textSecondary hover:text-textPrimary hover:bg-surface'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <ChartSkeleton height="h-80" />
      ) : data.length === 0 ? (
        <div className="h-80 flex items-center justify-center text-sm text-textMuted">
          暂无数据
        </div>
      ) : (
        <div className="relative">
          <div ref={containerRef} className="h-80 w-full" />
          {tooltip.visible && (
            <div
              className="absolute pointer-events-none z-10 bg-card border border-border rounded-lg shadow-lg px-3 py-2 text-xs space-y-1 min-w-[140px]"
              style={{
                left: tooltip.x + 12,
                top: tooltip.y + 12,
              }}
            >
              <div className="text-textMuted">{tooltip.time}</div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 font-mono">
                <span className="text-textMuted">开</span>
                <span className="text-textPrimary text-right">
                  {tooltip.open.toLocaleString()}
                </span>
                <span className="text-textMuted">高</span>
                <span className="text-up text-right">
                  {tooltip.high.toLocaleString()}
                </span>
                <span className="text-textMuted">低</span>
                <span className="text-down text-right">
                  {tooltip.low.toLocaleString()}
                </span>
                <span className="text-textMuted">收</span>
                <span className="text-textPrimary text-right">
                  {tooltip.close.toLocaleString()}
                </span>
                <span className="text-textMuted">量</span>
                <span className="text-textSecondary text-right">
                  {tooltip.volume.toLocaleString()}
                </span>
              </div>
              <div
                className={`text-right font-medium ${
                  tooltip.change >= 0 ? 'text-up' : 'text-down'
                }`}
              >
                {tooltip.change >= 0 ? '+' : ''}
                {tooltip.change.toFixed(2)}%
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
