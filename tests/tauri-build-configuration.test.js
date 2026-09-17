const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");
const zlib = require("node:zlib");

const webRoot = path.resolve(__dirname, "../apps/web");
const routerConfigUrl = pathToFileURL(
  path.resolve(webRoot, "react-router.config.ts"),
);
const routeMetadataUrl = pathToFileURL(
  path.resolve(webRoot, "app/route-metadata.ts"),
);
const devAppUrl = pathToFileURL(path.resolve(webRoot, "scripts/dev-app.js"));

// The icon layers ship as RGBA PNGs whose shape lives in alpha. The root tests
// must not pull in an image dependency, so this decodes exactly what the icon
// pipeline writes: 8-bit RGBA, non-interlaced.
function decodePng(buffer) {
  let offset = 8;
  let width = 0;
  let height = 0;
  const chunks = [];
  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString("ascii", offset + 4, offset + 8);
    const start = offset + 8;
    if (type === "IHDR") {
      width = buffer.readUInt32BE(start);
      height = buffer.readUInt32BE(start + 4);
      assert.equal(buffer[start + 8], 8, "8-bit channels");
      assert.equal(buffer[start + 9], 6, "RGBA colour type");
      assert.equal(buffer[start + 12], 0, "not interlaced");
    } else if (type === "IDAT") {
      chunks.push(buffer.subarray(start, start + length));
    } else if (type === "IEND") {
      break;
    }
    offset = start + length + 4;
  }
  const raw = zlib.inflateSync(Buffer.concat(chunks));
  const stride = width * 4;
  const data = Buffer.alloc(height * stride);
  let previous = Buffer.alloc(stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const row = Buffer.alloc(stride);
    for (let x = 0; x < stride; x += 1) {
      const left = x >= 4 ? row[x - 4] : 0;
      const up = previous[x];
      const upLeft = x >= 4 ? previous[x - 4] : 0;
      let value = line[x];
      if (filter === 1) value += left;
      else if (filter === 2) value += up;
      else if (filter === 3) value += (left + up) >> 1;
      else if (filter === 4) {
        const estimate = left + up - upLeft;
        const a = Math.abs(estimate - left);
        const b = Math.abs(estimate - up);
        const c = Math.abs(estimate - upLeft);
        value += a <= b && a <= c ? left : b <= c ? up : upLeft;
      }
      row[x] = value & 0xff;
    }
    row.copy(data, y * stride);
    previous = row;
  }
  return { width, height, data };
}

function alphaMask(image) {
  const mask = new Uint8Array(image.width * image.height);
  for (let i = 0; i < mask.length; i += 1) {
    mask[i] = image.data[i * 4 + 3] > 127 ? 1 : 0;
  }
  return mask;
}

// Sample every cubic of a path, so contour smoothness can be measured.
function samplePath(data, perCurve = 24) {
  const numbers = data.match(/-?\d+\.?\d*/g).map(Number);
  const points = [[numbers[0], numbers[1]]];
  for (let i = 2; i + 6 <= numbers.length; i += 6) {
    const [x0, y0] = points[points.length - 1];
    const [x1, y1] = numbers.slice(i, i + 2);
    const [x2, y2] = numbers.slice(i + 2, i + 4);
    const [x3, y3] = numbers.slice(i + 4, i + 6);
    for (let k = 1; k <= perCurve; k += 1) {
      const t = k / perCurve;
      const m = 1 - t;
      points.push([
        m ** 3 * x0 + 3 * m ** 2 * t * x1 + 3 * m * t ** 2 * x2 + t ** 3 * x3,
        m ** 3 * y0 + 3 * m ** 2 * t * y1 + 3 * m * t ** 2 * y2 + t ** 3 * y3,
      ]);
    }
  }
  return points;
}

// Tightest turn per pixel of contour, in degrees. A corner rounds this out; a
// kink spikes because the direction changes within a fraction of a pixel.
function peakTurnPerPixel(points) {
  const closed = [...points, points[0]];
  let peak = 0;
  for (let i = 1; i < closed.length - 1; i += 1) {
    const incoming = [
      closed[i][0] - closed[i - 1][0],
      closed[i][1] - closed[i - 1][1],
    ];
    const outgoing = [
      closed[i + 1][0] - closed[i][0],
      closed[i + 1][1] - closed[i][1],
    ];
    const first = Math.hypot(...incoming);
    const second = Math.hypot(...outgoing);
    if (first === 0 || second === 0) continue;
    const cosine = (incoming[0] * outgoing[0] + incoming[1] * outgoing[1]) / (first * second);
    const turn = (Math.acos(Math.min(1, Math.max(-1, cosine))) * 180) / Math.PI;
    peak = Math.max(peak, turn / ((first + second) / 2));
  }
  return peak;
}

