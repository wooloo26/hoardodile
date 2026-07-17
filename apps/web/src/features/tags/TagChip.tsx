import { Link } from "@tanstack/react-router"
import type { ReactNode } from "react"
import { TagChipSurface } from "./TagChipSurface"

export type TagChipProps = {
	readonly id: string
	/** Label inside the chip; may be a string or rich content (e.g. dot segments). */
	readonly name: ReactNode
	/** Effective display color; empty string means "no color override". */
	readonly color: string
	/**
	 * When `false`, render as a plain inline chip without navigating to
	 * the tag-filtered resource list. Defaults to `true` (link mode).
	 */
	readonly link?: boolean
	readonly type: "resource" | "character"
	readonly className?: string
}

/**
 * Single pinned-tag chip with subtle hover treatment, optionally
 * navigating to `/resources?tagIds=…` or `/characters?tagIds=…` when clicked.
 *
 * Visual rendering is delegated to {@link TagChipSurface} so the same chip
 * styling can be reused by document inline tag chips without needing an ID.
 */
export function TagChip(props: TagChipProps) {
	const { id, name, color, link = true, type, className } = props

	if (!link) {
		return (
			<TagChipSurface color={color} className={className}>
				{name}
			</TagChipSurface>
		)
	}

	return (
		<Link
			to={type === "resource" ? "/resources" : "/characters"}
			search={{ tagIds: [id], page: 1 }}
			target="_blank"
			rel="noopener noreferrer"
			className="block"
		>
			<TagChipSurface color={color} className={className}>
				{name}
			</TagChipSurface>
		</Link>
	)
}
