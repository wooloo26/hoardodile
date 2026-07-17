/**
 * Mobile viewport initial-scale factor used across the app shell and
 * plugin iframe previews. Kept in one place so it can be changed
 * without hunting through HTML templates and CSS rules.
 */
export const MOBILE_INITIAL_SCALE = 0.8

/**
 * Width in pixels at which the app switches from below-md to md+ layouts.
 *
 * This value is intentionally aligned with Tailwind's `md` breakpoint
 * (768 px) so that JS detection and CSS responsive prefixes stay in sync.
 * Components that need to know whether they are in the "below md" viewport
 * should use {@link isBelowMd} or {@link useBelowMd} from @hoardodile/ui/hooks/use-mobile.
 */
export const MOBILE_BREAKPOINT_PX = 768

/**
 * Same breakpoint expressed in rems, matching Tailwind's default theme
 * (`--breakpoint-md: 48rem`). Useful for CSS media queries and comments.
 */
export const MOBILE_BREAKPOINT_REM = MOBILE_BREAKPOINT_PX / 16

/**
 * Media query string that matches viewports below the `md` breakpoint
 * (< 768 px). Shared between JS hooks and anywhere else that needs to detect
 * a below-md viewport.
 *
 * Keep this in sync with the CSS/Tailwind breakpoint so JS and CSS never
 * disagree about the viewport size.
 */
export const MOBILE_QUERY = `(max-width: ${MOBILE_BREAKPOINT_PX - 1}px)`
