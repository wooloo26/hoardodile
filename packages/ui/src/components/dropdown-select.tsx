import { cn } from "@hoardodile/ui/lib/utils"
import { ChevronDownIcon } from "lucide-react"
import {
	DropdownMenu,
	DropdownMenuCheckboxItem,
	DropdownMenuContent,
	DropdownMenuRadioGroup,
	DropdownMenuRadioItem,
	DropdownMenuTrigger,
} from "./dropdown-menu"
import type * as React from "react"

export type DropdownSelectOption = {
	readonly value: string
	readonly label: React.ReactNode
}

type SharedProps = {
	readonly options: readonly DropdownSelectOption[]
	readonly placeholder?: string
	readonly size?: "sm" | "default"
	readonly triggerClassName?: string
	readonly contentClassName?: string
	readonly container?: HTMLElement | null
	readonly disabled?: boolean
	readonly modal?: boolean
	readonly "data-testid"?: string
	readonly "aria-label"?: string
}

function TriggerButton(
	props: {
		readonly label: React.ReactNode
		readonly placeholder?: string
		readonly size?: "sm" | "default"
		readonly className?: string
		readonly "data-testid"?: string
		readonly "aria-label"?: string
	} & Omit<React.ComponentProps<"button">, "aria-label">,
) {
	const {
		label,
		placeholder,
		size = "default",
		className,
		"data-testid": testId,
		"aria-label": ariaLabel,
		...rest
	} = props
	return (
		<button
			type="button"
			data-slot="dropdown-select-trigger"
			data-size={size}
			data-placeholder={label === undefined ? true : undefined}
			className={cn(
				"flex w-fit items-center justify-between gap-1.5 rounded-md border border-input bg-transparent py-2 pr-2 pl-2.5 text-sm whitespace-nowrap shadow-xs transition-[color,box-shadow] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[size=default]:h-9 data-[size=sm]:h-8 dark:bg-input/30 dark:hover:bg-input/50 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			data-testid={testId}
			aria-label={ariaLabel}
			{...rest}
		>
			<span className="line-clamp-1 flex items-center gap-1.5">
				{label ?? placeholder}
			</span>
			<ChevronDownIcon className="pointer-events-none size-4 text-muted-foreground" />
		</button>
	)
}

export function DropdownSelect(props: {
	readonly value: string
	readonly onValueChange: (value: string) => void
} & SharedProps) {
	const {
		value,
		onValueChange,
		options,
		placeholder,
		size = "default",
		triggerClassName,
		contentClassName,
		container,
		disabled,
		modal,
		"data-testid": testId,
		"aria-label": ariaLabel,
	} = props

	const selectedLabel = options.find((o) => o.value === value)?.label

	return (
		<DropdownMenu modal={modal}>
			<DropdownMenuTrigger disabled={disabled} asChild>
				<TriggerButton
					label={selectedLabel}
					placeholder={placeholder}
					size={size}
					className={triggerClassName}
					data-testid={testId}
					aria-label={ariaLabel}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				container={container}
				className={cn("min-w-36", contentClassName)}
			>
				<DropdownMenuRadioGroup
					value={value}
					onValueChange={onValueChange}
				>
					{options.map((opt) => (
						<DropdownMenuRadioItem
							key={opt.value}
							value={opt.value}
						>
							{opt.label}
						</DropdownMenuRadioItem>
					))}
				</DropdownMenuRadioGroup>
			</DropdownMenuContent>
		</DropdownMenu>
	)
}

export function DropdownMultiSelect(props: {
	readonly value: readonly string[]
	readonly onValueChange: (values: readonly string[]) => void
} & SharedProps) {
	const {
		value,
		onValueChange,
		options,
		placeholder,
		size = "default",
		triggerClassName,
		contentClassName,
		container,
		disabled,
		"data-testid": testId,
		"aria-label": ariaLabel,
	} = props

	const selectedCount = value.length
	const triggerLabel =
		selectedCount === 0
			? undefined
			: selectedCount === 1
				? options.find((o) => o.value === value[0])?.label
				: `${selectedCount} selected`

	return (
		<DropdownMenu>
			<DropdownMenuTrigger disabled={disabled} asChild>
				<TriggerButton
					label={triggerLabel}
					placeholder={placeholder}
					size={size}
					className={triggerClassName}
					data-testid={testId}
					aria-label={ariaLabel}
				/>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				container={container}
				className={cn("min-w-36", contentClassName)}
			>
				{options.map((opt) => (
					<DropdownMenuCheckboxItem
						key={opt.value}
						checked={value.includes(opt.value)}
						onCheckedChange={(checked) => {
							if (checked === true) {
								onValueChange([...value, opt.value])
							} else {
								onValueChange(
									value.filter((v) => v !== opt.value),
								)
							}
						}}
					>
						{opt.label}
					</DropdownMenuCheckboxItem>
				))}
			</DropdownMenuContent>
		</DropdownMenu>
	)
}
