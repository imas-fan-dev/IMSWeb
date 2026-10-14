import { Buffer } from "node:buffer"
import {
  chmodSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { resolve } from "node:path"
import process from "node:process"
import { pathToFileURL } from "node:url"

const ICNS_HEADER_SIZE = 8
const ICNS_CHUNK_HEADER_SIZE = 8
const ICNS_MAGIC = Buffer.from("icns", "ascii")

function invalidIcns(message) {
  throw new Error(`Invalid ICNS: ${message}`)
}

export function parseIcns(input) {
  const source = Buffer.from(input)
  if (source.length < ICNS_HEADER_SIZE) {
    invalidIcns("file is shorter than the 8-byte header")
  }
  if (!source.subarray(0, 4).equals(ICNS_MAGIC)) {
    invalidIcns("missing icns magic")
  }

  const declaredLength = source.readUInt32BE(4)
  if (declaredLength !== source.length) {
    invalidIcns(
      `declared length ${declaredLength} does not match ${source.length}`
    )
  }

  const chunks = []
  let offset = ICNS_HEADER_SIZE
  while (offset < source.length) {
    if (source.length - offset < ICNS_CHUNK_HEADER_SIZE) {
      invalidIcns(`truncated chunk header at offset ${offset}`)
    }

    const chunkLength = source.readUInt32BE(offset + 4)
    if (chunkLength < ICNS_CHUNK_HEADER_SIZE) {
      invalidIcns(`chunk at offset ${offset} has length ${chunkLength}`)
    }

    const end = offset + chunkLength
    if (end > source.length) {
      invalidIcns(`chunk at offset ${offset} exceeds the file length`)
    }

    const bytes = Buffer.from(source.subarray(offset, end))
    chunks.push({
      type: bytes.toString("latin1", 0, 4),
      bytes,
    })
    offset = end
  }

  if (chunks.length === 0) invalidIcns("file has no icon chunks")
  return chunks
}

function compareChunks(left, right) {
  const typeOrder = Buffer.compare(
    left.bytes.subarray(0, 4),
    right.bytes.subarray(0, 4)
  )
  return typeOrder || Buffer.compare(left.bytes, right.bytes)
}

export function canonicalizeIcns(input) {
  const source = Buffer.from(input)
  const chunks = parseIcns(source).toSorted(compareChunks)
  const output = Buffer.alloc(source.length)
  ICNS_MAGIC.copy(output, 0)
  output.writeUInt32BE(output.length, 4)

  let offset = ICNS_HEADER_SIZE
  for (const { bytes } of chunks) {
    bytes.copy(output, offset)
    offset += bytes.length
  }

  return output
}

export function canonicalizeIcnsFile(filePath) {
  const source = readFileSync(filePath)
  const canonical = canonicalizeIcns(source)
  if (source.equals(canonical)) return false

  const mode = statSync(filePath).mode & 0o777
  const temporaryPath = `${filePath}.${process.pid}.tmp`
  try {
    writeFileSync(temporaryPath, canonical, { flag: "wx", mode })
    chmodSync(temporaryPath, mode)
    renameSync(temporaryPath, filePath)
  } finally {
    rmSync(temporaryPath, { force: true })
  }
  return true
}

function isMainModule() {
  const entryPath = process.argv[1]
  return Boolean(
    entryPath && pathToFileURL(resolve(entryPath)).href === import.meta.url
  )
}

if (isMainModule()) {
  const [filePath, ...unexpected] = process.argv.slice(2)
  if (!filePath || unexpected.length > 0) {
    process.stderr.write(
      "Usage: node scripts/canonicalize-icns.js <icon.icns>\n"
    )
    process.exitCode = 1
  } else {
    try {
      const changed = canonicalizeIcnsFile(filePath)
      const message = changed
        ? `Canonicalized ICNS chunk order: ${filePath}`
        : `ICNS chunk order already canonical: ${filePath}`
      process.stdout.write(`${message}\n`)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`${message}\n`)
      process.exitCode = 1
    }
  }
}
