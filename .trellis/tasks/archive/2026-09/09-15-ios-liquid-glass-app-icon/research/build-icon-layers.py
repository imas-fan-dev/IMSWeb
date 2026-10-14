"""Rasterise the clean IMSWeb SVG master into app-icon layers.

    python3 build-icon-layers.py --write [--svg <master.svg>] [--out <dir>]
        Rasterise icon-sources/app-icon.svg into the tracked layer PNGs.

    python3 build-icon-layers.py --full-icon <out.png> [--android-background <out.png>]
        Rasterise the same geometry over the light plate, which is what the
        raster icon consumers need (desktop icons, iOS legacy appiconset,
        Android legacy mipmaps). The Android adaptive background is written
        from the same plate so every client sits on one colour.

The SVG is the geometry source of truth. Every path carries
data-layer="outline|wordmark|at"; each .icon layer is the alpha union of its
paths, except that the wordmark keeps clear of the @'s black edge as described
below. i and the flat-top m are sheared rounded blocks with continuous-curvature
corners, s is a traced closed band, and @ is a traced outer contour whose inner
a's opening is fitted as an ellipse so the arc inside it stays continuous.

The black frame is not traced from the sticker: it is the inner ink (the wordmark
shapes plus the @) offset by 56 px, closed by FRAME_CLOSE with a true disk so the
sharp re-entrant corners where two offset shapes merge become fillets, and traced
back into one closed contour, so exactly 28 px of black lands outside every edge.
outline-at paints the same @ with the same 56 px stroke, which keeps the @'s own
black edge; at also carries a 9 px keyline stroke. Because the outline layer is
underneath, the wordmark's white would hide that edge wherever a letterform
crosses it, so the white layer is cut back from AT_EDGE_INNER out to
AT_EDGE_OUTER outside the @ (see write_layers). The @, s and frame outlines are
the only things traced from the old metallic raster, once, at authoring time; the
build never reads a raster.

This is a research record, not a build step: nothing here runs during
`pnpm run icon:app`.
"""

import re
import subprocess
import sys
import tempfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

CANVAS = 1024
SUPER = 4096
FACTOR = SUPER // CANVAS
STEP = 8.0
def find_repository_root():
    for candidate in Path(__file__).resolve().parents:
        if (candidate / ".trellis").is_dir() and (candidate / "apps/web").is_dir():
            return candidate
    raise FileNotFoundError("cannot locate the IMSWeb repository root")


SVG = find_repository_root() / "apps/web/src-tauri/icon-sources/app-icon.svg"
OUTLINE = (17, 17, 19)
WORDMARK = (246, 246, 248)
AT = (201, 26, 29)
M_TOP_X0 = 390
M_TOP_X1 = 560
M_TOP_MAX_DELTA = 12


# --- masks -----------------------------------------------------------------

def _to_image(mask):
    return Image.fromarray(np.where(mask, 255, 0).astype(np.uint8))


def dilate(mask, radius):
    if radius <= 0:
        return mask.copy()
    size = np.int64(radius).item() * 2 + 1
    return np.asarray(_to_image(mask).filter(ImageFilter.MaxFilter(size))) > 0


def erode(mask, radius):
    if radius <= 0:
        return mask.copy()
    size = np.int64(radius).item() * 2 + 1
    return np.asarray(_to_image(mask).filter(ImageFilter.MinFilter(size))) > 0


def opening(mask, radius):
    return dilate(erode(mask, radius), radius)


def closing(mask, radius):
    return erode(dilate(mask, radius), radius)


FAR = 1.0e20


def _edt_1d(values):
    """Squared distance to the nearest zero, along one dimension."""
    n = values.size
    index = np.zeros(n, dtype=np.int64)
    bound = np.zeros(n + 1)
    k = 0
    bound[0] = -FAR
    bound[1] = FAR
    for q in range(1, n):
        while True:
            s = ((values[q] + q * q) - (values[index[k]] + index[k] * index[k])) / (
                2.0 * q - 2.0 * index[k]
            )
            if s <= bound[k]:
                k -= 1
                continue
            break
        k += 1
        index[k] = q
        bound[k] = s
        bound[k + 1] = FAR
    out = np.empty(n)
    k = 0
    for q in range(n):
        while bound[k + 1] < q:
            k += 1
        d = q - index[k]
        out[q] = d * d + values[index[k]]
    return out


def distance_to(mask):
    """Exact squared Euclidean distance from every pixel to the nearest True."""
    field = np.where(mask, 0.0, FAR)
    rows = np.empty_like(field)
    for y in range(field.shape[0]):
        rows[y] = _edt_1d(field[y])
    out = np.empty_like(rows)
    for x in range(rows.shape[1]):
        out[:, x] = _edt_1d(rows[:, x])
    return out


def disk_dilate(mask, radius):
    """Grow by a true disk. PIL's MaxFilter is a square, which is not one."""
    return distance_to(mask) <= radius * radius


def disk_erode(mask, radius):
    return ~disk_dilate(~mask, radius)


def disk_closing(mask, radius):
    """Fill concavities and fillet re-entrant corners with a true disk.

    Closing rounds the frame's reflex corners: the step where the band under
    the m meets the band around the @, and the bay between the m's right leg
    and the s. A square structuring element would fatten every convex arc along
    the diagonals, so the fillet has to be Euclidean to stay isotropic.
    """
    return disk_erode(disk_dilate(mask, radius), radius)


def label_image(mask):
    """4-connected labels via run-length union-find."""
    h, w = mask.shape
    labels = np.zeros((h, w), dtype=np.int32)
    parent = [0]
    m8 = mask.astype(np.int8)

    def find(a):
        root = a
        while parent[root] != root:
            root = parent[root]
        while parent[a] != root:
            parent[a], a = root, parent[a]
        return root

    def union(a, b):
        ra, rb = find(a), find(b)
        if ra != rb:
            parent[max(ra, rb)] = min(ra, rb)

    prev = []
    for y in range(h):
        row = m8[y]
        diff = np.diff(row)
        starts = (np.flatnonzero(diff == 1) + 1).tolist()
        ends = (np.flatnonzero(diff == -1) + 1).tolist()
        if row[0]:
            starts.insert(0, 0)
        if row[-1]:
            ends.append(w)
        out = np.zeros(w, dtype=np.int32)
        cur = []
        for s0, e0 in zip(starts, ends):
            label = len(parent)
            parent.append(label)
            for ps, pe, pl in prev:
                if ps < e0 and s0 < pe:
                    union(label, pl)
            out[s0:e0] = label
            cur.append((s0, e0, label))
        labels[y] = out
        prev = cur
    mapping = np.zeros(len(parent), dtype=np.int32)
    for i in range(len(mapping)):
        mapping[i] = find(i)
    return mapping[labels.ravel()].reshape(h, w)


