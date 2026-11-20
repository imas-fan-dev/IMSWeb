import type { ManagedSqlDatabase, SqlDatabase } from "@/infra/db/sql/database";
import { executeSql, queryAll, queryOne } from "@/infra/db/sql/query";
import type {
    NamecardTagBlocklistRecord,
    NamecardTagFreeRecord,
    NamecardTagPresetRecord,
    NamecardTagRecord,
    NamecardTagReplaceInput,
    NamecardTagRepository,
    NamecardTagSuggestionResult,
} from "@/ports/repositories/namecard-tags";
import {
    badTagRequest,
    matchBlockRule,
    normalizeCardTags,
    normalizeTagKey,
    normalizeTagName,
    tagConflict,
    type TagBlockMatch,
} from "@/utils/namecard-tags";

interface TagRow {
    card_id: string;
    name: string;
    preset_id: number | string | null;
}

interface PresetRow {
    id: number | string;
    name: string;
    aliases: unknown;
    created_at: string | Date;
    updated_at: string | Date;
}

interface BlocklistRow {
    id: number | string;
    pattern: string;
    is_regex: boolean;
    created_at: string | Date;
}

function iso(value: string | Date): string {
    return value instanceof Date ? value.toISOString() : value;
}

function numberId(value: number | string): number {
    return typeof value === "number" ? value : Number(value);
}

function aliasList(value: unknown): string[] {
    if (Array.isArray(value)) {
        return value.filter((entry): entry is string => typeof entry === "string");
    }
    if (typeof value === "string") {
        try {
            const parsed: unknown = JSON.parse(value);
            return Array.isArray(parsed)
                ? parsed.filter((entry): entry is string => typeof entry === "string")
                : [];
        } catch {
            return [];
        }
    }
    return [];
}

/**
 * 标签库的 PostgreSQL 实现。
 *
 * 归一化/校验规则在 `@/utils/namecard-tags`；这一层只负责落库与读取。
 * 所有写路径都经过一个事务：预设解析、屏蔽词校验、整组替换要么全成要么全败。
 */
export class SqlNamecardTagRepository implements NamecardTagRepository {
    constructor(private readonly database: ManagedSqlDatabase) {}

    async listForCards(
        cardIds: readonly string[]
    ): Promise<Map<string, NamecardTagRecord[]>> {
        const grouped = new Map<string, NamecardTagRecord[]>();
        for (const cardId of cardIds) grouped.set(cardId, []);
        if (cardIds.length === 0) return grouped;
        const placeholders = cardIds.map(() => "?").join(", ");
        const rows = await queryAll<TagRow>(
            this.database,
            `SELECT tag.card_id, COALESCE(preset.name, tag.name) AS name, tag.preset_id
               FROM namecard_tags tag
               LEFT JOIN namecard_tag_presets preset ON preset.id = tag.preset_id
              WHERE tag.card_id IN (${placeholders})
              ORDER BY tag.card_id, tag.display_order, tag.name`,
            cardIds
        );
        // 同一张卡上多个归一化文本并入同一预设后，展示层只保留一条，
        // 避免「Duet 并入 Solo」后同一张卡出现两个 Solo。
        const seenPresets = new Map<string, Set<number>>();
        for (const row of rows) {
            const presetId =
                row.preset_id === null ? null : numberId(row.preset_id);
            if (presetId !== null) {
                const seen = seenPresets.get(row.card_id) ?? new Set<number>();
                if (seen.has(presetId)) continue;
                seen.add(presetId);
                seenPresets.set(row.card_id, seen);
            }
            grouped.get(row.card_id)?.push({ name: row.name, presetId });
        }
        return grouped;
    }

    async blockedNames(names: readonly string[]): Promise<string[]> {
        if (names.length === 0) return [];
        const rules = await this.blockRules(this.database);
        if (rules.length === 0) return [];
        return names.filter((name) =>
            matchBlockRule(normalizeTagKey(name), rules)
        );
    }

