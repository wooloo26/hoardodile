import { DEFAULT_PAGE_SIZE } from "@hoardodile/consts"
import type {
	Comment,
	CommentCreateInput,
	CommentListInput,
	CommentThreadInput,
	CommentVote,
	CommentVoteInput,
	CommentVoteResult,
	ResAnchor,
} from "@hoardodile/schemas"
import { COMMENT_VOTE_CANCEL_WINDOW_MS } from "@hoardodile/schemas"
import { conflict, notFound } from "@hoardodile/shared"
import { eq } from "drizzle-orm"
import { createCapabilityGuard } from "src/domain/plugin/capability-guard.ts"
import type { SqliteDb } from "src/infra/db/connection.ts"
import { type ClockDeps, generateId, wrapAsync } from "src/infra/service.ts"
import type { PluginRegistry } from "../plugin/api-types.ts"
import { resources } from "../res/schema.ts"
import {
	buildCommentRepository,
	type CommentListFilter,
	type CommentRow,
	type CommentVoteRow,
} from "./repo.ts"

export type CommentServiceDeps = ClockDeps & {
	readonly db: SqliteDb
	/**
	 * Live accessor for the current plugin registry — called per request so
	 * a plugin rescan never leaves this service holding a stale registry.
	 */
	readonly getRegistry?: () => PluginRegistry
}

export type CommentListResult = {
	readonly rows: readonly Comment[]
	readonly total: number
	readonly totalAll: number
}

export type CommentDetail = {
	readonly comment: Comment
	readonly replies: readonly Comment[]
	readonly votes: readonly CommentVote[]
}

const MAX_PAGE_SIZE = 200

/**
 * Behaviour contract for the comment module.
 *
 * Comments are immutable text containers — the only mutable bit is
 * soft-delete via `deletedAt`. Replies are realised through `parentId`
 * self-reference. Votes are individual rows that can be cancelled within
 * {@link COMMENT_VOTE_CANCEL_WINDOW_MS} of their creation; after that
 * window they are permanent (DB-level enforcement: the service rejects
 * delete attempts past the window).
 */
export type CommentService = {
	list(input: CommentListInput): Promise<CommentListResult>
	thread(input: CommentThreadInput): Promise<CommentDetail>
	create(input: CommentCreateInput): Promise<Comment>
	softDelete(id: string): Promise<Comment>
	restore(id: string): Promise<Comment>
	hardDelete(id: string): Promise<void>
	addVote(input: CommentVoteInput): Promise<CommentVoteResult>
	cancelVote(voteId: string): Promise<void>
	listVotesFor(commentId: string): Promise<readonly CommentVote[]>
}