def flood_reachable(passable):
    """True where a border-connected path through `passable` exists."""
    lab = label_image(passable)
    border = np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))
    border = border[border > 0]
    if border.size == 0:
        return np.zeros_like(passable)
    return np.isin(lab, border)


def fill_holes(mask):
    holes = ~mask & ~flood_reachable(~mask)
    return mask | holes


def median_rgb(rgb, size):
    out = np.empty_like(rgb)
    for c in range(3):
        img = Image.fromarray(rgb[..., c].astype(np.uint8))
        out[..., c] = np.asarray(img.filter(ImageFilter.MedianFilter(size)))
    return out


def flatten_m_top(mask):
    """Fill only the shallow center notch along the m's top edge.

    The right shoulder starts after x=560 and must retain its curve. Limiting
    the fill depth also prevents a missing column from turning into a tall,
    straight wall.
    """
    out = mask.copy()
    columns = out[:, M_TOP_X0 : M_TOP_X1 + 1]
    valid = columns.any(axis=0)
    tops = np.argmax(columns, axis=0)
    baseline = tops[valid].min().item()
    for offset, is_valid in enumerate(valid):
        top = tops[offset].item()
        if is_valid and top - baseline <= M_TOP_MAX_DELTA:
            out[baseline : top + 1, M_TOP_X0 + offset] = True
    return out


def derive_masks(rgb, alpha, lum_light=110, chroma_red=60, texture=9,
                 min_red=4, min_fill=150, min_shape=2, max_speck=20):
    sticker = fill_holes(alpha >= 128)

    chroma = median_rgb(rgb, 5)
    chroma = chroma.max(2) - chroma.min(2)
    red = opening((chroma > chroma_red) & sticker, min_red)

    lum = median_rgb(rgb, texture).mean(2)
    light = sticker & (lum > lum_light)

    # The source carries a pale double outline outside the black frame. Flat it
    # reads as a white rim, and the system renders its own shadow, so the whole
    # ring is dropped: flood it through light pixels from the border, which the
    # black frame blocks.
    band = light & flood_reachable(light | ~sticker)
    silhouette = closing(opening(sticker & ~band, min_shape), min_shape)
    silhouette = flatten_m_top(silhouette)

    # No morphological opening: it also erases the 3-5 px white keyline that
    # rings the @ in the source art. Speckle is dropped by component size
    # instead, which keeps long thin lines and removes isolated dots.
    fill = light & ~band & ~red & silhouette
    labels = label_image(fill)
    sizes = np.bincount(labels.ravel(), minlength=labels.max() + 1)
    keep = np.zeros(sizes.size, dtype=bool)
    keep[1:] = sizes[1:] >= min_fill
    fill = keep[labels]
    fill = flatten_m_top(fill)

    # Brushed-striation leftovers survive as black specks inside the fills.
    # Only tiny ones are absorbed: the letterforms' enclosed black structure
    # (the @ counters, the s bowls, the m leg notch) is also enclosed, so a
    # blanket hole fill would swallow it and read as missing black.
    dark = silhouette & ~fill & ~red
    labels = label_image(dark)
    sizes = np.bincount(labels.ravel(), minlength=labels.max() + 1)
    speck = np.zeros(sizes.size, dtype=bool)
    speck[1:] = sizes[1:] <= max_speck
    fill = fill | speck[labels]

    return {"silhouette": silhouette, "white": fill, "red": red & silhouette}


# --- tracing ---------------------------------------------------------------

SEGMENTS = {
    1: "LT", 2: "TR", 3: "LR", 4: "RB", 5: "LT RB", 6: "TB", 7: "LB",
    8: "BL", 9: "TB", 10: "TR BL", 11: "RB", 12: "RL", 13: "TR", 14: "LT",
}

def marching_squares(mask, level=0.5):
    """Sub-pixel closed contours, in pixel coordinates of `mask`."""
    field = np.pad(mask.astype(np.float64), 1)
    a = field[:-1, :-1]
    b = field[:-1, 1:]
    c = field[1:, 1:]
    d = field[1:, :-1]
    index = (
        (a >= level).astype(np.uint8)
        | ((b >= level).astype(np.uint8) << 1)
        | ((c >= level).astype(np.uint8) << 2)
        | ((d >= level).astype(np.uint8) << 3)
    )
    ys, xs = np.nonzero((index != 0) & (index != 15))

    def lerp(p, q):
        with np.errstate(divide="ignore", invalid="ignore"):
            t = (level - p) / (q - p)
        return np.where(np.isfinite(t), np.clip(t, 0, 1), 0.5)

    tt = lerp(a[ys, xs], b[ys, xs])
    rr = lerp(b[ys, xs], c[ys, xs])
    bb = lerp(d[ys, xs], c[ys, xs])
    ll = lerp(a[ys, xs], d[ys, xs])

    points = {}
    adjacency = {}
    for k, code in enumerate(index[ys, xs]):
        y, x = ys[k].item(), xs[k].item()
        corners = {
            "T": np.array([x - 1 + tt[k], y - 1.0]),
            "R": np.array([x + 0.0, y - 1 + rr[k]]),
            "B": np.array([x - 1 + bb[k], y + 0.0]),
            "L": np.array([x - 1.0, y - 1 + ll[k]]),
        }
        keys = {
            "T": ("h", y, x), "R": ("v", y, x + 1),
            "B": ("h", y + 1, x), "L": ("v", y, x),
        }
        for corner in "TRBL":
            points[keys[corner]] = corners[corner]
        for segment in SEGMENTS.get(code.item(), "").split():
            start, end = keys[segment[0]], keys[segment[1]]
            adjacency.setdefault(start, []).append(end)
            adjacency.setdefault(end, []).append(start)

    seen = set()
    loops = []
    for start in adjacency:
        if start in seen:
            continue
        loop, current, previous = [], start, None
        while True:
            seen.add(current)
            loop.append(current)
            candidates = [n for n in adjacency[current] if n != previous]
            candidates = [n for n in candidates if n not in seen] or candidates
            if not candidates:
                break
            previous, current = current, candidates[0]
            if current == start:
                break
        if len(loop) > 8:
            loops.append(np.array([points[key] for key in loop]))
    return loops


