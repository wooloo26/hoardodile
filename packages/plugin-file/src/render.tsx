import "./index.css"

import { hotkeysCoreFeature, syncDataLoaderFeature } from "@headless-tree/core"
import { useTree } from "@headless-tree/react"
import { createPluginRoot, useVisibility } from "@hoardodile/plugin-sdk-react"
import { Badge } from "@hoardodile/ui/components/badge"
import {
	Empty,
	EmptyHeader,
	EmptyMedia,
	EmptyTitle,
} from "@hoardodile/ui/components/empty"
import {
	Tree,
	TreeItem,
	TreeItemLabel,
} from "@hoardodile/ui/components/reui/tree"
import { Spinner } from "@hoardodile/ui/components/spinner"
import { FileIcon, FolderIcon, FolderOpenIcon } from "lucide-react"
import { useMemo } from "react"
import { PluginAPIProvider, usePluginAPI } from "./hooks"
import { useTranslation } from "./i18n"
import type { FileEntry } from "./shared"

function formatSize(bytes: number | undefined): string {
	if (bytes === undefined) return "—"
	if (bytes === 0) return "0 B"
	const units = ["B", "KB", "MB", "GB", "TB"]
	const i = Math.floor(Math.log10(bytes) / 3)
	const unit = units[Math.min(i, units.length - 1)]
	const value = bytes / 1000 ** i
	return `${value.toFixed(1)} ${unit}`
}

interface TreeNode {
	id: string
	name: string
	ext?: string
	sizeBytes?: number
	children?: string[]
}

function buildTreeData(files: readonly FileEntry[]): {
	items: Record<string, TreeNode>
	folderIds: string[]
} {
	const items: Record<string, TreeNode> = {
		root: { id: "root", name: "root", children: [] },
	}
	const folderIds = new Set<string>(["root"])

	for (const file of files) {
		const isDir = file.filename.endsWith("/")
		const cleanPath = isDir ? file.filename.slice(0, -1) : file.filename
		const parts = cleanPath.split("/")

		// Build intermediate directories
		let currentPath = ""
		for (let i = 0; i < parts.length - 1; i++) {
			const part = parts[i]!
			const parentPath = currentPath || "root"
			currentPath = currentPath ? `${currentPath}/${part}` : part

			if (!items[currentPath]) {
				items[currentPath] = { id: currentPath, name: part, children: [] }
				folderIds.add(currentPath)
			}

			const parent = items[parentPath]
			if (parent?.children && !parent.children.includes(currentPath)) {
				parent.children.push(currentPath)
			}
		}

		// Leaf node
		const name = parts[parts.length - 1]!
		const id = cleanPath
		const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : "root"

		if (isDir) {
			if (!items[id]) {
				items[id] = { id, name, children: [] }
				folderIds.add(id)
			} else if (!items[id].children) {
				items[id].children = []
			}
		} else {
			items[id] = { id, name, ext: file.ext, sizeBytes: file.sizeBytes }
		}

		const parent = items[parentPath]
		if (parent?.children && !parent.children.includes(id)) {
			parent.children.push(id)
		}
	}

	// Sort children: folders first, then alphabetically
	for (const item of Object.values(items)) {
		if (item.children) {
			item.children.sort((a, b) => {
				const aIsDir = !!items[a]?.children
				const bIsDir = !!items[b]?.children
				if (aIsDir !== bIsDir) return aIsDir ? -1 : 1
				return a.localeCompare(b)
			})
		}
	}

	return { items, folderIds: Array.from(folderIds) }
}

const indent = 20

function FileTreeContent({ files }: { files: readonly FileEntry[] }) {
	const { t } = useTranslation()
	const { items, folderIds } = useMemo(() => buildTreeData(files), [files])

	const tree = useTree<TreeNode>({
		initialState: {
			expandedItems: folderIds,
		},
		indent,
		rootItemId: "root",
		getItemName: (item) => item.getItemData().name,
		isItemFolder: (item) => (item.getItemData()?.children?.length ?? 0) > 0,
		dataLoader: {
			getItem: (itemId) => items[itemId]!,
			getChildren: (itemId) => items[itemId]!.children ?? [],
		},
		features: [syncDataLoaderFeature, hotkeysCoreFeature],
	})

	return (
		<div className="flex h-full flex-col bg-background text-foreground">
			<div className="flex items-center gap-2 border-b px-4 py-3">
				<span className="text-sm font-medium">{t("fileTree")}</span>
				<Badge variant="secondary">{files.length}</Badge>
			</div>
			<div className="flex-1 overflow-auto">
				<Tree
					className="relative before:absolute before:inset-0 before:-ms-1 before:bg-[repeating-linear-gradient(to_right,transparent_0,transparent_calc(var(--tree-indent)-1px),var(--border)_calc(var(--tree-indent)-1px),var(--border)_calc(var(--tree-indent)))]"
					indent={indent}
					tree={tree}
				>
					{tree.getItems().map((item) => {
						if (item.getId() === "root") return null
						const data = item.getItemData()

						return (
							<TreeItem key={item.getId()} item={item}>
								<TreeItemLabel className="before:bg-background relative before:absolute before:inset-x-0 before:-inset-y-0.5 before:-z-10">
									<span className="flex items-center gap-2">
										{item.isFolder() ? (
											item.isExpanded() ? (
												<FolderOpenIcon className="text-muted-foreground pointer-events-none size-4" />
											) : (
												<FolderIcon className="text-muted-foreground pointer-events-none size-4" />
											)
										) : (
											<FileIcon className="text-muted-foreground pointer-events-none size-4" />
										)}
										{data.name}
									</span>
									{!item.isFolder() && (
										<span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
											<span className="w-16 text-right tabular-nums">
												{formatSize(data.sizeBytes)}
											</span>
										</span>
									)}
								</TreeItemLabel>
							</TreeItem>
						)
					})}
				</Tree>
			</div>
		</div>
	)
}

function FileTreeView() {
	const visible = useVisibility()
	const { t } = useTranslation()
	const api = usePluginAPI()
	const { data: files, isLoading } = api.useFileList()

	if (!visible) return null
	if (isLoading || files === undefined) {
		return (
			<div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
				<Spinner />
				<span>Loading...</span>
			</div>
		)
	}

	if (files.length === 0) {
		return (
			<Empty className="h-full">
				<EmptyHeader>
					<EmptyMedia variant="icon">
						<FolderOpenIcon className="size-6" />
					</EmptyMedia>
					<EmptyTitle>{t("noFiles")}</EmptyTitle>
				</EmptyHeader>
			</Empty>
		)
	}

	return <FileTreeContent files={files} />
}

createPluginRoot({ provider: PluginAPIProvider, render: FileTreeView })
