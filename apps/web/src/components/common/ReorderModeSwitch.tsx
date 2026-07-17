import { Label } from "@hoardodile/ui/components/label"
import { Switch } from "@hoardodile/ui/components/switch"

export type ReorderModeSwitchProps = {
	readonly id: string
	readonly checked: boolean
	readonly onCheckedChange: (checked: boolean) => void
	readonly label: string
	readonly ariaLabel: string
	readonly testId?: string
}

/**
 * Consistent "reorder mode" toggle used by every entity-management panel
 * on the Me > Custom page.
 */
export function ReorderModeSwitch(props: ReorderModeSwitchProps) {
	return (
		<div className="flex items-center gap-2">
			<Switch
				id={props.id}
				checked={props.checked}
				onCheckedChange={props.onCheckedChange}
				aria-label={props.ariaLabel}
				data-testid={props.testId}
			/>
			<Label
				htmlFor={props.id}
				className="cursor-pointer font-normal text-muted-foreground"
			>
				{props.label}
			</Label>
		</div>
	)
}