test("browser and Tauri targets keep separate servers and build outputs", async () => {
  const previousTarget = process.env.VITE_IMS_APP_TARGET;

  try {
    delete process.env.VITE_IMS_APP_TARGET;
    const webConfig = (await import(`${routerConfigUrl.href}?target=web`))
      .default;

    process.env.VITE_IMS_APP_TARGET = "app";
    const appConfig = (await import(`${routerConfigUrl.href}?target=app`))
      .default;

    assert.equal(webConfig.buildDirectory, "build");
    assert.equal(appConfig.buildDirectory, "build-app");
    assert.equal(
      path.dirname(path.resolve(webRoot, webConfig.buildDirectory)),
      path.dirname(path.resolve(webRoot, appConfig.buildDirectory)),
    );
    const { prerenderRoutesForTarget } = await import(routeMetadataUrl.href);
    assert.deepEqual(webConfig.prerender, prerenderRoutesForTarget("web"));
    assert.deepEqual(appConfig.prerender, prerenderRoutesForTarget("app"));
    assert.equal(webConfig.prerender.length, 30);
    assert.equal(appConfig.prerender.length, 28);
    assert.deepEqual(
      webConfig.prerender.filter(
        (route) => !appConfig.prerender.includes(route),
      ),
      ["/wiki/classic", "/story/classic"],
    );

    const tauriConfig = JSON.parse(
      await readFile(`${webRoot}/src-tauri/tauri.conf.json`, "utf8"),
    );
    const androidTauriConfig = JSON.parse(
      await readFile(`${webRoot}/src-tauri/tauri.android.conf.json`, "utf8"),
    );
    const iosTauriConfig = JSON.parse(
      await readFile(`${webRoot}/src-tauri/tauri.ios.conf.json`, "utf8"),
    );
    assert.equal(tauriConfig.build.frontendDist, "../build-app/client");
    assert.equal(tauriConfig.build.devUrl, "http://localhost:1420");
    assert.equal(
      tauriConfig.build.beforeDevCommand,
      "pnpm run icon:app && pnpm run dev:app",
    );
    assert.equal(
      tauriConfig.build.beforeBuildCommand,
      "pnpm run icon:app && pnpm run build:app",
    );
    assert.equal(tauriConfig.bundle.android, undefined);
    assert.equal(tauriConfig.bundle.iOS, undefined);
    assert.equal(
      androidTauriConfig.bundle.android.debugApplicationIdSuffix,
      ".debug",
    );
    // Xcode has raised its own minimum supported deployment target over
    // time; 15.0 is the floor current toolchains (local and CI) still build.
    assert.equal(iosTauriConfig.bundle.iOS.minimumSystemVersion, "15.0");
    assert.equal(iosTauriConfig.bundle.iOS.infoPlist, "Info.ios.plist");

    const capability = JSON.parse(
      await readFile(`${webRoot}/src-tauri/capabilities/default.json`, "utf8"),
    );
    const openerPermission = capability.permissions.find(
      (permission) =>
        typeof permission === "object" &&
        permission.identifier === "opener:allow-open-url",
    );
    assert.ok(openerPermission);
    const allowedUrls = openerPermission.allow.map(({ url }) => url);
    const deniedUrls = openerPermission.deny.map(({ url }) => url);
    assert.deepEqual(allowedUrls, ["*"]);
    for (const blockedUrl of ["data:*", "file:*", "javascript:*", "tauri:*"]) {
      assert.ok(deniedUrls.includes(blockedUrl));
    }

    const webIgnore = await readFile(`${webRoot}/.gitignore`, "utf8");
    assert.match(webIgnore, /^build-app$/m);

    const webPackage = JSON.parse(
      await readFile(`${webRoot}/package.json`, "utf8"),
    );
    assert.equal(
      webPackage.scripts.build,
      "VITE_IMS_APP_TARGET=web react-router build",
    );
    assert.equal(webPackage.scripts["build:app"], "node scripts/build-app.js");
    assert.equal(webPackage.scripts["dev:app"], "node scripts/dev-app.js");
    assert.equal(
      webPackage.scripts["icon:app"],
      "tauri icon src-tauri/icon-sources/app-icon.json && node scripts/canonicalize-icns.js src-tauri/icons/icon.icns && node scripts/sync-ios-app-icon.js",
    );

    const appIconManifestPath = path.resolve(
      webRoot,
      "src-tauri/icon-sources/app-icon.json",
    );
    const appIconManifest = JSON.parse(
      await readFile(appIconManifestPath, "utf8"),
    );
    assert.deepEqual(appIconManifest, {
      default: "../../public/brand/imsweb-app-icon.png",
      bg_color: "#e0e1e3",
      android_bg: "android-background.png",
      android_fg: "android-foreground.png",
      android_fg_scale: 88,
      android_monochrome: "android-monochrome.png",
    });

    for (const source of [
      appIconManifest.android_bg,
      appIconManifest.android_fg,
      appIconManifest.android_monochrome,
    ]) {
      const png = await readFile(
        path.resolve(path.dirname(appIconManifestPath), source),
      );
      assert.deepEqual(
        png.subarray(0, 8),
        Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      );
      assert.equal(png.readUInt32BE(16), 1024);
      assert.equal(png.readUInt32BE(20), 1024);
      assert.equal(png[25], 6);
    }

    assert.equal(
      webPackage.scripts.postbuild,
      "VITE_IMS_APP_TARGET=web node ../../scripts/check-classic-wiki-css-build.mjs",
    );
    assert.equal(
      webPackage.scripts.dev,
      "VITE_IMS_APP_TARGET=web react-router dev",
    );
    assert.equal(
      webPackage.scripts.preview,
      "VITE_IMS_APP_TARGET=web vite preview --host 127.0.0.1",
    );
    assert.equal(
      webPackage.scripts.typecheck,
      "VITE_IMS_APP_TARGET=web react-router typegen && tsc",
    );
    assert.equal(
      webPackage.scripts["test:unit"],
      "VITE_IMS_APP_TARGET=web vitest run",
    );
    assert.equal(
      webPackage.scripts["test:e2e"],
      "VITE_IMS_APP_TARGET=web playwright test",
    );

    const { appDevEnvironment } = await import(devAppUrl.href);
    const appEnvironment = appDevEnvironment({
      TAURI_DEV_HOST: "192.168.31.169",
      IMS_RUSTFS_API_PORT: "9010",
      IMS_RUSTFS_BUCKET: "imsweb-media-test",
    });
    assert.equal(
      appEnvironment.IMS_LOCAL_MEDIA_PROXY_ORIGIN,
      "http://127.0.0.1:9010",
    );
    assert.equal(appEnvironment.VITE_IMS_APP_TARGET, "app");
    assert.equal(
      appEnvironment.VITE_IMS_LOCAL_MEDIA_PATH_PREFIX,
      "/imsweb-media-test",
    );

    const viteConfig = await readFile(`${webRoot}/vite.config.ts`, "utf8");
    assert.match(viteConfig, /process\.env\.TAURI_DEV_HOST/);
    assert.match(viteConfig, /host: tauriDevHost/);
    assert.match(viteConfig, /IMS_LOCAL_MEDIA_PROXY_ORIGIN/);
    assert.match(
      viteConfig,
      /isAppTarget && localMediaProxyOrigin && localMediaPathPrefix\s*\?\s*{\s*\[localMediaPathPrefix\]:\s*{\s*target: localMediaProxyOrigin,\s*changeOrigin: true,/,
    );
  } finally {
    if (previousTarget === undefined) {
      delete process.env.VITE_IMS_APP_TARGET;
    } else {
      process.env.VITE_IMS_APP_TARGET = previousTarget;
    }
  }
});

// The iOS 26 Liquid Glass icon is a controlled Icon Composer document that the
// build-time sync script copies into src-tauri/gen/apple and references from
// project.pbxproj. Array order matters: ictool treats the first group and the
// first layer in a group as the topmost entry, so At must precede Wordmark and
// Outline or the glyph renders as a flat dark silhouette. The @ sits in its own
// group because the Liquid Glass parameters are group-scoped.
test("iOS Liquid Glass icon ships a layered Icon Composer document", async () => {
  const iconDirectory = path.resolve(
    webRoot,
    "src-tauri/icon-sources/ios-liquid-glass/AppIcon.icon",
  );
  const metadata = JSON.parse(
    await readFile(path.join(iconDirectory, "icon.json"), "utf8"),
  );
  assert.deepEqual(
    metadata.groups.map((group) => group.name),
    ["At", "Mark"],
  );
  const layers = metadata.groups.flatMap((group) => group.layers);
  assert.deepEqual(
    layers.map((layer) => layer.name),
    ["At", "Wordmark", "Outline"],
  );

  const at = metadata.groups[0];
  assert.equal(at.layers[0].glass, true);
  assert.equal(at.specular, true);
  assert.equal(at.lighting, "individual");
  assert.ok(at.translucency.enabled);
  // Icon Composer 2.0, which ships with Xcode 27, writes two keys that actool
  // in Xcode 26 cannot read: the top-level "features" array and a per-group
  // "refractivity" object. Archiving then fails with `Could not open
  // "AppIcon.icon"` and a nil-object exception, and the preview iOS job runs on
  // a runner image whose newest Xcode is 26.6, so either key blocks every iOS
  // preview release. Restore both once those images ship Xcode 27.
  assert.ok(!Object.hasOwn(metadata, "features"));
  assert.ok(!Object.hasOwn(at, "refractivity"));

  for (const layer of layers) {
    assert.ok(
      !Object.hasOwn(layer, "fill"),
      `${layer.name} must keep fill-specializations authoritative`,
    );
    assert.ok(Array.isArray(layer["fill-specializations"]));
    const png = await readFile(
      path.join(iconDirectory, "Assets", layer["image-name"]),
    );
    assert.deepEqual(
      png.subarray(0, 8),
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    );
    assert.equal(png.readUInt32BE(16), 1024);
    assert.equal(png.readUInt32BE(20), 1024);
    assert.equal(png[25], 6);
  }
});

test("the icon layers come from one tracked SVG geometry source", async () => {
  const sources = path.resolve(webRoot, "src-tauri/icon-sources");
  const svg = await readFile(path.join(sources, "app-icon.svg"), "utf8");

  assert.match(
    svg,
    /viewBox="0 0 1024 1024"/,
    "the SVG must stay on the 1024 canvas the layers use",
  );

  const paths = [];
  for (const chunk of svg.split("<path").slice(1)) {
    const head = chunk.split("/>", 1)[0];
    const id = /\bid="([^"]+)"/.exec(head);
    const layer = /\bdata-layer="([^"]+)"/.exec(head);
    const data = /\sd="([^"]+)"/.exec(head);
    if (id && layer && data) {
      paths.push({ id: id[1], layer: layer[1], tag: head, data: data[1] });
    }
  }
  assert.deepEqual(
    paths.map(({ id }) => id),
    ["outline-frame", "outline-at", "wordmark", "at-keyline", "at"],
    "hand-drawn primitives must stay in stacking order",
  );
  assert.deepEqual(
    paths.map(({ layer }) => layer),
    ["outline", "outline", "wordmark", "wordmark", "at"],
    "each primitive must declare the .icon layer it rasterises into",
  );
  for (const { id, data } of paths) {
    assert.match(data, /^M[\d.,-]+C/, `${id} must start with a Bezier path`);
    assert.match(data, /Z$/, `${id} must close every subpath`);
    assert.doesNotMatch(
      data,
      /[A-BD-LN-Y]/,
      `${id} must use only cubic Beziers and close commands`,
    );
  }

  const pathTag = (id) => paths.find((path) => path.id === id)?.tag ?? "";
  const pathData = (id) => paths.find((path) => path.id === id)?.data ?? "";
  const subpaths = (id) => pathData(id).split("M").slice(1);
  // The black frame is the inner ink -- the wordmark shapes plus the @ -- offset
  // by 56 px and traced back, so 28 px of black lands outside every edge. The
  // offset leaves a sharp re-entrant notch wherever two offset shapes merge, so
  // the band ships as one closed contour whose junctions are filleted.
  const frame = pathTag("outline-frame");
  assert.match(frame, /fill="#111113"/);
  assert.match(frame, /fill-rule="nonzero"/);
  assert.doesNotMatch(
    frame,
    /stroke/,
    "the frame must ship as geometry, not as a stroked outline",
  );
  assert.equal(
    subpaths("outline-frame").length,
    1,
    "the frame is one closed band with no separate hole subpath",
  );
  // Every transition on the frame's outer contour must be an arc. A kink shows
  // up as tens of degrees of turn inside a fraction of a pixel; the tightest
  // designed corner, the m's 13 px bottom radius, measures about 26 deg/px.
  const frameTurn = peakTurnPerPixel(samplePath(pathData("outline-frame")));
  assert.ok(
    frameTurn < 45,
    `frame contour must stay free of kinks, measured ${frameTurn.toFixed(1)} deg/px`,
  );
  // The a inside the @ is re-authored as one elliptical arc, so its opening is
  // a continuous sweep instead of a traced polygon with flats and nicks.
  assert.equal(
    subpaths("at").length,
    2,
    "the @ is the outer contour plus the a's counter",
  );
  assert.equal(
    (subpaths("at")[1].match(/C/g) ?? []).length,
    4,
    "the a's counter must stay a four-arc ellipse",
  );
  const outlineAt = pathTag("outline-at");
  assert.match(outlineAt, /fill="#111113"/);
  assert.match(outlineAt, /stroke-width="56"/);
  assert.match(outlineAt, /stroke-linejoin="round"/);
  assert.match(outlineAt, /stroke-linecap="round"/);
  assert.match(pathTag("wordmark"), /fill="#f6f6f8"/);
  const atKeyline = pathTag("at-keyline");
  assert.match(atKeyline, /fill="none"/);
  assert.match(atKeyline, /stroke-width="9"/);
  assert.match(pathTag("at"), /fill="#c91a1d"/);
  assert.doesNotMatch(
    svg,
    /<(?:text|image)\b/,
    "the checked-in SVG must not depend on a font or raster image",
  );

  // Android reuses the same geometry, so its monochrome layer is the
  // silhouette layer byte for byte.
  const [monochrome, outline] = await Promise.all([
    readFile(path.join(sources, "android-monochrome.png")),
    readFile(
      path.join(
        sources,
        "ios-liquid-glass/AppIcon.icon/Assets/Outline.png",
      ),
    ),
  ]);
  assert.deepEqual(monochrome, outline);
});

