import type { LucideIcon } from "lucide-react"
import {
	Download,
	Eye,
	Files,
	FileText,
	Film,
	Filter,
	Folder,
	Heart,
	Image,
	Info,
	Music,
	Pause,
	Play,
	Search,
	Sparkle,
	Star,
	Tag,
	Video,
} from "lucide-react"
import { apiPaths } from "@/lib/paths"

/**
 * Curated whitelist mapping a `lucide:<Name>` icon-ref name to its component.
 * Plugins can only use names listed here; unknown names render to nothing.
 * Expand this list when concrete plugin authors need more.
 */
export const LUCIDE_REGISTRY: Record<string, LucideIcon> = {
	Download,
	Eye,
	FileText,
	Files,
	Film,
	Filter,
	Folder,
	Heart,
	Image,
	Info,
	Music,
	Pause,
	Play,
	Search,
	Star,
	Sparkle,
	Tag,
	Video,
}

export type IconRef =
	| { readonly kind: "lucide"; readonly name: string }
	| { readonly kind: "asset"; readonly url: string }

/**
 * Parse a manifest-level icon string into a render-ready ref.
 *
 *   `<name>`            — lucide whitelist lookup (no dots or path separators)
 *   `<relative/path>`   — `/api/plugins/<pluginId>/<path>` (leading `./` stripped)
 *
 * Empty inputs return `undefined`. The renderer treats that as "nothing".
 */
export function parseIconRef(
	raw: string,
	pluginId: string,
): IconRef | undefined {
	const trimmed = raw.trim()
	if (trimmed.length === 0) return undefined
	if (
		trimmed.startsWith("http://") ||
		trimmed.startsWith("https://") ||
		trimmed.startsWith("data:")
	) {
		return undefined
	}
	if (
		trimmed.includes(".") ||
		trimmed.includes("/") ||
		trimmed.includes("\\")
	) {
		const rel = trimmed.replace(/^\.[\\/]/, "")
		if (rel.length === 0) return undefined
		return { kind: "asset", url: apiPaths.plugins.asset(pluginId, rel) }
	}
	return { kind: "lucide", name: trimmed }
}

export type IconProps = {
	readonly icon: IconRef
	readonly className?: string
}

/**
 * Render a parsed {@link IconRef}. `object-contain` clamps any asset image
 * (svg / png / **gif** / webp) into the box defined by `className`; the
 * source is never validated for type or dimensions. Lucide refs whose name
 * is not in {@link LUCIDE_REGISTRY} render nothing.
 */
export function Icon(props: IconProps) {
	const { icon, className } = props
	if (icon.kind === "lucide") {
		const Component = LUCIDE_REGISTRY[icon.name]
		if (Component === undefined) return null
		return <Component className={className} />
	}
	return (
		<img
			src={icon.url}
			alt=""
			className={`${className ?? ""} object-contain`}
			draggable={false}
		/>
	)
}