    async listForCardNumber(cardNumber: number): Promise<NamecardTagRecord[]> {
        const rows = await queryAll<TagRow>(
            this.database,
            `SELECT tag.card_id, COALESCE(preset.name, tag.name) AS name, tag.preset_id
               FROM namecard_tags tag
               JOIN fudaba_cards card ON card.id=tag.card_id
               LEFT JOIN namecard_tag_presets preset ON preset.id = tag.preset_id
              WHERE card.card_number=?
              ORDER BY tag.display_order, tag.name`,
            [cardNumber]
        );
        const seen = new Set<number>();
        const tags: NamecardTagRecord[] = [];
        for (const row of rows) {
            const presetId =
                row.preset_id === null ? null : numberId(row.preset_id);
            if (presetId !== null && seen.has(presetId)) continue;
            if (presetId !== null) seen.add(presetId);
            tags.push({ name: row.name, presetId });
        }
        return tags;
    }

    async replace(input: NamecardTagReplaceInput): Promise<NamecardTagRecord[]> {
        const tags = normalizeCardTags(input.names);
        const card = input.cardId
            ? await queryOne<{ id: string }>(
                  this.database,
                  `SELECT id FROM fudaba_cards
                    WHERE id=? AND deleted_at IS NULL`,
                  [input.cardId]
              )
            : input.cardNumber !== undefined
              ? await queryOne<{ id: string }>(
                    this.database,
                    `SELECT id FROM fudaba_cards
                      WHERE card_number=? AND deleted_at IS NULL`,
                    [input.cardNumber]
                )
              : null;
        if (!card) {
            throw Object.assign(new Error("名片不存在"), { status: 404 });
        }
        const blocklist = await this.blockRules(this.database);
        if (blocklist.length > 0) {
            const blocked = tags.find((tag) => matchBlockRule(tag.normalized, blocklist));
            if (blocked) {
                throw badTagRequest(`标签「${blocked.name}」被屏蔽`);
            }
        }
        const presets =
            tags.length > 0
                ? await this.resolvePresets(this.database, tags.map((tag) => tag.normalized))
                : new Map<string, number>();
        await this.database.transaction(async (database) => {
            await executeSql(
                database,
                `DELETE FROM namecard_tags WHERE card_id=?`,
                [card.id]
            );
            if (tags.length === 0) return;
            await database.batch(
                tags.map((tag, index) =>
                    database
                        .prepare(
                            `INSERT INTO namecard_tags
                                 (card_id, name, normalized, preset_id,
                                  display_order)
                             VALUES (?, ?, ?, ?, ?)`
                        )
                        .bind(
                            card.id,
                            tag.name,
                            tag.normalized,
                            presets.get(tag.normalized) ?? null,
                            index
                        )
                )
            );
        });
        await this.database.batch(
            tags.map((tag) =>
                this.database
                    .prepare(
                        `INSERT INTO namecard_tag_registry (normalized, name)
                         VALUES (?, ?)
                         ON CONFLICT (normalized) DO NOTHING`
                    )
                    .bind(tag.normalized, tag.name)
            )
        );
        // 同一预设在一次写入里经名称与别名各出现一次时，只保留第一条。
        const seen = new Set<number>();
        const saved: NamecardTagRecord[] = [];
        for (const tag of tags) {
            const presetId = presets.get(tag.normalized) ?? null;
            if (presetId !== null && seen.has(presetId)) continue;
            if (presetId !== null) seen.add(presetId);
            saved.push({ name: tag.name, presetId });
        }
        return saved;
    }

