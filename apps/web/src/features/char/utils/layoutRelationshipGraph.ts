import dagre from "@dagrejs/dagre"
import type { Edge, Node } from "@xyflow/react"
import type { CharGraphEdgeData } from "./buildRelationshipGraph"
import {
	CHAR_GRAPH_EXTERNAL_HEIGHT,
	CHAR_GRAPH_EXTERNAL_WIDTH,
	CHAR_GRAPH_NODE_HEIGHT,
	CHAR_GRAPH_NODE_WIDTH,
} from "./buildRelationshipGraph"

function nodeDimensions(node: Node): {
	readonly width: number
	readonly height: number
} {
	if (node.type === "charGraphExternal") {
		return {
			width: CHAR_GRAPH_EXTERNAL_WIDTH,
			height: CHAR_GRAPH_EXTERNAL_HEIGHT,
		}
	}
	return { width: CHAR_GRAPH_NODE_WIDTH, height: CHAR_GRAPH_NODE_HEIGHT }
}

function isHierarchicalEdge(edge: Edge): boolean {
	const data = edge.data as CharGraphEdgeData | undefined
	return data?.hierarchical === true
}

/** Apply dagre layout to relationship graph nodes. */
export function layoutRelationshipGraph(
	nodes: readonly Node[],
	edges: readonly Edge[],
	direction: "TB" | "LR" = "TB",
): Node[] {
	const graph = new dagre.graphlib.Graph()
	graph.setDefaultEdgeLabel(() => ({}))
	graph.setGraph({
		rankdir: direction,
		nodesep: 32,
		ranksep: 72,
		marginx: 12,
		marginy: 12,
	})

	for (const node of nodes) {
		const { width, height } = nodeDimensions(node)
		graph.setNode(node.id, { width, height })
	}

	for (const edge of edges) {
		const hierarchical = isHierarchicalEdge(edge)
		graph.setEdge(edge.source, edge.target, {
			weight: hierarchical ? 2 : 1,
			constraint: hierarchical,
		})
	}

	dagre.layout(graph)

	return nodes.map((node) => {
		const { width, height } = nodeDimensions(node)
		const layoutNode = graph.node(node.id)
		return {
			...node,
			position: {
				x: layoutNode.x - width / 2,
				y: layoutNode.y - height / 2,
			},
		}
	})
}
