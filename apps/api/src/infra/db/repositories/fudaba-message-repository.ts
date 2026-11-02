import type { FudabaWallLayoutItem } from '@imsweb/contracts/fudaba/messages';
import type {
    FudabaMessage,
    FudabaMessageColor,
    FudabaMessageEditInput,
    FudabaMessagePlacementInput,
    FudabaMessageListResponse,
} from '@imsweb/contracts/fudaba/messages';
import type {
    FudabaMessageFailure,
    FudabaMessageResult,
    FudabaMessagesRepository,
    FudabaMixedWallQuery,
    FudabaMixedWallRecord,
} from '@/ports/repositories/fudaba-messages';
import type {
    FudabaPublicPlacedCardRecord,
    FudabaPublicWallRecord,
} from '@/ports/repositories/fudaba';
import type { ManagedSqlDatabase, SqlDatabase } from '@/infra/db/sql/database';
import { executeSql, queryAll, queryOne } from '@/infra/db/sql/query';

function cardLabel(card: { producer_name: string }): string {
    const name = card.producer_name.trim();
    return name ? name + '的名片' : '名片';
}

interface MessageRow {
    display_height: number;
    paper_layout_version: number;
    id: string;
    office_id: string;
    author_account_id: string;
    content: string;
    color: FudabaMessageColor;
    publication_status: string;
    created_at: string | Date;
    updated_at: string | Date;
    content_revision: number;
    moderation_revision: number;
    hidden_at: string | Date | null;
    admin_hidden_at: string | Date | null;
    author_name: string;
    office_slug: string;
    office_name: string;
    office_status: 'active' | 'hidden' | 'archived';
    is_open: boolean;
    owner_account_id: string;
    author_status: string;
    author_deleted_at: unknown;
    owner_status: string;
    owner_deleted_at: unknown;
    pinned_at: string | Date;
    world_x: number;
    world_y: number;
    rotation: number;
    z_index: number;
    placement_revision: number;
    placement_updated_at: string | Date;
}
interface OfficeRow {
    id: string;
    owner_account_id: string;
    status: string;
    is_open: boolean;
    owner_status: string;
    owner_deleted_at: unknown;
}
interface MixedKey {
    id: string;
    kind: 'card' | 'message';
    pinned: string;
}
interface Cursor {
    scope: string;
    pinned: string;
    id: string;
    kind?: string;
}
const selectMessage = `SELECT message.*, office.slug AS office_slug, office.name AS office_name,
    office.status AS office_status, office.is_open, office.owner_account_id,
    author.status AS author_status, author.deleted_at AS author_deleted_at,
    owner.status AS owner_status, owner.deleted_at AS owner_deleted_at,
    COALESCE(profile.display_name,'制作人') AS author_name,
    placement.pinned_at, placement.world_x, placement.world_y, placement.rotation, placement.z_index,
    placement.revision AS placement_revision, placement.updated_at AS placement_updated_at
    FROM fudaba_messages message JOIN fudaba_offices office ON office.id=message.office_id
    JOIN platform_accounts author ON author.id=message.author_account_id
    JOIN platform_accounts owner ON owner.id=office.owner_account_id
    LEFT JOIN platform_profiles profile ON profile.account_id=message.author_account_id
    JOIN fudaba_message_placements placement ON placement.message_id=message.id`;
const publicMessage = `message.publication_status='published' AND message.hidden_at IS NULL AND message.admin_hidden_at IS NULL
    AND office.status='active' AND owner.status IN ('active','restricted') AND owner.deleted_at IS NULL
    AND author.status IN ('active','restricted') AND author.deleted_at IS NULL`;
function timestamp(value: string | Date): string {
    return value instanceof Date ? value.toISOString() : value;
}
function decodeCursor(value: string | undefined, scope: string): Cursor | null {
    if (!value) return null;
    let cursor: Cursor;
    try {
        cursor = JSON.parse(
            Buffer.from(value, 'base64url').toString()
        ) as Cursor;
    } catch {
        throw Object.assign(new Error('游标无效'), { status: 400 });
    }
    if (
        !cursor ||
        typeof cursor !== 'object' ||
        Array.isArray(cursor) ||
        cursor.scope !== scope ||
        typeof cursor.id !== 'string' ||
        cursor.id.length < 1 ||
        cursor.id.length > 128 ||
        typeof cursor.pinned !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/.test(
            cursor.pinned
        ) ||
        !Number.isFinite(Date.parse(cursor.pinned))
    )
        throw Object.assign(new Error('游标不属于当前查询'), { status: 400 });
    return cursor;
}
function encodeCursor(cursor: Cursor): string {
    return Buffer.from(JSON.stringify(cursor)).toString('base64url');
}
function bounds(x: number, y: number, rotation: number, height = 277) {
    const radians = (rotation * Math.PI) / 180;
    return [
        Math.abs(Math.cos(radians)) * 121 +
            Math.abs(Math.sin(radians)) * (height / 2) +
            16,
        Math.abs(Math.sin(radians)) * 121 +
            Math.abs(Math.cos(radians)) * (height / 2) +
            16,
        x,
        y,
    ];
}

