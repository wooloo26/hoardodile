import { ImageOff } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { apiPaths } from "@/lib/paths"

export type ResThumbUrlOptions = {
	/**
	 * Optional cache-buster (`v=`). Omitted for list cards so the browser can
	 * reuse one URL across meta backfill, pagination, and refresh.
	 */
	readonly cacheKey?: number | string
	/** Client-side bust after explicit cache clears (`bust=`). */
	readonly bust?: number
}

export function buildResThumbUrl(
	resId: string,
	options?: ResThumbUrlOptions,
): string {
	const base = `${apiPaths.resources.cover(resId)}?size=thumb`
	const params: string[] = []
	if (options?.cacheKey !== undefined) {
		params.push(`v=${options.cacheKey}`)
	}
	if (options?.bust !== undefined) {
		params.push(`bust=${options.bust}`)
	}
	return params.length === 0 ? base : `${base}&${params.join("&")}`
}

export type ResThumbProps = {
	readonly resId: string
	readonly cacheKey?: number | string
	readonly bust?: number
	/** Displayed centered in the tile when no image has been uploaded yet. */
	readonly name?: string
	readonly alt?: string
	readonly className?: string
	readonly maxWidth?: number
	readonly maxHeight?: number
	/**
	 * When true, request the image eagerly (`loading="eager"` +
	 * `fetchpriority="high"`). Used by the resource feed to fast-load
	 * the active card's poster while neighbours stay lazy.
	 */
	readonly eager?: boolean
}

/**
 * Thumbnail tile for a resource. Hits the auth-guarded HTTP endpoint
 * (`/api/resources/:id/cover?size=thumb`). When there is no preview source
 * the server streams a shared placeholder (200) so the browser does not log
 * 404s; that image is shown here until a real thumb exists.
 *
 * Visual style mirrors {@link CharThumb}: rounded corners, cover-fit
 * image, and a white hover overlay that fades in on pointer enter.
 */
export function ResThumb(props: ResThumbProps) {
	const {
		resId,
		cacheKey,
		bust,
		name,
		alt,
		className,
		maxWidth,
		maxHeight,
		eager,
	} = props
	const [loaded, setLoaded] = useState(false)
	const [broken, setBroken] = useState(false)
	const imgRef = useRef<HTMLImageElement>(null)
	const src = buildResThumbUrl(resId, { cacheKey, bust })

	useEffect(() => {
		setLoaded(false)
		setBroken(false)
	}, [src])

	useEffect(() => {
		const el = imgRef.current
		if (el === null) return
		if (el.complete && el.naturalWidth > 0) {
			setLoaded(true)
		} else if (el.complete && el.naturalWidth === 0) {
			setBroken(true)
		}
	})

	return (
		<div
			className={`${className ?? ""} relative overflow-hidden`}
			data-testid={`resource-thumb-${resId}`}
			data-state={loaded ? "loaded" : broken ? "broken" : "pending"}
		>
			<div className="pointer-events-none absolute inset-0 bg-white opacity-0 transition-opacity duration-300" />
			{broken ? (
				<div className="pointer-events-none flex flex-col items-center justify-center gap-2 bg-muted/40 px-2 text-center w-50 h-50 rounded">
					<ImageOff className="size-5" aria-hidden />
					{name !== undefined ? (
						<span className="line-clamp-2 text-xs text-muted-foreground">
							{name}
						</span>
					) : null}
				</div>
			) : (
				<img
					ref={imgRef}
					src={src}
					alt={alt ?? ""}
					style={{
						opacity: loaded ? 1 : 0,
						maxWidth,
						maxHeight,
					}}
					loading={eager === true ? "eager" : "lazy"}
					fetchPriority={eager === true ? "high" : "auto"}
					decoding="async"
					onLoad={() => setLoaded(true)}
					onError={() => setBroken(true)}
					data-testid={`resource-thumb-img-${resId}`}
				/>
			)}
		</div>
	)
}
