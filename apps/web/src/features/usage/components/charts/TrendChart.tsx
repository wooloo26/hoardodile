import type { ChartData, ChartOptions } from "chart.js"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { formatDurationMs } from "@/lib/formatDuration"
import { useChartTheme } from "@/lib/useChartTheme"
import { formatDayPeriodLabel } from "../../lib/date"
import { LineChart, withAlpha } from "./chartUtils"

type TrendChartProps = {
	readonly granularity: "day" | "week" | "month" | "year"
	readonly data: readonly {
		readonly period: string
		readonly totalMs: number
	}[]
	readonly timeZone: string
}

export function TrendChart(props: TrendChartProps) {
	const { granularity, data, timeZone } = props
	const { t } = useTranslation()
	const colors = useChartTheme()

	const formatted = useMemo(
		() =>
			data.map((bucket) => {
				const label =
					granularity === "day"
						? formatDayPeriodLabel(bucket.period, timeZone)
						: bucket.period
				return { label, totalMs: bucket.totalMs }
			}),
		[data, granularity, timeZone],
	)

	const chartData = useMemo<ChartData<"line">>(
		() => ({
			labels: formatted.map((item) => item.label),
			datasets: [
				{
					label: t("usage.stats.totalTime"),
					data: formatted.map((item) => item.totalMs),
					borderColor: colors.primary,
					backgroundColor: (context) => {
						const { chart } = context
						const { ctx, chartArea } = chart
						if (!chartArea) return colors.primaryTranslucent
						const gradient = ctx.createLinearGradient(
							0,
							chartArea.bottom,
							0,
							chartArea.top,
						)
						gradient.addColorStop(0, "transparent")
						gradient.addColorStop(1, withAlpha(colors.primary, 0.35))
						return gradient
					},
					fill: true,
					tension: 0.4,
					pointRadius: 0,
					pointHoverRadius: 4,
					borderWidth: 2,
				},
			],
		}),
		[formatted, colors, t],
	)

	const options = useMemo<ChartOptions<"line">>(
		() => ({
			responsive: true,
			maintainAspectRatio: false,
			interaction: { mode: "index", intersect: false },
			plugins: {
				legend: { display: false },
				tooltip: {
					backgroundColor: colors.card,
					titleColor: colors.foreground,
					bodyColor: colors.foreground,
					borderColor: colors.border,
					borderWidth: 1,
					callbacks: {
						label: (context) => {
							const value = context.parsed.y
							return `${context.dataset.label}: ${
								typeof value === "number" ? formatDurationMs(value) : ""
							}`
						},
					},
				},
			},
			scales: {
				x: {
					grid: { display: false },
					ticks: {
						color: colors.mutedForeground,
						font: { size: 12 },
					},
					border: { color: colors.border },
				},
				y: {
					grid: { color: withAlpha(colors.border, 0.5) },
					ticks: {
						color: colors.mutedForeground,
						font: { size: 12 },
						callback: (value) => formatDurationMs(Number(value)),
					},
					border: { display: false },
				},
			},
		}),
		[colors, t],
	)

	return (
		<div className="relative h-full w-full">
			<LineChart data={chartData} options={options} />
		</div>
	)
}