// The @ carries its own black edge, and the outline layer sits underneath, so
// the white would hide that edge wherever a letterform crosses it: the m's
// right leg over the ring, the s over the @'s lower right. The rasteriser cuts
// the white back from 6 px to 20 px outside the @, leaving the keyline drawn
// and the black edge visible. This measures the shipped layers rather than the
// master, because that cut is a property of the raster step.
test("the @ keeps its own black edge above the letterform white", async () => {
  const assets = path.resolve(
    webRoot,
    "src-tauri/icon-sources/ios-liquid-glass/AppIcon.icon/Assets",
  );
  const [wordmarkPng, atPng] = await Promise.all([
    readFile(path.join(assets, "Wordmark.png")),
    readFile(path.join(assets, "At.png")),
  ]);
  const wordmarkImage = decodePng(wordmarkPng);
  const atImage = decodePng(atPng);
  assert.equal(wordmarkImage.width, 1024);
  assert.equal(atImage.width, 1024);
  const wordmark = alphaMask(wordmarkImage);
  const at = alphaMask(atImage);
  const size = 1024;
  const isAt = (x, y) =>
    x >= 0 && y >= 0 && x < size && y < size && at[y * size + x] === 1;
  // Sampled disk: true when the @ reaches within `radius` of that pixel.
  const nearAt = (x, y, radius) => {
    for (let step = 0; step < 32; step += 1) {
      const angle = (step * Math.PI) / 16;
      const dx = Math.round(radius * Math.cos(angle));
      const dy = Math.round(radius * Math.sin(angle));
      if (isAt(x + dx, y + dy)) return true;
    }
    return false;
  };
  let keyline = 0;
  let covered = 0;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (wordmark[y * size + x] === 0) continue;
      if (nearAt(x, y, 6)) keyline += 1;
      else if (nearAt(x, y, 18)) covered += 1;
    }
  }
  assert.equal(
    covered,
    0,
    "wordmark white must stay out of the @'s black edge band",
  );
  assert.ok(
    keyline > 5000,
    `the @ keyline must stay drawn, measured ${keyline} px of white`,
  );
});

