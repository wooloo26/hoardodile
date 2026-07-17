import type { ChartData, ChartOptions } from "chart.js"
import { useMemo } from "react"
import { useTranslation } from "react-i18next"
import { formatDurationMs } from "@/lib/formatDuration"
import { useChartTheme } from "@/lib/useChartTheme"
import { BarChart, withAlpha } from "./chartUtils"

type HourlyDistributionChartProps = {
	readonly data: readonly number[]
	readonly labels?: readonly string[]
}

export function HourlyDistributionChart(props: HourlyDistributionChartProps) {
	const { data, labels: labelsProp } = props
	const { t } = useTranslation()
	const colors = useChartTheme()

	const labels = useMemo(
		() =>
			labelsProp ??
			data.map((_, hour) => `${String(hour).padStart(2, "0")}:00`),
		[data, labelsProp],
	)

	const chartData = useMemo<ChartData<"bar">>(
		() => ({
			labels: [...labels],
			datasets: [
				{
					label: t("usage.stats.totalTime"),
					data: [...data],
					backgroundColor: colors.primary,
					borderRadius: 4,
					borderSkipped: false,
				},
			],
		}),
		[labels, data, colors, t],
	)

	const options = useMemo<ChartOptions<"bar">>(
		() => ({
			responsive: true,
			maintainAspectRatio: false,
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
						callback: (_value, index) => (index % 2 === 0 ? labels[index] : ""),
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
		[colors, labels, t],
	)

	return (
		<div className="relative h-full w-full">
			<BarChart data={chartData} options={options} />
		</div>
	)
}
