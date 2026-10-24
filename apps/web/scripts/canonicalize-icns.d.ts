export interface IcnsChunk {
  readonly type: string
  readonly bytes: Buffer
}

export function parseIcns(input: Uint8Array): IcnsChunk[]
export function canonicalizeIcns(input: Uint8Array): Buffer
export function canonicalizeIcnsFile(filePath: string): boolean