def resample(loop, step):
    closed = np.vstack([loop, loop[:1]])
    lengths = np.hypot(*np.diff(closed, axis=0).T)
    total = lengths.sum()
    if total <= 0:
        return loop
    count = max(16, np.round(total / step).astype(int).item())
    targets = np.linspace(0.0, total, count, endpoint=False)
    cumulative = np.concatenate([[0.0], np.cumsum(lengths)])
    out = np.empty((count, 2))
    for axis in (0, 1):
        out[:, axis] = np.interp(targets, cumulative, closed[:, axis])
    return out


def smooth_loop(loop, sigma_samples):
    """Low-pass the polygon along its own arc length.

    Filtering the traced path rather than the mask keeps every feature width:
    blurring the mask would weld shut the thin black slots between the m legs.
    """
    if sigma_samples <= 0:
        return loop
    count = len(loop)
    radius = max(1, np.round(3 * sigma_samples).astype(int).item())
    if count < 4 * radius:
        return loop
    offsets = np.arange(-radius, radius + 1)
    kernel = np.exp(-0.5 * (offsets / sigma_samples) ** 2)
    kernel /= kernel.sum()
    padded = np.vstack([loop, loop, loop])
    out = np.empty_like(loop)
    for axis in (0, 1):
        out[:, axis] = np.convolve(padded[:, axis], kernel, mode="same")[
            count : 2 * count
        ]
    return out


def rdp(points, epsilon):
    keep = np.zeros(len(points), dtype=bool)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        i, j = stack.pop()
        if j <= i + 1:
            continue
        p, q = points[i], points[j]
        vector = q - p
        norm = np.hypot(vector[0], vector[1]).item()
        offsets = points[i + 1 : j] - p
        if norm > 0:
            distance = np.abs(
                vector[0] * offsets[:, 1] - vector[1] * offsets[:, 0]
            ) / norm
        else:
            distance = np.hypot(offsets[:, 0], offsets[:, 1])
        worst = np.argmax(distance).item()
        if distance[worst] > epsilon:
            keep[i + 1 + worst] = True
            stack += [(i, i + 1 + worst), (i + 1 + worst, j)]
    return points[keep]


def offset_loop(loop, delta):
    """Push every point delta pixels along its outward normal.

    Arc-length smoothing shrinks convex contours by roughly sigma^2 * k / 2.
    Left uncompensated that reads as a uniform rim of lost fill.
    """
    if delta == 0:
        return loop
    nxt = np.roll(loop, -1, axis=0)
    prv = np.roll(loop, 1, axis=0)
    tangent = nxt - prv
    length = np.hypot(tangent[:, 0], tangent[:, 1])
    length[length == 0] = 1.0
    normal = np.stack([tangent[:, 1] / length, -tangent[:, 0] / length], axis=1)
    area = 0.5 * np.sum(loop[:, 0] * nxt[:, 1] - nxt[:, 0] * loop[:, 1])
    return loop + (1.0 if area > 0 else -1.0) * delta * normal


def spline_path(points, scale):
    """Closed C2 cubic spline through `points`, emitted as cubic Beziers.

    Catmull-Rom is only C1: curvature jumps at every sample, so a long arc
    reads as a chain of slightly different circles and the eye sees flats and
    kinks. A periodic cubic spline solves for the second derivatives that keep
    curvature continuous across the knots, which is what makes the @ ring, the
    s bends and the traced keyline read as one continuous curve. Knots may be
    unevenly spaced; spacing only enters through the chord lengths.
    """
    n = len(points)
    if n < 3:
        return ""
    pts = points / scale
    following = np.roll(pts, -1, axis=0)
    previous = np.roll(pts, 1, axis=0)
    h = np.hypot(*(following - pts).T)
    if (h <= 0).any():
        return ""
    h_prev = np.roll(h, 1)
    slope_next = (following - pts) / h[:, None]
    slope_prev = (pts - previous) / h_prev[:, None]

    rows = np.arange(n)
    matrix = np.zeros((n, n))
    matrix[rows, rows] = 2.0 * (h_prev + h)
    matrix[rows, (rows - 1) % n] = h_prev
    matrix[rows, (rows + 1) % n] = h
    second = np.linalg.solve(matrix, 6.0 * (slope_next - slope_prev))
    tangent = slope_next - (
        h[:, None] * (2.0 * second + np.roll(second, -1, axis=0)) / 6.0
    )
    tangent_next = np.roll(tangent, -1, axis=0)

    parts = ["M{:.2f},{:.2f}".format(pts[0][0], pts[0][1])]
    for i in range(n):
        first = pts[i] + tangent[i] * h[i] / 3.0
        last = following[i] - tangent_next[i] * h[i] / 3.0
        parts.append(
            "C{:.2f},{:.2f} {:.2f},{:.2f} {:.2f},{:.2f}".format(
                first[0], first[1], last[0], last[1],
                following[i][0], following[i][1],
            )
        )
    parts.append("Z")
    return "".join(parts)
def smooth_contours(mask, sigma_px, epsilon_px, simplify_px=3.0):
    """Mask -> list of smooth closed polylines in SUPER space."""
    field = np.asarray(
        Image.fromarray((mask * 255).astype(np.uint8)).resize(
            (SUPER, SUPER), Image.Resampling.BICUBIC
        )
    )
    field = np.asarray(
        Image.fromarray(field).filter(ImageFilter.GaussianBlur(6))
    ).astype(np.float64) / 255.0

    sigma = sigma_px * FACTOR
    epsilon = epsilon_px * FACTOR
    simplify = simplify_px * FACTOR
    out = []
    for loop in marching_squares(field >= 0.5):
        if len(loop) < 12:
            continue
        simplified = rdp(loop, simplify)
        if len(simplified) < 6:
            continue
        smooth = smooth_loop(resample(simplified, STEP), sigma / STEP)
        final = rdp(smooth, epsilon)
        if len(final) >= 4:
            out.append(final)
    return out


def path_of(contours, delta):
    return "".join(
        spline_path(offset_loop(c, delta * FACTOR), FACTOR) for c in contours
    )


