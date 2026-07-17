import type { Charactership, RelationshipType } from "@hoardodile/schemas"
import { describe, expect, it } from "vitest"
import {
	buildRelationshipGraph,
	charGraphNodeId,
	externalGraphNodeId,
} from "./buildRelationshipGraph"
import { layoutRelationshipGraph } from "./layoutRelationshipGraph"

function makeType(
	overrides: Partial<RelationshipType> & Pick<RelationshipType, "id" | "name">,
): RelationshipType {
	return {
		selfLabel: "",
		targetLabel: "",
		kind: "directed",
		hierarchyFrom: null,
		position: 0,
		intro: "",
		color: "",
		pinned: false,
		createdAt: 0,
		updatedAt: 0,
		...overrides,
	}
}

function edge(
	id: string,
	typeId: string,
	selfId: string,
	targetId: string,
): Charactership {
	return {
		id,
		typeId,
		selfId,
		targetId,
		externalName: "",
		notes: "",
		metadata: {},
		createdAt: 0,
	}
}

function externalEdge(
	id: string,
	typeId: string,
	realCharId: string,
	externalName: string,
	realSide: "self" | "target" = "self",
): Charactership {
	return {
		id,
		typeId,
		selfId: realSide === "self" ? realCharId : null,
		targetId: realSide === "target" ? realCharId : null,
		externalName,
		notes: "",
		metadata: {},
		createdAt: 0,
	}
}

const types: readonly RelationshipType[] = [
	makeType({
		id: "directed",
		name: "Mentor",
		selfLabel: "mentor",
		targetLabel: "apprentice",
		color: "#3366cc",
	}),
	makeType({
		id: "symmetric",
		name: "Friend",
		selfLabel: "friend",
		targetLabel: "friend",
		kind: "symmetric",
	}),
	makeType({
		id: "hier",
		name: "Parent",
		selfLabel: "parent",
		targetLabel: "child",
		kind: "hierarchical",
		hierarchyFrom: "self",
	}),
	makeType({
		id: "hier-reverse",
		name: "Subordinate",
		selfLabel: "subordinate",
		targetLabel: "superior",
		kind: "hierarchical",
		hierarchyFrom: "target",
	}),
]

const characters = new Map([
	["anchor", { name: "Anchor", updatedAt: 1 }],
	["bob", { name: "Bob", updatedAt: 2 }],
	["carol", { name: "Carol", updatedAt: 3 }],
	["dave", { name: "Dave", updatedAt: 4 }],
	["eve", { name: "Eve", updatedAt: 5 }],
	["frank", { name: "Frank", updatedAt: 6 }],
])

function nodePos(
	laidOut: readonly {
		readonly position: { readonly x: number; readonly y: number }
	}[],
	charId: string,
) {
	const id = charGraphNodeId(charId)
	const node = laidOut.find((n) => "id" in n && (n as { id: string }).id === id)
	return node?.position
}

