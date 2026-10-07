#!/usr/bin/env node

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import {
  access,
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  statfs,
  symlink,
  unlink,
  writeFile,
} from "node:fs/promises";
import { arch, platform } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";

export const DEFAULT_OPENFREEMAP_VERSION = "20260816_080001_pt";
export const MAX_ZOOM = 11;
export const PMTILES_CLI_VERSION = "1.31.2";

const repositoryRoot = resolve(
  fileURLToPath(new URL("../..", import.meta.url)),
);
const mapDataRoot = join(repositoryRoot, "data/maps");
const openFreeMapOrigin = "https://tiles.openfreemap.org";
const minimumFreeBytes = 12 * 1024 ** 3;
const glyphFonts = ["Noto Sans Bold", "Noto Sans Italic", "Noto Sans Regular"];
const spriteNames = ["ofm.json", "ofm.png", "ofm@2x.json", "ofm@2x.png"];

const pmtilesToolAssets = {
  "darwin-arm64": {
    archive: "go-pmtiles-1.31.2_Darwin_arm64.zip",
    sha256: "40528f7f616fcbf91207cd48c8fc023d213f6d86c0cbf1f748732803d1880f3d",
    type: "zip",
  },
  "darwin-x64": {
    archive: "go-pmtiles-1.31.2_Darwin_x86_64.zip",
    sha256: "1f0dc02eee6c58312dd6c509faee1b5c32f0596568af1bf51f1b034e7a88a65b",
    type: "zip",
  },
  "linux-arm64": {
    archive: "go-pmtiles_1.31.2_Linux_arm64.tar.gz",
    sha256: "f8bd47e7ea866863489cad588fbaf2f31f42e5821f7a03f009b3769f05801cb1",
    type: "tar.gz",
  },
  "linux-x64": {
    archive: "go-pmtiles_1.31.2_Linux_x86_64.tar.gz",
    sha256: "3ed7dbf4ec2e6dfe5e25b6f70d1ffc932729f93c86db353bf514dd71010a312f",
    type: "tar.gz",
  },
};

function usage() {
  return `Usage: node scripts/maps/prepare-exchange-map.mjs [options]

Options:
  --apply                 Download and prepare the release (default is dry-run)
  --activate              Atomically point data/maps/current at the release
  --version <snapshot>    OpenFreeMap snapshot (default: ${DEFAULT_OPENFREEMAP_VERSION})
  --concurrency <count>   Concurrent companion-asset downloads (default: 8)
  --pmtiles-bin <path>    Use an existing pmtiles ${PMTILES_CLI_VERSION} binary
  --help                  Show this help
`;
}

export function parseArguments(argumentsList) {
  const options = {
    activate: false,
    apply: false,
    concurrency: 8,
    pmtilesBin: undefined,
    version: DEFAULT_OPENFREEMAP_VERSION,
  };
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (argument === "--apply") options.apply = true;
    else if (argument === "--activate") options.activate = true;
    else if (argument === "--help") return { ...options, help: true };
    else if (argument === "--version") options.version = argumentsList[++index];
    else if (argument === "--concurrency") {
      options.concurrency = Number(argumentsList[++index]);
    } else if (argument === "--pmtiles-bin") {
      options.pmtilesBin = argumentsList[++index];
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }

  if (!/^\d{8}_\d{6}_pt$/.test(options.version ?? "")) {
    throw new Error(
      "--version must use OpenFreeMap's YYYYMMDD_HHMMSS_pt format",
    );
  }
  if (
    !Number.isSafeInteger(options.concurrency) ||
    options.concurrency < 1 ||
    options.concurrency > 32
  ) {
    throw new Error("--concurrency must be an integer from 1 to 32");
  }
  if (options.activate && !options.apply) {
    throw new Error("--activate requires --apply");
  }
  return options;
}

