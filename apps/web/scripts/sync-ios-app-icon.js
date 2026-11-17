import {
  chmodSync,
  cpSync,
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { dirname, join, resolve } from "node:path"
import process from "node:process"
import { fileURLToPath, pathToFileURL } from "node:url"

const APP_ICON_DIRECTORY_NAME = "AppIcon.icon"
const APPLE_PROJECT_DIRECTORY = "src-tauri/gen/apple"
const XCODE_PROJECT_RELATIVE_PATH = "imsweb.xcodeproj/project.pbxproj"
const CONTROLLED_ICON_DIRECTORY = "src-tauri/icon-sources/ios-liquid-glass"
const REQUIRED_BUILD_SETTING = "ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon;"
const FILE_REFERENCE_COMMENT = APP_ICON_DIRECTORY_NAME
const BUILD_FILE_COMMENT = `${APP_ICON_DIRECTORY_NAME} in Resources`
const WIRED_MARKER = `/* ${BUILD_FILE_COMMENT} */`

const PBX_BUILD_FILE_SECTION = "/* Begin PBXBuildFile section */\n"
const PBX_FILE_REFERENCE_SECTION = "/* Begin PBXFileReference section */\n"
const PBX_RESOURCES_PHASE_ANCHOR =
  "isa = PBXResourcesBuildPhase;\n\t\t\tbuildActionMask = 2147483647;\n\t\t\tfiles = (\n"

function defaultWebRoot() {
  return resolve(dirname(fileURLToPath(import.meta.url)), "..")
}

function fnv1a(value) {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

export function deterministicObjectId(seed) {
  let value = ""
  for (let salt = 0; salt < 3; salt += 1) {
    value += fnv1a(`${salt}:${seed}`).toString(16).padStart(8, "0")
  }
  return value.toUpperCase()
}

function chooseObjectId(seed, projectText, taken) {
  for (let attempt = 0; attempt < 1000; attempt += 1) {
    const candidate = deterministicObjectId(
      attempt === 0 ? seed : `${seed}#${attempt}`
    )
    if (!projectText.includes(candidate) && !taken.has(candidate)) {
      return candidate
    }
  }
  throw new Error(`Unable to derive a free Xcode object id for ${seed}`)
}

// The Xcode project is a text format with fixed indentation, so wiring the
// icon means inserting a handful of lines around known section markers. The
// marker for "already wired" is the Resources build-file comment: whenever the
// build file line is present, the file reference and both list entries were
// written in the same pass.
export function wireAppIconIntoProject(projectText) {
  if (!projectText.includes(REQUIRED_BUILD_SETTING)) {
    throw new Error(
      `Xcode project is missing "${REQUIRED_BUILD_SETTING}"`
    )
  }
  if (projectText.includes(WIRED_MARKER)) {
    return projectText
  }

  const fileReferenceId = chooseObjectId(
    "imsweb:AppIcon.icon:file-reference",
    projectText,
    new Set()
  )
  const buildFileId = chooseObjectId(
    "imsweb:AppIcon.icon:build-file",
    projectText,
    new Set([fileReferenceId])
  )

  const fileReferenceLine =
    `\t\t${fileReferenceId} /* ${FILE_REFERENCE_COMMENT} */ = ` +
    `{isa = PBXFileReference; lastKnownFileType = folder.icon; ` +
    `path = ${APP_ICON_DIRECTORY_NAME}; sourceTree = "<group>"; };`
  const buildFileLine =
    `\t\t${buildFileId} /* ${BUILD_FILE_COMMENT} */ = ` +
    `{isa = PBXBuildFile; fileRef = ${fileReferenceId} /* ${FILE_REFERENCE_COMMENT} */; };`
  const groupChildLine = `\t\t\t\t${fileReferenceId} /* ${FILE_REFERENCE_COMMENT} */,`
  const resourceLine = `\t\t\t\t${buildFileId} /* ${BUILD_FILE_COMMENT} */,`

  let output = insertAfter(
    projectText,
    PBX_BUILD_FILE_SECTION,
    `${buildFileLine}\n`
  )
  output = insertAfter(
    output,
    PBX_FILE_REFERENCE_SECTION,
    `${fileReferenceLine}\n`
  )

  const mainGroupMatch = output.match(/mainGroup = ([0-9A-Fa-f]{24});/)
  if (!mainGroupMatch) {
    throw new Error("Xcode project has no mainGroup reference")
  }
  const mainGroupAnchor =
    `${mainGroupMatch[1]} = {\n` +
    "\t\t\tisa = PBXGroup;\n" +
    "\t\t\tchildren = (\n"
  output = insertAfter(output, mainGroupAnchor, `${groupChildLine}\n`)
  output = insertAfter(output, PBX_RESOURCES_PHASE_ANCHOR, `${resourceLine}\n`)

  return output
}

function insertAfter(text, anchor, insertion) {
  const index = text.indexOf(anchor)
  if (index === -1) {
    throw new Error(
      `Xcode project is missing expected anchor: ${anchor.split("\n")[0]}`
    )
  }
  const offset = index + anchor.length
  return `${text.slice(0, offset)}${insertion}${text.slice(offset)}`
}

export function patchProjectFile(projectPath) {
  const source = readFileSync(projectPath, "utf8")
  const patched = wireAppIconIntoProject(source)
  if (patched === source) return false

  const mode = statSync(projectPath).mode & 0o777
  const temporaryPath = `${projectPath}.${process.pid}.tmp`
  try {
    writeFileSync(temporaryPath, patched, { flag: "wx", mode })
    chmodSync(temporaryPath, mode)
    renameSync(temporaryPath, projectPath)
  } finally {
    rmSync(temporaryPath, { force: true })
  }
  return true
}

export function syncIosAppIcon({ webRoot = defaultWebRoot() } = {}) {
  const appleDirectory = join(webRoot, APPLE_PROJECT_DIRECTORY)
  if (!existsSync(appleDirectory)) {
    return { skipped: true, copied: false, patched: false }
  }

  const sourceDirectory = join(
    webRoot,
    CONTROLLED_ICON_DIRECTORY,
    APP_ICON_DIRECTORY_NAME
  )
  if (!existsSync(sourceDirectory)) {
    throw new Error(
      `Missing controlled Icon Composer document: ${sourceDirectory}`
    )
  }

  const targetDirectory = join(appleDirectory, APP_ICON_DIRECTORY_NAME)
  rmSync(targetDirectory, { force: true, recursive: true })
  cpSync(sourceDirectory, targetDirectory, { recursive: true })

  const patched = patchProjectFile(
    join(appleDirectory, XCODE_PROJECT_RELATIVE_PATH)
  )
  return { skipped: false, copied: true, patched }
}

function isMainModule() {
  const entryPath = process.argv[1]
  return Boolean(
    entryPath && pathToFileURL(resolve(entryPath)).href === import.meta.url
  )
}

if (isMainModule()) {
  try {
    const result = syncIosAppIcon()
    if (result.skipped) {
      process.stdout.write(
        `No ${APPLE_PROJECT_DIRECTORY} directory; skipped iOS app icon sync\n`
      )
    } else {
      const state = result.patched ? "Wired" : "Already wired"
      process.stdout.write(`${state} ${APP_ICON_DIRECTORY_NAME} into the iOS Xcode project\n`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    process.stderr.write(`${message}\n`)
    process.exitCode = 1
  }
}