test("every App tab icon is bundled as a usable iOS vector asset", async () => {
  const [model, buildScript] = await Promise.all([
    readFile(`${webRoot}/app/components/app/app-tab-model.ts`, "utf8"),
    readFile(`${webRoot}/src-tauri/build.rs`, "utf8"),
  ]);
  const tabIcons = Array.from(
    model.matchAll(/lucideIcon:\s*"([^"]+)"/g),
    (match) => match[1],
  );
  const inventory = buildScript.match(
    /const LUCIDE_TAB_ICONS:\s*\[&str;\s*(\d+)\]\s*=\s*\[([\s\S]*?)\];/,
  );
  assert.ok(inventory, "iOS build must declare its bundled icon inventory");
  const bundledIcons = Array.from(
    inventory[2].matchAll(/"([^"]+)"/g),
    (match) => match[1],
  );
  assert.ok(tabIcons.length > 0, "App navigation must declare its icons");
  assert.equal(bundledIcons.length, Number(inventory[1]));
  assert.deepEqual(bundledIcons, tabIcons);
  assert.equal(new Set(bundledIcons).size, bundledIcons.length);

  const catalog = path.join(
    webRoot,
    "src-tauri/plugins/native-glass/ios/Sources/Resources/Lucide.xcassets",
  );
  for (const icon of bundledIcons) {
    const imageset = path.join(catalog, `${icon}.imageset`);
    const metadata = JSON.parse(
      await readFile(path.join(imageset, "Contents.json"), "utf8"),
    );
    assert.equal(metadata.properties["preserves-vector-representation"], true);
    const universal = metadata.images.find((image) => image.idiom === "universal");
    assert.equal(universal?.filename, `${icon}.pdf`);
    const vector = await readFile(path.join(imageset, universal.filename));
    assert.equal(vector.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.match(vector.toString("latin1"), /%%EOF\s*$/);
  }
});