def uniform(contours, step):
    """Even arc-length spacing, so the spline knots stay well conditioned."""
    return [resample(contour / FACTOR, step) * FACTOR for contour in contours]


def raster(
    path_data,
    size=CANVAS,
    fill_enabled=True,
    fill_rule="evenodd",
    stroke_width=0.0,
    stroke_linejoin="round",
    stroke_linecap="round",
):
    stroke = ""
    if stroke_width > 0:
        stroke = (
            f' stroke="#fff" stroke-width="{stroke_width}"'
            f' stroke-linejoin="{stroke_linejoin}"'
            f' stroke-linecap="{stroke_linecap}"'
        )
    fill = "#fff" if fill_enabled else "none"
    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>'
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" '
        f'width="{size}" height="{size}">'
        f'<path fill="{fill}" fill-rule="{fill_rule}"{stroke} '
        f'd="{path_data}"/></svg>'
    )
    with tempfile.TemporaryDirectory(prefix="imsweb-icon-layer-") as temp_dir:
        svg_path = Path(temp_dir) / "layer.svg"
        png_path = Path(temp_dir) / "layer.png"
        svg_path.write_text(svg, encoding="utf-8")
        subprocess.run(
            ["rsvg-convert", "-w", str(size), "-h", str(size),
             "-o", str(png_path), str(svg_path)],
            check=True,
        )
        with Image.open(png_path) as image:
            return np.asarray(image.getchannel("A")) >= 128


def calibrate(mask, contours):
    """Pick the normal offset whose rasterisation best matches the mask."""
    best, best_iou = 0.0, -1.0
    for delta in (0.0, 0.5, 1.0, 1.5, 2.0, 2.5, 3.0, 4.0):
        got = raster(path_of(contours, delta), CANVAS)
        union = (mask | got).sum()
        iou = (mask & got).sum() / union if union else 0.0
        if iou > best_iou:
            best, best_iou = delta, iou
    return best, best_iou
def parse_svg(svg):
    text = Path(svg).read_text(encoding="utf-8")
    found = {}
    for chunk in text.split("<path")[1:]:
        head = chunk.partition("/>")[0]
        ident = re.search(r'\bid="([^"]+)"', head)
        data = re.search(r'\sd="([^"]+)"', head)
        if ident and data:
            found[ident.group(1)] = data.group(1)
    return found


def parse_svg_text(text):
    found = {}
    for chunk in text.split("<path")[1:]:
        head = chunk.partition("/>")[0]
        ident = re.search(r'\bid="([^"]+)"', head)
        data = re.search(r'\sd="([^"]+)"', head)
        if not ident or not data:
            continue
        layer = re.search(r'\bdata-layer="([^"]+)"', head)
        rule = re.search(r'\bfill-rule="([^"]+)"', head)
        fill = re.search(r'\bfill="([^"]+)"', head)
        width = re.search(r'\bstroke-width="([^"]+)"', head)
        linejoin = re.search(r'\bstroke-linejoin="([^"]+)"', head)
        linecap = re.search(r'\bstroke-linecap="([^"]+)"', head)
        found[ident.group(1)] = {
            "layer": layer.group(1) if layer else ident.group(1),
            "data": data.group(1),
            "fill_enabled": not fill or fill.group(1) != "none",
            "fill_rule": rule.group(1) if rule else "evenodd",
            "stroke_width": np.float64(width.group(1)).item() if width else 0.0,
            "stroke_linejoin": linejoin.group(1) if linejoin else "round",
            "stroke_linecap": linecap.group(1) if linecap else "round",
        }
    return found


def layer_png(mask):
    rgba = np.zeros((CANVAS, CANVAS, 4), np.uint8)
    rgba[..., :3] = 255
    rgba[..., 3] = (mask * 255).astype(np.uint8)
    return Image.fromarray(rgba)


def derive(source, sigma, epsilon, target):
    img = Image.open(source).convert("RGBA")
    masks = derive_masks(
        np.asarray(img.convert("RGB")).astype(np.float32),
        np.asarray(img.getchannel("A")).astype(np.float32),
    )
    paths = {}
    for ident, key, scale in (
        ("outline", "silhouette", 1.0),
        ("wordmark", "white", 1.0),
        ("at", "red", 0.8),
    ):
        mask = masks[key]
        contours = smooth_contours(mask, sigma * scale, epsilon)
        delta, iou = calibrate(mask, contours)
        paths[ident] = path_of(contours, delta)
        print(f"{ident:9s} contours={len(contours):3d} delta={delta:.1f}px IoU={iou:.4f}")
    svg = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<!-- One closed cubic Bezier per subpath. Hand-editable: change a\n"
        "     control point, then run `build-icon-layers.py --write`. -->\n"
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" '
        'width="1024" height="1024">\n'
        f'  <path id="outline" fill="#111113" fill-rule="evenodd" d="{paths["outline"]}"/>\n'
        f'  <path id="wordmark" fill="#f6f6f8" fill-rule="evenodd" d="{paths["wordmark"]}"/>\n'
        f'  <path id="at" fill="#c91a1d" fill-rule="evenodd" d="{paths["at"]}"/>\n'
        "</svg>\n"
    )
    Path(target).write_text(svg, encoding="utf-8")
    print("wrote", target, Path(target).stat().st_size, "bytes")


def shrink(mask):
    """Box-downsample a SUPER-resolution mask back onto the 1024 canvas."""
    return np.asarray(
        Image.fromarray((mask * 255).astype(np.uint8)).resize(
            (CANVAS, CANVAS), Image.Resampling.BOX
        )
    ) >= 128


def render_layers(svg):
    """Rasterise the document's three data-layers at SUPER resolution."""
    paths = parse_svg_text(
        svg if svg.lstrip().startswith("<") else Path(svg).read_text(encoding="utf-8")
    )

    def render_layer(name):
        mask = None
        for path in paths.values():
            if path["layer"] != name:
                continue
            rendered = raster(
                path["data"],
                SUPER,
                fill_enabled=path["fill_enabled"],
                fill_rule=path["fill_rule"],
                stroke_width=path["stroke_width"],
                stroke_linejoin=path["stroke_linejoin"],
                stroke_linecap=path["stroke_linecap"],
            )
            mask = rendered if mask is None else (mask | rendered)
        if mask is None:
            raise ValueError(f"no path declares data-layer=\"{name}\"")
        return mask

    return {
        "silhouette": render_layer("outline"),
        "white": render_layer("wordmark"),
        "red": render_layer("at"),
    }


