/**
 * Scroll shape of the packaged app shell.
 *
 * Two questions the app chrome keeps asking: which routes are ordinary
 * vertically scrolled documents, and how do you send one back to the top. They
 * live together because `layouts/app-layout.tsx` and
 * `components/app/app-tab-bar.tsx` both need the first answer and would
 * otherwise each carry their own copy of the pathname normalisation.
 *
 * These helpers are only reachable from the app build: the route manifest picks
 * `layouts/app-layout.tsx` over `layouts/public-layout.tsx` behind
 * `VITE_IMS_APP_TARGET`, so both callers are already absent from the web module
 * graph. Nothing here needs `IS_APP_TARGET` to gate it.
 */

/**
 * Drop trailing slashes so `/wiki/` and `/wiki` compare equal, while leaving
 * the root path alone.
 */
export function normalizeAppPathname(pathname: string) {
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname
}

/**
 * Routes the app shell renders as a full-height pane instead of a scrolling
 * document. `app-layout.tsx` swaps the shell to `h-dvh overflow-hidden` for
 * these, so the window never scrolls and there is no "top" to return to; the
 * exchange map scrolls its own inner panels.
 */
export function isNonScrollingAppRoute(pathname: string) {
  return normalizeAppPathname(pathname) === "/community/exchange"
}

/**
 * Send the shell back to the top.
 *
 * The window is the scroller for every route that scrolls at all: the shell in
 * `app-layout.tsx` is a plain `min-h-svh` column with no overflow container, so
 * content grows the document. Same scroller as
 * `components/shared/back-to-top.tsx`, deliberately, so the two controls cannot
 * drift into disagreeing about what "top" means.
 *
 * `instant` rather than `auto` on the reduced-motion branch, deliberately.
 * CSSOM-View defines `auto` as "defer to the element's computed
 * scroll-behavior", so it only stays instant while the stylesheet agrees;
 * `app.css` now drops `scroll-behavior: smooth` under
 * `prefers-reduced-motion: reduce`, which is the real fix and covers
 * back-to-top and anchor jumps too. `instant` keeps this call correct without
 * depending on that.
 *
 * Fires once per tap. No scroll listener and no per-frame work: the browser
 * owns the smooth-scroll animation.
 */
export function scrollAppViewToTop() {
  window.scrollTo({
    top: 0,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  })
}
