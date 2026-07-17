import {
	closestCenter,
	DndContext,
	type DragEndEvent,
	KeyboardSensor,
	PointerSensor,
	useSensor,
	useSensors,
} from "@dnd-kit/core"
import {
	arrayMove,
	rectSortingStrategy,
	SortableContext,
	sortableKeyboardCoordinates,
	useSortable,
} from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Input } from "@hoardodile/ui/components/input"
import { Switch } from "@hoardodile/ui/components/switch"
import { cn } from "@hoardodile/ui/lib/utils"
import { GripVertical, X } from "lucide-react"
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { TagPickerChip } from "@/features/tags/TagPickerChip"
import {
	EXTRA_FONT_TAGS,
	getPresetByIdOrName,
	loadPresetCss,
	PRESET_FONTS,
	SYSTEM_FONT_TAGS,
} from "@/lib/fonts"

export type FontPickerProps = {
	readonly value: readonly string[]
	readonly onChange: (value: string[]) => void
	readonly includeInherit?: boolean
	readonly inheritedFonts?: readonly string[]
	readonly inheritedFamily?: string
	readonly "data-testid"?: string
	readonly "aria-label"?: string
}

/**
 * Font picker with tag-style layout.
 *
 * - Optional font tags (web + system + extra) at the top.
 * - Custom input below tags.
 * - Selected fonts as draggable chips at the bottom.
 */
export function FontPicker(props: FontPickerProps) {
	const { t } = useTranslation()
	const {
		value,
		onChange,
		includeInherit = false,
		inheritedFonts,
		inheritedFamily,
		"data-testid": testId,
		"aria-label": ariaLabel,
	} = props

	const [customInput, setCustomInput] = useState("")
	const isInherited = includeInherit && value.length === 0

	function toggleInherit(next: boolean) {
		if (next) {
			onChange([])
		} else {
			onChange(["inter"])
		}
	}

	function addFont(name: string) {
		const trimmed = name.trim()
		if (trimmed.length === 0) return
		const preset = getPresetByIdOrName(trimmed)
		if (preset) {
			if (value.includes(preset.id) || value.includes(preset.name)) return
		} else if (value.includes(trimmed)) {
			return
		}
		loadPresetCss(trimmed)
		onChange([...value, trimmed])
	}

	function removeFont(index: number) {
		onChange(value.filter((_, i) => i !== index))
	}

	function handleDragEnd(event: DragEndEvent) {
		const { active, over } = event
		if (over === null || active.id === over.id) return
		const oldIndex = value.indexOf(String(active.id))
		const newIndex = value.indexOf(String(over.id))
		onChange(arrayMove([...value], oldIndex, newIndex))
	}

	function handleCustomKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
		if (e.key === "Enter") {
			e.preventDefault()
			const preset = getPresetByIdOrName(customInput.trim())
			if (preset) {
				addFont(preset.id)
			} else {
				addFont(customInput)
			}
			setCustomInput("")
		}
	}

	function toggleWebPreset(presetId: string, presetName: string) {
		const idx = value.findIndex((v) => v === presetId || v === presetName)
		if (idx !== -1) {
			removeFont(idx)
		} else {
			addFont(presetId)
		}
	}

	function toggleTag(tag: string) {
		const idx = value.indexOf(tag)
		if (idx !== -1) {
			removeFont(idx)
		} else {
			addFont(tag)
		}
	}

	const sensors = useSensors(
		useSensor(PointerSensor, { activationConstraint: { distance: 3 } }),
		useSensor(KeyboardSensor, {
			coordinateGetter: sortableKeyboardCoordinates,
		}),
	)

	return (
		<div className="flex flex-col gap-3" data-testid={testId}>
			{includeInherit && (
				<div className="flex items-center gap-2">
					<Switch
						checked={isInherited}
						onCheckedChange={toggleInherit}
						aria-label={t("font.inherit")}
					/>
					<span className="text-sm">{t("font.inherit")}</span>
				</div>
			)}

			{isInherited ? (
				<p className="text-xs text-muted-foreground">
					{t("font.inheritedHint")}
					{inheritedFonts !== undefined && inheritedFonts.length > 0 && (
						<span className="ml-1" style={{ fontFamily: inheritedFamily }}>
							({inheritedFonts.join(" → ")})
						</span>
					)}
				</p>
			) : (
				<>
					{/* Optional font tags */}
					<div className="flex flex-col gap-2">
						<p className="text-xs text-muted-foreground">
							{t("font.optionalTags")}
						</p>
						<div className="flex flex-wrap gap-2">
							{PRESET_FONTS.map((p) => {
								const active = value.includes(p.id) || value.includes(p.name)
								return (
									<TagPickerChip
										key={p.id}
										active={active}
										onClick={() => toggleWebPreset(p.id, p.name)}
									>
										<span style={{ fontFamily: p.name }}>
											{t(p.i18nKey, {
												defaultValue: p.name,
											})}
										</span>
									</TagPickerChip>
								)
							})}
						</div>
						<div className="flex flex-wrap gap-2">
							{SYSTEM_FONT_TAGS.map((tag) => {
								const active = value.includes(tag)
								return (
									<TagPickerChip
										key={tag}
										active={active}
										onClick={() => toggleTag(tag)}
									>
										<span style={{ fontFamily: tag }}>{tag}</span>
									</TagPickerChip>
								)
							})}
						</div>
						<div className="flex flex-wrap gap-2">
							{EXTRA_FONT_TAGS.map((tag) => {
								const active = value.includes(tag)
								return (
									<TagPickerChip
										key={tag}
										active={active}
										onClick={() => toggleTag(tag)}
									>
										<span style={{ fontFamily: tag }}>{tag}</span>
									</TagPickerChip>
								)
							})}
						</div>
					</div>

					{/* Custom font input */}
					<Input
						value={customInput}
						onChange={(e) => setCustomInput(e.target.value)}
						onKeyDown={handleCustomKeyDown}
						placeholder={t("font.addCustom")}
						className="h-8 text-sm"
						aria-label={ariaLabel ?? t("font.addCustom")}
					/>

					{/* Selected font chips with drag sorting */}
					{value.length > 0 && (
						<div className="flex flex-col gap-2">
							<p className="text-xs text-muted-foreground">
								{t("font.selected")}
							</p>
							<DndContext
								sensors={sensors}
								collisionDetection={closestCenter}
								onDragEnd={handleDragEnd}
							>
								<SortableContext
									items={value as string[]}
									strategy={rectSortingStrategy}
								>
									<div className="flex flex-wrap gap-2">
										{value.map((name, index) => (
											<SortableFontChip
												key={name}
												name={name}
												onRemove={() => removeFont(index)}
											/>
										))}
									</div>
								</SortableContext>
							</DndContext>
						</div>
					)}
				</>
			)}
		</div>
	)
}

