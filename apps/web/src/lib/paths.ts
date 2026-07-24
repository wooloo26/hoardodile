/**
 * Central URL path definitions for all server endpoints.
 *
 * Every non-tRPC URL used in the app should be generated through this file.
 * This eliminates hard-coded path strings scattered across components and
 * makes route changes a single-point update.
 *
 * All functions are pure and have no runtime dependencies, so they can be
 * safely imported by the service worker as well.
 */

export const apiPaths = {
	auth: {
		status: () => "/auth/status",
		login: () => "/auth/login",
		logout: () => "/auth/logout",
	},

	characters: {
		image: (id: string, variant: string) =>
			`/api/characters/${id}/images/${variant}`,
		thumb: (id: string, variant: string) =>
			`/api/characters/${id}/thumb/${variant}`,
	},

	resources: {
		cover: (id: string) => `/api/resources/${id}/cover`,
		files: (id: string, filename: string) =>
			`/api/resources/${id}/files/${encodeURIComponent(filename)}`,
		sourceZip: (id: string) => `/api/resources/${id}/source.zip`,
		bulkSourceZip: () => "/api/resources/bulk-source.zip",
	},

	uploads: {
		ordered: () => "/api/uploads/ordered",
		orderedFile: (fileId: string) =>
			`/api/uploads/ordered/${encodeURIComponent(fileId)}`,
		stagedPreview: (fileId: string) =>
			`/api/uploads/staged/${encodeURIComponent(fileId)}/preview`,
		archive: () => "/api/uploads/archive",
	},

	cache: {
		root: () => "/api/cache",
		trash: () => "/api/cache/trash",
		trashDownload: (name: string) =>
			`/api/cache/trash/${encodeURIComponent(name)}/download`,
	},

	precache: {
		start: () => "/api/precache",
		abort: () => "/api/precache/abort",
		stream: () => "/api/precache/stream",
	},

	plugins: {
		indexHtml: (id: string) =>
			`/api/plugins/${encodeURIComponent(id)}/index.html`,
		asset: (id: string, rel: string) => `/api/plugins/${id}/${rel}`,
	},

	backups: {
		download: (fileName: string) =>
			`/api/backups/${encodeURIComponent(fileName)}/download`,
	},

	versions: {
		dbDownload: (version: number) => `/api/versions/${version}/db.sqlite`,
	},

	pluginUpload: () => "/api/plugin-upload",

	events: () => "/api/events",
} as const