def at_edge(small):
    """The black band the wordmark must leave clear for the @'s own edge.

    The outline layer sits underneath, so the white would hide that edge
    wherever a letterform crosses it. Cutting the band can only ever remove
    white that already sits on frame black; otherwise the cut would punch a
    background hole in a letterform, which is a hard error.
    """
    edge = disk_dilate(small["red"], AT_EDGE_OUTER) & ~disk_dilate(
        small["red"], AT_EDGE_INNER
    )
    hidden = edge & ~small["silhouette"]
    if hidden.any():
        raise ValueError(f"@ edge would cut {hidden.sum().item()} px outside the frame")
    return edge


BACKGROUND = (224, 225, 227)   # app-icon.json bg_color #e0e1e3 / icon.json light fill


def full_icon(small):
    """Composite the three layers over the light plate for raster icon targets.

    `tauri icon` consumes one opaque square image: the desktop icons, the iOS
    legacy appiconset and the Android legacy mipmaps all come from it. The iOS
    Liquid Glass document draws its own background, so this plate exists only
    for those raster consumers.
    """
    plate = np.zeros((CANVAS, CANVAS, 3), np.uint8)
    plate[:] = BACKGROUND
    plate[small["silhouette"]] = OUTLINE
    plate[small["white"]] = WORDMARK
    plate[small["red"]] = AT
    return Image.fromarray(plate)


def layer_masks(svg):
    masks = render_layers(svg)
    small = {key: shrink(mask) for key, mask in masks.items()}
    edge = at_edge(small)
    small["white"] = small["white"] & ~edge
    return small, edge


def write_full_icon(svg, png, background=None):
    """Rasterise the full-bleed icon used by the desktop and favicon targets."""
    small, _ = layer_masks(svg)
    icon = full_icon(small)
    target = Path(png)
    target.parent.mkdir(parents=True, exist_ok=True)
    icon.save(target)
    print("wrote", target, target.stat().st_size, "bytes")
    if background:
        plate = np.zeros((CANVAS, CANVAS, 4), np.uint8)
        plate[..., :3] = BACKGROUND
        plate[..., 3] = 255
        path = Path(background)
        path.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(plate).save(path)
        print("wrote", path, path.stat().st_size, "bytes")


def write_layers(svg, out):
    small, edge = layer_masks(svg)
    targets = Path(out)
    targets.mkdir(parents=True, exist_ok=True)
    layer_png(small["silhouette"]).save(targets / "Outline.png")
    layer_png(small["white"]).save(targets / "Wordmark.png")
    layer_png(small["red"]).save(targets / "At.png")
    android = np.zeros((CANVAS, CANVAS, 4), np.uint8)
    android[small["silhouette"]] = OUTLINE + (255,)
    android[small["white"]] = WORDMARK + (255,)
    android[small["red"]] = AT + (255,)
    Image.fromarray(android).save(targets / "android-foreground.png")
    layer_png(small["silhouette"]).save(targets / "android-monochrome.png")
    print(" ".join(f"{k}={v.sum().item()}" for k, v in sorted(small.items())))
    print(f"at-edge cut={edge.sum().item()} px")
    print("wrote layers into", targets)


# --- authoring mode: derive the tracked geometry from the pre-flattening art ---

BLACK_HEX = "#111113"
WHITE_HEX = "#f6f6f8"
RED_HEX = "#c91a1d"
SHEAR = 0.364          # right-lean, dx/dy, measured on the source letterforms
BASELINE = 504.0
SHIFT_Y = 16.5         # drop the ink so the framed mark is centred on the canvas
FRAME = 56.0           # black frame stroke; 28 px lands outside the shape
FRAME_CLOSE = 28.0     # disk fillet radius for the frame's re-entrant corners
FRAME_STEP = 8.0       # uniform spacing of the traced frame contour
FRAME_SIGMA = 8.0      # arc-length smoothing of that contour
FRAME_FILLET = 24.0    # corner radius applied before the spline is emitted
AT_EDGE_OUTER = 20.0   # black @ edge band seen over the letterform white
AT_EDGE_INNER = 6.0    # keep zone: the 9 px keyline must stay visible
CORNER_HANDLE = 0.72   # Bezier handle / radius; 0.5523 is a circular arc
KEY = 9.0              # white keyline stroke; about 4.5 px stays visible


def largest(mask):
    labels = label_image(mask)
    counts = np.bincount(labels.ravel())
    return labels == (np.argmax(counts[1:]) + 1)


def grow(seed, passable, box):
    """4-connected growth of `seed` through `passable`, limited to `box`."""
    out = seed.copy()
    while True:
        grown = out.copy()
        for axis in (0, 1):
            for shift in (1, -1):
                grown |= np.roll(out, shift, axis=axis) & passable
        grown &= box
        if grown.sum() == out.sum():
            return out
        out = grown


def derive_regions(source):
    """Region masks of the pre-flattening artwork.

    alpha gives the sticker, the red @ is separated by HSV chroma, and the s is
    grown from bright pixels through everything that is not the black outline.
    """
    with Image.open(source) as image:
        rgba = image.convert("RGBA")
        rgb = np.asarray(rgba.convert("RGB")).astype(np.float32)
        alpha = np.asarray(rgba.getchannel("A")).astype(np.float32)
    sticker = fill_holes(alpha >= 128)
    chroma = median_rgb(rgb, 5)
    chroma = chroma.max(2) - chroma.min(2)
    at = largest((chroma > 60) & sticker)
    luminance = median_rgb(rgb, 9).mean(2)
    box = np.zeros_like(at)
    box[495:705, 560:845] = True
    passable = ((luminance > 75) | (alpha < 100)) & box
    s = largest(fill_holes(grow((luminance > 195) & (alpha > 200) & box, passable, box)))
    frame = largest(sticker)
    return {"frame": frame, "s": s, "at": at}


def _normal_field(points):
    follow = np.roll(points, -1, axis=0)
    previous = np.roll(points, 1, axis=0)
    tangent = follow - previous
    length = np.hypot(tangent[:, 0], tangent[:, 1])
    length[length == 0] = 1.0
    normal = np.stack([tangent[:, 1] / length, -tangent[:, 0] / length], axis=1)
    area = 0.5 * np.sum(points[:, 0] * follow[:, 1] - follow[:, 0] * points[:, 1])
    return normal * (1.0 if area > 0 else -1.0)


