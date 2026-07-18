import { cn } from "@hoardodile/ui/lib/utils"
import { Handle, type NodeProps, Position } from "@xyflow/react"
import { memo } from "react"
import type { CharGraphCharacterNodeData } from "../utils/buildRelationshipGraph"
import { CharThumb } from "./CharThumb"

type Props = NodeProps & {
	readonly data: CharGraphCharacterNodeData
}

function CharGraphCharacterNodeComponent(props: Props) {
	const { data, selected } = props
	return (
		<div
			className={cn(
				"flex w-30 flex-col items-center gap-px rounded border bg-card px-0.5 py-0.5 shadow-sm",
				data.isAnchor && "ring-1 ring-primary",
				selected && "border-primary",
			)}
			data-testid={`char-graph-node-${data.charId}`}
		>
			<Handle
				type="target"
				position={Position.Top}
				className="size-1! bg-muted-foreground/50!"
			/>
			<CharThumb
				charId={data.charId}
				variant="avatar"
				cacheKey={data.updatedAt}
				name={data.name}
				hoverOverlay={false}
				className="size-10 rounded-full overflow-hidden"
			/>
			<span className="max-w-full truncate text-sm">{data.name}</span>
			<Handle
				type="source"
				position={Position.Bottom}
				className="size-1! bg-muted-foreground/50!"
			/>
		</div>
	)
}

export const CharGraphCharacterNode = memo(CharGraphCharacterNodeComponent)
