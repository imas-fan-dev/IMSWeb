/**
 * 名片总页数：正面 + 中间页 + 背面。
 *
 * 审核列表、管理列表与名片对象都显示这个数字；三处曾经各算一遍，
 * 差别只在「有没有背面」和「中间页从哪来」，这里统一成一条公式。
 */
export function namecardPageCount(input: {
    hasBack: boolean
    middleCount: number
}): number {
    return 1 + input.middleCount + (input.hasBack ? 1 : 0)
}
