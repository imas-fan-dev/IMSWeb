import jaconv from 'jaconv';
import { pinyin as hanziToPinyin } from 'pinyin-pro';

/** 0=英文来源、1=假名罗马音、2=中文拼音、3=特殊符号（永远垫底）。 */
export type NamecardSortBucket = 0 | 1 | 2 | 3;

export interface NamecardSortKey {
    /** 归一化后的比较键：小写、无空白、假名/汉字已罗马化或拼音化。 */
    key: string;
    bucket: NamecardSortBucket;
}

/**
 * 纯英文名：首字符是字母，其余只允许字母、数字与常见英文分隔符。
 * 以数字或符号开头、中英混排的名字都不算，交给后面的规则。
 */
const LATIN_TEXT = /^[a-z][a-z0-9 ._'-]*$/;

/** 平假名与片假名。NFKC 已把半角片假名折成全角。 */
const KANA = /[\u3041-\u30ff\u31f0-\u31ff]/;
const HAN = /\p{Script=Han}/u;

/** NFKC → 合并空白 → 去首尾空白 → 小写。空值一律看成空串。 */
function normalizeText(value: string | null | undefined): string {
    if (typeof value !== 'string') return '';
    return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function compact(text: string): string {
    return text.replace(/\s+/g, '');
}

/**
 * 假名先转罗马音、汉字再转拼音：两个库都只处理自己那类字符，
 * 所以混排字符串直接串联调用即可（「春香アマミ」→「chunxiangamami」）。
 */
function romanize(text: string): string {
    const kana = jaconv.toHebon(jaconv.toHiragana(text));
    // jaconv returns uppercased romaji; the comparison key is always lowercase.
    // pinyin-pro 覆盖简繁两套汉字（繁体字也要参与拼音排序）。
    const han = hanziToPinyin(kana, {
        toneType: 'none',
        type: 'array',
    }).join('');
    return compact(han).toLowerCase();
}

/**
 * PRD §3.1 的排序键阶梯（命中即返回）：
 * 1. 名称是英文 → 名称；2. 读音是英文 → 读音；
 * 3. 有读音 → 读音罗马音；4. 名称以假名开头 → 名称罗马音；
 * 5. 其余（汉字为主）→ 拼音；6. 什么都不是 → 特殊符号垫底。
 *
 * 名称为空返回空键 + bucket 3，保证排在任何真实内容之后。
 */
export function namecardSortKey(
    name: string | null | undefined,
    reading: string | null | undefined
): NamecardSortKey {
    const nameText = normalizeText(name);
    if (!nameText) return { key: '', bucket: 3 };
    if (LATIN_TEXT.test(nameText)) {
        return { key: compact(nameText), bucket: 0 };
    }

    const readingText = normalizeText(reading);
    if (readingText && LATIN_TEXT.test(readingText)) {
        return { key: compact(readingText), bucket: 0 };
    }
    if (readingText) {
        // 读音正常只允许假名 / 英文；万一混进汉字，按拼音归到中文桶。
        const bucket =
            HAN.test(readingText) && !KANA.test(readingText) ? 2 : 1;
        return { key: romanize(readingText), bucket };
    }

    if (KANA.test(nameText)) {
        // 假名出现在任何位置（含「英文开头 + 假名尾巴」）都先罗马化，
        // 与英文/拼音键在同一个排序空间里比较。
        return { key: romanize(nameText), bucket: 1 };
    }
    if (HAN.test(nameText)) {
        return { key: romanize(nameText), bucket: 2 };
    }
    // 没有英文、读音、假名与汉字：逗号、星号、纯数字等，统一垫底。
    return { key: compact(nameText), bucket: 3 };
}