function getDisplayName(
	name: string,
	t: (key: string, options?: { defaultValue?: string }) => string,
): string {
	const preset = getPresetByIdOrName(name)
	if (preset) return t(preset.i18nKey, { defaultValue: preset.name })
	return name
}

type SortableFontChipProps = {
	readonly name: string
	readonly onRemove: () => void
}

function SortableFontChip(props: SortableFontChipProps) {
	const { name, onRemove } = props
	const { t } = useTranslation()
	const {
		attributes,
		listeners,
		setNodeRef,
		transform,
		transition,
		isDragging,
	} = useSortable({ id: name, transition: null })

	const style: React.CSSProperties = {
		transform: CSS.Translate.toString(transform),
		transition,
		opacity: isDragging ? 0.5 : 1,
	}

	const displayName = getDisplayName(name, t)
	const preset = getPresetByIdOrName(name)

	return (
		<div
			ref={setNodeRef}
			style={style}
			className={cn(
				"inline-flex items-center gap-1 rounded-md border bg-card px-2 py-1 text-sm",
				isDragging && "z-10",
			)}
		>
			<button
				type="button"
				className="cursor-grab text-muted-foreground active:cursor-grabbing"
				{...attributes}
				{...listeners}
			>
				<GripVertical className="size-3.5" />
			</button>
			<span style={{ fontFamily: preset?.name ?? name }}>{displayName}</span>
			<button
				type="button"
				onClick={onRemove}
				className="text-muted-foreground hover:text-destructive"
			>
				<X className="size-3.5" />
			</button>
		</div>
	)
}
