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
 * Wires up the canonical delete + force-delete mutation lifecycle used by
 * management panel row components: on success, invalidate queries; on error,
 * surface the server's message. Eliminates the repeated
 * `deleteMut`/`forceMut`/`onDelete`/`onForceDelete` block in every row.
 *
 * @example
 *   const { handleDelete, handleForceDelete } = useDeleteMutation({
 *     deleteOptions: deleteTraitMutation(),
 *     forceDeleteOptions: forceDeleteTraitMutation(),
 *     invalidate: invalidateTraits,
 *   })
 *   // JSX:
 *   <DeleteEntityButton
 *     onDelete={() => handleDelete(trait.id)}
 *     onForceDelete={(typed) => handleForceDelete(trait.id, typed)}
 *   />
 */
export type DeleteMutationConfig<
	TDeleteOutput = unknown,
	TForceOutput = unknown,
> = {
	readonly deleteOptions: UseMutationOptions<TDeleteOutput, Error, string>
	readonly forceDeleteOptions: UseMutationOptions<
		TForceOutput,
		Error,
		{ readonly id: string; readonly name: string }
	>
	readonly invalidate: (qc: QueryClient) => Promise<void>
	readonly errorMessageKey?: string
}

export type DeleteMutationResult<
	TDeleteOutput = unknown,
	TForceOutput = unknown,
> = {
	readonly deleteMut: UseMutationResult<TDeleteOutput, Error, string>
	readonly forceDeleteMut: UseMutationResult<
		TForceOutput,
		Error,
		{ readonly id: string; readonly name: string }
	>
	readonly handleDelete: (id: string) => Promise<void>
	readonly handleForceDelete: (id: string, name: string) => Promise<void>
}

export function useDeleteMutation<
	TDeleteOutput = unknown,
	TForceOutput = unknown,
>(
	config: DeleteMutationConfig<TDeleteOutput, TForceOutput>,
): DeleteMutationResult<TDeleteOutput, TForceOutput> {
	const qc = useQueryClient()
	const { t } = useTranslation()
	const errorKey = config.errorMessageKey ?? "common.unknownError"

	const deleteMut = useMutation({
		...config.deleteOptions,
		onSuccess: async () => {
			await config.invalidate(qc)
		},
		onError: (err: Error) => {
			toast.error(err.message || t(errorKey))
		},
	})

	const forceDeleteMut = useMutation({
		...config.forceDeleteOptions,
		onSuccess: async () => {
			await config.invalidate(qc)
		},
		onError: (err: Error) => {
			toast.error(err.message || t(errorKey))
		},
	})

	async function handleDelete(id: string) {
		await deleteMut.mutateAsync(id)
	}

	async function handleForceDelete(id: string, name: string) {
		await forceDeleteMut.mutateAsync({ id, name })
	}

	return { deleteMut, forceDeleteMut, handleDelete, handleForceDelete }
}