    async suggest(input: {
        q: string;
        limit: number;
    }): Promise<NamecardTagSuggestionResult> {
        const q = normalizeTagKey(input.q);
        const like = `%${q}%`;
        const presetRows = await queryAll<{
            id: number | string;
            name: string;
            aliases: unknown;
        }>(
            this.database,
            `SELECT preset.id, preset.name,
                    COALESCE((
                        SELECT json_agg(alias.text ORDER BY alias.text)
                          FROM namecard_tag_aliases alias
                         WHERE alias.preset_id=preset.id
                    ), '[]') AS aliases
               FROM namecard_tag_presets preset
              WHERE preset.normalized LIKE ?
                 OR EXISTS (
                     SELECT 1 FROM namecard_tag_aliases alias
                      WHERE alias.preset_id=preset.id
                        AND alias.normalized LIKE ?
                 )
              ORDER BY (preset.normalized LIKE ?) DESC, preset.name
              LIMIT ?`,
            [like, like, `${q}%`, input.limit]
        );
        return {
            presets: presetRows.map((row) => ({
                id: numberId(row.id),
                name: row.name,
                aliases: aliasList(row.aliases),
            })),
        };
    }

    async listFree(input: {
        q: string | null;
        sort: 'frequency' | 'recent';
        limit: number;
        offset: number;
    }): Promise<{ items: NamecardTagFreeRecord[]; total: number }> {
        const q = input.q === null ? "" : normalizeTagKey(input.q);
        const like = `%${q}%`;
        const order =
            input.sort === 'recent'
                ? 'r.first_seen_at DESC, min(t.name)'
                : 'COUNT(*) DESC, min(t.name)';
        const [rows, total] = await Promise.all([
            queryAll<{ name: string; count: number | string }>(
                this.database,
                `SELECT min(t.name) AS name, COUNT(*)::int AS count
                   FROM namecard_tags t
                   JOIN namecard_tag_registry r ON r.normalized = t.normalized
                  WHERE t.preset_id IS NULL AND t.normalized LIKE ?
                  GROUP BY t.normalized, r.first_seen_at
                  ORDER BY ${order}
                  LIMIT ? OFFSET ?`,
                [like, input.limit, input.offset]
            ),
            queryOne<{ total: number | string }>(
                this.database,
                `SELECT COUNT(DISTINCT normalized)::int AS total
                   FROM namecard_tags
                  WHERE preset_id IS NULL AND normalized LIKE ?`,
                [like]
            ),
        ]);
        return {
            items: rows.map((row) => ({
                name: row.name,
                count: Number(row.count),
            })),
            total: Number(total?.total ?? 0),
        };
    }

    async blockFreeTag(input: {
        name: string;
        pattern: string;
        isRegex: boolean;
        now: string;
    }): Promise<{ removed: number; item: NamecardTagBlocklistRecord }> {
        const normalized = normalizeTagKey(input.name);
        this.assertValidPattern(input.pattern, input.isRegex);
        return this.database.transaction(async (database) => {
            const removed = await executeSql(
                database,
                `DELETE FROM namecard_tags WHERE normalized=?`,
                [normalized]
            );
            const row = await queryOne<BlocklistRow>(
                database,
                `INSERT INTO namecard_tag_blocklist (pattern, is_regex, created_at)
                 VALUES (?, ?, ?)
                 RETURNING id, pattern, is_regex, created_at`,
                [
                    input.isRegex ? input.pattern : normalizeTagKey(input.pattern),
                    input.isRegex,
                    input.now,
                ]
            );
            if (!row) throw new Error("Blocklist insert returned no row");
            return {
                removed: removed.meta.changes,
                item: this.blocklistRecord(row),
            };
        });
    }

