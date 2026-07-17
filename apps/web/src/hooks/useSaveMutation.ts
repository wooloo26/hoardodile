import {
	type QueryClient,
	type UseMutationOptions,
	type UseMutationResult,
	useMutation,
	useQueryClient,
} from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"

/**
 * Wires up the canonical "save" mutation lifecycle used by edit panels
 * across the app: on success, invalidate the relevant queries, show the
 * shared "saved" toast, and notify the parent so it can close its dialog;
 * on error, surface the server's message (falling back to a generic
 * "save failed" toast). Eliminates ~10 identical copies of this block.
 *
 * The translation keys default to `common.saved` / `common.saveFailed`;
 * callers with feature-specific copy override via {@link successMessageKey}
 * / {@link errorMessageKey}.
 */
export type SaveMutationConfig<TInput, TOutput> = {
	readonly mutationOptions: UseMutationOptions<TOutput, Error, TInput>
	readonly invalidate: (qc: QueryClient) => Promise<void>
	readonly onSaved?: () => void
	readonly successMessageKey?: string
	readonly errorMessageKey?: string
}

export function useSaveMutation<TInput, TOutput>(
	config: SaveMutationConfig<TInput, TOutput>,
): UseMutationResult<TOutput, Error, TInput> {
	const qc = useQueryClient()
	const { t } = useTranslation()
	const successKey = config.successMessageKey ?? "common.saved"
	const errorKey = config.errorMessageKey ?? "common.saveFailed"
	return useMutation({
		...config.mutationOptions,
		onSuccess: async () => {
			await config.invalidate(qc)
			toast.success(t(successKey))
			config.onSaved?.()
		},
		onError: (err) => {
			toast.error(err.message || t(errorKey))
		},
	})
}
