import type {
	UsageDeviceBrowser,
	UsageDeviceChannel,
	UsageDeviceInfo,
	UsageDeviceOs,
	UsageDeviceType,
} from "@hoardodile/schemas"
import { usageDeviceType } from "@hoardodile/schemas"
import Bowser from "bowser"
import { APP_VERSION } from "@/lib/appInfo"

function parseChannel(): UsageDeviceChannel {
	return "web"
}

function parseDeviceType(platformType: string): UsageDeviceType {
	const parsed = usageDeviceType.safeParse(platformType)
	return parsed.success ? parsed.data : "unknown"
}

function parseOs(osName: string): UsageDeviceOs {
	const normalized = osName.toLowerCase()
	switch (normalized) {
		case "windows":
			return "windows"
		case "macos":
		case "mac os":
		case "mac os x":
			return "macos"
		case "linux":
			return "linux"
		case "ios":
			return "ios"
		case "android":
			return "android"
		default:
			return "unknown"
	}
}

function parseBrowser(browserName: string): UsageDeviceBrowser {
	const normalized = browserName.toLowerCase()
	switch (normalized) {
		case "chrome":
			return "chrome"
		case "safari":
			return "safari"
		case "firefox":
			return "firefox"
		case "microsoft edge":
		case "edge":
			return "edge"
		case "opera":
			return "opera"
		default:
			return "unknown"
	}
}

/**
 * Detect structured device environment for usage analytics.
 *
 * Uses Bowser for UA parsing.
 */
export function detectDeviceInfo(): UsageDeviceInfo {
	const hints = (navigator as { userAgentData?: Bowser.ClientHints })
		.userAgentData
	const parser = Bowser.getParser(navigator.userAgent, hints)
	const os = parser.getOS()
	const browser = parser.getBrowser()

	return {
		channel: parseChannel(),
		deviceType: parseDeviceType(parser.getPlatformType()),
		os: parseOs(os.name ?? ""),
		osVersion: os.version ?? "",
		browser: parseBrowser(browser.name ?? ""),
		browserVersion: browser.version ?? "",
		appVersion: APP_VERSION,
	}
}