// The plugin refuses the native path when any control icon is missing, so a
// typo in either the Rust inventory or a control's `icon` value silently drops
// iOS 26 back to CSS glass instead of failing loudly. This test keeps the
// inventory, the packaged vectors and the Web call sites in one agreement.
test("every native glass control icon is bundled and actually requested", async () => {
  const controlSources = [
    "app/pages/community/exchange/exchange-office-map.tsx",
    "app/pages/community/exchange/community-exchange-page.tsx",
    "app/pages/community/exchange/components/exchange-mobile-navigation.tsx",
  ];
  const [buildScript, ...sources] = await Promise.all([
    readFile(`${webRoot}/src-tauri/build.rs`, "utf8"),
    ...controlSources.map((file) => readFile(`${webRoot}/${file}`, "utf8")),
  ]);

  const inventory = buildScript.match(
    /const LUCIDE_CONTROL_ICONS:\s*\[&str;\s*(\d+)\]\s*=\s*\[([\s\S]*?)\];/,
  );
  assert.ok(inventory, "iOS build must declare its control icon inventory");
  const bundled = Array.from(
    inventory[2].matchAll(/"([^"]+)"/g),
    (match) => match[1],
  );
  assert.equal(bundled.length, Number(inventory[1]));
  assert.equal(new Set(bundled).size, bundled.length);

  // Every native control declares its icon as either a literal or a ternary
  // (`expanded ? "x" : "menu"`), so both shapes are read here. The direction
  // that matters is the silent one: an icon a control asks for but the bundle
  // does not carry turns the whole native path off with no error anywhere.
  const referenced = new Set();
  for (const source of sources) {
    for (const match of source.matchAll(
      /icon:\s*(?:"([a-z0-9-]+)"|[\s\S]{0,120}?\?\s*"([a-z0-9-]+)"\s*:\s*"([a-z0-9-]+)")/g,
    )) {
      for (const capture of match.slice(1)) {
        if (capture) referenced.add(capture);
      }
    }
  }
  // Guards the extractor itself: falling below the icon set the map controls
  // declare today means the pattern stopped matching, not that icons went away.
  assert.ok(
    referenced.size >= 9,
    `expected at least 9 native control icons, read ${referenced.size}`,
  );
  for (const icon of referenced) {
    assert.ok(
      bundled.includes(icon),
      `native control requests "${icon}" which the iOS bundle does not carry`,
    );
  }

  const catalog = path.join(
    webRoot,
    "src-tauri/plugins/native-glass/ios/Sources/Resources/Lucide.xcassets",
  );
  for (const icon of bundled) {
    const imageset = path.join(catalog, `${icon}.imageset`);
    const metadata = JSON.parse(
      await readFile(path.join(imageset, "Contents.json"), "utf8"),
    );
    assert.equal(metadata.properties["preserves-vector-representation"], true);
    const universal = metadata.images.find((image) => image.idiom === "universal");
    assert.equal(universal?.filename, `${icon}.pdf`);
    const vector = await readFile(path.join(imageset, universal.filename));
    assert.equal(vector.subarray(0, 5).toString("ascii"), "%PDF-");
    assert.match(vector.toString("latin1"), /%%EOF\s*$/);
  }
});

