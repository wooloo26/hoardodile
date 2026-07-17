import type { QueryClient } from "@tanstack/react-query"
import type { CroppedImage } from "@/components/common/ImageCropper"
import { invalidateResources, uploadResCover } from "@/features/res/api"
import { mimeToImageExt } from "@/lib/mime"

/**
 * Snapshot the current WebGL canvas as a PNG `Blob`. Callers must ensure
 * the WebGL context was created with `preserveDrawingBuffer: true` so this
 * works even outside the active render frame.
 *
 * @throws Error when the canvas is unable to encode.
 */
export function snapshotCanvasPng(canvas: HTMLCanvasElement): Promise<Blob> {
	return new Promise(function executePngEncode(resolve, reject) {
		canvas.toBlob(function onPngBlob(blob) {
			if (blob === null) {
				reject(new Error("canvas.toBlob returned null"))
				return
			}
			resolve(blob)
		}, "image/png")
	})
}

/**
 * Upload the given PNG blob as the resource cover and refresh the
 * resource caches.
 *
 * @throws Error when the server rejects the upload.
 */
export async function uploadResCoverFromCapture(
	resId: string,
	blob: Blob,
	qc: QueryClient,
): Promise<void> {
	await uploadResCover(resId, blob, "cover.png", "application/octet-stream")
	await invalidateResources(qc, resId)
}

/**
 * Upload a cropped image as the resource cover (correct filename extension)
 * and refresh resource caches.
 *
 * @throws Error when the server rejects the upload.
 */
export async function uploadResCoverCropped(
	resId: string,
	cropped: CroppedImage,
	qc: QueryClient,
): Promise<void> {
	const ext = mimeToImageExt(cropped.mimeType)
	await uploadResCover(
		resId,
		cropped.blob,
		`cover${ext}`,
		"application/octet-stream",
	)
	await invalidateResources(qc, resId)
}
