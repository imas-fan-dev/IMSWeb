/** Opaque client identifier. getRandomValues also works on HTTP LAN origins. */
export function createRandomId(): string {
  const crypto = globalThis.crypto
  if (typeof crypto?.randomUUID === "function") return crypto.randomUUID()
  if (typeof crypto?.getRandomValues !== "function")
    throw new Error("当前浏览器不支持安全随机标识")
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  )
}