    async listPresets(input: {
        q: string | null;
        limit: number;
        offset: number;
    }): Promise<{ items: NamecardTagPresetRecord[]; total: number }> {
        const q = input.q === null ? "" : normalizeTagKey(input.q);
        const like = `%${q}%`;
        const [rows, total] = await Promise.all([
            queryAll<PresetRow>(
                this.database,
                `SELECT preset.id, preset.name,
                        COALESCE((
                            SELECT json_agg(alias.text ORDER BY alias.text)
                              FROM namecard_tag_aliases alias
                             WHERE alias.preset_id=preset.id
                        ), '[]') AS aliases,
                        preset.created_at, preset.updated_at
                   FROM namecard_tag_presets preset
                  WHERE preset.normalized LIKE ?
                     OR EXISTS (
                         SELECT 1 FROM namecard_tag_aliases alias
                          WHERE alias.preset_id=preset.id
                            AND alias.normalized LIKE ?
                     )
                  ORDER BY (preset.normalized LIKE ?) DESC, preset.name
                  LIMIT ? OFFSET ?`,
                [like, like, `${q}%`, input.limit, input.offset]
            ),
            queryOne<{ total: number | string }>(
                this.database,
                `SELECT COUNT(*)::int AS total
                   FROM namecard_tag_presets preset
                  WHERE preset.normalized LIKE ?
                     OR EXISTS (
                         SELECT 1 FROM namecard_tag_aliases alias
                          WHERE alias.preset_id=preset.id
                            AND alias.normalized LIKE ?
                     )`,
                [like, like]
            ),
        ]);
        return {
            items: rows.map((row) => this.presetRecord(row)),
            total: Number(total?.total ?? 0),
        };
    }

    async createPreset(input: {
        name: string;
        aliases: readonly string[];
        now: string;
    }): Promise<NamecardTagPresetRecord> {
        const name = normalizeTagName(input.name);
        if (name === "") throw badTagRequest("预设名称不能为空");
        const normalized = normalizeTagKey(name);
        const aliases = this.normalizeAliases(input.aliases, normalized);
        try {
            return await this.database.transaction(async (database) => {
                const row = await queryOne<{ id: number | string }>(
                    database,
                    `INSERT INTO namecard_tag_presets
                         (name, normalized, created_at, updated_at)
                     VALUES (?, ?, ?, ?)
                     RETURNING id`,
                    [name, normalized, input.now, input.now]
                );
                if (!row) throw new Error("Preset insert returned no row");
                const id = numberId(row.id);
                await this.writeAliases(database, id, aliases);
                return await this.readPreset(database, id);
            });
        } catch (error) {
            if (isUniqueViolation(error)) throw tagConflict("预设或别名已存在");
            throw error;
        }
    }

    async updatePreset(input: {
        id: number;
        name?: string;
        aliases?: readonly string[];
        now: string;
    }): Promise<NamecardTagPresetRecord> {
        try {
            return await this.database.transaction(async (database) => {
                const existing = await this.readPreset(database, input.id);
                const name =
                    input.name === undefined
                        ? existing.name
                        : normalizeTagName(input.name);
                if (name === "") throw badTagRequest("预设名称不能为空");
                const normalized = normalizeTagKey(name);
                await executeSql(
                    database,
                    `UPDATE namecard_tag_presets
                        SET name=?, normalized=?, updated_at=?
                      WHERE id=?`,
                    [name, normalized, input.now, input.id]
                );
                if (input.aliases !== undefined) {
                    const aliases = this.normalizeAliases(input.aliases, normalized);
                    await executeSql(
                        database,
                        `DELETE FROM namecard_tag_aliases WHERE preset_id=?`,
                        [input.id]
                    );
                    await this.writeAliases(database, input.id, aliases);
                }
                return await this.readPreset(database, input.id);
            });
        } catch (error) {
            if (isUniqueViolation(error)) throw tagConflict("预设或别名已存在");
            throw error;
        }
    }

    async deletePreset(id: number): Promise<boolean> {
        const result = await executeSql(
            this.database,
            `DELETE FROM namecard_tag_presets WHERE id=?`,
            [id]
        );
        return result.meta.changes > 0;
    }