// The iOS bundler merges src-tauri/Info.ios.plist into the generated Xcode
// project's Info.plist, so a key lost in an edit only shows up on a device:
// without UIApplicationSceneManifest UIKit traps in
// UIApplicationEvaluateRuntimeIssueForNoSceneLifecycleAdoption before the
// WebView exists, and without NSAllowsLocalNetworking a device build cannot
// reach the private LAN backend over cleartext.
test("iOS plist keeps the device and scene declarations", async () => {
  const iosPlist = await readFile(`${webRoot}/src-tauri/Info.ios.plist`, "utf8");

  for (const key of [
    "NSAppTransportSecurity",
    "NSLocalNetworkUsageDescription",
    "UIApplicationSceneManifest",
  ]) {
    assert.ok(
      iosPlist.includes(`<key>${key}</key>`),
      `Info.ios.plist no longer declares ${key}`,
    );
  }
  assert.match(
    iosPlist,
    /<key>UIApplicationSupportsMultipleScenes<\/key>\s*<true\/>/,
  );
});

test("mobile geolocation keeps its native access narrowly scoped", async () => {
  const webPackage = JSON.parse(
    await readFile(`${webRoot}/package.json`, "utf8"),
  );
  assert.equal(
    webPackage.dependencies["@tauri-apps/plugin-geolocation"],
    "2.3.2",
  );

  const cargoManifest = await readFile(
    `${webRoot}/src-tauri/Cargo.toml`,
    "utf8",
  );
  const mobileDependenciesHeader =
    '[target.\'cfg(any(target_os = "ios", target_os = "android"))\'.dependencies]';
  const mobileDependenciesStart = cargoManifest.indexOf(
    mobileDependenciesHeader,
  );
  assert.notEqual(mobileDependenciesStart, -1);
  const nextCargoSection = cargoManifest.indexOf(
    "\n[",
    mobileDependenciesStart + mobileDependenciesHeader.length,
  );
  const mobileDependencies = cargoManifest.slice(
    mobileDependenciesStart,
    nextCargoSection === -1 ? undefined : nextCargoSection,
  );
  assert.match(mobileDependencies, /tauri-plugin-geolocation = "=2\.3\.2"/);
  assert.equal(cargoManifest.match(/tauri-plugin-geolocation/g)?.length, 1);

  const cargoLock = await readFile(`${webRoot}/src-tauri/Cargo.lock`, "utf8");
  assert.match(
    cargoLock,
    /\[\[package\]\]\s+name = "tauri-plugin-geolocation"\s+version = "2\.3\.2"/,
  );

  const rustEntry = await readFile(`${webRoot}/src-tauri/src/lib.rs`, "utf8");
  assert.match(
    rustEntry,
    /#\[cfg\(mobile\)\]\s+let builder = builder\.plugin\(tauri_plugin_geolocation::init\(\)\);/,
  );

  const capability = JSON.parse(
    await readFile(
      `${webRoot}/src-tauri/capabilities/geolocation.json`,
      "utf8",
    ),
  );
  assert.deepEqual(capability.windows, ["main"]);
  assert.deepEqual(capability.platforms, ["iOS", "android"]);
  assert.deepEqual(capability.permissions, [
    "geolocation:allow-check-permissions",
    "geolocation:allow-request-permissions",
    "geolocation:allow-get-current-position",
  ]);

  const iosPlist = await readFile(
    `${webRoot}/src-tauri/Info.ios.plist`,
    "utf8",
  );
  assert.match(
    iosPlist,
    /<key>NSLocationWhenInUseUsageDescription<\/key>\s*<string>位置仅用于在事务所地图上显示您的当前位置并将地图移回该位置。<\/string>/,
  );
});