export function createCommentService(deps: CommentServiceDeps): CommentService {
	const repo = buildCommentRepository(deps.db)
	const now = deps.now ?? Date.now
	const newId = deps.newId ?? generateId
	const guard = createCapabilityGuard()

	function list(input: CommentListInput): CommentListResult {
		const page = input.page ?? 1
		const size = Math.min(input.size ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
		const trashed = input.trashed ?? false
		const filter = {
			query: input.query?.trim() ?? "",
			charId: input.charId,
			resId: input.resId,
			anchor: input.anchor,
			trashed,
			sortBy: input.sortBy ?? "newest",
		} as const
		if (trashed) {
			return listTrashed(filter, page, size)
		}
		const rows = repo.listTopLevel({
			...filter,
			limit: size,
			offset: (page - 1) * size,
		})
		const total = repo.countTopLevel(filter)
		const totalAll = repo.countAll(filter)
		const rowsHydrated = hydrate(rows)
		return {
			rows: rowsHydrated,
			total,
			totalAll,
		}
	}

	function listTrashed(
		filter: Omit<CommentListFilter, "limit" | "offset">,
		page: number,
		size: number,
	): CommentListResult {
		const allRootIds = repo.findTrashedFloorRootIds()
		if (allRootIds.length === 0) {
			return { rows: [], total: 0, totalAll: 0 }
		}
		const trashedFilter = { ...filter, trashed: true as const }
		const totalAll = repo.countAll(trashedFilter)
		const rootRows = repo.listRootsByIds(allRootIds, {
			...filter,
			trashed: false,
			limit: size,
			offset: (page - 1) * size,
		})
		const total = repo.countRootsByIds(allRootIds, filter)
		if (rootRows.length === 0) {
			return { rows: [], total, totalAll }
		}
		const rowsHydrated = hydrate(rootRows)
		const rootIdsForPage = rootRows.map((r) => r.id)
		const allReplyRows = repo.listRepliesFor(rootIdsForPage)
		const repliesByRoot = new Map<string, CommentRow[]>()
		for (const reply of allReplyRows) {
			const rootId = findRootIdWithin(reply, rootIdsForPage)
			if (rootId === undefined) continue
			const list = repliesByRoot.get(rootId)
			if (list === undefined) {
				repliesByRoot.set(rootId, [reply])
			} else {
				list.push(reply)
			}
		}
		const repliesHydratedByRoot = new Map<string, readonly Comment[]>()
		for (const [rootId, replyRows] of repliesByRoot) {
			repliesHydratedByRoot.set(rootId, hydrate(replyRows))
		}
		const enriched = rowsHydrated.map((c) => {
			const replies = repliesHydratedByRoot.get(c.id)
			if (replies === undefined || replies.length === 0) return c
			return { ...c, floorContext: { replies } }
		})
		return { rows: enriched, total, totalAll }
	}

	function findRootIdWithin(
		reply: CommentRow,
		rootIds: readonly string[],
	): string | undefined {
		const seen = new Set<string>()
		let cursor: CommentRow | undefined = reply
		while (cursor !== undefined) {
			if (rootIds.includes(cursor.id)) return cursor.id
			if (cursor.parentId === null) return undefined
			if (seen.has(cursor.id)) return undefined
			seen.add(cursor.id)
			cursor = repo.findById(cursor.parentId)
		}
		return undefined
	}

	function thread(input: CommentThreadInput): CommentDetail {
		const commentId = input.id
		const fullContext = input.fullContext ?? false
		if (fullContext) {
			const rootId = repo.findRootId(commentId)
			const root = repo.findById(rootId)
			const allReplies = repo.listRepliesFor([rootId])
			const all = [root, ...allReplies]
			const hydrated = hydrate(all)
			const rootHydrated = hydrated[0]
			if (rootHydrated === undefined) {
				throw notFound("comment.not_found", `comment ${rootId} not found`, {
					id: rootId,
				})
			}
			const voteRows = repo.listVotesFor([
				rootId,
				...allReplies.map((r) => r.id),
			])
			const ts = now()
			const votes = voteRows.map((v) => voteRowToVote(v, ts))
			return {
				comment: rootHydrated,
				replies: hydrated.slice(1),
				votes,
			}
		}
		const root = repo.findById(commentId)
		const allReplies = repo.listRepliesFor([commentId])
		const visibleReplies = filterVisibleReplies(allReplies, commentId)
		const all = [root, ...visibleReplies]
		const hydrated = hydrate(all)
		const rootHydrated = hydrated[0]
		if (rootHydrated === undefined) {
			throw notFound("comment.not_found", `comment ${commentId} not found`, {
				id: commentId,
			})
		}
		const voteRows = repo.listVotesFor([
			commentId,
			...visibleReplies.map((r) => r.id),
		])
		const ts = now()
		const votes = voteRows.map((v) => voteRowToVote(v, ts))
		return {
			comment: rootHydrated,
			replies: hydrated.slice(1),
			votes,
		}
	}

	/**
	 * Drop soft-deleted replies *and* any descendants underneath them so
	 * the caller never sees orphaned sub-threads.
	 */
	function filterVisibleReplies(
		rows: readonly CommentRow[],
		rootId: string,
	): readonly CommentRow[] {
		const trashedIds = new Set<string>()
		for (const r of rows) if (r.deletedAt !== null) trashedIds.add(r.id)
		if (trashedIds.size === 0) return rows
		const byId = new Map<string, CommentRow>()
		for (const r of rows) byId.set(r.id, r)
		function isAncestorTrashed(start: CommentRow): boolean {
			if (start.deletedAt !== null) return true
			let cursor = start.parentId
			while (cursor !== null && cursor !== rootId) {
				if (trashedIds.has(cursor)) return true
				const parent = byId.get(cursor)
				if (parent === undefined) return false
				cursor = parent.parentId
			}
			return false
		}
		return rows.filter((r) => !isAncestorTrashed(r))
	}

	function hydrate(rows: readonly CommentRow[]): readonly Comment[] {
		if (rows.length === 0) return []
		const ids = rows.map((r) => r.id)
		const charsByCommentId = repo.listCharacterIds(ids)
		const resourcesByCommentId = repo.listResourceIds(ids)
		const counts = repo.voteCounts(ids)
		const replyCounts = repo.replyCounts(ids)
		return rows.map((row) => {
			const c = counts.get(row.id) ?? { likeCount: 0, dislikeCount: 0 }
			return {
				id: row.id,
				parentId: row.parentId ?? undefined,
				body: row.body,
				createdAt: row.createdAt,
				charIds: charsByCommentId.get(row.id) ?? [],
				resIds: resourcesByCommentId.get(row.id) ?? [],
				likeCount: c.likeCount,
				dislikeCount: c.dislikeCount,
				replyCount: replyCounts.get(row.id) ?? 0,
				...(row.floor !== null ? { floor: row.floor } : {}),
				...(row.deletedAt !== null ? { deletedAt: row.deletedAt } : {}),
				anchor: parseRowAnchor(row),
			}
		})
	}

	function create(input: CommentCreateInput): Comment {
		const body = input.body.trim()
		if (body.length === 0) {
			throw conflict("comment.empty_body", "comment body cannot be empty", {})
		}
		if (input.parentId !== undefined) {
			repo.findById(input.parentId)
		}
		if (input.anchor !== undefined) {
			const resRow = deps.db
				.select({ contentPluginId: resources.contentPluginId })
				.from(resources)
				.where(eq(resources.id, input.anchor.resId))
				.get()
			if (resRow !== undefined && resRow.contentPluginId !== null) {
				const pluginEntry = deps.getRegistry?.().getById(resRow.contentPluginId)
				if (pluginEntry !== undefined) {
					guard.require(pluginEntry.manifest, "message")
				}
			}
		}
		const id = newId()
		const ts = now()
		const isTopLevel = input.parentId === undefined
		const mergedResIds = (() => {
			const base = input.resIds ?? []
			if (input.anchor === undefined) return base
			if (base.includes(input.anchor.resId)) return base
			return [...base, input.anchor.resId]
		})()
		repo.insertWithLinks(
			id,
			{
				parentId: input.parentId ?? null,
				body,
				deletedAt: null,
				floor: isTopLevel ? repo.nextTopLevelFloor() : null,
				anchor: input.anchor,
			},
			ts,
			input.charIds ?? [],
			mergedResIds,
		)
		return hydrateOne(repo.findById(id))
	}

	function softDelete(id: string): Comment {
		const row = repo.findById(id)
		if (row.deletedAt !== null) {
			throw conflict(
				"comment.already_trashed",
				`comment ${id} is already in the trash`,
				{ id },
			)
		}
		repo.patch(id, { deletedAt: now() })
		return hydrateOne(repo.findById(id))
	}

	function restore(id: string): Comment {
		const row = repo.findById(id)
		if (row.deletedAt === null) {
			throw conflict(
				"comment.not_trashed",
				`comment ${id} is not in the trash`,
				{ id },
			)
		}
		repo.patch(id, { deletedAt: null })
		return hydrateOne(repo.findById(id))
	}

	function hardDelete(id: string): void {
		const row = repo.findById(id)
		if (row.deletedAt === null) {
			throw conflict(
				"comment.hard_delete_requires_trash",
				`comment ${id} must be soft-deleted first`,
				{ id },
			)
		}
		repo.remove(id)
	}

	function hydrateOne(row: CommentRow): Comment {
		const all = hydrate([row])
		const first = all[0]
		if (first === undefined) {
			throw notFound("comment.not_found", `comment ${row.id} not found`, {
				id: row.id,
			})
		}
		return first
	}

	function addVote(input: CommentVoteInput): CommentVoteResult {
		repo.findById(input.commentId)
		const ts = now()
		const recent = repo.listVotesFor([input.commentId])[0]
		const inWindow =
			recent !== undefined &&
			ts - recent.createdAt < COMMENT_VOTE_CANCEL_WINDOW_MS
		if (inWindow && recent !== undefined) {
			if (recent.kind === input.kind) {
				repo.deleteVote(recent.id)
				return { action: "cancelled", vote: undefined }
			}
			const voteId = newId()
			repo.swapVote(recent.id, voteId, input.commentId, input.kind, ts)
			const row = repo.findVote(voteId)
			if (row === undefined) {
				throw notFound("commentVote.not_found", `vote ${voteId} not found`, {
					id: voteId,
				})
			}
			return { action: "swapped", vote: voteRowToVote(row, ts) }
		}
		return {
			action: "added",
			vote: insertAndLoadVote(input.commentId, input.kind, ts),
		}
	}

	function insertAndLoadVote(
		commentId: string,
		kind: "like" | "dislike",
		ts: number,
	): CommentVote {
		const id = newId()
		repo.insertVote(id, commentId, kind, ts)
		const row = repo.findVote(id)
		if (row === undefined) {
			throw notFound("commentVote.not_found", `vote ${id} not found`, { id })
		}
		return voteRowToVote(row, ts)
	}

	function cancelVote(voteId: string): void {
		const row = repo.findVote(voteId)
		if (row === undefined) {
			throw notFound("commentVote.not_found", `vote ${voteId} not found`, {
				id: voteId,
			})
		}
		const elapsed = now() - row.createdAt
		if (elapsed >= COMMENT_VOTE_CANCEL_WINDOW_MS) {
			throw conflict(
				"commentVote.window_closed",
				`vote ${voteId} is past its 24h cancellation window`,
				{ id: voteId, elapsedMs: elapsed },
			)
		}
		repo.deleteVote(voteId)
	}

	function listVotesFor(commentId: string): readonly CommentVote[] {
		repo.findById(commentId)
		const rows = repo.listVotesFor([commentId])
		const ts = now()
		return rows.map((r) => voteRowToVote(r, ts))
	}

	function voteRowToVote(row: CommentVoteRow, asOf: number): CommentVote {
		const kind = row.kind === "dislike" ? "dislike" : "like"
		return {
			id: row.id,
			commentId: row.commentId,
			kind,
			createdAt: row.createdAt,
			cancellable: asOf - row.createdAt < COMMENT_VOTE_CANCEL_WINDOW_MS,
		}
	}

	return wrapAsync({
		list,
		thread,
		create,
		softDelete,
		restore,
		hardDelete,
		addVote,
		cancelVote,
		listVotesFor,
	})
}

function parseRowAnchor(row: CommentRow): ResAnchor | undefined {
	if (row.anchorData === null) return undefined
	const parsed = JSON.parse(row.anchorData) as ResAnchor
	return parsed
}
