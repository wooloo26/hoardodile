import type { TagGroup } from "./buildTagGroups"
import { TagChip } from "./TagChip"

export type CatTagGroupsProps = {
	readonly type: "character" | "resource"
	readonly groups: readonly TagGroup[]
	readonly categoryVariant?: "text" | "chip"
	/**
	 * Optional `data-testid` template applied to each group row. The
	 * `catId` of each group is appended with a hyphen.
	 */
	readonly testIdPrefix?: string
}

/**
 * Compact layout shared by character and resource detail pages: one row
 * per category, with the category name on the left and a horizontal,
 * non-wrapping strip of tag chips on the right. The strip becomes
 * horizontally scrollable when it overflows so that tags belonging to
 * one category never wrap onto a second visual line.
 */
export function CatTagGroups(props: CatTagGroupsProps) {
	const { type, groups, categoryVariant = "text", testIdPrefix } = props
	return (
		<div className="flex flex-col gap-1.5">
			{groups.map((group) => (
				<div
					key={group.catId}
					className="flex min-w-0 items-center gap-2"
					data-testid={
						testIdPrefix === undefined
							? undefined
							: `${testIdPrefix}-${group.catId}`
					}
				>
					{categoryVariant === "chip" ? (
						<>
							<TagChip
								id={group.catId}
								type={type}
								name={group.catName}
								color={group.catColor}
								link={false}
								className="shrink-0"
							/>
							<span className="shrink-0 text-xs text-muted-foreground">: </span>
						</>
					) : (
						<span className="shrink-0 text-xs text-muted-foreground">
							{group.catName}
						</span>
					)}
					<div className="flex min-w-0 flex-1 flex-wrap gap-1.5">
						{group.tags.map((tag) => (
							<TagChip
								key={tag.id}
								id={tag.id}
								type={type}
								name={tag.name}
								color={tag.color}
								className="max-w-30"
							/>
						))}
					</div>
				</div>
			))}
		</div>
	)
}