export function buildResourcePlan(version = DEFAULT_OPENFREEMAP_VERSION) {
  const releaseName = `openfreemap-${version}-z0-${MAX_ZOOM}`;
  const releaseDir = join(mapDataRoot, "releases", releaseName);
  const archiveSource = `https://btrfs.openfreemap.com/areas/planet/${version}/tiles.pmtiles`;
  const resources = [];

  for (const name of spriteNames) {
    resources.push({
      kind: "sprite",
      contentType: name.endsWith(".json") ? "application/json" : "image/png",
      destination: join("sprites", name),
      url: `${openFreeMapOrigin}/sprites/ofm_f384/${name}`,
    });
  }
  for (const font of glyphFonts) {
    for (let start = 0; start <= 65_535; start += 256) {
      const range = `${start}-${start + 255}`;
      resources.push({
        kind: "glyph",
        contentType: "application/x-protobuf",
        destination: join("fonts", font, `${range}.pbf`),
        url: `${openFreeMapOrigin}/fonts/${encodeURIComponent(font)}/${range}.pbf`,
      });
    }
  }
  for (let zoom = 0; zoom <= 6; zoom += 1) {
    const width = 2 ** zoom;
    for (let x = 0; x < width; x += 1) {
      for (let y = 0; y < width; y += 1) {
        resources.push({
          kind: "natural-earth",
          contentType: "image/png",
          destination: join(
            "natural-earth",
            String(zoom),
            String(x),
            `${y}.png`,
          ),
          url: `${openFreeMapOrigin}/natural_earth/ne2sr/${zoom}/${x}/${y}.png`,
        });
      }
    }
  }

  return {
    archiveName: "openfreemap-z0-11.pmtiles",
    archiveSource,
    currentLink: join(mapDataRoot, "current"),
    releaseDir,
    releaseName,
    resources,
    stagingDir: join(mapDataRoot, `.staging-${releaseName}`),
    version,
  };
}

async function sha256(path) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function validDownloadedFile(path, contentType) {
  try {
    const metadata = await stat(path);
    if (!metadata.isFile() || metadata.size === 0) return false;
    if (contentType === "application/json") {
      JSON.parse(await readFile(path, "utf8"));
      return true;
    }

    const handle = await open(path, "r");
    try {
      const header = Buffer.alloc(8);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      if (contentType === "image/png") {
        return (
          bytesRead === 8 &&
          header.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        );
      }
      if (contentType === "application/x-protobuf") {
        return (
          bytesRead > 0 && !["<", "{"].includes(String.fromCharCode(header[0]))
        );
      }
      return true;
    } finally {
      await handle.close();
    }
  } catch {
    return false;
  }
}

