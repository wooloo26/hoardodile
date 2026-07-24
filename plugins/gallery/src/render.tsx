import "./index.css"

import { createPluginRoot, useVisibility } from "@hoardodile/plugin-sdk-react"
import { useMemo } from "react"
import { GalleryView } from "./GalleryView"
import { readGalleryPreviews } from "./helpers"
import { PluginAPIProvider, usePluginAPI } from "./hooks"

function GalleryPreview() {
	const api = usePluginAPI()
	const visible = useVisibility()
	const { data: files } = api.useFileList()

	const previewFiles = useMemo(
		() => readGalleryPreviews(api.resource.sourceMeta) ?? [],
		[api.resource.sourceMeta],
	)

	const mediaFiles = files ?? previewFiles
	const expectedCount = api.resource.fileStats?.count

	if (!visible) return undefined
	return (
		<GalleryView
			mediaFiles={mediaFiles}
			onCurrentFileChange={() => {}}
			hideSendBar={false}
			expectedCount={expectedCount}
		/>
	)
}

createPluginRoot({ provider: PluginAPIProvider, render: GalleryPreview })
