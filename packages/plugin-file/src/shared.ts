export type FileEntry = {
	readonly filename: string
	readonly sizeBytes?: number
	readonly ext?: string
}

export type FileSourceMeta = {
	readonly fileCount?: number
}

export type FileSearchMeta = {
	readonly v: number
}

export interface FileSchema {
	readonly file: FileEntry
	readonly sourceMeta: FileSourceMeta
	readonly searchMeta: FileSearchMeta
}
