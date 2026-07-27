# Asset Provenance

Public assets added to `apps/web/public/` must record their source and purpose.

## About page

Imported from the public IMSWeb site on 2026-07-25 to preserve the established
art direction of `https://idol-master.top/About.html`.

| Local asset | Original source | Purpose |
| --- | --- | --- |
| `brand/about/gakuen-arisa.png` | `https://idol-master.top/assets/images/Production/GakuenAsari.png` | About-page full-body character artwork |
| `brand/about/staff/iris-radio-p.webp` | `https://idol-master.top/assets/images/Creator/ywsyj.webp` | Staff avatar |
| `brand/about/staff/edge-of-dream.webp` | `https://idol-master.top/assets/images/Creator/mxzb.webp` | Staff avatar |
| `brand/about/staff/tata.jpg` | `https://idol-master.top/assets/images/Creator/TaTa.jpg` | Staff avatar |
| `brand/about/staff/album-hnn-kaori.webp` | `https://idol-master.top/assets/images/Creator/xiangbu.webp` | Staff avatar |
| `brand/about/staff/asahikari.webp` | `https://idol-master.top/assets/images/Creator/asahikari.webp` | Staff avatar |
| `brand/about/staff/rainbow-notes.webp` | `https://idol-master.top/assets/images/Creator/hongsebiji.webp` | Staff avatar |
| `brand/about/staff/sakuragaoka-unnamed.webp` | `https://idol-master.top/assets/images/Creator/yingqiuwuming.webp` | Staff avatar |

## Series introductions

The six character illustrations and the `IrisIdol.ttf` display font used by the
series introduction pages are imported from the current public legacy site with
`pnpm run media:brand-assets:sync`. The command stages source files under the
ignored `data/migration/legacy-brand-assets/` directory and writes them through
the object-storage state machine under `brand/works/` and `brand/fonts/`; the
binary files are not committed to `apps/web/public/`.

| Object storage asset | Original source | Purpose |
| --- | --- | --- |
| `brand/works/765/character.png` | `https://idol-master.top/assets/images/Production/765Haruka.png` | 765PRO ALLSTARS series introduction |
| `brand/works/cg/character.png` | `https://idol-master.top/assets/images/Production/346Uzuki.png` | CINDERELLA GIRLS series introduction |
| `brand/works/ml/character.png` | `https://idol-master.top/assets/images/Production/765Mirai.png` | MILLION LIVE! series introduction |
| `brand/works/sidem/character.png` | `https://idol-master.top/assets/images/Production/315Teru.png` | SideM series introduction |
| `brand/works/sc/character.png` | `https://idol-master.top/assets/images/Production/283Mano.png` | SHINY COLORS series introduction |
| `brand/works/gakuen/character.png` | `https://idol-master.top/assets/images/Production/GakuenSaki.png` | Gakuen Idolmaster series introduction |
| `brand/fonts/iris-idol.ttf` | `https://idol-master.top/assets/font/IrisIdol.ttf` | Series title display font |

## Producer map

The administrative boundary is a versioned client-side resource. Community
names, regional descriptions, contact details, links, visibility, and ordering
are stored separately through the Producer Map API and are not embedded in the
GeoJSON.

Province images and community images are imported from the current public
legacy page with `pnpm run media:producer-map:sync`. The command is read-only by
default; `--apply` requires exact source and bucket confirmations. Downloaded
media is staged under ignored `data/migration/legacy-producer-map/`, then stored
under `community/producer-map/assets/` in object storage. Historical media is
not committed to `apps/web/public/`.

| Local asset | Original source | Purpose |
| --- | --- | --- |
| `maps/china-provinces.json` | `https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json` (retrieved 2026-07-26; source linked by the public legacy page) | Province-level boundaries for the interactive Producer Map; the source's `100000_JD` inset and Hainan's remote South China Sea island polygons are intentionally omitted from the visual display |
