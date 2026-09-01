const assert = require("node:assert/strict");
const { readFile } = require("node:fs/promises");
const path = require("node:path");
const test = require("node:test");
const { pathToFileURL } = require("node:url");

const projectRoot = path.resolve(__dirname, "..");
const webRoot = path.resolve(projectRoot, "apps/web");
const appDeviceUrl = pathToFileURL(
  path.resolve(webRoot, "scripts/app-device.js"),
);
const appToolchainUrl = pathToFileURL(
  path.resolve(webRoot, "scripts/app-toolchain.js"),
);

test("device delivery parses targets, profiles, and passthrough arguments", async () => {
  const { parseAppDeviceArguments } = await import(appDeviceUrl.href);

  const iosDefaults = parseAppDeviceArguments(["ios"]);
  assert.equal(iosDefaults.platform, "ios");
  assert.equal(iosDefaults.target, "simulator");
  assert.equal(iosDefaults.profile, "debug");
  assert.equal(iosDefaults.launch, true);
  assert.equal(iosDefaults.build, true);

  const androidDefaults = parseAppDeviceArguments(["android"]);
  assert.equal(androidDefaults.target, "emulator");

  const explicit = parseAppDeviceArguments([
    "android",
    "--target",
    "device",
    "--release",
    "--device",
    "00152155M000372",
    "--no-launch",
    "--skip-build",
    "--",
    "--verbose",
  ]);
  assert.equal(explicit.target, "device");
  assert.equal(explicit.profile, "release");
  assert.equal(explicit.device, "00152155M000372");
  assert.equal(explicit.launch, false);
  assert.equal(explicit.build, false);
  assert.deepEqual(explicit.passthrough, ["--verbose"]);

  // A bare --host asks the launcher to detect a private LAN address.
  assert.equal(parseAppDeviceArguments(["ios", "--live", "--host"]).host, "auto");

  // `pnpm run app -- ios ...` forwards the separator; it is not passthrough.
  const viaPnpmSeparator = parseAppDeviceArguments([
    "--",
    "ios",
    "--target",
    "device",
  ]);
  assert.equal(viaPnpmSeparator.command, "ios");
  assert.equal(viaPnpmSeparator.target, "device");
  assert.deepEqual(viaPnpmSeparator.passthrough, []);

  assert.equal(
    parseAppDeviceArguments(["ios", "--live", "--host", "192.168.31.169"]).host,
    "192.168.31.169",
  );

  assert.throws(
    () => parseAppDeviceArguments(["ios", "--target", "emulator"]),
    /--target/,
  );
  assert.throws(
    () => parseAppDeviceArguments(["android", "--target", "simulator"]),
    /--target/,
  );
  assert.throws(
    () => parseAppDeviceArguments(["ios", "--profile", "beta"]),
    /--profile/,
  );
  assert.throws(() => parseAppDeviceArguments(["ios", "--nope"]), /--nope/);
});

test("build arguments and identifiers match the Tauri and Gradle contracts", async () => {
  const {
    ANDROID_ABI_TARGETS,
    androidApplicationId,
    androidBuildArguments,
    iosBuildArguments,
    iosSimulatorRustTarget,
  } = await import(appDeviceUrl.href);

  const tauriConfig = JSON.parse(
    await readFile(`${webRoot}/src-tauri/tauri.conf.json`, "utf8"),
  );
  const androidConfig = JSON.parse(
    await readFile(`${webRoot}/src-tauri/tauri.android.conf.json`, "utf8"),
  );
  const debugSuffix = androidConfig.bundle.android.debugApplicationIdSuffix;

  // Tauri sanitizes "-" into "_" when it generates the Android package name.
  assert.equal(
    androidApplicationId(
      { identifier: tauriConfig.identifier, debugSuffix },
      "release",
    ),
    tauriConfig.identifier.replace(/-/g, "_"),
  );
  assert.equal(
    androidApplicationId(
      { identifier: tauriConfig.identifier, debugSuffix },
      "debug",
    ),
    `${tauriConfig.identifier.replace(/-/g, "_")}${debugSuffix}`,
  );

  assert.deepEqual(ANDROID_ABI_TARGETS["arm64-v8a"], {
    tauriTarget: "aarch64",
    flavor: "arm64",
  });
  assert.deepEqual(ANDROID_ABI_TARGETS["armeabi-v7a"], {
    tauriTarget: "armv7",
    flavor: "arm",
  });

  assert.deepEqual(
    androidBuildArguments({ tauriTarget: "aarch64", profile: "debug" }),
    ["android", "build", "--apk", "--target", "aarch64", "--debug"],
  );
  assert.deepEqual(
    androidBuildArguments({ tauriTarget: "aarch64", profile: "release" }),
    ["android", "build", "--apk", "--target", "aarch64"],
  );

  // Simulator slices are not archived, so they never take an export method.
  assert.deepEqual(
    iosBuildArguments({
      target: "aarch64-sim",
      profile: "debug",
      exportMethod: "debugging",
    }),
    ["ios", "build", "--target", "aarch64-sim", "--debug"],
  );
  assert.deepEqual(
    iosBuildArguments({
      target: "aarch64",
      profile: "release",
      exportMethod: "debugging",
    }),
    ["ios", "build", "--target", "aarch64", "--export-method", "debugging"],
  );

  assert.equal(iosSimulatorRustTarget("arm64"), "aarch64-sim");
  assert.equal(iosSimulatorRustTarget("x64"), "x86_64");
});

