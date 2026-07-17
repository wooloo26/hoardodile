import { usageDeviceOs } from "@hoardodile/schemas"
import { detectDeviceInfo } from "./detectDeviceInfo"

describe("detectDeviceInfo", () => {
	const originalNavigator = global.navigator

	function setUserAgent(ua: string) {
		Object.defineProperty(global, "navigator", {
			value: {
				...originalNavigator,
				userAgent: ua,
			},
			configurable: true,
		})
	}

	afterEach(() => {
		Object.defineProperty(global, "navigator", {
			value: originalNavigator,
			configurable: true,
		})
	})

	test("detects desktop chrome", () => {
		setUserAgent(
			"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
		)

		const info = detectDeviceInfo()

		expect(info.channel).toBe("web")
		expect(info.deviceType).toBe("desktop")
		expect(usageDeviceOs.options).toContain(info.os)
		expect(info.browser).toBe("chrome")
	})

	test("detects mobile safari", () => {
		setUserAgent(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
		)

		const info = detectDeviceInfo()

		expect(info.channel).toBe("web")
		expect(info.deviceType).toBe("mobile")
		expect(usageDeviceOs.options).toContain(info.os)
		expect(info.browser).toBe("safari")
	})

	test("detects android chrome as mobile", () => {
		setUserAgent(
			"Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36",
		)

		const info = detectDeviceInfo()

		expect(info.channel).toBe("web")
		expect(info.deviceType).toBe("mobile")
		expect(usageDeviceOs.options).toContain(info.os)
		expect(info.browser).toBe("chrome")
	})
})
