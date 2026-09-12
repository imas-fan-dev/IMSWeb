/**
 * SVG filter graph backing the Chromium-only refraction ceiling.
 *
 * `backdrop-filter: url(#glass-displacement)` needs the referenced filter to
 * exist in the document, so this renders once at the document root. It paints
 * nothing on its own and stays inert unless `data-glass-refraction="on"` is set
 * on the root element.
 *
 * The graph is deliberately small: fractal noise supplies a smooth, non-tiling
 * displacement field, and feDisplacementMap bends the backdrop along it. Larger
 * scales look like water rather than glass, so the scale stays in single
 * digits.
 *
 * See docs/architecture/glass-refraction-platform-strategy.md for why this is
 * Chromium-only and why it is attached to a decorative overlay.
 */
export function GlassFilterDefs() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      className="pointer-events-none absolute size-0"
    >
      <defs>
        <filter
          id="glass-displacement"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          colorInterpolationFilters="sRGB"
        >
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.012 0.018"
            numOctaves="2"
            seed="7"
            result="noise"
          />
          <feGaussianBlur in="noise" stdDeviation="1.4" result="softNoise" />
          <feDisplacementMap
            in="SourceGraphic"
            in2="softNoise"
            scale="8"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  )
}