test("target selection prefers running targets and rejects ambiguity", async () => {
  const { selectTarget } = await import(appDeviceUrl.href);

  const simulators = [
    { name: "iPhone 17 Pro", identifier: "AAA", state: "Shutdown" },
    { name: "iPhone 17", identifier: "BBB", state: "Booted" },
  ];
  const prefer = (candidate) => candidate.state === "Booted";

  assert.equal(
    selectTarget(simulators, "", { kind: "iOS 模拟器", prefer }).identifier,
    "BBB",
  );
  assert.equal(
    selectTarget(simulators, "AAA", { kind: "iOS 模拟器", prefer }).identifier,
    "AAA",
  );
  assert.equal(
    selectTarget(simulators, "17 pro", { kind: "iOS 模拟器", prefer })
      .identifier,
    "AAA",
  );

  assert.throws(
    () => selectTarget(simulators, "Pixel", { kind: "iOS 模拟器", prefer }),
    /Pixel/,
  );
  assert.throws(() => selectTarget([], "", { kind: "iOS 真机" }), /没有可用/);
  assert.throws(
    () =>
      selectTarget(
        [
          { name: "iPad", identifier: "A" },
          { name: "iPhone", identifier: "B" },
        ],
        "",
        { kind: "iOS 真机" },
      ),
    /--device/,
  );
});

test("prerequisite report groups checks and surfaces blocking failures", async () => {
  const {
    collectPrerequisites,
    formatPrerequisiteReport,
    prerequisiteFailures,
    MINIMUM_GRADLE_JAVA_MAJOR,
    MAXIMUM_GRADLE_JAVA_MAJOR,
  } = await import(appToolchainUrl.href);

  assert.ok(MINIMUM_GRADLE_JAVA_MAJOR <= MAXIMUM_GRADLE_JAVA_MAJOR);

  const groups = collectPrerequisites({
    platform: "android",
    workspaceRoot: webRoot,
    environment: { PATH: "", HOME: "" },
  });
  const labels = groups.map((group) => group.label);
  assert.deepEqual(labels, ["通用", "Android"]);

  // An empty environment cannot satisfy the Android SDK contract.
  const failures = prerequisiteFailures(groups);
  assert.ok(failures.some((failure) => failure.includes("Android SDK")));

  const report = formatPrerequisiteReport(groups);
  assert.match(report, /\[Android\]/);
  assert.match(report, /ANDROID_HOME/);

  const statuses = groups.flatMap(({ checks }) =>
    checks.map((entry) => entry.status),
  );
  for (const status of statuses) {
    assert.ok(["ok", "warn", "fail"].includes(status));
  }

  const iosOnly = collectPrerequisites({
    platform: "ios",
    workspaceRoot: webRoot,
    environment: { PATH: "", HOME: "" },
  });
  assert.deepEqual(
    iosOnly.map((group) => group.label),
    ["通用", "iOS"],
  );
});

test("device delivery keeps one argument-driven entry per workspace", async () => {
  const webPackage = JSON.parse(
    await readFile(`${webRoot}/package.json`, "utf8"),
  );
  const rootPackage = JSON.parse(
    await readFile(`${projectRoot}/package.json`, "utf8"),
  );

  assert.equal(webPackage.scripts.app, "node scripts/app-device.js");
  assert.equal(
    webPackage.scripts["app:doctor"],
    "node scripts/app-device.js doctor",
  );
  assert.equal(rootPackage.scripts.app, "pnpm --filter @imsweb/web run app");
  assert.equal(
    rootPackage.scripts["app:doctor"],
    "pnpm --filter @imsweb/web run app:doctor",
  );

  // Target, profile, and device selection stay flags rather than new scripts,
  // so the bounded script surface in tests/test_workspace_boundaries.py holds.
  const appScripts = (scripts) =>
    Object.keys(scripts).filter((name) => name === "app" || name.startsWith("app:"));
  assert.deepEqual(appScripts(webPackage.scripts), ["app", "app:doctor"]);
  assert.deepEqual(appScripts(rootPackage.scripts), ["app", "app:doctor"]);

  assert.match(rootPackage.scripts["test:infra"], /tauri-device-delivery\.test\.js/);
});

test("device delivery documentation is registered and linked", async () => {
  const documentPath = "docs/development/app-device-delivery.md";
  const document = await readFile(
    path.resolve(projectRoot, documentPath),
    "utf8",
  );

  assert.match(document, /^# .+/m);
  assert.match(document, /^> 文档类型：开发/m);
  assert.match(document, /^> 状态：Active/m);
  assert.match(document, /^> 权威来源：/m);
  assert.match(document, /pnpm run app:doctor/);
  assert.match(document, /pnpm run app ios --target device --release/);
  assert.match(document, /pnpm run app android --target device --release/);

  const index = await readFile(
    path.resolve(projectRoot, "docs/README.md"),
    "utf8",
  );
  assert.ok(index.includes("development/app-device-delivery.md"));

  const tauriDocument = await readFile(
    path.resolve(projectRoot, "docs/development/tauri-mobile.md"),
    "utf8",
  );
  assert.ok(tauriDocument.includes("app-device-delivery.md"));

  const webRules = await readFile(path.resolve(webRoot, ".rules"), "utf8");
  assert.ok(webRules.includes("app-device.js"));
});
