import { apiFetch } from "@/lib/http"
import { apiPaths } from "@/lib/paths"
import { trpcMutation, trpcQuery, trpcQueryOptions } from "@/trpc/factory"

export const pluginKeys = {
	all: ["plugin"] as const,
	listAll: () => [...pluginKeys.all, "listAll"] as const,
}

export function pluginListAllQueryOptions() {
	return trpcQueryOptions({
		namespace: "plugin",
		procedure: "listAll",
		input: undefined,
		queryKey: pluginKeys.listAll(),
		staleTime: 10_000,
	})
}

export function pluginUpdateMutation() {
	return trpcMutation("plugin", "update")
}

export function pluginReorderMutation() {
	return trpcMutation("plugin", "reorder")
}

export function pluginRescanMutation() {
	return trpcMutation("plugin", "rescan")
}

export function systemPrefRemoveAllMutation() {
	return trpcMutation("systemPreference", "removeAll")
}

export function pluginPrefRemoveAllByPluginMutation() {
	return trpcMutation("pluginPreference", "removeAllByPlugin")
}

export function pluginPrefRemoveAllMutation() {
	return trpcMutation("pluginPreference", "removeAll")
}

export function pluginCacheRemoveAllByPluginMutation() {
	return trpcMutation("pluginPreference", "cacheRemoveAllByPlugin")
}

export function pluginCacheRemoveAllMutation() {
	return trpcMutation("pluginPreference", "cacheRemoveAll")
}

export function pluginCacheListByResId(resId: string) {
	return trpcQuery("pluginPreference", "cacheListByResId", { resId })
}

export async function uploadPlugin(formData: FormData): Promise<void> {
	const resp = await apiFetch(apiPaths.pluginUpload(), {
		method: "POST",
		body: formData,
	})
	if (!resp.ok) {
		const text = await resp.text().catch(() => "")
		throw new Error(text || `plugin upload failed (${resp.status})`)
	}
}
