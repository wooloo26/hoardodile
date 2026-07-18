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

	// Messages
	listMessages: "listMessages",
	createMessage: "createMessage",

	// Danmaku
	listDanmaku: "listDanmaku",
	createDanmaku: "createDanmaku",

	// Preferences / cache
	setPref: "setPref",
	setCache: "setCache",

	// Cache invalidation
	invalidate: "invalidate",

	// Dialog
	dialogConfirm: "dialog.confirm",
	dialogPrompt: "dialog.prompt",
	dialogAlert: "dialog.alert",
	dialogOpenFile: "dialog.openFile",

	// Logging — must match the SDK's PluginRequests keys exactly,
	// otherwise plugin log calls are silently swallowed.
	logInfo: "logInfo",
	logWarn: "logWarn",
	logError: "logError",
} as const
