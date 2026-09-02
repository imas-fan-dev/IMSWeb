const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const webRoot = path.resolve(__dirname, "../apps/web");
const routerConfigUrl = pathToFileURL(
  path.resolve(webRoot, "react-router.config.ts"),
);
const devAppUrl = pathToFileURL(path.resolve(webRoot, "scripts/dev-app.js"));

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
    assert.ok(webConfig.prerender.includes("/wiki/classic"));
    assert.ok(!appConfig.prerender.includes("/wiki/classic"));

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
    assert.equal(iosTauriConfig.bundle.iOS.minimumSystemVersion, "14.0");

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
      "tauri icon src-tauri/icon-sources/app-icon.json",
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

// The Swift side writes prepared uploads into the iOS caches root and the Web
// side reads them back through the fs plugin, so the capability scope and the
// plugin's directory have to name the same place. They live in different
// languages and drift silently: a mismatch only shows up on device, as every
// avatar and namecard pick failing with "forbidden path".
test("native image capability reads the directory the iOS plugin writes", async () => {
  const capability = JSON.parse(
    await readFile(`${webRoot}/src-tauri/capabilities/native-image.json`, "utf8"),
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
  assert.match(plugin, /urls\(for: \.cachesDirectory, in: \.userDomainMask\)\[0\]/);
  assert.match(
    plugin,
    /base\.appendingPathComponent\("native-image", isDirectory: true\)/,
  );
  assert.ok(!plugin.includes("bundleIdentifier"));
});
