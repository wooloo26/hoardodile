import { randomUUID } from "@/lib/randomUUID"

const STORAGE_KEY = "hoardodile-device-id"

/**
 * Stable per-browser device id for multi-device usage analytics.
 */
export function detectDeviceId(): string {
	try {
		const existing = localStorage.getItem(STORAGE_KEY)
		if (existing !== null && existing.length > 0) {
			return existing
		}
		const id = randomUUID()
		localStorage.setItem(STORAGE_KEY, id)
		return id
	} catch {
		return "unknown"
	}
}

export function formatDeviceLabel(deviceId: string): string {
	if (deviceId.length <= 8) return deviceId
	return deviceId.slice(-8)
}