    async mergeFreeTag(input: {
        id: number;
        name: string;
        now: string;
    }): Promise<NamecardTagPresetRecord> {
        const text = normalizeTagName(input.name);
        if (text === "") throw badTagRequest("标签不能为空");
        const normalized = normalizeTagKey(text);
        try {
            return await this.database.transaction(async (database) => {
                await this.readPreset(database, input.id);
                const existingAlias = await queryOne<{ preset_id: number | string }>(
                    database,
                    `SELECT preset_id FROM namecard_tag_aliases WHERE normalized=?`,
                    [normalized]
                );
                if (existingAlias) {
                    throw tagConflict(
                        numberId(existingAlias.preset_id) === input.id
                            ? "该别名已经属于这个预设"
                            : "该别名已属于其它预设"
                    );
                }
                await executeSql(
                    database,
                    `INSERT INTO namecard_tag_aliases (preset_id, text, normalized)
                     VALUES (?, ?, ?)`,
                    [input.id, text, normalized]
                );
                await executeSql(
                    database,
                    `UPDATE namecard_tags SET preset_id=? WHERE normalized=?`,
                    [input.id, normalized]
                );
                await executeSql(
                    database,
                    `UPDATE namecard_tag_presets SET updated_at=? WHERE id=?`,
                    [input.now, input.id]
                );
                return await this.readPreset(database, input.id);
            });
        } catch (error) {
            if (isUniqueViolation(error)) throw tagConflict("该别名已存在");
            throw error;
        }
    }

    async promoteFreeTag(input: {
        name: string;
        presetName?: string;
        aliases: readonly string[];
        now: string;
    }): Promise<NamecardTagPresetRecord> {
        const tagName = normalizeTagName(input.name);
        if (tagName === "") throw badTagRequest("标签不能为空");
        const tagKey = normalizeTagKey(tagName);
        const presetName = normalizeTagName(input.presetName ?? tagName);
        const presetKey = normalizeTagKey(presetName);
        const aliases = this.normalizeAliases(input.aliases, presetKey);
        try {
            return await this.database.transaction(async (database) => {
                const row = await queryOne<{ id: number | string }>(
                    database,
                    `INSERT INTO namecard_tag_presets
                         (name, normalized, created_at, updated_at)
                     VALUES (?, ?, ?, ?)
                     RETURNING id`,
                    [presetName, presetKey, input.now, input.now]
                );
                if (!row) throw new Error("Preset insert returned no row");
                const id = numberId(row.id);
                await this.writeAliases(database, id, aliases);
                await executeSql(
                    database,
                    `UPDATE namecard_tags SET preset_id=? WHERE normalized=?`,
                    [id, tagKey]
                );
                return await this.readPreset(database, id);
            });
        } catch (error) {
            if (isUniqueViolation(error)) throw tagConflict("预设或别名已存在");
            throw error;
        }
    }

    async listBlocklist(input: {
        q: string | null;
        limit: number;
        offset: number;
    }): Promise<{ items: NamecardTagBlocklistRecord[]; total: number }> {
        const like = `%${(input.q ?? '').trim().toLowerCase()}%`;
        const [rows, total] = await Promise.all([
            queryAll<BlocklistRow>(
                this.database,
                `SELECT id, pattern, is_regex, created_at
                   FROM namecard_tag_blocklist
                  WHERE LOWER(pattern) LIKE ?
                  ORDER BY id
                  LIMIT ? OFFSET ?`,
                [like, input.limit, input.offset]
            ),
            queryOne<{ total: number | string }>(
                this.database,
                `SELECT COUNT(*)::int AS total
                   FROM namecard_tag_blocklist
                  WHERE LOWER(pattern) LIKE ?`,
                [like]
            ),
        ]);
        return {
            items: rows.map((row) => this.blocklistRecord(row)),
            total: Number(total?.total ?? 0),
        };
    }

    async createBlocklist(input: {
        pattern: string;
        isRegex: boolean;
        now: string;
    }): Promise<NamecardTagBlocklistRecord> {
        this.assertValidPattern(input.pattern, input.isRegex);
        const pattern = input.isRegex
            ? input.pattern
            : normalizeTagKey(input.pattern);
        if (pattern === "") throw badTagRequest("屏蔽词不能为空");
        const row = await queryOne<BlocklistRow>(
            this.database,
            `INSERT INTO namecard_tag_blocklist (pattern, is_regex, created_at)
             VALUES (?, ?, ?)
             RETURNING id, pattern, is_regex, created_at`,
            [pattern, input.isRegex, input.now]
        );
        if (!row) throw new Error("Blocklist insert returned no row");
        return this.blocklistRecord(row);
    }

