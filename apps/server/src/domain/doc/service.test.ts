import { randomUUID } from "node:crypto"
import { mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { eq } from "drizzle-orm"
import {
	type CharService,
	createCharacterService,
} from "src/domain/char/service.ts"
import { docCharLinks, docResLinks } from "src/domain/doc/schema.ts"
import {
	buildResourceRepository,
	type ResRepository,
} from "src/domain/res/repo.ts"
import { resources } from "src/domain/res/schema.ts"
import { type DbHandles, openDb } from "src/infra/db/connection.ts"
import {
	createStoragePaths,
	type StoragePaths,
} from "src/infra/storage/paths.ts"
import { afterEach, beforeEach, describe, expect, test } from "vitest"
import { createDocumentService, type DocService } from "./service.ts"

describe("document service", () => {
	let root: string
	let paths: StoragePaths
	let dbh: DbHandles
	let svc: DocService
	let charSvc: CharService
	let resRepo: ResRepository

	beforeEach(async () => {
		root = mkdtempSync(join(tmpdir(), "app-doc-"))
		paths = createStoragePaths({ root })
		dbh = openDb(":memory:")
		dbh.runMigrations()
		svc = createDocumentService({ db: dbh.db })
		charSvc = createCharacterService({
			db: dbh.db,
			paths,
			readOnly: { current: false },
		})
		resRepo = buildResourceRepository(dbh.db)
	})

	afterEach(() => {
		dbh.close()
		rmSync(root, { recursive: true, force: true })
	})

	test("commitDraft creates version, clears draft and rewrites links atomically", async () => {
		const resId = randomUUID()
		const char = await charSvc.create({ name: "DocChar" })
		resRepo.insert(
			resId,
			{
				name: "DocRes",
				intro: "",
				contentPluginId: null,
				tagIds: [],
				charIds: [],
			},
			Date.now(),
			1,
		)

		const doc = await svc.createNode({ kind: "document", title: "Draft" })
		await svc.patchDraft({
			id: doc.id,
			title: "Committed",
			content: {
				version: 4,
				blocks: [
					{
						type: "paragraph",
						content: [
							{
								type: "charChip",
								props: { charId: char.id, fallbackName: "DocChar" },
							},
							{ type: "resCard", props: { resId } },
						],
					},
				],
			},
		})

		const version = await svc.commitDraft({ id: doc.id, message: "first" })
		expect(version.docId).toBe(doc.id)
		expect(version.versionNo).toBe(1)
		expect(version.title).toBe("Committed")

		const detail = await svc.detail(doc.id)
		expect(detail.title).toBe("Committed")

		const draft = await svc.getDraft(doc.id)
		expect(draft.title).toBe(detail.title)

		const charRows = dbh.db.select().from(docCharLinks).all()
		expect(charRows).toHaveLength(1)
		expect(charRows[0]?.docId).toBe(doc.id)
		expect(charRows[0]?.charId).toBe(char.id)

		const resRows = dbh.db.select().from(docResLinks).all()
		expect(resRows).toHaveLength(1)
		expect(resRows[0]?.docId).toBe(doc.id)
		expect(resRows[0]?.resId).toBe(resId)
	})

	test("commitDraft overwrites previous links on second commit", async () => {
		const resId = randomUUID()
		const charA = await charSvc.create({ name: "A" })
		const charB = await charSvc.create({ name: "B" })
		resRepo.insert(
			resId,
			{
				name: "ResA",
				intro: "",
				contentPluginId: null,
				tagIds: [],
				charIds: [],
			},
			Date.now(),
			1,
		)

		const doc = await svc.createNode({ kind: "document", title: "Doc" })
		await svc.patchDraft({
			id: doc.id,
			content: {
				version: 4,
				blocks: [
					{
						type: "paragraph",
						content: [
							{
								type: "charChip",
								props: { charId: charA.id, fallbackName: "A" },
							},
							{ type: "resCard", props: { resId } },
						],
					},
				],
			},
		})
		await svc.commitDraft({ id: doc.id })

		await svc.patchDraft({
			id: doc.id,
			content: {
				version: 4,
				blocks: [
					{
						type: "paragraph",
						content: [
							{
								type: "charChip",
								props: { charId: charB.id, fallbackName: "B" },
							},
						],
					},
				],
			},
		})
		await svc.commitDraft({ id: doc.id })

		const charRows = dbh.db.select().from(docCharLinks).all()
		expect(charRows.map((r) => r.charId)).toEqual([charB.id])

		const resRows = dbh.db.select().from(docResLinks).all()
		expect(resRows).toHaveLength(0)
	})

	test("patchDraft extracts charIds and resIds from content automatically", async () => {
		const resId = randomUUID()
		const char = await charSvc.create({ name: "DocChar" })
		resRepo.insert(
			resId,
			{
				name: "DocRes",
				intro: "",
				contentPluginId: null,
				tagIds: [],
				charIds: [],
			},
			Date.now(),
			1,
		)

		const doc = await svc.createNode({ kind: "document", title: "Draft" })
		await svc.patchDraft({
			id: doc.id,
			content: {
				version: 4,
				blocks: [
					{
						type: "paragraph",
						content: [
							{
								type: "charChip",
								props: { charId: char.id, fallbackName: "DocChar" },
							},
							{
								type: "resCard",
								props: { resId },
							},
						],
					},
				],
			},
		})

		const draft = await svc.getDraft(doc.id)
		expect(draft.charIds).toEqual([char.id])
		expect(draft.resIds).toEqual([resId])
	})

	test("patchDraft deduplicates entity ids while preserving first-occurrence order", async () => {
		const doc = await svc.createNode({ kind: "document", title: "Draft" })
		const charA = await charSvc.create({ name: "A" })
		const charB = await charSvc.create({ name: "B" })
		const resA = randomUUID()
		const resB = randomUUID()
		const resC = randomUUID()
		for (const resId of [resA, resB, resC]) {
			resRepo.insert(
				resId,
				{
					name: `Res ${resId}`,
					intro: "",
					contentPluginId: null,
					tagIds: [],
					charIds: [],
				},
				Date.now(),
				1,
			)
		}

		await svc.patchDraft({
			id: doc.id,
			content: {
				version: 4,
				blocks: [
					{
						type: "paragraph",
						content: [
							{ type: "charChip", props: { charId: charA.id } },
							{ type: "charChip", props: { charId: charB.id } },
							{ type: "charChip", props: { charId: charA.id } },
							{ type: "resCard", props: { resId: resA } },
						],
					},
					{
						type: "paragraph",
						content: [
							{ type: "charChip", props: { charId: charB.id } },
							{ type: "resCard", props: { resId: resB } },
							{ type: "resCard", props: { resId: resA } },
							{ type: "resCard", props: { resId: resC } },
						],
					},
				],
			},
		})

		const draft = await svc.getDraft(doc.id)
		expect(draft.charIds).toEqual([charA.id, charB.id])
		expect(draft.resIds).toEqual([resA, resB, resC])
	})

	test("patchDraft handles 100+ entity references efficiently", async () => {
		const doc = await svc.createNode({ kind: "document", title: "Draft" })
		const charIds: string[] = []
		const resIds: string[] = []
		for (let i = 0; i < 120; i++) {
			const char = await charSvc.create({ name: `Char ${i}` })
			charIds.push(char.id)
		}
		for (let i = 0; i < 80; i++) {
			const resId = randomUUID()
			resIds.push(resId)
			resRepo.insert(
				resId,
				{
					name: `Res ${i}`,
					intro: "",
					contentPluginId: null,
					tagIds: [],
					charIds: [],
				},
				Date.now(),
				1,
			)
		}
		const content = {
			version: 4,
			blocks: [
				{
					type: "paragraph",
					content: [
						...charIds.map((charId) => ({
							type: "charChip" as const,
							props: { charId },
						})),
						...resIds.map((resId) => ({
							type: "resCard" as const,
							props: { resId },
						})),
					],
				},
			],
		}

		await svc.patchDraft({ id: doc.id, content })

		const draft = await svc.getDraft(doc.id)
		expect(draft.charIds).toHaveLength(120)
		expect(draft.resIds).toHaveLength(80)
		expect(draft.charIds).toEqual(charIds)
		expect(draft.resIds).toEqual(resIds)
	})

	test("patchDraft filters out non-existing character and resource ids", async () => {
		const doc = await svc.createNode({ kind: "document", title: "Draft" })
		const char = await charSvc.create({ name: "Existing" })
		const resId = randomUUID()
		resRepo.insert(
			resId,
			{
				name: "Existing",
				intro: "",
				contentPluginId: null,
				tagIds: [],
				charIds: [],
			},
			Date.now(),
			1,
		)
		const missingCharId = randomUUID()
		const missingResId = randomUUID()

		await svc.patchDraft({
			id: doc.id,
			content: {
				version: 4,
				blocks: [
					{
						type: "paragraph",
						content: [
							{ type: "charChip", props: { charId: char.id } },
							{ type: "charChip", props: { charId: missingCharId } },
							{ type: "resCard", props: { resId } },
							{ type: "resCard", props: { resId: missingResId } },
						],
					},
				],
			},
		})

		const draft = await svc.getDraft(doc.id)
		expect(draft.charIds).toEqual([char.id])
		expect(draft.resIds).toEqual([resId])
	})

	test("patchDraft filters out soft-deleted characters and resources", async () => {
		const doc = await svc.createNode({ kind: "document", title: "Draft" })
		const liveChar = await charSvc.create({ name: "Live" })
		const deletedChar = await charSvc.create({ name: "Deleted" })
		await charSvc.softDelete(deletedChar.id)

		const liveResId = randomUUID()
		const deletedResId = randomUUID()
		for (const id of [liveResId, deletedResId]) {
			resRepo.insert(
				id,
				{
					name: `Res ${id}`,
					intro: "",
					contentPluginId: null,
					tagIds: [],
					charIds: [],
				},
				Date.now(),
				1,
			)
		}
		dbh.db
			.update(resources)
			.set({ deletedAt: Date.now() })
			.where(eq(resources.id, deletedResId))
			.run()

		await svc.patchDraft({
			id: doc.id,
			content: {
				version: 4,
				blocks: [
					{
						type: "paragraph",
						content: [
							{ type: "charChip", props: { charId: liveChar.id } },
							{ type: "charChip", props: { charId: deletedChar.id } },
							{ type: "resCard", props: { resId: liveResId } },
							{ type: "resCard", props: { resId: deletedResId } },
						],
					},
				],
			},
		})

		const draft = await svc.getDraft(doc.id)
		expect(draft.charIds).toEqual([liveChar.id])
		expect(draft.resIds).toEqual([liveResId])
	})
})