def fit_contours(mask, sigma, eps=0.8, simplify=1.5, passes=6, step=0.6):
    """Smooth contours fitted back against the mask.

    A Catmull-Rom spline overshoots at a sharp corner, so mismatching pixels
    pull or push the nearest sample along its normal for a few passes. The
    result is unevenly spaced, so callers resample before emitting curves.
    """
    contours = [loop.copy() for loop in smooth_contours(mask, sigma, eps, simplify)]
    for _ in range(passes):
        got = raster(path_of(contours, 0.0), CANVAS)
        extra = got & ~mask
        missing = mask & ~got
        if extra.sum() <= 200 and missing.sum() <= 200:
            break
        for bad, sign in ((extra, -1.0), (missing, 1.0)):
            rows, columns = np.nonzero(bad)
            if rows.size == 0:
                continue
            targets = np.stack([columns, rows], 1) * np.float64(FACTOR)
            for loop in contours:
                normal = _normal_field(loop)
                distances = np.linalg.norm(targets[:, None, :] - loop[None, :, :], axis=2)
                close = distances.min(1) < 80.0
                if not close.any():
                    continue
                nearest = np.argmin(distances[close], axis=1)
                hit = np.zeros(len(loop), dtype=bool)
                hit[nearest] = True
                loop[hit] += sign * step * FACTOR * normal[hit]
    return contours


def trace_fit(mask, sigma, eps=0.8, simplify=1.5, passes=6, step=0.6):
    return path_of(fit_contours(mask, sigma, eps, simplify, passes, step), 0.0)


def shear(x, y, base=BASELINE):
    return (x - SHEAR * (y - base), np.float64(y + SHIFT_Y).item())


class Bezier(object):
    """Minimal cubic-Bezier path builder."""

    def __init__(self):
        self.parts = []

    def move(self, x, y):
        self.parts.append("M{:.2f},{:.2f}".format(x, y))
        return self

    def curve(self, control1, control2, end):
        self.parts.append(
            "C{:.2f},{:.2f} {:.2f},{:.2f} {:.2f},{:.2f}".format(
                control1[0], control1[1], control2[0], control2[1], end[0], end[1]
            )
        )
        return self

    def close(self):
        self.parts.append("Z")
        return self

    def line(self, start, end):
        return self.curve(
            (start[0] + (end[0] - start[0]) / 3.0, start[1] + (end[1] - start[1]) / 3.0),
            (start[0] + 2 * (end[0] - start[0]) / 3.0, start[1] + 2 * (end[1] - start[1]) / 3.0),
            end,
        )

    def text(self):
        return "".join(self.parts)


def rounded_block(x0, y0, x1, y1, radius):
    """Sheared rounded rectangle: one letterform block of the i or the m.

    The corner handles are longer than the 0.5523 r of a circular arc, so the
    curvature starts at zero where the arc leaves the straight edge instead of
    snapping to 1/r. That continuous-curvature blend is what makes the
    straight-to-round transition read as one continuous sweep.
    """
    point = lambda x, y: shear(x, y)
    corner = CORNER_HANDLE * radius
    path = Bezier()
    path.move(*point(x0 + radius, y0))
    path.line(point(x0 + radius, y0), point(x1 - radius, y0))
    path.curve(point(x1 - radius + corner, y0), point(x1, y0 + radius - corner), point(x1, y0 + radius))
    path.line(point(x1, y0 + radius), point(x1, y1 - radius))
    path.curve(point(x1, y1 - radius + corner), point(x1 - radius + corner, y1), point(x1 - radius, y1))
    path.line(point(x1 - radius, y1), point(x0 + radius, y1))
    path.curve(point(x0 + radius - corner, y1), point(x0, y1 - radius + corner), point(x0, y1 - radius))
    path.line(point(x0, y1 - radius), point(x0, y0 + radius))
    path.curve(point(x0, y0 + radius - corner), point(x0 + radius - corner, y0), point(x0 + radius, y0))
    return path.close().text()


def m_block(x0, x1, y0, y1, slots, slot_top, slot_radius, radius_top_left, radius_top_right, radius_bottom):
    """Flat-top sheared m whose leg slots are negative space between blocks.

    The two top corners get separate radii: the source's shoulder sweeps over
    roughly 30 px while its junction with the i stays tight, and a shoulder
    radius that is too small reads as a kink once the frame is offset from it.
    """
    point = lambda x, y: shear(x, y)
    corner = CORNER_HANDLE
    path = Bezier()
    path.move(*point(x0 + radius_top_left, y0))
    path.line(point(x0 + radius_top_left, y0), point(x1 - radius_top_right, y0))
    path.curve(
        point(x1 - radius_top_right + corner * radius_top_right, y0),
        point(x1, y0 + radius_top_right - corner * radius_top_right),
        point(x1, y0 + radius_top_right),
    )
    path.line(point(x1, y0 + radius_top_right), point(x1, y1 - radius_bottom))
    path.curve(
        point(x1, y1 - radius_bottom + corner * radius_bottom),
        point(x1 - radius_bottom + corner * radius_bottom, y1),
        point(x1 - radius_bottom, y1),
    )
    x = x1 - radius_bottom
    for slot_x0, slot_x1 in reversed(slots):
        path.line(point(x, y1), point(slot_x1, y1))
        path.line(point(slot_x1, y1), point(slot_x1, slot_top + slot_radius))
        path.curve(
            point(slot_x1, slot_top + slot_radius - corner * slot_radius),
            point(slot_x1 - slot_radius + corner * slot_radius, slot_top),
            point(slot_x1 - slot_radius, slot_top),
        )
        path.curve(
            point(slot_x1 - slot_radius - corner * slot_radius, slot_top),
            point(slot_x0, slot_top + slot_radius - corner * slot_radius),
            point(slot_x0, slot_top + slot_radius),
        )
        path.line(point(slot_x0, slot_top + slot_radius), point(slot_x0, y1))
        x = slot_x0
    path.line(point(x, y1), point(x0 + radius_bottom, y1))
    path.curve(
        point(x0 + radius_bottom - corner * radius_bottom, y1),
        point(x0, y1 - radius_bottom + corner * radius_bottom),
        point(x0, y1 - radius_bottom),
    )
    path.line(point(x0, y1 - radius_bottom), point(x0, y0 + radius_top_left))
    path.curve(
        point(x0, y0 + radius_top_left - corner * radius_top_left),
        point(x0 + radius_top_left - corner * radius_top_left, y0),
        point(x0 + radius_top_left, y0),
    )
    return path.close().text()


