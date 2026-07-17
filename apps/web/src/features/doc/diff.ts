import { blockToNode } from "@blocknote/core"
import { transformToSuggestionTransaction } from "@handlewithcare/prosemirror-suggest-changes"
import type { DocContent } from "@hoardodile/schemas"
import { ChangeSet } from "prosemirror-changeset"
import type { Node, Schema } from "prosemirror-model"
import { EditorState } from "prosemirror-state"
import { StepMap } from "prosemirror-transform"
import type { DocEditorInstance } from "./editor/schema.ts"

/** Extract plain text from a BlockNote v2 payload for diffing. */
export function tiptapToPlainText(content: DocContent | undefined): string {
	if (content === undefined) return ""
	const blocks = content.blocks
	if (!Array.isArray(blocks)) return ""
	const lines: string[] = []
	for (const block of blocks) {
		collectBlock(block, lines)
	}
	return lines.join("\n")
}

function collectBlock(block: unknown, lines: string[]): void {
	if (!isObject(block)) return
	let buf = ""
	const inline = block.content
	if (Array.isArray(inline)) {
		for (const item of inline) {
			if (!isObject(item)) continue
			const text = item.text
			if (typeof text === "string") buf += text
			// Preserve character mention names so diffs remain readable.
			if (
				item.type === "charChip" &&
				isObject(item.props) &&
				typeof item.props.fallbackName === "string" &&
				item.props.fallbackName.length > 0
			) {
				buf += item.props.fallbackName
			}
			// Preserve resource id so diffs remain readable.
			if (
				item.type === "resCard" &&
				isObject(item.props) &&
				typeof item.props.resId === "string" &&
				item.props.resId.length > 0
			) {
				buf += `[${item.props.resId}]`
			}
		}
	}
	lines.push(buf)
	const children = block.children
	if (Array.isArray(children)) {
		for (const child of children) collectBlock(child, lines)
	}
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null
}

export type DiffOp = {
	readonly kind: "equal" | "insert" | "delete"
	readonly text: string
}

/**
 * Line-level Myers-style LCS diff. `O(n*m)` time / space — fine for
 * documents up to a few thousand lines, which covers the realistic
 * editor payload size; we cap the input above before invoking this.
 */
export function lineDiff(left: string, right: string): readonly DiffOp[] {
	const a = left.length === 0 ? [] : left.split("\n")
	const b = right.length === 0 ? [] : right.split("\n")
	const n = a.length
	const m = b.length
	// LCS table; index helpers below assume rows/cols exist via construction.
	const dp: number[][] = Array.from({ length: n + 1 }, () =>
		new Array<number>(m + 1).fill(0),
	)
	function get(row: number, col: number): number {
		const r = dp[row]
		if (r === undefined) return 0
		const v = r[col]
		return v ?? 0
	}
	function set(row: number, col: number, value: number): void {
		const r = dp[row]
		if (r === undefined) return
		r[col] = value
	}
	for (let i = n - 1; i >= 0; i--) {
		for (let j = m - 1; j >= 0; j--) {
			if (a[i] === b[j]) {
				set(i, j, get(i + 1, j + 1) + 1)
			} else {
				set(i, j, Math.max(get(i + 1, j), get(i, j + 1)))
			}
		}
	}
	const ops: DiffOp[] = []
	let i = 0
	let j = 0
	while (i < n && j < m) {
		const ai = a[i] ?? ""
		const bj = b[j] ?? ""
		if (ai === bj) {
			ops.push({ kind: "equal", text: ai })
			i++
			j++
		} else if (get(i + 1, j) >= get(i, j + 1)) {
			ops.push({ kind: "delete", text: ai })
			i++
		} else {
			ops.push({ kind: "insert", text: bj })
			j++
		}
	}
	while (i < n) {
		ops.push({ kind: "delete", text: a[i] ?? "" })
		i++
	}
	while (j < m) {
		ops.push({ kind: "insert", text: b[j] ?? "" })
		j++
	}
	return ops
}

/** Loose BlockNote block shape used for diff input/output. */
export type DiffableBlock = Record<string, unknown>

export function blocksToDoc(
	schema: Schema,
	blocks: readonly DiffableBlock[],
): Node {
	const safeBlocks = blocks.length > 0 ? blocks : [{ type: "paragraph" }]
	const blockNodes = safeBlocks.map((block) =>
		blockToNode(block as Parameters<typeof blockToNode>[0], schema),
	)
	const blockGroup = schema.nodes.blockGroup!.createChecked({}, blockNodes)
	return schema.nodes.doc!.createChecked({}, blockGroup)
}

/**
 * Compute a ProseMirror document that renders the difference between
 * `baseBlocks` and `currentBlocks` using the same `insertion`/`deletion`
 * suggestion marks that BlockNote's AI extension uses.
 *
 * Returns `undefined` when the two documents are structurally identical,
 * otherwise a ProseMirror Node that can be applied to a read-only DocEditor.
 */
export function computeInlineDiffDoc(
	editor: DocEditorInstance,
	baseBlocks: readonly DiffableBlock[],
	currentBlocks: readonly DiffableBlock[],
): Node | undefined {
	if (contentEquals(baseBlocks, currentBlocks)) {
		return undefined
	}

	const schema = editor._tiptapEditor.state.schema
	const baseDoc = blocksToDoc(schema, baseBlocks)
	const currentDoc = blocksToDoc(schema, currentBlocks)

	const baseState = EditorState.create({ schema, doc: baseDoc })

	// Ask prosemirror-changeset to compare the two whole documents. Passing a
	// single StepMap that maps the entire base doc onto the current doc lets
	// ChangeSet.computeDiff break the replacement into smaller changed regions.
	const changeSet = ChangeSet.create(baseDoc).addSteps(
		currentDoc,
		[new StepMap([0, baseDoc.content.size, currentDoc.content.size])],
		0,
	)

	// Apply the detected changes as individual replace steps so that
	// transformToSuggestionTransaction can turn each region into inline
	// insertion/deletion marks instead of treating the whole doc as one change.
	const tr = baseState.tr
	const changes = [...changeSet.changes].sort((a, b) => b.fromA - a.fromA)
	for (const change of changes) {
		const slice = currentDoc.slice(change.fromB, change.toB)
		tr.replace(change.fromA, change.toA, slice)
	}

	const suggestionTr = transformToSuggestionTransaction(tr, baseState)
	const diffState = baseState.apply(suggestionTr)
	return diffState.doc
}

function contentEquals(
	a: readonly DiffableBlock[],
	b: readonly DiffableBlock[],
): boolean {
	if (a.length !== b.length) return false
	for (let i = 0; i < a.length; i++) {
		if (!isEqual(a[i], b[i])) return false
	}
	return true
}

function isEqual(a: unknown, b: unknown): boolean {
	if (a === b) return true
	if (typeof a !== "object" || typeof b !== "object") return false
	if (a === null || b === null) return false
	const aObj = a as Record<string, unknown>
	const bObj = b as Record<string, unknown>
	const aKeys = Object.keys(aObj)
	const bKeys = Object.keys(bObj)
	if (aKeys.length !== bKeys.length) return false
	for (const key of aKeys) {
		if (!bKeys.includes(key)) return false
		if (!isEqual(aObj[key], bObj[key])) return false
	}
	return true
}
