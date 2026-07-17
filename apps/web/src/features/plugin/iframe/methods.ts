/**
 * Canonical method names for the plugin iframe request handlers.
 *
 * These strings are the wire-format method names that sandboxed plugin
 * iframes use when calling `host.request(...)`.  Centralizing them prevents
 * typos and keeps the test-suite in sync with the implementation.
 */

export const pluginMethods = {
	// Files
	readFile: "readFile",
	listFiles: "listFiles",

	// Comments
	listComments: "listComments",
	createComment: "createComment",

	// Danmaku
	listDanmaku: "listDanmaku",
	createDanmaku: "createDanmaku",

	// Preferences / cache
	setPref: "setPref",
	setCache: "setCache",

	// Upload
	getUploadUrl: "getUploadUrl",
	notifyUploadComplete: "notifyUploadComplete",

	// Cache invalidation
	invalidate: "invalidate",

	// Dialog
	dialogConfirm: "dialog.confirm",
	dialogPrompt: "dialog.prompt",
	dialogAlert: "dialog.alert",
	dialogOpenFile: "dialog.openFile",

	// Logging
	logInfo: "log.info",
	logWarn: "log.warn",
	logError: "log.error",
} as const
