import type { DocDraft } from "@hoardodile/schemas"
import { useMutation } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import { toast } from "sonner"
import {
	commitDraftMutation,
	discardDraftMutation,
	patchDraftMutation,
} from "../index.ts"

export type UseDocDraftMutationsResult = {
	readonly patchMut: ReturnType<
		typeof useMutation<
			DocDraft,
			Error,
			{
				readonly id: string
				readonly title?: string
				readonly content?: Record<string, unknown>
			}
		>
	>
	readonly commitMut: ReturnType<
		typeof useMutation<
			unknown,
			Error,
			{ readonly id: string; readonly message?: string }
		>
	>
	readonly discardMut: ReturnType<typeof useMutation<DocDraft, Error, string>>
}

/**
 * Encapsulates the patch/commit/discard mutations for document drafts.
 *
 * Callers own the `onSuccess` callbacks (e.g. cache invalidation and local
 * buffer cleanup) because those actions depend on the current document id and
 * hook-local refs.
 */
export function useDocDraftMutations(): UseDocDraftMutationsResult {
	const { t } = useTranslation()

	const patchMut = useMutation({
		...patchDraftMutation(),
		onError: (err) =>
			toast.error(err.message || t("documents.toast.saveFailed")),
	})

	const commitMut = useMutation({
		...commitDraftMutation(),
		onError: (err) =>
			toast.error(err.message || t("documents.toast.commitFailed")),
	})

	const discardMut = useMutation({
		...discardDraftMutation(),
	})

	return { patchMut, commitMut, discardMut }
}
