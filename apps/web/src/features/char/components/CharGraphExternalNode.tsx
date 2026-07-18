import { Handle, type NodeProps, Position } from "@xyflow/react"
import { memo } from "react"
import type { CharGraphExternalNodeData } from "../utils/buildRelationshipGraph"

type Props = NodeProps & {
	readonly data: CharGraphExternalNodeData
}

function CharGraphExternalNodeComponent(props: Props) {
	const { data } = props
	return (
		<div
			className="flex w-14 items-center justify-center rounded-full border bg-muted/30 px-1 py-px text-[9px] font-medium text-muted-foreground"
			data-testid={`char-graph-external-${data.name}`}
		>
			<Handle
				type="target"
				position={Position.Top}
				className="size-1! bg-muted-foreground/50!"
			/>
			<span className="max-w-full truncate">{data.name}</span>
		</div>
	)
}

export const CharGraphExternalNode = memo(CharGraphExternalNodeComponent)
