import type { TagBlockMatch, TagBlockRule } from "@/utils/validation/namecard-tags";

/** 名片上的一枚标签：显示名 + 命中的预设（自由标签为 null）。 */
export interface NamecardTagRecord {
    name: string;
    presetId: number | null;
}

export interface NamecardTagPresetRecord {
    id: number;
    name: string;
    aliases: string[];
    createdAt: string;
    updatedAt: string;
}

export interface NamecardTagBlocklistRecord {
    id: number;
    pattern: string;
    isRegex: boolean;
    createdAt: string;
}

export interface NamecardTagFreeRecord {
    name: string;
    count: number;
}

export interface NamecardTagSuggestionResult {
    presets: Array<{ id: number; name: string; aliases: string[] }>;
}

export interface NamecardTagReplaceInput {
    /** Fudaba 行 id（uuid 字符串）。与 `cardNumber` 二选一。 */
    cardId?: string;
    /** 墙上展示的名片编号；认领与后台保存按它定位。 */
    cardNumber?: number;
    /** 未归一化的用户输入；数组顺序即展示顺序（写库前统一归一化 + 去重 + 校验）。 */
    names: readonly string[];
}

/**
 * 标签库的读写端口。
 *
 * 标签与名片内容审核解耦：`replace` 直接改 `namecard_tags`，不会写进
 * pending/review 载荷。读取侧（公开墙、属主编辑器）也通过同一端口批量取
 * 标签，避免各仓储各写一份归一化逻辑。
 */
export interface NamecardTagRepository {
    /** 批量读取多张名片的标签；每张卡都有条目（可能是空数组）。 */
    listForCards(cardIds: readonly string[]): Promise<Map<string, NamecardTagRecord[]>>;
    /** 单张卡（按编号）的标签。 */
    listForCardNumber(cardNumber: number): Promise<NamecardTagRecord[]>;
    /** 整组替换；拒绝时抛 400/409 业务错误并带上违规标签文本。 */
    replace(input: NamecardTagReplaceInput): Promise<NamecardTagRecord[]>;
    /** 提交前自检：返回被屏蔽词命中的原文（顺序与入参一致）。 */
    blockedNames(names: readonly string[]): Promise<string[]>;
    /** 输入候选：预设（名称/别名包含）与自由标签（子串，完全相等优先）。 */
    suggest(input: { q: string; limit: number }): Promise<NamecardTagSuggestionResult>;

    /* ---- 管理台：自由标签 ---- */
    listFree(input: {
        q: string | null;
        sort: 'frequency' | 'recent';
        limit: number;
        offset: number;
    }): Promise<{ items: NamecardTagFreeRecord[]; total: number }>;
    /** 屏蔽一条自由标签（移除现存行）并追加一条屏蔽词。 */
    blockFreeTag(input: {
        name: string;
        pattern: string;
        isRegex: boolean;
        now: string;
    }): Promise<{ removed: number; item: NamecardTagBlocklistRecord }>;

    /* ---- 管理台：预设 ---- */
    listPresets(input: {
        q: string | null;
        limit: number;
        offset: number;
    }): Promise<{ items: NamecardTagPresetRecord[]; total: number }>;
    createPreset(input: {
        name: string;
        aliases: readonly string[];
        now: string;
    }): Promise<NamecardTagPresetRecord>;
    updatePreset(input: {
        id: number;
        name?: string;
        aliases?: readonly string[];
        now: string;
    }): Promise<NamecardTagPresetRecord>;
    deletePreset(id: number): Promise<boolean>;
    /** 把一条自由标签并入预设的别名，并把现存标签指向该预设。 */
    mergeFreeTag(input: {
        id: number;
        name: string;
        now: string;
    }): Promise<NamecardTagPresetRecord>;
    /** 把一条自由标签提升为预设（可另取预设名与别名）。 */
    promoteFreeTag(input: {
        name: string;
        presetName?: string;
        aliases: readonly string[];
        now: string;
    }): Promise<NamecardTagPresetRecord>;

    /* ---- 管理台：屏蔽词 ---- */
    listBlocklist(input: {
        q: string | null;
        limit: number;
        offset: number;
    }): Promise<{ items: NamecardTagBlocklistRecord[]; total: number }>;
    createBlocklist(input: {
        pattern: string;
        isRegex: boolean;
        now: string;
    }): Promise<NamecardTagBlocklistRecord>;
    updateBlocklist(input: {
        id: number;
        pattern: string;
        isRegex: boolean;
    }): Promise<NamecardTagBlocklistRecord | null>;
    deleteBlocklist(id: number): Promise<boolean>;
    /** 现存自由标签里被任意屏蔽词命中的那些（后台高亮标记）。 */
    listBlockedMatches(): Promise<TagBlockMatch[]>;
    /** 一键移除某条屏蔽词命中的全部自由标签；返回移除的行数。 */
    removeBlocklistMatches(id: number): Promise<number>;
}

export type { TagBlockMatch, TagBlockRule };