async function download(url, destination, contentType) {
  if (await validDownloadedFile(destination, contentType)) return false;
  await rm(destination, { force: true });

  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.partial`;
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "IMSWeb map asset preparation" },
      });
      if (!response.ok || !response.body) {
        throw new Error(`${response.status} ${response.statusText}`);
      }
      const responseType = response.headers
        .get("content-type")
        ?.split(";", 1)[0];
      if (contentType && responseType !== contentType) {
        throw new Error(
          `Expected ${contentType}, received ${responseType ?? "no content type"}`,
        );
      }
      await pipeline(
        Readable.fromWeb(response.body),
        createWriteStream(temporary, { flags: "w" }),
      );
      if (!(await validDownloadedFile(temporary, contentType))) {
        throw new Error("Downloaded file failed format validation");
      }
      await rename(temporary, destination);
      return true;
    } catch (error) {
      lastError = error;
      await rm(temporary, { force: true });
      if (attempt < 3)
        await new Promise((done) => setTimeout(done, attempt * 500));
    }
  }
  throw new Error(`Failed to download ${url}: ${lastError}`);
}

function run(command, argumentsList, options = {}) {
  const result = spawnSync(command, argumentsList, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: options.capture ? "utf8" : undefined,
    stdio: options.capture ? "pipe" : "inherit",
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`${command} exited with status ${result.status}`);
  }
  return options.capture ? `${result.stdout ?? ""}${result.stderr ?? ""}` : "";
}

async function findPmtilesBinary(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      const nested = await findPmtilesBinary(path);
      if (nested) return nested;
    } else if (entry.isFile() && entry.name === "pmtiles") {
      return path;
    }
  }
  return undefined;
}

async function ensurePmtilesBinary(override) {
  const binary = override ? resolve(override) : undefined;
  if (binary) {
    await access(binary);
    const version = run(binary, ["version"], { capture: true });
    if (!version.includes(PMTILES_CLI_VERSION)) {
      throw new Error(
        `Expected pmtiles ${PMTILES_CLI_VERSION}, received: ${version.trim()}`,
      );
    }
    return binary;
  }

  const key = `${platform()}-${arch()}`;
  const asset = pmtilesToolAssets[key];
  if (!asset) throw new Error(`Unsupported pmtiles CLI platform: ${key}`);

  const toolDir = join(
    mapDataRoot,
    "tools",
    `pmtiles-${PMTILES_CLI_VERSION}-${key}`,
  );
  const existing = await findPmtilesBinary(toolDir).catch(() => undefined);
  if (existing) return existing;

  await mkdir(toolDir, { recursive: true });
  const archivePath = join(toolDir, asset.archive);
  const downloadUrl = `https://github.com/protomaps/go-pmtiles/releases/download/v${PMTILES_CLI_VERSION}/${asset.archive}`;
  let actualHash = "";
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    await download(downloadUrl, archivePath);
    actualHash = await sha256(archivePath);
    if (actualHash === asset.sha256) break;
    await rm(archivePath, { force: true });
  }
  if (actualHash !== asset.sha256) {
    throw new Error(
      `pmtiles CLI checksum mismatch after retry: expected ${asset.sha256}, received ${actualHash}`,
    );
  }

  if (asset.type === "zip") run("unzip", ["-q", archivePath, "-d", toolDir]);
  else run("tar", ["-xzf", archivePath, "-C", toolDir]);
  const extracted = await findPmtilesBinary(toolDir);
  if (!extracted)
    throw new Error(`No pmtiles binary found in ${asset.archive}`);
  await chmod(extracted, 0o755);
  const version = run(extracted, ["version"], { capture: true });
  if (!version.includes(PMTILES_CLI_VERSION)) {
    throw new Error(`Downloaded unexpected pmtiles version: ${version.trim()}`);
  }
  return extracted;
}

async function checkFreeSpace() {
  await mkdir(mapDataRoot, { recursive: true });
  const filesystem = await statfs(mapDataRoot);
  const available = Number(filesystem.bavail) * Number(filesystem.bsize);
  if (available < minimumFreeBytes) {
    throw new Error(
      `At least 12 GiB free is required; only ${(available / 1024 ** 3).toFixed(2)} GiB is available`,
    );
  }
}

function isVerifiedArchive(pmtilesBinary, path) {
  try {
    run(pmtilesBinary, ["verify", path], { capture: true });
    return true;
  } catch {
    return false;
  }
}

async function prepareArchive(plan, pmtilesBinary) {
  const finalPath = join(plan.stagingDir, plan.archiveName);
  if (isVerifiedArchive(pmtilesBinary, finalPath)) return finalPath;
  await rm(finalPath, { force: true });

  const partialPath = `${finalPath}.partial.pmtiles`;
  if (isVerifiedArchive(pmtilesBinary, partialPath)) {
    await rename(partialPath, finalPath);
    return finalPath;
  }
  // go-pmtiles extract cannot resume an incomplete output archive.
  await rm(partialPath, { force: true });
  run(pmtilesBinary, [
    "extract",
    plan.archiveSource,
    partialPath,
    `--maxzoom=${MAX_ZOOM}`,
    "--download-threads=4",
  ]);
  run(pmtilesBinary, ["verify", partialPath]);
  await rename(partialPath, finalPath);
  return finalPath;
}

async function downloadResources(resources, destinationRoot, concurrency) {
  let nextIndex = 0;
  let downloaded = 0;

  async function downloadWorker() {
    while (nextIndex < resources.length) {
      const index = nextIndex;
      nextIndex += 1;
      const resource = resources[index];
      if (
        await download(
          resource.url,
          join(destinationRoot, resource.destination),
          resource.contentType,
        )
      ) {
        downloaded += 1;
      }
      const completed = index + 1;
      if (completed % 250 === 0 || completed === resources.length) {
        console.log(`Companion assets: ${completed}/${resources.length}`);
      }
    }
  }

  const workers = Array.from({ length: concurrency }, () => downloadWorker());
  await Promise.all(workers);
  return downloaded;
}

