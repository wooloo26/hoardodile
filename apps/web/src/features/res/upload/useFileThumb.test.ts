import { act, renderHook, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useFileThumb } from "./useFileThumb"

const file = new File(["pixels"], "photo.png", { type: "image/png" })

describe("useFileThumb", () => {
	let revokeSpy: ReturnType<typeof vi.spyOn>
	let fetchSpy: ReturnType<typeof vi.spyOn>
	let objectUrls: string[] = []

	beforeEach(() => {
		objectUrls = []
		revokeSpy = vi
			.spyOn(globalThis.URL, "revokeObjectURL")
			.mockImplementation(() => {})
		fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => {
			return new Response(new Blob(["preview"]), { status: 200 })
		})
		vi.spyOn(globalThis.URL, "createObjectURL").mockImplementation(() => {
			const url = `blob:mock-${objectUrls.length}`
			objectUrls.push(url)
			return url
		})

		// IntersectionObserver is not implemented in jsdom; provide a minimal
		// mock so useInView can be exercised with an explicit root.
		globalThis.IntersectionObserver = vi.fn(
			(
				callback: IntersectionObserverCallback,
				options?: IntersectionObserverInit,
			) => {
				const observer = {
					observe: () => {
						callback(
							[
								{
									isIntersecting: true,
									boundingClientRect: {} as DOMRectReadOnly,
									intersectionRatio: 1,
									intersectionRect: {} as DOMRectReadOnly,
									rootBounds: null,
									target: document.createElement("div"),
									time: Date.now(),
								},
							],
							observer as unknown as IntersectionObserver,
						)
					},
					unobserve: () => {},
					disconnect: () => {},
					takeRecords: () => [],
					root: options?.root ?? null,
					rootMargin:
						typeof options?.rootMargin === "string"
							? options.rootMargin
							: "0px",
					scrollMargin:
						typeof options?.scrollMargin === "string"
							? options.scrollMargin
							: "0px",
					thresholds: Array.isArray(options?.threshold)
						? options.threshold
						: [0],
				}
				return observer as unknown as IntersectionObserver
			},
		) as unknown as typeof IntersectionObserver
	})

	afterEach(() => {
		vi.restoreAllMocks()
	})

	it("fetches a preview when enabled, ready and stagedFileId are available", async () => {
		const { result } = renderHook(() =>
			useFileThumb("file-1", file, true, true),
		)

		await waitFor(() => expect(result.current.kind).toBe("ready"))
		expect(fetchSpy).toHaveBeenCalledTimes(1)
		expect(fetchSpy).toHaveBeenCalledWith(
			"/api/uploads/staged/file-1/preview",
			expect.objectContaining({ credentials: "include" }),
		)
	})

	it("does not refetch when stagedFileId changes but the File is the same", async () => {
		const { result, rerender } = renderHook(
			({ stagedFileId }: { stagedFileId: string }) =>
				useFileThumb(stagedFileId, file, true, true),
			{ initialProps: { stagedFileId: "file-a" } },
		)

		await waitFor(() => expect(result.current.kind).toBe("ready"))
		expect(fetchSpy).toHaveBeenCalledTimes(1)

		rerender({ stagedFileId: "file-b" })

		await waitFor(() => expect(result.current.kind).toBe("ready"))
		expect(fetchSpy).toHaveBeenCalledTimes(1)
	})

	it("returns the cached URL even while ready is false (restaging)", async () => {
		const { result, rerender } = renderHook(
			({ ready }: { ready: boolean }) =>
				useFileThumb("file-1", file, true, ready),
			{ initialProps: { ready: true } },
		)

		await waitFor(() => expect(result.current.kind).toBe("ready"))
		const readyUrl = result.current.kind === "ready" ? result.current.url : null
		expect(readyUrl).toBeTruthy()

		rerender({ ready: false })

		await waitFor(() => expect(result.current.kind).toBe("ready"))
		expect(result.current.kind === "ready" ? result.current.url : null).toBe(
			readyUrl,
		)
		expect(fetchSpy).toHaveBeenCalledTimes(1)
	})

	it("revokes the object URL on unmount", async () => {
		const { result, unmount } = renderHook(() =>
			useFileThumb("file-1", file, true, true),
		)

		await waitFor(() => expect(result.current.kind).toBe("ready"))
		const readyUrl = result.current.kind === "ready" ? result.current.url : null
		expect(readyUrl).toBeTruthy()

		act(() => unmount())

		await waitFor(() => expect(revokeSpy).toHaveBeenCalledWith(readyUrl))
	})
})
