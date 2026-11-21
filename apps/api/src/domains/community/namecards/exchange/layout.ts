import type { NamecardCardLayoutRecord } from '@/ports/repositories/namecards';

/**
 * 布局归一：只保留「当前可见卡片集合」里的编号，丢掉空分组，并把尚未出现在布局里的卡片
 * 按 `fallbackOrder`（数据库自然顺序，新卡在前）补进默认分组最前。
 *
 * 属主清单与公开主页共用这一份规则，避免两边各写一套排序。
 */
export function normalizeCardLayout(
    layout: NamecardCardLayoutRecord | null,
    fallbackOrder: readonly number[]
): NamecardCardLayoutRecord {
    const known = new Set(fallbackOrder);
    const seen = new Set<number>();
    const take = (numbers: readonly number[]): number[] =>
        numbers.filter((number) => {
            if (!known.has(number) || seen.has(number)) return false;
            seen.add(number);
            return true;
        });

    const groups = (layout?.groups ?? [])
        .map((group) => ({ ...group, cardNumbers: take(group.cardNumbers) }))
        .filter((group) => group.cardNumbers.length > 0);
    const defaultCardNumbers = take(layout?.defaultCardNumbers ?? []);
    const missing = fallbackOrder.filter((number) => !seen.has(number));
    return { groups, defaultCardNumbers: [...missing, ...defaultCardNumbers] };
}

/** 摊平成渲染顺序：默认分组在前，然后是各分组（分组顺序即用户拖出来的顺序）。 */
export function flattenCardLayout(layout: NamecardCardLayoutRecord): number[] {
    return [
        ...layout.defaultCardNumbers,
        ...layout.groups.flatMap((group) => group.cardNumbers),
    ];
}