export class SqlFudabaMessageRepository implements FudabaMessagesRepository {
    constructor(
        private readonly database: ManagedSqlDatabase,
        private readonly cards: {
            wall(
                slug: string,
                actorId: string | null
            ): Promise<FudabaPublicWallRecord | null>;
            hydrate(
                officeId: string,
                ids: string[],
                actorId: string | null
            ): Promise<FudabaPublicPlacedCardRecord[]>;
        }
    ) {}
    private async active(
        database: SqlDatabase,
        actorId: string,
        lock = false
    ): Promise<boolean> {
        return !!(await queryOne(
            database,
            "SELECT id FROM platform_accounts WHERE id=? AND status='active' AND deleted_at IS NULL" +
                (lock ? ' FOR UPDATE' : ''),
            [actorId]
        ));
    }
    async read(id: string, actorId: string): Promise<FudabaMessageResult> {
        const row = await this.row(this.database, id);
        if (!row) return { status: 'not-found' };
        if (
            row.author_account_id !== actorId &&
            row.owner_account_id !== actorId
        )
            return { status: 'forbidden' };
        return {
            status: 'ok',
            message: this.view(
                row,
                actorId,
                await this.active(this.database, actorId)
            ),
        };
    }
    private async office(
        database: SqlDatabase,
        id: string
    ): Promise<OfficeRow | null> {
        await queryOne(
            database,
            'SELECT id FROM fudaba_offices WHERE id=? FOR NO KEY UPDATE',
            [id]
        );
        return queryOne(
            database,
            `SELECT office.*, owner.status AS owner_status, owner.deleted_at AS owner_deleted_at FROM fudaba_offices office JOIN platform_accounts owner ON owner.id=office.owner_account_id WHERE office.id=?`,
            [id]
        );
    }
    private async row(
        database: SqlDatabase,
        id: string,
        lock = false
    ): Promise<MessageRow | null> {
        if (lock)
            await queryOne(
                database,
                'SELECT id FROM fudaba_messages WHERE id=? FOR UPDATE',
                [id]
            );
        return queryOne<MessageRow>(
            database,
            `${selectMessage} WHERE message.id=?`,
            [id]
        );
    }
    private view(
        row: MessageRow,
        actorId: string | null,
        active: boolean,
        admin = false
    ): FudabaMessage {
        const mine = row.author_account_id === actorId;
        const owner = row.owner_account_id === actorId;
        const hidden =
            row.hidden_at !== null ||
            row.admin_hidden_at !== null ||
            row.publication_status !== 'published';
        const open =
            row.office_status === 'active' &&
            row.is_open &&
            ['active', 'restricted'].includes(row.owner_status) &&
            row.owner_deleted_at === null;
        return {
            id: row.id,
            office: {
                id: row.office_id,
                slug: row.office_slug,
                name: row.office_name,
                status: row.office_status,
                isOpen: row.is_open,
            },
            authorAccountId: row.author_account_id,
            authorName: row.author_name,
            content: row.content,
            color: row.color,
            createdAt: timestamp(row.created_at),
            updatedAt: timestamp(row.updated_at),
            contentRevision: Number(row.content_revision),
            moderationRevision: Number(row.moderation_revision),
            hiddenByOffice: row.hidden_at !== null,
            hiddenByAdmin: row.admin_hidden_at !== null,
            placement: {
                pinnedAt: timestamp(row.pinned_at),
                x: Number(row.world_x),
                y: Number(row.world_y),
                rotation: Number(row.rotation),
                zIndex: Number(row.z_index),
                revision: Number(row.placement_revision),
                updatedAt: timestamp(row.placement_updated_at),
            },
            capabilities: {
                canEdit: active && mine && open && !hidden,
                canMove:
                    active &&
                    (mine || owner) &&
                    open &&
                    !hidden &&
                    ['active', 'restricted'].includes(row.author_status) &&
                    row.author_deleted_at === null,
                canDestroy: active && mine && !admin,
                canModerateOffice: active && owner && !admin,
                canModerateAdmin: admin,
            },
        };
    }
    private async expand(
        database: SqlDatabase,
        officeId: string,
        x: number,
        y: number,
        rotation: number,
        z: number,
        height = 277
    ): Promise<void> {
        const [rx, ry] = bounds(x, y, rotation, height);
        await executeSql(
            database,
            `UPDATE fudaba_office_walls SET max_z_index=GREATEST(max_z_index,?), left_edge=LEAST(left_edge,floor(?/800.0)*800), top_edge=LEAST(top_edge,floor(?/450.0)*450), right_edge=GREATEST(right_edge,ceil(?/800.0)*800), bottom_edge=GREATEST(bottom_edge,ceil(?/450.0)*450) WHERE office_id=?`,
            [z, x - rx, y - ry, x + rx, y + ry, officeId]
        );
    }
    private async writableOffice(
        database: SqlDatabase,
        officeId: string
    ): Promise<OfficeRow | FudabaMessageFailure> {
        const office = await this.office(database, officeId);
        if (!office) return { status: 'not-found' };
        if (
            office.status !== 'active' ||
            !office.is_open ||
            !['active', 'restricted'].includes(office.owner_status) ||
            office.owner_deleted_at !== null
        )
            return { status: 'closed' };
        return office;
    }
    async create(input: {
        id: string;
        officeId: string;
        actorId: string;
        content: string;
        height?: number;
        color: FudabaMessageColor;
        center?: { x: number; y: number };
        keyHash: string;
        requestHash: string;
        now: string;
    }): Promise<FudabaMessageResult> {
        return this.database.transaction(async (database) => {
            await queryOne(
                database,
                'SELECT id FROM platform_accounts WHERE id=? FOR UPDATE',
                [input.actorId]
            );
            if (!(await this.active(database, input.actorId)))
                return { status: 'forbidden' };
            const receipt = await queryOne<{
                request_hash: string;
                resource_id: string;
            }>(
                database,
                "SELECT request_hash,resource_id FROM fudaba_mutation_receipts WHERE scope='message-create' AND account_id=? AND key_hash=?",
                [input.actorId, input.keyHash]
            );
            if (receipt) {
                if (receipt.request_hash !== input.requestHash)
                    return { status: 'idempotency-conflict' };
                const row = await this.row(database, receipt.resource_id);
                if (!row) return { status: 'gone' };
                if (
                    row.hidden_at !== null ||
                    row.admin_hidden_at !== null ||
                    row.publication_status !== 'published'
                )
                    return { status: 'not-editable' };
                if (row.office_status !== 'active') return { status: 'closed' };
                return {
                    status: 'ok',
                    message: this.view(row, input.actorId, true),
                };
            }
            const office = await this.writableOffice(database, input.officeId);
            if ('status' in office && !('id' in office)) return office;
            const cooldown = await queryOne<{
                last_published_at: Date | string;
            }>(
                database,
                'SELECT last_published_at FROM fudaba_message_publish_cooldowns WHERE account_id=? AND office_id=?',
                [input.actorId, input.officeId]
            );
            if (cooldown) {
                const remaining =
                    10_000 -
                    (Date.parse(input.now) -
                        Date.parse(timestamp(cooldown.last_published_at)));
                if (remaining > 0)
                    return {
                        status: 'limited',
                        retryAfter: Math.ceil(remaining / 1000),
                    };
            }
            const occupied = await queryAll<{
                x: number;
                y: number;
                rx: number;
                ry: number;
            }>(
                database,
                `SELECT world_x AS x,world_y AS y,abs(cos(radians(rotation)))*120+abs(sin(radians(rotation)))*80 AS rx,abs(sin(radians(rotation)))*120+abs(cos(radians(rotation)))*80 AS ry FROM fudaba_office_cards WHERE office_id=? UNION ALL SELECT world_x,world_y,abs(cos(radians(rotation)))*121+abs(sin(radians(rotation)))*message.display_height/2.0,abs(sin(radians(rotation)))*121+abs(cos(radians(rotation)))*message.display_height/2.0 FROM fudaba_message_placements placement JOIN fudaba_messages message ON message.id=placement.message_id WHERE placement.office_id=?`,
                [input.officeId, input.officeId]
            );
            const height = input.height ?? 277;
            const center = input.center ?? { x: 800, y: 450 };
            const clamp = (value: number) =>
                Math.min(999800, Math.max(-999800, value));
            let x = clamp(center.x),
                y = clamp(center.y),
                found = false;
            for (let index = 0; index <= occupied.length * 4 + 32; index++) {
                const ring = Math.ceil((Math.sqrt(index + 1) - 1) / 2);
                const side = 2 * ring;
                const offset = index - (2 * ring - 1) ** 2;
                let dx = 0,
                    dy = 0;
                if (ring > 0) {
                    if (offset < side) {
                        dx = ring;
                        dy = -ring + offset;
                    } else if (offset < 2 * side) {
                        dx = ring - (offset - side);
                        dy = ring;
                    } else if (offset < 3 * side) {
                        dx = -ring;
                        dy = ring - (offset - 2 * side);
                    } else {
                        dx = -ring + (offset - 3 * side);
                        dy = -ring;
                    }
                }
                x = clamp(center.x + dx * 280);
                y = clamp(center.y + dy * 320);
                if (
                    !occupied.some(
                        (item) =>
                            Math.abs(Number(item.x) - x) <
                                Number(item.rx) + 137 &&
                            Math.abs(Number(item.y) - y) <
                                Number(item.ry) + height / 2 + 16
                    )
                ) {
                    found = true;
                    break;
                }
            }
            if (!found) return { status: 'closed' };
            const wall = await queryOne<{ max_z_index: number }>(
                database,
                'SELECT max_z_index FROM fudaba_office_walls WHERE office_id=?',
                [input.officeId]
            );
            if (
                !wall ||
                Number(wall.max_z_index) >= 2147483000 ||
                y > 1_000_000
            )
                return { status: 'closed' };
            const z = Number(wall.max_z_index) + 1;
            await executeSql(
                database,
                'INSERT INTO fudaba_messages(id,office_id,author_account_id,content,color,created_at,updated_at,display_height) VALUES(?,?,?,?,?,?,?,?)',
                [
                    input.id,
                    input.officeId,
                    input.actorId,
                    input.content.trim(),
                    input.color,
                    input.now,
                    input.now,
                    height,
                ]
            );
            await executeSql(
                database,
                'INSERT INTO fudaba_message_placements(message_id,office_id,pinned_at,world_x,world_y,z_index,updated_at) VALUES(?,?,?,?,?,?,?)',
                [input.id, input.officeId, input.now, x, y, z, input.now]
            );
            await this.expand(database, input.officeId, x, y, 0, z, height);
            await executeSql(
                database,
                "INSERT INTO fudaba_mutation_receipts(scope,account_id,key_hash,request_hash,resource_id,created_at) VALUES('message-create',?,?,?,?,?)",
                [
                    input.actorId,
                    input.keyHash,
                    input.requestHash,
                    input.id,
                    Date.parse(input.now),
                ]
            );
            await executeSql(
                database,
                'INSERT INTO fudaba_message_publish_cooldowns(account_id,office_id,last_published_at) VALUES(?,?,?) ON CONFLICT(account_id,office_id) DO UPDATE SET last_published_at=EXCLUDED.last_published_at',
                [input.actorId, input.officeId, input.now]
            );
            return {
                status: 'ok',
                message: this.view(
                    (await this.row(database, input.id))!,
                    input.actorId,
                    true
                ),
            };
        });
    }
    async edit(
        id: string,
        actorId: string,
        input: FudabaMessageEditInput,
        now: string
    ): Promise<FudabaMessageResult> {
        return this.database.transaction(async (database) => {
            if (!(await this.active(database, actorId, true)))
                return { status: 'forbidden' };
            const before = await this.row(database, id);
            if (!before) return { status: 'not-found' };
            const office = await this.writableOffice(
                database,
                before.office_id
            );
            if (!('id' in office)) return office;
            const row = (await this.row(database, id, true))!;
            if (!row || row.author_account_id !== actorId)
                return { status: 'forbidden' };
            if (
                row.hidden_at !== null ||
                row.admin_hidden_at !== null ||
                row.publication_status !== 'published'
            )
                return { status: 'not-editable' };
            if (Number(row.content_revision) !== input.expectedRevision)
                return {
                    status: 'conflict',
                    revision: Number(row.content_revision),
                };
            await executeSql(
                database,
                'UPDATE fudaba_messages SET content=?,color=?,display_height=?,content_revision=content_revision+1,updated_at=? WHERE id=?',
                [
                    input.content.trim(),
                    input.color,
                    input.height ?? Number(row.display_height),
                    now,
                    id,
                ]
            );
            await this.expand(
                database,
                row.office_id,
                Number(row.world_x),
                Number(row.world_y),
                Number(row.rotation),
                Number(row.z_index),
                input.height ?? Number(row.display_height)
            );
            return {
                status: 'ok',
                message: this.view(
                    (await this.row(database, id))!,
                    actorId,
                    true
                ),
            };
        });
    }
    async place(
        id: string,
        actorId: string,
        input: FudabaMessagePlacementInput,
        now: string
    ): Promise<FudabaMessageResult> {
        return this.database.transaction(async (database) => {
            if (!(await this.active(database, actorId, true)))
                return { status: 'forbidden' };
            const before = await this.row(database, id);
            if (!before) return { status: 'not-found' };
            const office = await this.writableOffice(
                database,
                before.office_id
            );
            if (!('id' in office)) return office;
            const row = await this.row(database, id, true);
            if (!row) return { status: 'not-found' };
            if (
                row.author_account_id !== actorId &&
                row.owner_account_id !== actorId
            )
                return { status: 'forbidden' };
            if (!this.view(row, actorId, true).capabilities.canMove)
                return { status: 'not-editable' };
            if (Number(row.placement_revision) !== input.expectedRevision)
                return {
                    status: 'conflict',
                    revision: Number(row.placement_revision),
                };
            const wall = await queryOne<{ max_z_index: number }>(
                database,
                'SELECT max_z_index FROM fudaba_office_walls WHERE office_id=?',
                [row.office_id]
            );
            const z =
                input.zIndex === Number(row.z_index)
                    ? Number(row.z_index)
                    : Number(wall!.max_z_index) + 1;
            if (z > 2147483000) return { status: 'closed' };
            await executeSql(
                database,
                'UPDATE fudaba_message_placements SET world_x=?,world_y=?,rotation=?,z_index=?,revision=revision+1,updated_at=? WHERE message_id=?',
                [input.x, input.y, input.rotation, z, now, id]
            );
            await this.expand(
                database,
                row.office_id,
                input.x,
                input.y,
                input.rotation,
                z,
                Number(row.display_height)
            );
            return {
                status: 'ok',
                message: this.view(
                    (await this.row(database, id))!,
                    actorId,
                    true
                ),
            };
        });
    }
    async destroy(
        id: string,
        actorId: string
    ): Promise<{ status: 'ok' } | FudabaMessageFailure> {
        return this.database.transaction(async (database) => {
            if (!(await this.active(database, actorId, true)))
                return { status: 'forbidden' };
            const row = await this.row(database, id, true);
            if (!row) return { status: 'gone' };
            if (row.author_account_id !== actorId)
                return { status: 'forbidden' };
            await executeSql(
                database,
                'DELETE FROM fudaba_messages WHERE id=?',
                [id]
            );
            return { status: 'ok' };
        });
    }
    async moderate(
        id: string,
        actorId: string,
        layer: 'office' | 'admin',
        hidden: boolean,
        expectedRevision: number,
        now: string
    ): Promise<FudabaMessageResult> {
        return this.database.transaction(async (database) => {
            if (
                layer === 'office' &&
                !(await this.active(database, actorId, true))
            )
                return { status: 'forbidden' };
            if (
                layer === 'admin' &&
                (!/^[1-9][0-9]*$/.test(actorId) ||
                    !(await queryOne(
                        database,
                        "SELECT id FROM backoffice_accounts WHERE id=? AND dept='op' AND admin_role='super_admin' FOR UPDATE",
                        [actorId]
                    )))
            )
                return { status: 'forbidden' };
            const before = await this.row(database, id);
            if (!before) return { status: 'not-found' };
            await this.office(database, before.office_id);
            const row = await this.row(database, id, true);
            if (!row) return { status: 'not-found' };
            if (layer === 'office' && row.owner_account_id !== actorId)
                return { status: 'forbidden' };
            if (Number(row.moderation_revision) !== expectedRevision)
                return {
                    status: 'conflict',
                    revision: Number(row.moderation_revision),
                };
            const columns =
                layer === 'office'
                    ? ['hidden_at', 'hidden_by_account_id']
                    : ['admin_hidden_at', 'admin_hidden_by_id'];
            await executeSql(
                database,
                `UPDATE fudaba_messages SET ${columns[0]}=?,${columns[1]}=?,moderation_revision=moderation_revision+1 WHERE id=?`,
                [hidden ? now : null, hidden ? actorId : null, id]
            );
            await executeSql(
                database,
                'INSERT INTO fudaba_message_moderation_audit(message_id,office_id,layer,actor_account_id,actor_admin_id,hidden,created_at) VALUES(?,?,?,?,?,?,?)',
                [
                    id,
                    row.office_id,
                    layer,
                    layer === 'office' ? actorId : null,
                    layer === 'admin' ? actorId : null,
                    hidden,
                    now,
                ]
            );
            return {
                status: 'ok',
                message: this.view(
                    (await this.row(database, id))!,
                    layer === 'office' ? actorId : null,
                    layer === 'office',
                    layer === 'admin'
                ),
            };
        });
    }
    async list(input: {
        actorId: string;
        mode: 'mine' | 'office' | 'admin';
        officeId?: string;
        status?: 'all' | 'visible' | 'office-hidden' | 'admin-hidden';
        limit: number;
        cursor?: string;
        scope: string;
    }): Promise<FudabaMessageListResponse | null> {
        if (
            input.mode === 'admin' &&
            (!/^[1-9][0-9]*$/.test(input.actorId) ||
                !(await queryOne(
                    this.database,
                    "SELECT id FROM backoffice_accounts WHERE id=? AND dept='op' AND admin_role='super_admin'",
                    [input.actorId]
                )))
        )
            return null;
        const active =
            input.mode === 'admin'
                ? false
                : await this.active(this.database, input.actorId);
        const clauses: string[] = [];
        const values: unknown[] = [];
        if (input.mode === 'mine') {
            clauses.push('message.author_account_id=?');
            values.push(input.actorId);
        }
        if (input.mode === 'office') {
            const owner = await queryOne(
                this.database,
                'SELECT id FROM fudaba_offices WHERE id=? AND owner_account_id=?',
                [input.officeId, input.actorId]
            );
            if (!owner) return null;
            clauses.push('message.office_id=?');
            values.push(input.officeId);
        } else if (input.officeId) {
            clauses.push('message.office_id=?');
            values.push(input.officeId);
        }
        if (input.status === 'visible') clauses.push(publicMessage);
        if (input.status === 'office-hidden')
            clauses.push('message.hidden_at IS NOT NULL');
        if (input.status === 'admin-hidden')
            clauses.push('message.admin_hidden_at IS NOT NULL');
        const cursor = decodeCursor(input.cursor, input.scope);
        if (cursor) {
            clauses.push('(message.created_at,message.id)<(?,?)');
            values.push(cursor.pinned, cursor.id);
        }
        values.push(input.limit + 1);
        const rows = await queryAll<MessageRow & { cursor_time: string }>(
            this.database,
            `${selectMessage.replace('SELECT message.*,', `SELECT to_char(message.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_time,message.*,`)} WHERE ${clauses.length ? clauses.join(' AND ') : 'TRUE'} ORDER BY message.created_at DESC,message.id DESC LIMIT ?`,
            values
        );
        const next = rows.length > input.limit;
        const page = rows.slice(0, input.limit);
        const last = page.at(-1);
        return {
            messages: page.map((row) =>
                this.view(
                    row,
                    input.mode === 'admin' ? null : input.actorId,
                    active,
                    input.mode === 'admin'
                )
            ),
            pageInfo: {
                hasNextPage: next,
                nextCursor:
                    next && last
                        ? encodeCursor({
                              scope: input.scope,
                              pinned: last.cursor_time,
                              id: last.id,
                          })
                        : null,
            },
        };
    }
    async readWall(
        slug: string,
        actorId: string | null,
        query: FudabaMixedWallQuery
    ): Promise<FudabaMixedWallRecord | null> {
        const base = await this.cards.wall(slug, actorId);
        if (!base) return null;
        const office = await queryOne<OfficeRow>(
            this.database,
            `SELECT office.id,office.owner_account_id,office.status,office.is_open,owner.status AS owner_status,owner.deleted_at AS owner_deleted_at FROM fudaba_offices office JOIN platform_accounts owner ON owner.id=office.owner_account_id WHERE office.id=?`,
            [base.office.id]
        );
        const active =
            actorId !== null && (await this.active(this.database, actorId));
        const owner = active && office!.owner_account_id === actorId;
        const cardSql = `SELECT card.id,'card' AS kind,placement.pinned_at,placement.world_x AS x,placement.world_y AS y,placement.rotation,120.0 AS rx,80.0 AS ry FROM fudaba_office_cards placement JOIN fudaba_cards card ON card.id=placement.card_id JOIN platform_accounts account ON account.id=card.owner_account_id WHERE placement.office_id=? AND card.publication_status='published'  AND card.deleted_at IS NULL AND account.status IN ('active','restricted') AND account.deleted_at IS NULL AND EXISTS (
            SELECT 1 FROM fudaba_card_series entry
            JOIN agencies series ON series.code=entry.series_code
            WHERE entry.card_id=card.id
              AND (series.wiki_enabled OR series.code='namecard-other')
        )`;
        const messageSql = `SELECT message.id,'message' AS kind,placement.pinned_at,placement.world_x AS x,placement.world_y AS y,placement.rotation,121.0 AS rx,message.display_height / 2.0 AS ry FROM fudaba_messages message JOIN fudaba_message_placements placement ON placement.message_id=message.id JOIN fudaba_offices office ON office.id=message.office_id JOIN platform_accounts author ON author.id=message.author_account_id JOIN platform_accounts owner ON owner.id=office.owner_account_id WHERE message.office_id=? AND ${publicMessage}`;
        const clauses: string[] = [];
        const values: unknown[] = [base.office.id, base.office.id];
        if (query.bbox) {
            clauses.push(
                'x+abs(cos(radians(rotation)))*rx+abs(sin(radians(rotation)))*ry+16>=? AND x-abs(cos(radians(rotation)))*rx-abs(sin(radians(rotation)))*ry-16<=? AND y+abs(sin(radians(rotation)))*rx+abs(cos(radians(rotation)))*ry+16>=? AND y-abs(sin(radians(rotation)))*rx-abs(cos(radians(rotation)))*ry-16<=?'
            );
            values.push(
                query.bbox[0],
                query.bbox[2],
                query.bbox[1],
                query.bbox[3]
            );
        }
        if (query.item) {
            const separator = query.item.indexOf(':');
            const kind = query.item.slice(0, separator);
            const id = query.item.slice(separator + 1);
            if (!['card', 'message'].includes(kind) || separator < 1)
                throw Object.assign(new Error('物件标识无效'), { status: 400 });
            clauses.push('kind=? AND id=?');
            values.push(kind, id);
        }
        const cursor = decodeCursor(query.cursor, query.scope);
        if (cursor) {
            if (!['card', 'message'].includes(cursor.kind ?? ''))
                throw Object.assign(new Error('游标无效'), { status: 400 });
            clauses.push('(pinned_at,kind,id)>(?,?,?)');
            values.push(cursor.pinned, cursor.kind, cursor.id);
        }
        values.push(query.limit + 1);
        const keys = await queryAll<MixedKey>(
            this.database,
            `SELECT id,kind,to_char(pinned_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS pinned FROM (${cardSql} UNION ALL ${messageSql}) mixed ${clauses.length ? 'WHERE ' + clauses.join(' AND ') : ''} ORDER BY pinned_at,kind,id LIMIT ?`,
            values
        );
        const page = keys.slice(0, query.limit);
        const cardIds = page
            .filter((key) => key.kind === 'card')
            .map((key) => key.id);
        const cardMap = new Map(
            (await this.cards.hydrate(base.office.id, cardIds, actorId)).map(
                (card) => [card.id, card]
            )
        );
        const messageIds = page
            .filter((key) => key.kind === 'message')
            .map((key) => key.id);
        const messages = messageIds.length
            ? await queryAll<MessageRow>(
                  this.database,
                  `${selectMessage} WHERE message.id IN (${messageIds.map(() => '?').join(',')}) AND ${publicMessage}`,
                  messageIds
              )
            : [];
        const messageMap = new Map(
            messages.map((row) => [row.id, this.view(row, actorId, active)])
        );
        const items: FudabaMixedWallRecord['items'] = [];
        for (const key of page) {
            if (key.kind === 'card') {
                const card = cardMap.get(key.id);
                if (card)
                    items.push({
                        kind: 'card',
                        card,
                        canMove:
                            active &&
                            office!.is_open &&
                            (owner || card.viewer_owned),
                    });
            } else {
                const message = messageMap.get(key.id);
                if (message) items.push({ kind: 'message', message });
            }
        }
        const count = await queryOne<{ total: string }>(
            this.database,
            `SELECT COUNT(*) AS total FROM fudaba_messages message JOIN fudaba_offices office ON office.id=message.office_id JOIN platform_accounts author ON author.id=message.author_account_id JOIN platform_accounts owner ON owner.id=office.owner_account_id WHERE message.office_id=? AND ${publicMessage}`,
            [base.office.id]
        );
        const next = keys.length > query.limit;
        const last = page.at(-1);
        return {
            office: base.office,
            wall: {
                ...base.wall,
                total: base.wall.total + Number(count?.total ?? 0),
            },
            items,
            pageInfo: {
                hasNextPage: next,
                nextCursor:
                    next && last
                        ? encodeCursor({ scope: query.scope, ...last })
                        : null,
            },
            capabilities: {
                canCreateMessage: active && office!.is_open,
                canArrangeWall: owner && office!.is_open,
                canManageMessages: owner,
            },
        };
    }
    async layouts(
        items: FudabaMixedWallRecord['items'],
        includeBack = false
    ): Promise<FudabaWallLayoutItem[]> {
        const ids = items
            .filter((item) => item.kind === 'message')
            .map((item) => item.message.id);
        const heights = ids.length
            ? await queryAll<{ id: string; display_height: number }>(
                  this.database,
                  `SELECT id,display_height FROM fudaba_messages WHERE id IN (${ids.map(() => '?').join(',')})`,
                  ids
              )
            : [];
        const byId = new Map(
            heights.map((row) => [row.id, Number(row.display_height)])
        );
        const cardIds = items.flatMap((item) =>
            item.kind === 'card' ? [item.card.id] : []
        );
        const mediaVersions = cardIds.length
            ? await queryAll<{ id: string; revision: number }>(
                  this.database,
                  `SELECT id, revision FROM fudaba_cards WHERE id IN (${cardIds.map(() => '?').join(',')})`,
                  cardIds
              )
            : [];
        const mediaVersionById = new Map(
            mediaVersions.map((row) => [row.id, row.revision])
        );
        const keys = items.flatMap((item) =>
            item.kind === 'card'
                ? [
                      item.card.front_object_key,
                      ...(includeBack && item.card.back_object_key ? [item.card.back_object_key] : []),
                  ]
                : []
        );
        const previews = keys.length
            ? await queryAll<{
                  object_key: string;
                  asset_sha256: string;
                  preview_data_url: string;
              }>(
                  this.database,
                  `SELECT object_key,asset_sha256,preview_data_url FROM fudaba_card_media_previews WHERE object_key IN (${keys.map(() => '?').join(',')})`,
                  keys
              )
            : [];
        const byKey = new Map(previews.map((row) => [row.object_key, row]));
        return items.map((item) => {
            if (item.kind === 'message')
                return {
                    kind: 'message' as const,
                    id: item.message.id,
                    placement: item.message.placement,
                    width: 242,
                    height: byId.get(item.message.id) ?? 277,
                    layoutVersion: 1 as const,
                    color: item.message.color,
                    contentRevision: item.message.contentRevision,
                };
            const card = item.card;
            const preview = byKey.get(card.front_object_key);
            return {
                kind: 'card' as const,
                id: card.id,
                displayName: cardLabel(card),
                viewerOwned: card.viewer_owned,
                width: 240,
                height: 160,
                layoutVersion: 1 as const,
                placement: {
                    pinnedAt: timestamp(card.pinned_at),
                    x: Number(card.position_x),
                    y: Number(card.position_y),
                    rotation: Number(card.rotation),
                    zIndex: Number(card.z_index),
                    revision: Number(card.revision),
                    updatedAt: timestamp(card.updated_at),
                },
                preview: preview?.preview_data_url ?? null,
                ...(includeBack
                    ? {
                          backPreview:
                              (card.back_object_key
                                  ? byKey.get(card.back_object_key)?.preview_data_url
                                  : null) ?? null,
                      }
                    : {}),
                assetVersion: String(mediaVersionById.get(card.id) ?? 0),
            };
        });
    }

    async saveMediaPreview(
        objectKey: string,
        assetSha256: string,
        preview: string | null,
        guard: { cardId: string; revision: number; side: 'front' | 'back' }
    ): Promise<boolean> {
        return this.database.transaction(async (database) => {
            const card = await queryOne<{
                revision: number;
                front_object_key: string;
                back_object_key: string | null;
                deleted_at: string | null;
            }>(
                database,
                'SELECT revision, front_object_key, back_object_key, deleted_at FROM fudaba_cards WHERE id = ? FOR UPDATE',
                [guard.cardId]
            );
            if (
                !card ||
                card.deleted_at ||
                card.revision !== guard.revision ||
                (guard.side === 'front'
                    ? card.front_object_key
                    : card.back_object_key) !== objectKey
            ) {
                return false;
            }
            if (!preview) {
                await executeSql(
                    database,
                    'DELETE FROM fudaba_card_media_previews WHERE object_key = ?',
                    [objectKey]
                );
                return true;
            }
            await executeSql(
                database,
                `INSERT INTO fudaba_card_media_previews (object_key, asset_sha256, preview_data_url)
                VALUES (?, ?, ?) ON CONFLICT (object_key) DO UPDATE
                SET asset_sha256 = EXCLUDED.asset_sha256, preview_data_url = EXCLUDED.preview_data_url, created_at = CURRENT_TIMESTAMP`,
                [objectKey, assetSha256, preview]
            );
            return true;
        });
    }

    async listLayoutBackfill(after: string, limit: number) {
        const rows = await queryAll<{
            id: string;
            content: string;
            content_revision: number;
            display_height: number;
        }>(
            this.database,
            'SELECT id,content,content_revision,display_height FROM fudaba_messages WHERE id>? ORDER BY id LIMIT ?',
            [after, limit]
        );
        return rows.map((row) => ({
            id: row.id,
            content: row.content,
            contentRevision: Number(row.content_revision),
            height: Number(row.display_height),
        }));
    }
    async applyLayoutBackfill(
        id: string,
        expectedRevision: number,
        height: number
    ): Promise<'ok' | 'conflict' | 'gone'> {
        if (!Number.isInteger(height) || height < 160 || height > 560)
            throw new Error('Invalid paper height');
        return this.database.transaction(async (database) => {
            const before = await this.row(database, id);
            if (!before) return 'gone';
            await queryOne(
                database,
                'SELECT id FROM fudaba_offices WHERE id=? FOR UPDATE',
                [before.office_id]
            );
            const row = await this.row(database, id, true);
            if (!row) return 'gone';
            if (Number(row.content_revision) !== expectedRevision)
                return 'conflict';
            await executeSql(
                database,
                'UPDATE fudaba_messages SET display_height=?,paper_layout_version=1 WHERE id=?',
                [height, id]
            );
            await this.expand(
                database,
                row.office_id,
                Number(row.world_x),
                Number(row.world_y),
                Number(row.rotation),
                Number(row.z_index),
                height
            );
            return 'ok';
        });
    }
    async listPreviewBackfill(
        after: string,
        limit: number
    ): Promise<
        {
            objectKey: string;
            cardId: string;
            revision: number;
            side: 'front' | 'back';
        }[]
    > {
        const rows = await queryAll<{
            object_key: string;
            card_id: string;
            revision: number;
            side: 'front' | 'back';
        }>(
            this.database,
            `SELECT DISTINCT ON (asset.object_key)
            asset.object_key, card.id AS card_id, card.revision, asset.side
            FROM fudaba_cards card
            CROSS JOIN LATERAL (VALUES ('front', card.front_object_key), ('back', card.back_object_key)) AS asset(side, object_key)
            LEFT JOIN fudaba_card_media_previews preview ON preview.object_key = asset.object_key
            WHERE card.deleted_at IS NULL AND asset.object_key > ? AND preview.object_key IS NULL
            ORDER BY asset.object_key, card.id, asset.side LIMIT ?`,
            [after, limit]
        );
        return rows.map((row) => ({
            objectKey: row.object_key,
            cardId: row.card_id,
            revision: row.revision,
            side: row.side,
        }));
    }
}
