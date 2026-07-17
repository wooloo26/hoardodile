import type { Charactership } from "@hoardodile/schemas"
import { cn } from "@hoardodile/ui/lib/utils"
import { useQuery } from "@tanstack/react-query"
import { useNavigate } from "@tanstack/react-router"
import {
	Background,
	Controls,
	type Node,
	ReactFlow,
	useReactFlow,
} from "@xyflow/react"
import "@xyflow/react/dist/style.css"
import { useEffect, useMemo, useRef } from "react"
import { useTheme } from "@/components/common/ThemeProvider"
import {
	charactershipGraphQueryOptions,
	relationshipTypesQueryOptions,
} from "../api"
import { buildRelationshipGraph } from "../utils/buildRelationshipGraph"
import { layoutRelationshipGraph } from "../utils/layoutRelationshipGraph"
import { CharGraphCharacterNode } from "./CharGraphCharacterNode"
import { CharGraphExternalNode } from "./CharGraphExternalNode"
import { CharGraphRelationshipEdge } from "./CharGraphRelationshipEdge"
import { useCharactersByIds } from "./CharSelectorDialog"

const EMPTY_EDGES: readonly Charactership[] = []

const nodeTypes = {
	charGraphCharacter: CharGraphCharacterNode,
	charGraphExternal: CharGraphExternalNode,
} as const

const edgeTypes = {
	charGraphRelationship: CharGraphRelationshipEdge,
} as const

type Props = {
	readonly charId: string
}

function collectCharIds(
	edges: readonly Charactership[],
	anchorCharId: string,
): string[] {
	const ids = new Set<string>([anchorCharId])
	for (const edge of edges) {
		if (edge.selfId !== null) ids.add(edge.selfId)
		if (edge.targetId !== null) ids.add(edge.targetId)
	}
	return [...ids]
}

function FitViewOnLayout(props: { readonly layoutKey: string }) {
	const { fitView } = useReactFlow()
	const lastKey = useRef("")

	useEffect(() => {
		if (lastKey.current === props.layoutKey) return
		lastKey.current = props.layoutKey
		void fitView({ padding: 0.2, duration: 0, maxZoom: 1 })
	}, [props.layoutKey, fitView])

	return null
}

function CharRelationshipGraphInner(props: Props) {
	const { charId: anchorCharId } = props
	const { resolvedTheme } = useTheme()
	const navigate = useNavigate()
	const typesQ = useQuery(relationshipTypesQueryOptions())
	const edgesQ = useQuery(charactershipGraphQueryOptions(anchorCharId))
	const edgeList = edgesQ.data ?? EMPTY_EDGES
	const charIdsInGraph = useMemo(
		() => collectCharIds(edgeList, anchorCharId),
		[anchorCharId, edgeList],
	)
	const charsQ = useCharactersByIds(charIdsInGraph)
	const charactersById = useMemo(() => {
		const map = new Map<string, { name: string; updatedAt: number }>()
		for (const character of charsQ.data ?? []) {
			map.set(character.id, {
				name: character.name,
				updatedAt: character.updatedAt,
			})
		}
		return map
	}, [charsQ.data])

	const { nodes, edges, layoutKey } = useMemo(() => {
		const graph = buildRelationshipGraph({
			edges: edgeList,
			types: typesQ.data ?? [],
			anchorCharId,
			charactersById,
		})
		const laidOut = layoutRelationshipGraph(graph.nodes, graph.edges)
		const nodeIds = laidOut
			.map((node) => node.id)
			.sort()
			.join(",")
		const edgeIds = graph.edges
			.map((edge) => edge.id)
			.sort()
			.join(",")
		return {
			nodes: laidOut,
			edges: graph.edges,
			layoutKey: `${nodeIds}|${edgeIds}`,
		}
	}, [anchorCharId, charactersById, edgeList, typesQ.data])

	function handleNodeClick(_event: React.MouseEvent, node: Node) {
		if (node.type !== "charGraphCharacter") return
		const data = node.data
		if (
			typeof data !== "object" ||
			data === null ||
			!("charId" in data) ||
			typeof data.charId !== "string"
		) {
			return
		}
		if (data.charId === anchorCharId) return
		void navigate({ to: "/characters/$id", params: { id: data.charId } })
	}

	return (
		<div
			className={cn(
				"relative overflow-hidden rounded-lg border bg-muted/10",
				"min-h-80 h-[min(480px,50vh)]",
			)}
			data-testid="character-relationship-graph"
		>
			<ReactFlow
				colorMode={resolvedTheme}
				nodes={nodes}
				edges={edges}
				nodeTypes={nodeTypes}
				edgeTypes={edgeTypes}
				onNodeClick={handleNodeClick}
				nodesDraggable={false}
				nodesConnectable={false}
				elementsSelectable={false}
				panOnDrag
				zoomOnScroll={false}
				preventScrolling={false}
				zoomOnDoubleClick={false}
				maxZoom={1}
				proOptions={{ hideAttribution: true }}
			>
				<Background gap={16} size={1} />
				<Controls showInteractive={false} />
				<FitViewOnLayout layoutKey={layoutKey} />
			</ReactFlow>
		</div>
	)
}

/** Relationship graph for the character detail overview tab. */
export function CharRelationshipGraph(props: Props) {
	return <CharRelationshipGraphInner {...props} />
}