async function activateRelease(plan) {
  const temporaryLink = `${plan.currentLink}.next-${process.pid}`;
  await rm(temporaryLink, { force: true });
  await symlink(join("releases", plan.releaseName), temporaryLink);
  try {
    await rename(temporaryLink, plan.currentLink);
  } catch (error) {
    if (error?.code !== "EEXIST") throw error;
    await unlink(plan.currentLink);
    await rename(temporaryLink, plan.currentLink);
  }
  console.log(
    `Activated ${plan.currentLink} -> ${relative(mapDataRoot, plan.releaseDir)}`,
  );
}

async function releaseExists(path) {
  try {
    const metadata = await lstat(path);
    return metadata.isDirectory();
  } catch {
    return false;
  }
}

async function readReleaseManifest(path) {
  try {
    const content = await readFile(path, "utf8");
    return JSON.parse(content);
  } catch (error) {
    throw new Error(`Cannot read exchange map release manifest: ${path}`, {
      cause: error,
    });
  }
}

export async function main(argumentsList = process.argv.slice(2)) {
  const options = parseArguments(argumentsList);
  if (options.help) {
    console.log(usage());
    return;
  }
  const plan = buildResourcePlan(options.version);
  const counts = Object.groupBy(plan.resources, ({ kind }) => kind);
  const count = (kind) => counts[kind]?.length ?? 0;

  console.log(`OpenFreeMap snapshot: ${plan.version}`);
  console.log(`Remote archive: ${plan.archiveSource}`);
  console.log(`Output release: ${plan.releaseDir}`);
  console.log(`PMTiles zoom: z0-${MAX_ZOOM} (measured about 7.92 GiB)`);
  console.log(
    `Companions: ${plan.resources.length} total (${count("sprite")} sprite, ${count("glyph")} glyph, ${count("natural-earth")} Natural Earth files)`,
  );
  if (!options.apply) {
    console.log(
      "Dry-run only. Add --apply to download; add --activate to switch data/maps/current.",
    );
    return;
  }

  await checkFreeSpace();
  if (await releaseExists(plan.releaseDir)) {
    const manifest = await readReleaseManifest(
      join(plan.releaseDir, "manifest.json"),
    );
    if (
      manifest.openFreeMapVersion !== plan.version ||
      manifest.maxZoom !== MAX_ZOOM
    ) {
      throw new Error(
        `Existing release manifest does not match ${plan.releaseName}`,
      );
    }
    console.log(`Release already prepared: ${plan.releaseDir}`);
    if (options.activate) await activateRelease(plan);
    return;
  }

  await mkdir(plan.stagingDir, { recursive: true });
  const pmtilesBinary = await ensurePmtilesBinary(options.pmtilesBin);
  const archivePath = await prepareArchive(plan, pmtilesBinary);
  const downloaded = await downloadResources(
    plan.resources,
    plan.stagingDir,
    options.concurrency,
  );
  const archiveStat = await stat(archivePath);
  const manifest = {
    schemaVersion: 1,
    openFreeMapVersion: plan.version,
    maxZoom: MAX_ZOOM,
    archive: {
      file: plan.archiveName,
      source: plan.archiveSource,
      bytes: archiveStat.size,
      sha256: await sha256(archivePath),
    },
    companionAssets: {
      total: plan.resources.length,
      sprites: count("sprite"),
      glyphs: count("glyph"),
      naturalEarthTiles: count("natural-earth"),
      downloadedThisRun: downloaded,
    },
    attribution:
      "OpenFreeMap; © OpenMapTiles; Data from OpenStreetMap (https://www.openstreetmap.org/copyright)",
  };
  await writeFile(
    join(plan.stagingDir, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await mkdir(dirname(plan.releaseDir), { recursive: true });
  await rename(plan.stagingDir, plan.releaseDir);
  console.log(`Prepared release: ${plan.releaseDir}`);
  if (options.activate) await activateRelease(plan);
}

const isMain =
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
