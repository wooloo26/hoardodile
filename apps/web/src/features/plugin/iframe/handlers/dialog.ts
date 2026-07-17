import type { QueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { pluginMethods } from "../methods"
import { defineHandler, type HandlerEntry } from "./registry"

export function createHandlers(_qc: QueryClient): HandlerEntry[] {
	return [
		defineHandler(
			pluginMethods.dialogConfirm,
			z.object({ message: z.string() }),
			async (_ctx, params) => {
				return Promise.resolve(window.confirm(params.message))
			},
		),

		defineHandler(
			pluginMethods.dialogPrompt,
			z.object({ message: z.string(), defaultValue: z.string().optional() }),
			async (_ctx, params) => {
				return Promise.resolve(
					window.prompt(params.message, params.defaultValue ?? ""),
				)
			},
		),

		defineHandler(
			pluginMethods.dialogAlert,
			z.object({ message: z.string() }),
			async (_ctx, params) => {
				window.alert(params.message)
				return Promise.resolve()
			},
		),

		defineHandler(pluginMethods.dialogOpenFile, async () => {
			return new Promise<File | null>((resolve) => {
				const input = document.createElement("input")
				input.type = "file"
				input.style.display = "none"
				input.addEventListener("change", () => {
					const file = input.files?.[0] ?? null
					input.remove()
					resolve(file)
				})
				input.addEventListener("cancel", () => {
					input.remove()
					resolve(null)
				})
				document.body.appendChild(input)
				input.click()
			})
		}),
	]
}
