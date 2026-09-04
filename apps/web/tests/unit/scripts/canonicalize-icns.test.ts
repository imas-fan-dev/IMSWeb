import { Buffer } from "node:buffer"
import { createHash } from "node:crypto"
import {
  chmodSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, resolve } from "node:path"
import { describe, expect, it } from "vitest"

import {
  canonicalizeIcns,
  canonicalizeIcnsFile,
  parseIcns,
} from "../../../scripts/canonicalize-icns.js"

function makeChunk(type: string, payload: string) {
  if (Buffer.byteLength(type, "latin1") !== 4) {
    throw new Error("ICNS test chunk types must contain four bytes")
  }
  const payloadBytes = Buffer.from(payload)
  const chunk = Buffer.alloc(8 + payloadBytes.length)
  chunk.write(type, 0, 4, "latin1")
  chunk.writeUInt32BE(chunk.length, 4)
  payloadBytes.copy(chunk, 8)
  return chunk
}

function makeIcns(chunks: Buffer[]) {
  const length = 8 + chunks.reduce((total, chunk) => total + chunk.length, 0)
  const output = Buffer.alloc(length)
  output.write("icns", 0, 4, "ascii")
  output.writeUInt32BE(length, 4)

  let offset = 8
  for (const chunk of chunks) {
    chunk.copy(output, offset)
    offset += chunk.length
  }
  return output
}

function payloadSignature(bytes: Buffer) {
  return createHash("sha256").update(bytes.subarray(8)).digest("hex")
}

describe("ICNS canonicalization", () => {
  it("produces identical bytes from different chunk orders", () => {
    const chunks = [
      makeChunk("zzzz", "last"),
      makeChunk("aaaa", "second"),
      makeChunk("aaaa", "first"),
    ]
    const first = canonicalizeIcns(makeIcns(chunks))
    const second = canonicalizeIcns(makeIcns([...chunks].reverse()))

    expect(first).toEqual(second)
    expect(parseIcns(first).map(({ type }) => type)).toEqual([
      "aaaa",
      "aaaa",
      "zzzz",
    ])
    expect(canonicalizeIcns(first)).toEqual(first)
  })

  it("rewrites atomically once and preserves file permissions", () => {
    const directory = mkdtempSync(join(tmpdir(), "imsweb-icns-"))
    const iconPath = join(directory, "icon.icns")
    writeFileSync(
      iconPath,
      makeIcns([makeChunk("zzzz", "z"), makeChunk("aaaa", "a")])
    )
    chmodSync(iconPath, 0o640)

    try {
      expect(canonicalizeIcnsFile(iconPath)).toBe(true)
      const once = readFileSync(iconPath)
      expect(statSync(iconPath).mode & 0o777).toBe(0o640)
      expect(canonicalizeIcnsFile(iconPath)).toBe(false)
      expect(readFileSync(iconPath)).toEqual(once)
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  })

  it("rejects malformed containers instead of rewriting them", () => {
    expect(() => canonicalizeIcns(Buffer.alloc(7))).toThrow(
      "shorter than the 8-byte header"
    )

    const empty = Buffer.alloc(8)
    empty.write("icns", 0, 4, "ascii")
    empty.writeUInt32BE(empty.length, 4)
    expect(() => canonicalizeIcns(empty)).toThrow("no icon chunks")

    const truncatedHeader = Buffer.alloc(12)
    truncatedHeader.write("icns", 0, 4, "ascii")
    truncatedHeader.writeUInt32BE(truncatedHeader.length, 4)
    expect(() => canonicalizeIcns(truncatedHeader)).toThrow(
      "truncated chunk header"
    )

    const shortChunk = Buffer.alloc(16)
    shortChunk.write("icns", 0, 4, "ascii")
    shortChunk.writeUInt32BE(shortChunk.length, 4)
    shortChunk.write("aaaa", 8, 4, "latin1")
    shortChunk.writeUInt32BE(7, 12)
    expect(() => canonicalizeIcns(shortChunk)).toThrow("has length 7")

    const wrongMagic = makeIcns([makeChunk("aaaa", "a")])
    wrongMagic.write("nope", 0, 4, "ascii")
    expect(() => canonicalizeIcns(wrongMagic)).toThrow("missing icns magic")

    const wrongLength = makeIcns([makeChunk("aaaa", "a")])
    wrongLength.writeUInt32BE(wrongLength.length + 1, 4)
    expect(() => canonicalizeIcns(wrongLength)).toThrow("does not match")

    const overflowingChunk = makeIcns([makeChunk("aaaa", "a")])
    overflowingChunk.writeUInt32BE(overflowingChunk.length, 12)
    expect(() => canonicalizeIcns(overflowingChunk)).toThrow(
      "exceeds the file length"
    )
  })

  it("preserves every payload in the repository icon", () => {
    const icon = readFileSync(resolve("src-tauri/icons/icon.icns"))
    const originalChunks = parseIcns(icon)
    const canonical = canonicalizeIcns(icon)
    const canonicalChunks = parseIcns(canonical)
    const signatures = (chunks: ReturnType<typeof parseIcns>) =>
      chunks
        .map(({ type, bytes }) => `${type}:${payloadSignature(bytes)}`)
        .sort()

    expect(originalChunks).toHaveLength(12)
    expect(canonical.length).toBe(icon.length)
    expect(signatures(canonicalChunks)).toEqual(signatures(originalChunks))
    expect(canonicalizeIcns(canonical)).toEqual(canonical)
  })
})
