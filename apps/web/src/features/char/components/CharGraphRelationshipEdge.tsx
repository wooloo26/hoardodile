import { cn } from "@hoardodile/ui/lib/utils"
import {
	BaseEdge,
	EdgeLabelRenderer,
	type EdgeProps,
	getBezierPath,
} from "@xyflow/react"
import { memo } from "react"
import { computeTagChipColors, isSpecialTagStyle } from "@/lib/colors"
import type { CharGraphEdgeData } from "../utils/buildRelationshipGraph"

type Props = EdgeProps & {
	readonly data: CharGraphEdgeData
}

function CharGraphRelationshipEdgeComponent(props: Props) {
	const {
		id,
		sourceX,
		sourceY,
		targetX,
		targetY,
		markerEnd,
		markerStart,
		data,
	} = props
	const edgeData = data ?? { label: "", color: "", hierarchical: false }
	const [path, labelX, labelY] = getBezierPath({
		sourceX,
		sourceY,
		targetX,
		targetY,
	})
	const color = edgeData.color
	const stroke =
		color.length > 0 && !isSpecialTagStyle(color) ? color : "var(--border)"
	const labelStyle =
		color.length > 0 && !isSpecialTagStyle(color)
			? { color: computeTagChipColors(color).fg }
			: undefined

	return (
		<>
			<BaseEdge
				id={id}
				path={path}
				markerEnd={markerEnd}
				markerStart={markerStart}
				style={{ stroke, strokeWidth: 1.25 }}
			/>
			{edgeData.label.length > 0 ? (
				<EdgeLabelRenderer>
					<div
						className={cn(
							"pointer-events-none absolute rounded bg-muted/80 px-1 py-px text-sm",
						)}
						style={{
							transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
							...labelStyle,
						}}
					>
						{edgeData.label}
					</div>
				</EdgeLabelRenderer>
			) : null}
		</>
	)
}

export const CharGraphRelationshipEdge = memo(
	CharGraphRelationshipEdgeComponent,
)
