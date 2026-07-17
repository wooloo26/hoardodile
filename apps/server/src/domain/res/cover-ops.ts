import type { CoverKind, CoverMeta } from "@hoardodile/schemas"
import type { ResFiles } from "./files.ts"
import type { ResRepository } from "./repo.ts"

export type ResCoverOpsDeps = {
	readonly repo: ResRepository
	readonly files: ResFiles
	readonly now: () => number
}

export type ResCoverOps = {
	hasCoverMeta(id: string): Promise<boolean>
	recordCoverMeta(
		id: string,
		meta: {
			readonly width?: number
			readonly height?: number
			readonly kind: CoverKind
			readonly source?: string
		},
	): Promise<void>
	findCover(id: string): Promise<string | undefined>
}

export function buildResourceCoverOps(deps: ResCoverOpsDeps): ResCoverOps {
	const { repo, files, now } = deps

	async function hasCoverMeta(id: string): Promise<boolean> {
		const row = repo.findById(id)
		return row.coverMeta !== null
	}

	async function recordCoverMeta(
		id: string,
		meta: {
			readonly width?: number
			readonly height?: number
			readonly kind: CoverKind
			readonly source?: string
		},
	): Promise<void> {
		const row = repo.findById(id)
		const nextJson = JSON.stringify({
			width: meta.width,
			height: meta.height,
			kind: meta.kind,
			source: meta.source,
		} satisfies CoverMeta)
		if (row.coverMeta === nextJson) return
		repo.patchMeta(id, { coverMeta: nextJson }, now())
	}

	async function findCover(id: string): Promise<string | undefined> {
		const row = repo.findById(id)
		return files.findCover(id, row.coverVersion)
	}

	return {
		hasCoverMeta,
		recordCoverMeta,
		findCover,
	}
}