test("Android synchronizes navigation-bar contrast through the native plugin", async () => {
  const [
    rustEntry,
    iosCapabilityText,
    androidCapabilityText,
    androidPlugin,
    systemBars,
  ] = await Promise.all([
    readFile(`${webRoot}/src-tauri/src/lib.rs`, "utf8"),
    readFile(`${webRoot}/src-tauri/capabilities/native-glass.json`, "utf8"),
    readFile(
      `${webRoot}/src-tauri/capabilities/native-glass-android.json`,
      "utf8",
    ),
    readFile(
      `${webRoot}/src-tauri/plugins/native-glass/android/src/main/java/NativeGlassPlugin.kt`,
      "utf8",
    ),
    readFile(
      `${webRoot}/src-tauri/plugins/native-glass/android/src/main/java/SystemBarAppearance.kt`,
      "utf8",
    ),
  ]);
  const iosCapability = JSON.parse(iosCapabilityText);
  const androidCapability = JSON.parse(androidCapabilityText);

  assert.match(
    rustEntry,
    /#\[cfg\(mobile\)\]\s+let builder = builder\.plugin\(tauri_plugin_native_glass::init\(\)\);/,
  );
  assert.deepEqual(iosCapability.platforms, ["iOS"]);
  assert.deepEqual(iosCapability.permissions, ["native-glass:default"]);
  assert.deepEqual(androidCapability.platforms, ["android"]);
  assert.deepEqual(androidCapability.permissions, [
    "native-glass:allow-update",
  ]);

  // Normalize whitespace so this test protects the native command and its
  // policy rather than Kotlin wrapping or indentation.
  const compact = (source) => source.replace(/\s+/g, "");
  const plugin = compact(androidPlugin);
  const policy = compact(systemBars);
  assert.ok(androidPlugin.includes("@Command"));
  assert.ok(plugin.includes("funupdate(invoke:Invoke)"));
  assert.ok(plugin.includes("valappearance=systemBarAppearance(args.dark)"));
  assert.ok(
    plugin.includes("window.navigationBarColor=appearance.navigationBarColor"),
  );
  assert.ok(
    plugin.includes(
      "isAppearanceLightNavigationBars=appearance.lightNavigationBarIcons",
    ),
  );
  assert.ok(
    plugin.includes(
      "isAppearanceLightStatusBars=appearance.lightStatusBarIcons",
    ),
  );
  assert.ok(policy.includes("sdkInt>=Build.VERSION_CODES.O"));
  assert.ok(policy.includes("sdkInt>=Build.VERSION_CODES.M"));
  assert.ok(policy.includes("LIGHT_NAVIGATION_BAR_COLOR=-131589"));
  assert.ok(policy.includes("DARK_NAVIGATION_BAR_COLOR=-15263977"));
});

