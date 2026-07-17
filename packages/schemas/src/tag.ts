import {
	MAX_COLOR_LENGTH,
	MAX_INTRO_LENGTH,
	MAX_NAME_LENGTH,
} from "@hoardodile/consts/text-limits"
import { z } from "zod"
import { id, timestamp } from "./primitives.ts"

/**
 * User-defined tag. Must be attached to a {@link Category}; `catId` is
 * required — uncategorized tags are not allowed.
 */
export const tag = z.object({
	id,
	name: z.string().min(1).max(MAX_NAME_LENGTH),
	intro: z.string().max(MAX_INTRO_LENGTH).default(""),
	color: z.string().max(MAX_COLOR_LENGTH).default(""),
	position: z.number().int(),
	pinned: z.boolean(),
	catId: id,
	createdAt: timestamp,
	updatedAt: timestamp,
})

export type Tag = z.infer<typeof tag>

/**
 * Minimal tag shape embedded in character card responses. Contains only the
 * fields needed for display; full tag data lives in the tag module.
 * `color` is the effective display color: tag.color → category.color → "".
 */
export const pinnedTag = z.object({
	id,
	name: z.string().min(1).max(MAX_NAME_LENGTH),
	color: z.string().max(MAX_COLOR_LENGTH).default(""),
})

export type PinnedTag = z.infer<typeof pinnedTag>
