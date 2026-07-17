import type { ChartData, ChartOptions } from "chart.js"
import Chart from "chart.js/auto"
import { useEffect, useRef } from "react"

export function withAlpha(color: string, alpha: number): string {
	if (!color) return `oklch(0 0 0 / ${alpha})`
	if (color.startsWith("oklch(")) {
		const inner = color.slice(6, -1).trim()
		return `oklch(${inner} / ${alpha})`
	}
	return color
}

export function LineChart(props: {
	readonly data: ChartData<"line">
	readonly options: ChartOptions<"line">
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const chartRef = useRef<Chart<"line"> | null>(null)

	useEffect(() => {
		if (!canvasRef.current) return
		const ctx = canvasRef.current.getContext("2d")
		if (!ctx) return

		const chart = new Chart(ctx, {
			type: "line",
			data: props.data,
			options: props.options,
		})
		chartRef.current = chart

		return () => {
			chart.destroy()
			chartRef.current = null
		}
	}, [])

	useEffect(() => {
		const chart = chartRef.current
		if (!chart) return
		chart.data = props.data
		chart.options = props.options
		chart.update()
	}, [props.data, props.options])

	return <canvas ref={canvasRef} />
}

export function BarChart(props: {
	readonly data: ChartData<"bar">
	readonly options: ChartOptions<"bar">
}) {
	const canvasRef = useRef<HTMLCanvasElement>(null)
	const chartRef = useRef<Chart<"bar"> | null>(null)

	useEffect(() => {
		if (!canvasRef.current) return
		const ctx = canvasRef.current.getContext("2d")
		if (!ctx) return

		const chart = new Chart(ctx, {
			type: "bar",
			data: props.data,
			options: props.options,
		})
		chartRef.current = chart

		return () => {
			chart.destroy()
			chartRef.current = null
		}
	}, [])

	useEffect(() => {
		const chart = chartRef.current
		if (!chart) return
		chart.data = props.data
		chart.options = props.options
		chart.update()
	}, [props.data, props.options])

	return <canvas ref={canvasRef} />
}