    async updateBlocklist(input: {
        id: number;
        pattern: string;
        isRegex: boolean;
    }): Promise<NamecardTagBlocklistRecord | null> {
        this.assertValidPattern(input.pattern, input.isRegex);
        const pattern = input.isRegex
            ? input.pattern
            : normalizeTagKey(input.pattern);
        if (pattern === "") throw badTagRequest("屏蔽词不能为空");
        const row = await queryOne<BlocklistRow>(
            this.database,
            `UPDATE namecard_tag_blocklist
                SET pattern=?, is_regex=?
              WHERE id=?
              RETURNING id, pattern, is_regex, created_at`,
            [pattern, input.isRegex, input.id]
        );
        return row ? this.blocklistRecord(row) : null;
    }

    async deleteBlocklist(id: number): Promise<boolean> {
        const result = await executeSql(
            this.database,
            `DELETE FROM namecard_tag_blocklist WHERE id=?`,
            [id]
        );
        return result.meta.changes > 0;
    }

    async listBlockedMatches(): Promise<TagBlockMatch[]> {
        const [rules, tags] = await Promise.all([
            this.blockRules(this.database),
            queryAll<{ normalized: string; name: string; count: number | string }>(
                this.database,
                `SELECT normalized, min(name) AS name, COUNT(*)::int AS count
                   FROM namecard_tags
                  WHERE preset_id IS NULL
                  GROUP BY normalized
                  ORDER BY min(name)`
            ),
        ]);
        if (rules.length === 0) return [];
        const matches: TagBlockMatch[] = [];
        for (const tag of tags) {
            const rule = matchBlockRule(tag.normalized, rules);
            if (!rule) continue;
            matches.push({
                name: tag.name,
                count: Number(tag.count),
                patternId: rule.id,
            });
        }
        return matches;
    }

    async removeBlocklistMatches(id: number): Promise<number> {
        const rule = await queryOne<BlocklistRow>(
            this.database,
            `SELECT id, pattern, is_regex, created_at
               FROM namecard_tag_blocklist
              WHERE id=?`,
            [id]
        );
        if (!rule) {
            throw Object.assign(new Error("屏蔽词不存在"), { status: 404 });
        }
        if (!rule.is_regex) {
            const result = await executeSql(
                this.database,
                `DELETE FROM namecard_tags
                  WHERE preset_id IS NULL AND normalized LIKE '%' || ? || '%'`,
                [normalizeTagKey(rule.pattern)]
            );
            return result.meta.changes;
        }
        // 正则的匹配语义留在应用层，与保存校验用的是同一个 JS `RegExp`。
        const free = await queryAll<{ normalized: string }>(
            this.database,
            `SELECT DISTINCT normalized
               FROM namecard_tags
              WHERE preset_id IS NULL`
        );
        let matcher: RegExp;
        try {
            matcher = new RegExp(rule.pattern);
        } catch {
            return 0;
        }
        const matched = free
            .map((row) => row.normalized)
            .filter((normalized) => matcher.test(normalized));
        if (matched.length === 0) return 0;
        let removed = 0;
        // 分批删除，避免超长 IN 列表（标签库通常远小于这个量级）。
        for (let index = 0; index < matched.length; index += 500) {
            const chunk = matched.slice(index, index + 500);
            const placeholders = chunk.map(() => "?").join(", ");
            const result = await executeSql(
                this.database,
                `DELETE FROM namecard_tags
                  WHERE preset_id IS NULL AND normalized IN (${placeholders})`,
                chunk
            );
            removed += result.meta.changes;
        }
        return removed;
    }

    private normalizeAliases(
        aliases: readonly string[],
        presetKey: string
    ): Array<{ text: string; normalized: string }> {
        const seen = new Set<string>([presetKey]);
        const normalized: Array<{ text: string; normalized: string }> = [];
        for (const raw of aliases) {
            const text = normalizeTagName(raw);
            if (text === "") continue;
            const key = normalizeTagKey(text);
            if (seen.has(key)) continue;
            seen.add(key);
            normalized.push({ text, normalized: key });
        }
        return normalized;
    }

