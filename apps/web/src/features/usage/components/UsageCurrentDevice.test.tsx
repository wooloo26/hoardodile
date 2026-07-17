import { render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { UsageCurrentDevice } from "./UsageCurrentDevice"

vi.mock("../detectDeviceInfo", () => ({
	detectDeviceInfo: () => ({
		channel: "web" as const,
		deviceType: "desktop" as const,
		os: "windows" as const,
		osVersion: "10",
		browser: "chrome" as const,
		browserVersion: "125",
		appVersion: "",
	}),
}))

vi.mock("react-i18next", () => ({
	useTranslation: () => ({
		t: (key: string, options?: Record<string, string>) => {
			if (options?.version) return `App ${options.version}`
			if (key === "usage.stats.currentDevice.title") return "Current device"
			if (key === "usage.stats.currentDevice.channelLabel") return "Channel"
			if (key.endsWith(".desktop")) return "Desktop"
			if (key.endsWith(".windows")) return "Windows"
			if (key.endsWith(".chrome")) return "Chrome"
			if (key.endsWith(".web")) return "Web"
			return key
		},
	}),
}))

describe("UsageCurrentDevice", () => {
	it("renders detected device info", () => {
		render(<UsageCurrentDevice />)

		expect(screen.getByTestId("usage-current-device")).toBeInTheDocument()
		expect(screen.getByText("Current device")).toBeInTheDocument()
		expect(screen.getByText(/Desktop/)).toBeInTheDocument()
		expect(screen.getByText(/Windows 10/)).toBeInTheDocument()
		expect(screen.getByText(/Chrome 125/)).toBeInTheDocument()
		expect(screen.getByText(/Channel/)).toBeInTheDocument()
		expect(screen.getByText(/Web/)).toBeInTheDocument()
	})
})
