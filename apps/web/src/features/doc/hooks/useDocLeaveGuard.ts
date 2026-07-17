import { useBlocker } from "@tanstack/react-router"
import { useCallback, useRef } from "react"

export type UseDocLeaveGuardInput = {
	/** Whether there are unsaved changes that should block navigation. */
	readonly dirty: boolean
	/** Message shown in the system confirm dialog. */
	readonly message: string
}

/**
 * Blocks navigation when the document has unsaved changes, using the browser's
 * native `confirm` dialog for both in-app navigation and tab close.
 */
export function useDocLeaveGuard(input: UseDocLeaveGuardInput): void {
	const { dirty, message } = input

	const dirtyRef = useRef(dirty)
	dirtyRef.current = dirty
	const messageRef = useRef(message)
	messageRef.current = message

	const shouldBlockFn = useCallback((): boolean => {
		if (!dirtyRef.current) return false
		return !window.confirm(messageRef.current)
	}, [])

	const enableBeforeUnload = useCallback((): boolean => dirtyRef.current, [])

	useBlocker({
		shouldBlockFn,
		enableBeforeUnload,
	})
}
