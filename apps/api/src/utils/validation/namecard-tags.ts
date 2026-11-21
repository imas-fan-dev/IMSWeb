import {
    NAMECARD_TAG_LIMIT,
    NAMECARD_TAG_MAX_LENGTH,
} from "@imsweb/contracts/namecards/runtime";

/**
 * 标签的归一化与校验。
 *
 * 显示保留用户输入的大小写形态；比较键按 PRD 的规则生成：
 * `trim → NFKC → 去零宽字符 → 连续空白折叠 → 小写`。
 * 预设名称、别名、屏蔽词与筛选参数都走同一条路径，避免两套口径。
 */

/** 零宽与方向控制字符：复制粘贴常见，比较前一律移除。 */
const INVISIBLE = /[\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff]/g;

/** 折叠所有空白（含全角空格）为一个普通空格。 */
const SPACES = /\s+/g;

/** 标签的显示形态：修剪、NFKC、去零宽、折叠空白。 */
export function normalizeTagName(value: string): string {
    return value
        .normalize("NFKC")
        .replace(INVISIBLE, "")
        .replace(SPACES, " ")
        .trim();
}

/** 比较键：显示形态再小写（NFKC 已把全角转成半角）。 */
export function normalizeTagKey(value: string): string {
    return normalizeTagName(value).toLowerCase();
}

/** 校验并归一化一组标签，按比较键去重（保留第一次出现的显示形态）。 */
export function normalizeCardTags(
    names: readonly string[]
): Array<{ name: string; normalized: string }> {
    const seen = new Set<string>();
    const tags: Array<{ name: string; normalized: string }> = [];
    for (const raw of names) {
        const name = normalizeTagName(raw);
        if (name === "" || name.length > NAMECARD_TAG_MAX_LENGTH) {
            throw badTagRequest(
                `标签「${raw.trim().slice(0, NAMECARD_TAG_MAX_LENGTH)}」长度无效`
            );
        }
        const normalized = name.toLowerCase();
        if (seen.has(normalized)) continue;
        seen.add(normalized);
        tags.push({ name, normalized });
    }
    if (tags.length > NAMECARD_TAG_LIMIT) {
        throw badTagRequest(`每张名片最多 ${NAMECARD_TAG_LIMIT} 个标签`);
    }
    return tags;
}

/** 一条屏蔽词命中的判定：literal 走包含，regex 用 JS 等价于 SQL 的 `~`。 */
export interface TagBlockRule {
    id: number;
    pattern: string;
    isRegex: boolean;
}

/**
 * 找到第一条命中该标签（比较键）的屏蔽词。返回 null 表示放行。
 * 无效的存量正则直接跳过：它既不能匹配，也不该让保存整个失败。
 */
export function matchBlockRule(
    normalized: string,
    rules: readonly TagBlockRule[]
): TagBlockRule | null {
    for (const rule of rules) {
        if (rule.isRegex) {
            try {
                if (new RegExp(rule.pattern).test(normalized)) return rule;
            } catch {
                continue;
            }
            continue;
        }
        const needle = normalizeTagKey(rule.pattern);
        if (needle !== "" && normalized.includes(needle)) return rule;
    }
    return null;
}

/** 一条被屏蔽词命中的现存标签。 */
export interface TagBlockMatch {
    name: string;
    count: number;
    patternId: number;
}

export function badTagRequest(message: string): Error {
    return Object.assign(new Error(message), { status: 400 });
}

export function tagConflict(message: string): Error {
    return Object.assign(new Error(message), { status: 409 });
}