// The Swift side writes prepared uploads into the iOS caches root and the Web
// side reads them back through the fs plugin, so the capability scope and the
// plugin's directory have to name the same place. They live in different
// languages and drift silently: a mismatch only shows up on device, as every
// avatar and namecard pick failing with "forbidden path".
test("native image capability reads the directory the iOS plugin writes", async () => {
  const capability = JSON.parse(
    await readFile(
      `${webRoot}/src-tauri/capabilities/native-image.json`,
      "utf8",
    ),
  );
  assert.deepEqual(capability.platforms, ["iOS"]);
  assert.ok(capability.permissions.includes("fs:allow-read-file"));

  const scope = capability.permissions.find(
    (permission) =>
      typeof permission === "object" && permission.identifier === "fs:scope",
  );
  assert.ok(scope);
  assert.deepEqual(
    scope.allow.map(({ path: allowed }) => allowed),
    ["$CACHE/native-image/**"],
  );

  // `$CACHE` is the iOS caches root. `$APPCACHE` would add the bundle
  // identifier as an extra segment that the plugin never creates.
  const plugin = await readFile(
    `${webRoot}/src-tauri/plugins/native-image/ios/Sources/NativeImagePlugin.swift`,
    "utf8",
  );
  assert.match(
    plugin,
    /urls\(for: \.cachesDirectory, in: \.userDomainMask\)\[0\]/,
  );
  assert.match(
    plugin,
    /base\.appendingPathComponent\("native-image", isDirectory: true\)/,
  );
  assert.ok(!plugin.includes("bundleIdentifier"));
});