def shift_path(path_data, dy):
    """Drop a pure M/C/Z path by dy; coordinates only ever appear as x,y pairs."""

    def replace(match):
        return "{},{:.2f}".format(match.group(1), np.float64(match.group(2)).item() + dy)

    return re.sub(r"(-?\d+\.?\d*),(-?\d+\.?\d*)", replace, path_data)


def compose_document(at_path, s_path, frame_path=None):
    """Five primitives: the frame, the @ with its own edge, the wordmark.

    Without `frame_path` the frame is the inner ink stroked by FRAME, which is
    the constant-width round offset used to build it. With `frame_path` the
    frame is the traced outline of that offset after the re-entrant corners
    where two dilated shapes meet have been filleted; that is the shipped form,
    because a union of two round offsets leaves a sharp notch at every merge
    point and those notches are what reads as an abrupt transition.
    """
    at_path = shift_path(at_path, SHIFT_Y)
    s_path = shift_path(s_path, SHIFT_Y)
    wordmark = (
        rounded_block(199, 330, 275, 504, 12)
        + rounded_block(199, 277, 275, 320, 9)
        + m_block(295.5, 558.5, 330, 504, [(369.5, 390.5), (464.5, 485.5)], 383, 10.5, 10, 34, 13)
        + s_path
    )
    ink = wordmark + " " + at_path
    rounded = 'stroke-linejoin="round" stroke-linecap="round"'
    stroke = ' stroke="' + BLACK_HEX + '" stroke-width="' + str(np.int64(FRAME).item()) + '" '
    if frame_path is None:
        frame = (
            '<path data-layer="outline" id="outline-frame" fill="' + BLACK_HEX + '" fill-rule="nonzero"'
            + stroke + rounded + ' d="' + ink + '"/>'
        )
    else:
        frame = (
            '<path data-layer="outline" id="outline-frame" fill="' + BLACK_HEX
            + '" fill-rule="nonzero" d="' + frame_path + '"/>'
        )
    return (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        "<!-- Geometry master. The @ and s outlines were traced once from the\n"
        "     pre-flattening artwork and evenly resampled; i and the flat-top m are\n"
        "     hand-authored. The black frame is the inner ink (wordmark plus @)\n"
        "     offset by 56 px, closed by a 28 px disk so its re-entrant corners and\n"
        "     the bay between the m and the s become fillets, and traced back. The\n"
        "     wordmark layer keeps clear of the @'s own black edge (see\n"
        "     write_layers), so that edge stays visible over the letterforms. The\n"
        "     build never reads a raster. data-layer names the .icon layer each\n"
        "     primitive rasterises into. -->\n"
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">\n'
        '  ' + frame + '\n'
        '  <path data-layer="outline" id="outline-at" fill="' + BLACK_HEX + '" fill-rule="evenodd" stroke="' + BLACK_HEX
        + '" stroke-width="' + str(np.int64(FRAME).item()) + '" ' + rounded + ' d="' + at_path + '"/>\n'
        '  <path data-layer="wordmark" id="wordmark" fill="' + WHITE_HEX + '" fill-rule="evenodd" d="' + wordmark + '"/>\n'
        '  <path data-layer="wordmark" id="at-keyline" fill="none" fill-rule="evenodd" stroke="' + WHITE_HEX
        + '" stroke-width="' + str(np.int64(KEY).item()) + '" ' + rounded + ' d="' + at_path + '"/>\n'
        '  <path data-layer="at" id="at" fill="' + RED_HEX + '" fill-rule="evenodd" d="' + at_path + '"/>\n'
        "</svg>\n"
    )


def fillet_corners(points, radius, min_turn=10.0, max_turn=178.0, samples=6):
    """Replace every corner tighter than `radius` with a tangent circular arc.

    Arc-length smoothing alone still leaves the source sticker's cut corners
    sharp. Rounding only the corners keeps the straight runs straight and the
    frame widths unchanged, which is what "round and smooth" needs here.
    """
    count = len(points)
    out = []
    for i in range(count):
        previous, current, following = points[i - 1], points[i], points[(i + 1) % count]
        incoming, outgoing = current - previous, following - current
        first, second = np.hypot(*incoming), np.hypot(*outgoing)
        if first < 1e-6 or second < 1e-6:
            continue
        unit_in, unit_out = incoming / first, outgoing / second
        cross = unit_in[0] * unit_out[1] - unit_in[1] * unit_out[0]
        turn = np.degrees(np.arccos(np.clip(unit_in @ unit_out, -1.0, 1.0)))
        if turn < min_turn or turn > max_turn or abs(cross) < 1e-9:
            out.append(current)
            continue
        half = np.radians(turn) / 2.0
        cut = min(radius * np.tan(half), 0.45 * first, 0.45 * second)
        effective = cut / np.tan(half)
        start, end = current - unit_in * cut, current + unit_out * cut
        side = 1.0 if cross > 0 else -1.0
        centre = start + side * np.array([-unit_in[1], unit_in[0]]) * effective
        angle_start = np.arctan2(start[1] - centre[1], start[0] - centre[0])
        angle_end = np.arctan2(end[1] - centre[1], end[0] - centre[0])
        sweep = (angle_end - angle_start + np.pi) % (2 * np.pi) - np.pi
        out.append(start)
        for k in range(1, samples + 1):
            angle = angle_start + sweep * k / (samples + 1)
            out.append(centre + effective * np.array([np.cos(angle), np.sin(angle)]))
        out.append(end)
    return np.array(out)


def rounded_contours(mask, sigma, fillet_radius=0.0, step=8.0, epsilon=0.8, simplify=1.5, fit=True):
    """Trace a mask into evenly spaced, optionally corner-rounded loops.

    The fit recovers the source's exact outline; the fillet rounds off the
    sticker's cut corners; the even resample is what keeps the emitted spline
    free of cusps, because unevenly spaced knots turn a small direction change
    into a visible kink.
    """
    traced = (
        fit_contours(mask, sigma, epsilon, simplify)
        if fit
        else smooth_contours(mask, sigma, epsilon, simplify)
    )
    loops = []
    for loop in traced:
        points = loop / FACTOR
        if fillet_radius > 0:
            points = fillet_corners(points, fillet_radius)
        loops.append(resample(points, step) * FACTOR)
    return loops


