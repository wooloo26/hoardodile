type TagChipColorDotProps = {
	readonly color: string
}

export function TagChipColorDot(props: TagChipColorDotProps) {
	if (props.color === "") return null
	return (
		<span
			aria-hidden="true"
			className="inline-block size-3 rounded-full border border-background/40"
			style={{ background: props.color }}
		/>
	)
}