    private async writeAliases(
        database: SqlDatabase,
        presetId: number,
        aliases: readonly { text: string; normalized: string }[]
    ): Promise<void> {
        if (aliases.length === 0) return;
        await database.batch(
            aliases.map((alias) =>
                database
                    .prepare(
                        `INSERT INTO namecard_tag_aliases
                             (preset_id, text, normalized)
                         VALUES (?, ?, ?)`
                    )
                    .bind(presetId, alias.text, alias.normalized)
            )
        );
    }

    private async readPreset(
        database: SqlDatabase,
        id: number
    ): Promise<NamecardTagPresetRecord> {
        const row = await queryOne<PresetRow>(
            database,
            `SELECT preset.id, preset.name,
                    COALESCE((
                        SELECT json_agg(alias.text ORDER BY alias.text)
                          FROM namecard_tag_aliases alias
                         WHERE alias.preset_id=preset.id
                    ), '[]') AS aliases,
                    preset.created_at, preset.updated_at
               FROM namecard_tag_presets preset
              WHERE preset.id=?`,
            [id]
        );
        if (!row) {
            throw Object.assign(new Error("预设标签不存在"), { status: 404 });
        }
        return this.presetRecord(row);
    }

    private presetRecord(row: PresetRow): NamecardTagPresetRecord {
        return {
            id: numberId(row.id),
            name: row.name,
            aliases: aliasList(row.aliases),
            createdAt: iso(row.created_at),
            updatedAt: iso(row.updated_at),
        };
    }

    private blocklistRecord(row: BlocklistRow): NamecardTagBlocklistRecord {
        return {
            id: numberId(row.id),
            pattern: row.pattern,
            isRegex: row.is_regex === true,
            createdAt: iso(row.created_at),
        };
    }

    private async blockRules(database: SqlDatabase): Promise<
        Array<{ id: number; pattern: string; isRegex: boolean }>
    > {
        const rows = await queryAll<BlocklistRow>(
            database,
            `SELECT id, pattern, is_regex, created_at
               FROM namecard_tag_blocklist
              ORDER BY id`
        );
        return rows.map((row) => ({
            id: numberId(row.id),
            pattern: row.pattern,
            isRegex: row.is_regex === true,
        }));
    }

    private async resolvePresets(
        database: SqlDatabase,
        normalized: readonly string[]
    ): Promise<Map<string, number>> {
        const resolved = new Map<string, number>();
        if (normalized.length === 0) return resolved;
        const placeholders = normalized.map(() => "?").join(", ");
        const presetRows = await queryAll<{
            normalized: string;
            id: number | string;
        }>(
            database,
            `SELECT normalized, id FROM namecard_tag_presets
              WHERE normalized IN (${placeholders})`,
            normalized
        );
        // 预设名优先于别名：同名冲突时以预设本身为准。
        for (const row of presetRows) {
            resolved.set(row.normalized, numberId(row.id));
        }
        const aliasRows = await queryAll<{
            normalized: string;
            id: number | string;
        }>(
            database,
            `SELECT normalized, preset_id AS id FROM namecard_tag_aliases
              WHERE normalized IN (${placeholders})`,
            normalized
        );
        for (const row of aliasRows) {
            if (!resolved.has(row.normalized)) {
                resolved.set(row.normalized, numberId(row.id));
            }
        }
        return resolved;
    }

    private assertValidPattern(pattern: string, isRegex: boolean): void {
        if (pattern.trim() === "") throw badTagRequest("屏蔽词不能为空");
        if (!isRegex) return;
        try {
            new RegExp(pattern);
        } catch {
            throw badTagRequest("正则表达式无效");
        }
    }
}

/** PostgreSQL 唯一约束冲突：`23505`。 */
function isUniqueViolation(error: unknown): boolean {
    if (!error || typeof error !== "object") return false;
    const code = (error as { code?: unknown }).code;
    return code === "23505" || code === 23505;
}
