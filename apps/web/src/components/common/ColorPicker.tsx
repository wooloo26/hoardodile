import { cn } from "@hoardodile/ui/lib/utils"
import { BookmarkPlus, Plus, X } from "lucide-react"
import { useTranslation } from "react-i18next"
import { jsonCodec } from "@/features/prefs"
import { TagPickerChip } from "@/features/tags/TagPickerChip"
import { usePrefSync } from "@/hooks/usePrefSync"
import {
	DEFAULT_COLOR_PRESETS,
	isSpecialTagStyle,
	TAG_SPECIAL_STYLES,
} from "@/lib/colors"
import { prefKeys } from "@/lib/keys"

export type ColorPickerProps = {
	readonly value: string
	readonly onChange: (color: string) => void
	readonly specialStyles?: boolean
	readonly placeholder?: string
	readonly testId?: string
}

const DEFAULT_COLOR_PICK = "#9D9D9D"
const MAX_USER_PRESETS = 20

export function ColorPicker(props: ColorPickerProps) {
	const { value, onChange, specialStyles = true, placeholder, testId } = props
	const { t } = useTranslation()
	const [userPresets, setUserPresets] = usePrefSync<string[]>(
		prefKeys.colorPresets,
		[],
		jsonCodec<string[]>(),
	)

	const hasColor = value !== ""
	const isSpecial = isSpecialTagStyle(value)
	const effectiveInputValue =
		hasColor && !isSpecial ? value : DEFAULT_COLOR_PICK

	function addPreset() {
		if (value === "" || isSpecialTagStyle(value)) return
		const normalized = value.toLowerCase()
		const all = [...DEFAULT_COLOR_PRESETS, ...userPresets].map((c) =>
			c.toLowerCase(),
		)
		if (all.includes(normalized)) return
		const next = [...userPresets, value]
		if (next.length > MAX_USER_PRESETS) {
			next.shift()
		}
		setUserPresets(next)
	}

	function removePreset(index: number) {
		setUserPresets(userPresets.filter((_, i) => i !== index))
	}

	const canAddPreset =
		hasColor &&
		!isSpecial &&
		![...DEFAULT_COLOR_PRESETS, ...userPresets]
			.map((c) => c.toLowerCase())
			.includes(value.toLowerCase())

	return (
		<div className="flex flex-col gap-3" data-testid={testId}>
			<div className="flex items-center gap-2">
				{isSpecial ? (
					<TagPickerChip color={value}>
						{t(`categories.panel.specialStyle.${value}`)}
					</TagPickerChip>
				) : (
					<div
						className={cn(
							"relative size-8 shrink-0 overflow-hidden rounded-md border",
							hasColor ? "border-border" : "border-dashed border-border",
						)}
					>
						{hasColor ? (
							<div
								className="absolute inset-0"
								style={{ backgroundColor: value }}
							/>
						) : null}
						<input
							type="color"
							value={effectiveInputValue}
							onChange={(e) => onChange(e.target.value)}
							className="absolute inset-0 cursor-pointer opacity-0"
							data-testid={testId !== undefined ? `${testId}-input` : undefined}
							title={placeholder}
						/>
					</div>
				)}

				{hasColor || isSpecial ? (
					<button
						type="button"
						onClick={() => onChange("")}
						className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label={t("common.colorPicker.clear")}
						data-testid={testId !== undefined ? `${testId}-clear` : undefined}
					>
						<X className="size-3" />
					</button>
				) : (
					<button
						type="button"
						onClick={() => onChange(DEFAULT_COLOR_PICK)}
						className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label={t("common.colorPicker.set")}
						data-testid={testId !== undefined ? `${testId}-set` : undefined}
					>
						<Plus className="size-3" />
					</button>
				)}

				{canAddPreset ? (
					<button
						type="button"
						onClick={addPreset}
						className="flex size-6 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
						aria-label={t("common.colorPicker.addPreset")}
						data-testid={
							testId !== undefined ? `${testId}-add-preset` : undefined
						}
					>
						<BookmarkPlus className="size-3" />
					</button>
				) : null}
			</div>

			<div className="flex flex-col gap-1.5">
				<span className="text-xs font-medium text-muted-foreground">
					{t("common.colorPicker.defaultPresets")}
				</span>
				<div className="flex flex-wrap gap-1">
					{DEFAULT_COLOR_PRESETS.map((c) => (
						<button
							key={c}
							type="button"
							onClick={() => onChange(c)}
							className={cn(
								"size-5 rounded-sm border border-border/60 transition-shadow",
								value.toLowerCase() === c.toLowerCase()
									? "ring-2 ring-primary border-none"
									: "hover:ring-2 hover:ring-primary/40",
							)}
							style={{ backgroundColor: c }}
							aria-label={c}
						/>
					))}
				</div>
			</div>

			{userPresets.length > 0 ? (
				<div className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-muted-foreground">
						{t("common.colorPicker.myPresets")}
					</span>
					<div className="flex flex-wrap gap-1">
						{userPresets.map((c, index) => (
							<div key={`${c}-${index}`} className="group relative">
								<button
									type="button"
									onClick={() => onChange(c)}
									className={cn(
										"size-5 rounded-sm border border-border/60 transition-shadow",
										value.toLowerCase() === c.toLowerCase()
											? "ring-2 ring-primary border-none"
											: "hover:ring-2 hover:ring-primary/40",
									)}
									style={{ backgroundColor: c }}
									aria-label={c}
								/>
								<button
									type="button"
									onClick={() => removePreset(index)}
									className="absolute -right-1 -top-1 flex size-3 items-center justify-center rounded-full border border-border bg-background text-muted-foreground opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
									aria-label={t("common.colorPicker.removePresetAria", {
										color: c,
									})}
								>
									<X className="size-2" />
								</button>
							</div>
						))}
					</div>
				</div>
			) : null}

			{specialStyles ? (
				<div className="flex flex-col gap-1.5">
					<span className="text-xs font-medium text-muted-foreground">
						{t("common.colorPicker.specialStyles")}
					</span>
					<div className="flex flex-wrap gap-1">
						{TAG_SPECIAL_STYLES.map((style) => (
							<TagPickerChip
								key={style}
								color={style}
								active={value === style}
								onClick={() => onChange(style)}
								title={t(`categories.panel.specialStyle.${style}`)}
							>
								{t(`categories.panel.specialStyle.${style}`)}
							</TagPickerChip>
						))}
					</div>
				</div>
			) : null}
		</div>
	)
}
