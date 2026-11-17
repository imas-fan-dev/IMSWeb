/**
 * 名片页旋转的唯一算法：把「位置 → 圈数」的算术收在一处。
 *
 * 属主编辑器、社区墙的认领/补充、后台管理窗都按同一套槽位顺序理解页面：
 * 0 是正面、最后一个是背面、其余是中间页。以前三处各写一份取模与拼 payload，
 * 结果中间页只在部分入口生效；现在统一走这里。
 */

/** 旋转一圈的四分之一：顺时针 +1，逆时针等价于 +3。 */
export function nextTurn(turns: number, direction: "left" | "right"): number {
  return (((turns + (direction === "right" ? 1 : 3)) % 4) + 4) % 4
}

/** 只改一个槽位的圈数，其余原样保留。 */
export function rotateOne(
  rotations: Readonly<Record<number, number>>,
  position: number,
  direction: "left" | "right"
): Record<number, number> {
  return {
    ...rotations,
    [position]: nextTurn(rotations[position] ?? 0, direction),
  }
}

/**
 * 按「槽位顺序」把本地圈数编成请求体：0 是正面、最后一个是背面，其余是中间页。
 * `middles` 与页面顺序对齐；末尾的空转裁掉，避免提交一串无意义的 0。
 */
export function rotationPayload(
  slotCount: number,
  rotations: Readonly<Record<number, number>>
): { front?: number; back?: number; middles?: number[] } | undefined {
  const turns = (position: number) => (((rotations[position] ?? 0) % 4) + 4) % 4
  const last = Math.max(slotCount - 1, 0)
  const middles = Array.from({ length: Math.max(last - 1, 0) }, (_, index) =>
    turns(index + 1)
  )
  while (middles.length > 0 && middles[middles.length - 1] === 0) middles.pop()
  const payload = {
    ...(turns(0) ? { front: turns(0) } : {}),
    ...(last > 0 && turns(last) ? { back: turns(last) } : {}),
    ...(middles.length > 0 ? { middles } : {}),
  }
  return Object.keys(payload).length ? payload : undefined
}