def rounded_path(mask, sigma, fillet_radius=0.0, step=8.0, epsilon=0.8, simplify=1.5, fit=True):
    return path_of(
        rounded_contours(mask, sigma, fillet_radius, step, epsilon, simplify, fit), 0.0
    )


def polygon_area(points):
    following = np.roll(points, -1, axis=0)
    return 0.5 * np.sum(
        points[:, 0] * following[:, 1] - following[:, 0] * points[:, 1]
    )


def counter_arc(contour):
    """Rebuild the a's counter as one continuous elliptical inner arc.

    The opening is close to an ellipse, so fitting the principal axes and
    scaling them to keep the traced area replaces the polygon's flats, nicks
    and squared-off lower end with a single smooth sweep of the same size.
    """
    points = contour / FACTOR
    centred = points - points.mean(axis=0)
    values, vectors = np.linalg.eigh(centred.T @ centred / len(centred))
    axes = vectors[:, np.argsort(values)[::-1]]
    local = centred @ axes
    low, high = local.min(axis=0), local.max(axis=0)
    centre = points.mean(axis=0) + axes @ ((low + high) / 2.0)
    half = (high - low) / 2.0
    scale = np.sqrt(abs(polygon_area(points)) / (np.pi * half[0] * half[1]))
    return ellipse_path(centre, axes, half * min(1.0, scale))


def ellipse_path(centre, axes, half, k=0.5523):
    """Closed ellipse from four cubic Beziers in the fitted axis frame."""
    unit_u, unit_v = axes[:, 0], axes[:, 1]
    semi_u, semi_v = half[0], half[1]
    corners = [
        centre + semi_u * unit_u,
        centre + semi_v * unit_v,
        centre - semi_u * unit_u,
        centre - semi_v * unit_v,
    ]
    tangents = [
        semi_v * unit_v,
        -semi_u * unit_u,
        -semi_v * unit_v,
        semi_u * unit_u,
    ]
    path = Bezier()
    path.move(*corners[0])
    for i in range(4):
        end = corners[(i + 1) % 4]
        path.curve(
            corners[i] + k * tangents[i], end - k * tangents[(i + 1) % 4], end
        )
    return path.close().text()


GLYPH_STEP = 8.0
GLYPH_SIGMA = 3.0


def trace_frame(document):
    """Trace the constructed frame band back into one smooth closed contour.

    The band starts as the inner ink offset by FRAME, which is smooth along
    every edge but leaves a sharp re-entrant corner wherever two offset shapes
    merge (m to @, @ to s) and a background bay between the m's right leg and
    the s. A disk closing of FRAME_CLOSE fills that bay and fillets every
    reflex corner with the same radius; the corner fillet and the arc-length
    smoothing then turn what is left of those corners into arcs, so the outer
    contour reads as one continuous sweep instead of a staircase.
    """
    band = disk_closing(shrink(render_layers(document)["silhouette"]), FRAME_CLOSE)
    loops = rounded_contours(band, FRAME_SIGMA, FRAME_FILLET, FRAME_STEP, 0.8, 1.5, fit=False)
    delta, iou = calibrate(band, loops)
    print(
        "frame  traced band IoU={:.4f} px={} (close={:.0f}px fillet={:.0f}px)".format(
            iou, band.sum().item(), FRAME_CLOSE, FRAME_FILLET
        )
    )
    return path_of(loops, delta), band


def trace_geometry(source, target):
    """Re-derive app-icon.svg from the pre-flattening artwork."""
    regions = derive_regions(source)
    at_loops = rounded_contours(regions["at"], GLYPH_SIGMA, step=GLYPH_STEP)
    at_loops.sort(key=lambda loop: abs(polygon_area(loop / FACTOR)), reverse=True)
    # The largest loop wraps the ring and the a; every smaller loop is an
    # opening, and the a's counter is re-authored so its inner arc is
    # continuous instead of a traced polygon.
    at_path = path_of(at_loops[:1], 0.0) + "".join(
        counter_arc(loop) for loop in at_loops[1:]
    )
    s_path = rounded_path(regions["s"], GLYPH_SIGMA, step=GLYPH_STEP)
    for name, mask, path_data in (("at", regions["at"], at_path), ("s", regions["s"], s_path)):
        got = raster(path_data, CANVAS)
        union = (mask | got).sum()
        iou = (mask & got).sum() / union if union else 0.0
        print(
            "{:6s} IoU={:.4f} loops={} bytes={}".format(
                name, iou, len(at_loops) if name == "at" else 1, len(path_data)
            )
        )
    frame_path, band = trace_frame(compose_document(at_path, s_path))
    document = compose_document(at_path, s_path, frame_path)
    geometry = shrink(render_layers(document)["silhouette"])
    union = (band | geometry).sum()
    iou = (band & geometry).sum() / union if union else 0.0
    print("frame  rendered-vs-traced IoU={:.4f} px={}".format(iou, geometry.sum().item()))
    Path(target).write_text(document, encoding="utf-8")
    print("wrote", target, Path(target).stat().st_size, "bytes")


def main(argv):
    try:
        if "--write" in argv:
            out = argv[argv.index("--out") + 1] if "--out" in argv else "/tmp/icon-layers"
            source = argv[argv.index("--svg") + 1] if "--svg" in argv else str(SVG)
            write_layers(source, out)
            return 0
        if "--full-icon" in argv:
            png = argv[argv.index("--full-icon") + 1]
            background = (
                argv[argv.index("--android-background") + 1]
                if "--android-background" in argv
                else None
            )
            source = argv[argv.index("--svg") + 1] if "--svg" in argv else str(SVG)
            write_full_icon(source, png, background)
            return 0
        if "--trace" in argv:
            source = argv[argv.index("--trace") + 1]
            target = argv[argv.index("--out-svg") + 1] if "--out-svg" in argv else "/tmp/app-icon.traced.svg"
            trace_geometry(source, target)
            return 0
        if "--from-art" in argv:
            print(
                "failed: --from-art is retired; app-icon.svg is the clean "
                "hand-authored geometry master",
                file=sys.stderr,
            )
            return 1
        print(__doc__)
        return 1
    except OSError as error:
        print("failed:", error, file=sys.stderr)
        return 1
    except ValueError as error:
        print("failed:", error, file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
