/**
 * Dominant-colour extraction for a namecard image.
 *
 * The card wall paints the card backdrop with `accent`, so the value has to be
 * a colour that is recognisably the artwork's own: picking the plain channel
 * average turns every card grey, because paper whites dominate most scans.
 * Pixels are therefore bucketed by hue and weighted by saturation, then the
 * heaviest bucket contributes its mean RGB. Near-transparent, near-black and
 * near-white pixels carry no hue and are dropped.
 */

const HUE_BUCKETS = 12;

/** Minimum alpha for a pixel to describe a colour at all. */
const MIN_ALPHA = 128;

/** Pixels below this saturation (0..1) are greys and never represent the artwork. */
const MIN_SATURATION = 0.12;

/** Luma bounds outside which a pixel is treated as ink blur or paper. */
const MIN_LUMA = 24;
const MAX_LUMA = 240;

export interface AccentAccumulator {
    weight: number;
    r: number;
    g: number;
    b: number;
}

function toHex(value: number): string {
    return Math.max(0, Math.min(255, Math.round(value)))
        .toString(16)
        .padStart(2, "0");
}

/**
 * Buckets raw RGBA (`channels === 4`) or RGB (`channels === 3`) pixels by hue
 * and returns the weighted mean of the heaviest bucket as `#rrggbb`.
 */
export function pickAccentFromPixels(
    data: Uint8Array,
    channels: number,
    buckets: Map<number, AccentAccumulator> = new Map(),
): string | null {
    if (channels !== 3 && channels !== 4) {
        throw new Error("Unsupported pixel channel count");
    }
    const stride = channels;
    for (let offset = 0; offset + stride <= data.length; offset += stride) {
        const r = data[offset]!;
        const g = data[offset + 1]!;
        const b = data[offset + 2]!;
        if (channels === 4 && data[offset + 3]! < MIN_ALPHA) continue;
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        if (luma < MIN_LUMA || luma > MAX_LUMA) continue;
        const saturation = max === 0 ? 0 : (max - min) / max;
        if (saturation < MIN_SATURATION) continue;
        let hue: number;
        const delta = max - min;
        if (max === r) hue = ((g - b) / delta + (g < b ? 6 : 0)) * 60;
        else if (max === g) hue = ((b - r) / delta + 2) * 60;
        else hue = ((r - g) / delta + 4) * 60;
        const bucket = Math.min(
            HUE_BUCKETS - 1,
            Math.floor((hue % 360) / (360 / HUE_BUCKETS)),
        );
        // Saturation-squared keeps a few vivid pixels ahead of a large pale wash.
        const weight = saturation * saturation;
        const current = buckets.get(bucket) ?? { weight: 0, r: 0, g: 0, b: 0 };
        current.weight += weight;
        current.r += r * weight;
        current.g += g * weight;
        current.b += b * weight;
        buckets.set(bucket, current);
    }
    let best: AccentAccumulator | null = null;
    for (const candidate of buckets.values()) {
        if (!best || candidate.weight > best.weight) best = candidate;
    }
    if (!best || best.weight <= 0) return null;
    return `#${toHex(best.r / best.weight)}${toHex(best.g / best.weight)}${toHex(best.b / best.weight)}`;
}