describe("buildRelationshipGraph", () => {
	it("creates character nodes with anchor highlight", () => {
		const result = buildRelationshipGraph({
			edges: [edge("e1", "directed", "anchor", "bob")],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		const anchorNode = result.nodes.find(
			(node) => node.id === charGraphNodeId("anchor"),
		)
		const bobNode = result.nodes.find(
			(node) => node.id === charGraphNodeId("bob"),
		)
		expect(anchorNode?.data).toMatchObject({
			isAnchor: true,
			name: "Anchor",
		})
		expect(bobNode?.data).toMatchObject({
			isAnchor: false,
			name: "Bob",
		})
	})

	it("creates directed edges from self to target with label", () => {
		const result = buildRelationshipGraph({
			edges: [edge("e1", "directed", "anchor", "bob")],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		expect(result.edges).toHaveLength(1)
		expect(result.edges[0]).toMatchObject({
			id: "e1",
			source: charGraphNodeId("anchor"),
			target: charGraphNodeId("bob"),
			label: "mentor",
		})
	})

	it("creates symmetric edges with both markers", () => {
		const result = buildRelationshipGraph({
			edges: [edge("e1", "symmetric", "anchor", "bob")],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		expect(result.edges[0]).toMatchObject({
			markerStart: { type: "arrowclosed" },
			markerEnd: { type: "arrowclosed" },
		})
	})

	it("orients hierarchical edges from ancestor to descendant", () => {
		const result = buildRelationshipGraph({
			edges: [edge("e1", "hier", "anchor", "bob")],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		expect(result.edges[0]).toMatchObject({
			source: charGraphNodeId("anchor"),
			target: charGraphNodeId("bob"),
			label: "parent",
		})
	})

	it("creates external target nodes", () => {
		const external = externalEdge("ext1", "directed", "anchor", "Tokyo")
		const result = buildRelationshipGraph({
			edges: [external],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		expect(
			result.nodes.some((node) => node.id === externalGraphNodeId("ext1")),
		).toBe(true)
		expect(result.edges[0]?.target).toBe(externalGraphNodeId("ext1"))
	})

	it("creates external source nodes when the real character is the target", () => {
		const external = externalEdge(
			"ext1",
			"directed",
			"anchor",
			"Tokyo",
			"target",
		)
		const result = buildRelationshipGraph({
			edges: [external],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		expect(
			result.nodes.some((node) => node.id === externalGraphNodeId("ext1")),
		).toBe(true)
		expect(result.edges[0]?.source).toBe(externalGraphNodeId("ext1"))
		expect(result.edges[0]?.target).toBe(charGraphNodeId("anchor"))
	})

	it("includes all characters from multi-hop edges", () => {
		const result = buildRelationshipGraph({
			edges: [
				edge("e1", "directed", "anchor", "bob"),
				edge("e2", "directed", "bob", "carol"),
			],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		expect(result.nodes.map((node) => node.id).sort()).toEqual(
			[
				charGraphNodeId("anchor"),
				charGraphNodeId("bob"),
				charGraphNodeId("carol"),
			].sort(),
		)
	})

	it("multi-level hierarchical chain: A->B->C edges point ancestor to descendant", () => {
		const result = buildRelationshipGraph({
			edges: [
				edge("e1", "hier", "anchor", "bob"),
				edge("e2", "hier", "bob", "carol"),
			],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		expect(result.edges).toHaveLength(2)
		const e1 = result.edges.find((e) => e.id === "e1")
		const e2 = result.edges.find((e) => e.id === "e2")
		expect(e1).toMatchObject({
			source: charGraphNodeId("anchor"),
			target: charGraphNodeId("bob"),
			label: "parent",
		})
		expect(e2).toMatchObject({
			source: charGraphNodeId("bob"),
			target: charGraphNodeId("carol"),
			label: "parent",
		})
	})

	it("mixed types: hierarchical + directed + symmetric coexist", () => {
		const result = buildRelationshipGraph({
			edges: [
				edge("e1", "hier", "anchor", "bob"),
				edge("e2", "directed", "anchor", "carol"),
				edge("e3", "symmetric", "bob", "carol"),
			],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		expect(result.edges).toHaveLength(3)
		expect(result.nodes).toHaveLength(3)
		const hierEdge = result.edges.find((e) => e.id === "e1")
		const dirEdge = result.edges.find((e) => e.id === "e2")
		const symEdge = result.edges.find((e) => e.id === "e3")
		expect(hierEdge).toMatchObject({
			source: charGraphNodeId("anchor"),
			target: charGraphNodeId("bob"),
		})
		expect(dirEdge).toMatchObject({
			source: charGraphNodeId("anchor"),
			target: charGraphNodeId("carol"),
		})
		expect(symEdge).toMatchObject({
			markerStart: { type: "arrowclosed" },
			markerEnd: { type: "arrowclosed" },
		})
	})

	it("hierarchyFrom=target reverses edge direction", () => {
		const result = buildRelationshipGraph({
			edges: [edge("e1", "hier-reverse", "anchor", "bob")],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		expect(result.edges[0]).toMatchObject({
			source: charGraphNodeId("bob"),
			target: charGraphNodeId("anchor"),
			label: "subordinate",
		})
	})

	it("one node is ancestor in multiple hierarchical edges", () => {
		const result = buildRelationshipGraph({
			edges: [
				edge("e1", "hier", "anchor", "bob"),
				edge("e2", "hier", "anchor", "carol"),
			],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		expect(result.edges).toHaveLength(2)
		expect(result.edges[0]).toMatchObject({
			source: charGraphNodeId("anchor"),
		})
		expect(result.edges[1]).toMatchObject({
			source: charGraphNodeId("anchor"),
		})
	})

	it("orphan anchor node with no edges", () => {
		const result = buildRelationshipGraph({
			edges: [],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		expect(result.nodes).toHaveLength(1)
		expect(result.nodes[0]).toMatchObject({
			id: charGraphNodeId("anchor"),
		})
		expect(result.edges).toHaveLength(0)
	})

	it("external node with hierarchical edge", () => {
		const ext = externalEdge("ext1", "hier", "anchor", "Org")
		const result = buildRelationshipGraph({
			edges: [ext],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		expect(result.nodes.some((n) => n.id === externalGraphNodeId("ext1"))).toBe(
			true,
		)
		expect(result.edges[0]?.source).toBe(charGraphNodeId("anchor"))
		expect(result.edges[0]?.target).toBe(externalGraphNodeId("ext1"))
	})

	it("unknown type id falls back to typeId as label", () => {
		const result = buildRelationshipGraph({
			edges: [edge("e1", "unknown-type", "anchor", "bob")],
			types: [types[0]!],
			anchorCharId: "anchor",
			charactersById: characters,
		})
		expect(result.edges[0]?.label).toBe("unknown-type")
	})

	it("deep 5-level hierarchical chain produces 5 edges", () => {
		const result = buildRelationshipGraph({
			edges: [
				edge("e1", "hier", "anchor", "bob"),
				edge("e2", "hier", "bob", "carol"),
				edge("e3", "hier", "carol", "dave"),
				edge("e4", "hier", "dave", "eve"),
			],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		expect(result.edges).toHaveLength(4)
		expect(result.nodes).toHaveLength(5)
		for (const e of result.edges) {
			expect(e.source).not.toBe(e.target)
		}
	})
})

describe("layoutRelationshipGraph", () => {
	it("assigns non-zero positions to nodes", () => {
		const graph = buildRelationshipGraph({
			edges: [edge("e1", "directed", "anchor", "bob")],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		const laidOut = layoutRelationshipGraph(graph.nodes, graph.edges)
		for (const node of laidOut) {
			expect(Number.isFinite(node.position.x)).toBe(true)
			expect(Number.isFinite(node.position.y)).toBe(true)
		}
	})

	it("hierarchical edge source is above target (smaller Y)", () => {
		const graph = buildRelationshipGraph({
			edges: [edge("e1", "hier", "anchor", "bob")],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		const laidOut = layoutRelationshipGraph(graph.nodes, graph.edges)
		const anchorPos = nodePos(laidOut, "anchor")
		const bobPos = nodePos(laidOut, "bob")
		expect(anchorPos).toBeDefined()
		expect(bobPos).toBeDefined()
		expect(anchorPos!.y).toBeLessThan(bobPos!.y)
	})

	it("multi-level hierarchical chain has Y values in order", () => {
		const graph = buildRelationshipGraph({
			edges: [
				edge("e1", "hier", "anchor", "bob"),
				edge("e2", "hier", "bob", "carol"),
				edge("e3", "hier", "carol", "dave"),
			],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		const laidOut = layoutRelationshipGraph(graph.nodes, graph.edges)
		const anchorPos = nodePos(laidOut, "anchor")
		const bobPos = nodePos(laidOut, "bob")
		const carolPos = nodePos(laidOut, "carol")
		const davePos = nodePos(laidOut, "dave")
		expect(anchorPos!.y).toBeLessThan(bobPos!.y)
		expect(bobPos!.y).toBeLessThan(carolPos!.y)
		expect(carolPos!.y).toBeLessThan(davePos!.y)
	})

	it("mixed types layout does not crash", () => {
		const graph = buildRelationshipGraph({
			edges: [
				edge("e1", "hier", "anchor", "bob"),
				edge("e2", "directed", "anchor", "carol"),
				edge("e3", "symmetric", "bob", "carol"),
			],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		const laidOut = layoutRelationshipGraph(graph.nodes, graph.edges)
		expect(laidOut.length).toBe(graph.nodes.length)
		for (const node of laidOut) {
			expect(Number.isFinite(node.position.x)).toBe(true)
			expect(Number.isFinite(node.position.y)).toBe(true)
		}
	})

	it("deep 5-level hierarchical chain has monotonically increasing Y", () => {
		const graph = buildRelationshipGraph({
			edges: [
				edge("e1", "hier", "anchor", "bob"),
				edge("e2", "hier", "bob", "carol"),
				edge("e3", "hier", "carol", "dave"),
				edge("e4", "hier", "dave", "eve"),
			],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		const laidOut = layoutRelationshipGraph(graph.nodes, graph.edges)
		const positions = ["anchor", "bob", "carol", "dave", "eve"].map((id) => {
			const pos = nodePos(laidOut, id)
			expect(pos).toBeDefined()
			return pos!.y
		})
		for (let i = 1; i < positions.length; i++) {
			expect(positions[i]!).toBeGreaterThan(positions[i - 1]!)
		}
	})

	it("hierarchyFrom=target still puts ancestor above descendant", () => {
		const graph = buildRelationshipGraph({
			edges: [edge("e1", "hier-reverse", "anchor", "bob")],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		const laidOut = layoutRelationshipGraph(graph.nodes, graph.edges)
		const anchorPos = nodePos(laidOut, "anchor")
		const bobPos = nodePos(laidOut, "bob")
		expect(bobPos!.y).toBeLessThan(anchorPos!.y)
	})

	it("circular directed edges do not crash", () => {
		const graph = buildRelationshipGraph({
			edges: [
				edge("e1", "directed", "anchor", "bob"),
				edge("e2", "directed", "bob", "anchor"),
			],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		const laidOut = layoutRelationshipGraph(graph.nodes, graph.edges)
		expect(laidOut.length).toBeGreaterThan(0)
		for (const node of laidOut) {
			expect(Number.isFinite(node.position.x)).toBe(true)
			expect(Number.isFinite(node.position.y)).toBe(true)
		}
	})

	it("orphan anchor node gets a finite position", () => {
		const graph = buildRelationshipGraph({
			edges: [],
			types,
			anchorCharId: "anchor",
			charactersById: characters,
		})
		const laidOut = layoutRelationshipGraph(graph.nodes, graph.edges)
		expect(laidOut).toHaveLength(1)
		expect(Number.isFinite(laidOut[0]!.position.x)).toBe(true)
		expect(Number.isFinite(laidOut[0]!.position.y)).toBe(true)
	})
})
