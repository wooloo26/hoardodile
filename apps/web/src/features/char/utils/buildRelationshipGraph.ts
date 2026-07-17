import type {
	Character,
	Charactership,
	RelationshipType,
} from "@hoardodile/schemas"
import type { Edge, Node } from "@xyflow/react"
import { keyBy } from "es-toolkit"

export const CHAR_GRAPH_NODE_WIDTH = 120
export const CHAR_GRAPH_NODE_HEIGHT = 72
export const CHAR_GRAPH_EXTERNAL_WIDTH = 56
export const CHAR_GRAPH_EXTERNAL_HEIGHT = 24

export type CharGraphCharacterNodeData = {
	readonly charId: string
	readonly name: string
	readonly updatedAt: number
	readonly isAnchor: boolean
}

export type CharGraphExternalNodeData = {
	readonly name: string
}

export type CharGraphEdgeData = {
	readonly label: string
	readonly color: string
	readonly hierarchical: boolean
}

export function charGraphNodeId(charId: string): string {
	return `char:${charId}`
}

export function externalGraphNodeId(edgeId: string): string {
	return `external:${edgeId}`
}

function isExternalEdge(edge: Charactership): boolean {
	return (
		(edge.selfId === null || edge.targetId === null) &&
		edge.externalName.length > 0
	)
}

function fallbackLabel(
	type: RelationshipType | undefined,
	field: "selfLabel" | "targetLabel" | "name",
	typeId: string,
): string {
	if (type === undefined) return typeId
	const value = type[field]
	if (field !== "name" && value.trim().length > 0) return value
	if (type.name.trim().length > 0) return type.name
	return typeId
}

function hierarchicalEndpoints(
	type: RelationshipType,
	edge: Charactership,
): { readonly sourceId: string; readonly targetId: string } | undefined {
	if (type.kind !== "hierarchical" || type.hierarchyFrom === null) {
		return undefined
	}
	const ancestorId = type.hierarchyFrom === "self" ? edge.selfId : edge.targetId
	const descendantId =
		type.hierarchyFrom === "self" ? edge.targetId : edge.selfId
	if (ancestorId === null || descendantId === null) return undefined
	return { sourceId: ancestorId, targetId: descendantId }
}

function edgeLabel(
	type: RelationshipType | undefined,
	edge: Charactership,
): string {
	if (type === undefined) return edge.typeId
	if (type.kind === "symmetric") {
		const selfLabel = fallbackLabel(type, "selfLabel", edge.typeId)
		const targetLabel = fallbackLabel(type, "targetLabel", edge.typeId)
		if (selfLabel === targetLabel) return selfLabel
		return `${selfLabel} / ${targetLabel}`
	}
	return fallbackLabel(type, "selfLabel", edge.typeId)
}

function collectCharacterIds(edges: readonly Charactership[]): Set<string> {
	const ids = new Set<string>()
	for (const edge of edges) {
		if (edge.selfId !== null) ids.add(edge.selfId)
		if (edge.targetId !== null) ids.add(edge.targetId)
	}
	return ids
}

export type BuildRelationshipGraphInput = {
	readonly edges: readonly Charactership[]
	readonly types: readonly RelationshipType[]
	readonly anchorCharId: string
	readonly charactersById: ReadonlyMap<
		string,
		Pick<Character, "name" | "updatedAt">
	>
}

export type BuildRelationshipGraphResult = {
	readonly nodes: Node[]
	readonly edges: Edge[]
}

/** Convert charactership edges into React Flow nodes and edges. */
export function buildRelationshipGraph(
	input: BuildRelationshipGraphInput,
): BuildRelationshipGraphResult {
	const { edges, types, anchorCharId, charactersById } = input
	const typeById = keyBy(types, (type) => type.id)
	const charIds = collectCharacterIds(edges)
	charIds.add(anchorCharId)

	const nodes: Node[] = []
	for (const charId of charIds) {
		const character = charactersById.get(charId)
		nodes.push({
			id: charGraphNodeId(charId),
			type: "charGraphCharacter",
			position: { x: 0, y: 0 },
			data: {
				charId,
				name: character?.name ?? charId,
				updatedAt: character?.updatedAt ?? 0,
				isAnchor: charId === anchorCharId,
			} satisfies CharGraphCharacterNodeData,
		})
	}

	const flowEdges: Edge[] = []
	for (const edge of edges) {
		const type = typeById[edge.typeId]
		const color = type?.color ?? ""
		const label = edgeLabel(type, edge)

		const isHierarchical = type?.kind === "hierarchical"

		if (isExternalEdge(edge)) {
			const externalId = externalGraphNodeId(edge.id)
			nodes.push({
				id: externalId,
				type: "charGraphExternal",
				position: { x: 0, y: 0 },
				data: {
					name: edge.externalName,
				} satisfies CharGraphExternalNodeData,
			})

			const realCharId = edge.selfId ?? edge.targetId
			if (realCharId === null) continue

			if (type?.kind === "symmetric") {
				flowEdges.push({
					id: edge.id,
					source: charGraphNodeId(realCharId),
					target: externalId,
					type: "charGraphRelationship",
					label,
					data: {
						label,
						color,
						hierarchical: false,
					} satisfies CharGraphEdgeData,
					markerStart: { type: "arrowclosed" },
					markerEnd: { type: "arrowclosed" },
				})
				continue
			}

			const sourceCharId = edge.selfId !== null ? edge.selfId : undefined
			const targetCharId = edge.targetId !== null ? edge.targetId : undefined
			flowEdges.push({
				id: edge.id,
				source:
					sourceCharId !== undefined
						? charGraphNodeId(sourceCharId)
						: externalId,
				target:
					targetCharId !== undefined
						? charGraphNodeId(targetCharId)
						: externalId,
				type: "charGraphRelationship",
				label,
				data: {
					label,
					color,
					hierarchical: false,
				} satisfies CharGraphEdgeData,
				markerEnd: { type: "arrowclosed" },
			})
			continue
		}

		if (edge.selfId === null || edge.targetId === null) continue

		if (type?.kind === "symmetric") {
			flowEdges.push({
				id: edge.id,
				source: charGraphNodeId(edge.selfId),
				target: charGraphNodeId(edge.targetId),
				type: "charGraphRelationship",
				label,
				data: { label, color, hierarchical: false } satisfies CharGraphEdgeData,
				markerStart: { type: "arrowclosed" },
				markerEnd: { type: "arrowclosed" },
			})
			continue
		}

		const hierarchical = type ? hierarchicalEndpoints(type, edge) : undefined
		const sourceCharId = hierarchical?.sourceId ?? edge.selfId
		const targetCharId = hierarchical?.targetId ?? edge.targetId
		if (sourceCharId === null || targetCharId === null) continue

		flowEdges.push({
			id: edge.id,
			source: charGraphNodeId(sourceCharId),
			target: charGraphNodeId(targetCharId),
			type: "charGraphRelationship",
			label,
			data: {
				label,
				color,
				hierarchical: isHierarchical,
			} satisfies CharGraphEdgeData,
			markerEnd: { type: "arrowclosed" },
		})
	}

	return { nodes, edges: flowEdges }
}
