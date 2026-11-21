import {
    fudabaCardFieldsSubmissionSchema,
    type FudabaCardFieldsRequest,
    type FudabaCardUpdateRequest,
    type NamecardCardFieldIssue
} from '@imsweb/contracts/fudaba';
import { parseFudabaRevision } from '@/domains/community/fudaba/contracts/card';

export type FudabaCardCreditRole = 'design' | 'illustration' | 'other';

/** One designer / illustrator credited for the artwork. */
export interface FudabaCardCredit {
    accountId: string | null;
    displayName: string;
    url: string | null;
    roles: FudabaCardCreditRole[];
}

export type FudabaExchangeMode = 'auto' | 'manual' | 'none';

export interface FudabaCardFields {
    bio: string;
    /** 团体名片：制作人名称由团体名称派生，交换模式固定为自动。 */
    isGroupCard: boolean;
    credits: FudabaCardCredit[];
    exchangeMode: FudabaExchangeMode;
    favoriteCharacterIds: number[];
    /** 所属团体; absent until the owner fills it in. */
    groupName: string | null;
    producerReading: string | null;
    isOriginal: boolean;
    /** `YYYY` / `YYYY-MM` / `YYYY-MM-DD`; absent when unknown. */
    madeOn: string | null;
    madeWithAi: boolean;
    producerName: string;
    seriesCodes: string[];
    /** 标签：即时生效，不进审核载荷。 */
    tags?: string[];
    tradeNote: string;
    /** 显示状态: whether other visitors see the card at all. */
    visible: boolean;
}

export interface FudabaCardUpdate extends FudabaCardFields {
    expectedRevision: number;
}

export interface FudabaCardPlacementSubmission {
    positionX: number;
    positionY: number;
    rotation: number;
    zIndex: number;
    expectedRevision: number | null;
}

/** 一次保存里按顺时针 90° 圈数（0-3）记录的页面旋转。 */
export interface FudabaMediaRotations {
    front: number;
    back: number;
    middles: number[];
}

const MAX_PLACEMENT_REVISION = 2_147_483_647;

/**
 * 卡片字段的规则全部在 `@imsweb/contracts/fudaba` 的 zod schema 里：上限、去重、
 * 日期范围、名称读法、枚举、跨字段要求。这一层只负责「multipart 字符串 → 规范
 * 对象」的强制转换、缺省值填充与派生字段，不再自己判断业务规则。
 */

/**
 * 每个 multipart 字段的强制转换。表以外的字段原样送出——合法值范围与格式都由
 * schema 判定。
 */

/** JSON 文本 → 数组/对象；解不开就原样留着，让 schema 报格式错误。 */
function parseJson(value: unknown): unknown {
    if (typeof value !== 'string') return value;
    try {
        return JSON.parse(value);
    } catch {
        return value;
    }
}

/** `'true'` / `'false'` → 布尔；其它值原样留着。 */
function parseFlag(value: unknown): unknown {
    if (value === 'true') return true;
    if (value === 'false') return false;
    return value;
}

/** 空串与只有空白的字符串都是「没有填写」，按缺省处理成 null。 */
function parseNullableText(value: unknown): unknown {
    if (typeof value === 'string' && value.trim().length === 0) return null;
    return value;
}

/** 企划编码先修剪（schema 只判形态，不修剪）。 */
function parseSeriesCodes(value: unknown): unknown {
    const parsed = parseJson(value);
    return Array.isArray(parsed)
        ? parsed.map((code) => (typeof code === 'string' ? code.trim() : code))
        : parsed;
}

/** credits 的每个字段同样来自 multipart 字符串。 */
function coerceCredit(value: unknown): unknown {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return value;
    const credit = { ...(value as Record<string, unknown>) };
    if ('accountId' in credit) {
        credit.accountId = parseNullableText(credit.accountId);
    }
    if ('url' in credit) {
        credit.url = parseNullableText(credit.url);
    }
    if ('roles' in credit) {
        credit.roles = parseJson(credit.roles);
    }
    return credit;
}

function parseCredits(value: unknown): unknown {
    const parsed = parseJson(value);
    return Array.isArray(parsed) ? parsed.map(coerceCredit) : parsed;
}

const FIELD_COERCIONS: Record<string, (value: unknown) => unknown> = {
    seriesCodes: parseSeriesCodes,
    favoriteCharacterIds: parseJson,
    tags: parseJson,
    credits: parseCredits,
    isGroupCard: parseFlag,
    isOriginal: parseFlag,
    madeWithAi: parseFlag,
    visible: parseFlag,
    groupName: parseNullableText,
    producerReading: parseNullableText,
    madeOn: parseNullableText
};

/**
 * 缺省值：布尔默认关、可见默认开、交换模式默认手动、可空文本与 credit 默认空。
 * 只补缺，不覆盖已经送来的值——不合格的值交给 schema 报错。
 */
const CARD_FIELD_DEFAULTS: Record<string, unknown> = {
    producerName: '',
    isGroupCard: false,
    isOriginal: false,
    madeWithAi: false,
    visible: true,
    exchangeMode: 'manual',
    groupName: null,
    producerReading: null,
    madeOn: null,
    credits: []
};

/**
 * multipart 的字符串字段 → schema 能读的规范对象。未知字段原样保留，
 * 好让 `.strict()` 的 schema 拒绝它。
 */
function coerceCardFields(fields: Record<string, unknown>): Record<string, unknown> {
    const coerced: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(fields)) {
        const coerce = FIELD_COERCIONS[key];
        coerced[key] = coerce ? coerce(raw) : raw;
    }
    for (const [key, fallback] of Object.entries(CARD_FIELD_DEFAULTS)) {
        coerced[key] ??= fallback;
    }
    return coerced;
}

/** 旧手写 adapter 的业务文案，按报错字段还原；规则本身已经不在这一层。 */
const CARD_FIELD_MESSAGES: Record<string, string> = {
    producerName: 'producerName 长度或内容无效',
    bio: 'bio 长度或内容无效',
    tradeNote: 'tradeNote 长度或内容无效',
    groupName: 'groupName 长度或内容无效',
    producerReading: '制作人名读法只能使用日文假名、英文字母、撇号与连字符',
    madeOn: 'madeOn 无效',
    exchangeMode: 'exchangeMode 无效',
    seriesCodes: 'seriesCodes 无效',
    favoriteCharacterIds: 'favoriteCharacterIds 无效',
    credits: 'credits 无效',
    isGroupCard: 'isGroupCard 必须是布尔值',
    isOriginal: 'isOriginal 必须是布尔值',
    madeWithAi: 'madeWithAi 必须是布尔值',
    visible: 'visible 必须是布尔值'
};

/** zod 的首个报错 → 客户端一直在读的中文文案。 */
function cardFieldsMessage(issues: readonly NamecardCardFieldIssue[]): string {
    const issue = issues[0];
    if (!issue) return '请求体字段无效';
    if (issue.code === 'unrecognized_keys') return '请求体包含未知字段';
    // 跨字段规则写在 schema 里，文案也由它给出。
    if (issue.code === 'custom' && issue.path.length === 0) {
        return issue.message || '请求体字段无效';
    }
    const field = issue.path[0];
    if (typeof field !== 'string') return '请求体字段无效';
    if (
        (issue.code === 'too_big' || issue.code === 'too_small') &&
        issue.type === 'string'
    ) {
        return `${field} 长度或内容无效`;
    }
    return CARD_FIELD_MESSAGES[field] ?? `${field} 无效`;
}

/**
 * 派生与缺省（不是规则判断）：团体名片的制作人名称由团体名称派生、交换模式固定
 * 自动、始终可见；原创声明与 AI 声明互斥，两个都勾上时以 AI 声明为准。
 */
function normalizeCardFields(fields: FudabaCardFieldsRequest): FudabaCardFields {
    const isGroupCard = fields.isGroupCard ?? false;
    const groupName = fields.groupName;
    return {
        isGroupCard,
        // 团体名片的制作人名称是选填（团体可能有吉祥物）：留空时回落到团体名称。
        // 走到这里团体名称一定非空——schema 的跨字段规则拦住了空团体名称。
        producerName: isGroupCard
            ? fields.producerName || groupName || ''
            : fields.producerName,
        seriesCodes: fields.seriesCodes,
        favoriteCharacterIds: fields.favoriteCharacterIds,
        bio: fields.bio,
        tradeNote: fields.tradeNote,
        // 团体名片只能是自动交换，前端即便传了别的值也按自动处理。
        exchangeMode: isGroupCard ? 'auto' : fields.exchangeMode,
        madeOn: fields.madeOn,
        groupName,
        producerReading: fields.producerReading,
        isOriginal: fields.isOriginal && !fields.madeWithAi,
        madeWithAi: fields.madeWithAi,
        // 团体名片的表述是「任何人都可以自由领取」，所以它必须可见。
        visible: isGroupCard ? true : fields.visible,
        credits: fields.credits,
        tags: fields.tags
    };
}

function badRequest(message: string): Error {
    return Object.assign(new Error(message), { status: 400 });
}

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw badRequest('请求体必须是对象');
    }
    return value as Record<string, unknown>;
}

function allowedKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
    const expected = new Set(allowed);
    if (Object.keys(value).some((key) => !expected.has(key))) {
        throw badRequest('请求体包含未知字段');
    }
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): void {
    const actual = Object.keys(value);
    const allowed = new Set(expected);
    if (
        actual.length !== expected.length ||
        actual.some((key) => !allowed.has(key))
    ) {
        throw badRequest('请求体字段无效');
    }
}

function finiteNumber(
    value: unknown,
    name: string,
    minimum: number,
    maximum: number
): number {
    if (
        typeof value !== 'number' || !Number.isFinite(value) ||
        value < minimum || value > maximum
    ) {
        throw badRequest(`${name} 必须是 ${minimum} 到 ${maximum} 之间的数字`);
    }
    return value;
}

function zIndex(value: unknown): number {
    if (
        typeof value !== 'number' || !Number.isSafeInteger(value) ||
        value < 1 || value > 2_147_483_000
    ) {
        throw badRequest('zIndex 超出墙面层级范围');
    }
    return value;
}

function placementRevision(value: unknown): number {
    if (
        typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 ||
        value > MAX_PLACEMENT_REVISION
    ) {
        throw badRequest(
            `expectedRevision 必须是 0 到 ${MAX_PLACEMENT_REVISION} 之间的整数`
        );
    }
    return value;
}

/**
 * 保存时随图一起提交的旋转，按顺时针 90° 的圈数记（0-3）。只在真正写入的那一次
 * 生效：新建和替换图片各算一次保存，revision 只加一次。
 */
export function parseMediaRotations(
    value: string | undefined | null
): FudabaMediaRotations {
    if (!value) return { front: 0, back: 0, middles: [] };
    let parsed: unknown;
    try {
        parsed = JSON.parse(value);
    } catch {
        throw Object.assign(new Error('旋转参数格式无效'), { status: 400 });
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw Object.assign(new Error('旋转参数格式无效'), { status: 400 });
    }
    const turns = (input: unknown): number => {
        if (input === undefined) return 0;
        if (typeof input !== 'number' || !Number.isInteger(input) || input < 0 || input > 3) {
            throw Object.assign(new Error('旋转圈数必须是 0-3 的整数'), { status: 400 });
        }
        return input;
    };
    const record = parsed as { front?: unknown; back?: unknown; middles?: unknown };
    const middles = record.middles === undefined ? [] : record.middles;
    if (!Array.isArray(middles)) {
        throw Object.assign(new Error('中间页旋转格式无效'), { status: 400 });
    }
    return {
        front: turns(record.front),
        back: turns(record.back),
        middles: middles.map((value) => turns(value))
    };
}

/**
 * 是否有任何一张页面需要旋转。中间页也算进去：只提交 `middles` 圈数时，写入
 * 阶段一样会用到 `images.rotate`，门禁漏了它就会踩到非空断言。
 */
export function hasMediaRotations(rotations: FudabaMediaRotations): boolean {
    return (
        Boolean(rotations.front || rotations.back) ||
        rotations.middles.some((turns) => turns !== 0)
    );
}

/**
 * multipart 提交的字段边界：contracts 的 schema 只在这里执行（与路由上的
 * `jsonSchemaValidator` 同级），转换层负责先把字符串还原成规范对象。
 */
function cardFieldsSchemaValidator(
    schema: typeof fudabaCardFieldsSubmissionSchema,
    fields: Record<string, unknown>
): FudabaCardFields {
    const parsed = schema.safeParse(coerceCardFields(fields));
    if (!parsed.success) throw badRequest(cardFieldsMessage(parsed.error.issues));
    return normalizeCardFields(parsed.data);
}

/**
 * 创建只送 multipart 字符串：先做强制转换，再交给创建侧的 zod schema 判规则。
 */
export function parseFudabaCardCreateFields(
    fields: Record<string, string>
): FudabaCardFields {
    // 旋转随图提交，由 `parseMediaRotations` 单独解析，不属于卡片内容字段。
    const content: Record<string, unknown> = { ...fields };
    delete content.rotations;
    return cardFieldsSchemaValidator(fudabaCardFieldsSubmissionSchema, content);
}

/**
 * 更新请求已经由路由上的 `fudabaCardUpdateRequestSchema` 校验过（同一份规则），
 * 这里只补缺省、做派生字段。
 */
export function parseFudabaCardUpdate(
    body: FudabaCardUpdateRequest
): FudabaCardUpdate {
    return {
        ...normalizeCardFields(body),
        expectedRevision: body.expectedRevision
    };
}

export function parseFudabaDelete(value: unknown): number {
    const body = object(value);
    allowedKeys(body, ['expectedRevision']);
    return parseFudabaRevision(body.expectedRevision);
}

export function parseFudabaCardPlacement(
    value: unknown
): FudabaCardPlacementSubmission {
    const body = object(value);
    exactKeys(body, ['layoutVersion', 'x', 'y', 'rotation', 'zIndex', 'expectedRevision']);
    if (body.layoutVersion !== 1) throw badRequest('layoutVersion 无效');
    return {
        positionX: finiteNumber(body.x, 'x', -1_000_000, 1_000_000),
        positionY: finiteNumber(body.y, 'y', -1_000_000, 1_000_000),
        rotation: finiteNumber(body.rotation, 'rotation', -12, 12),
        zIndex: zIndex(body.zIndex),
        expectedRevision: body.expectedRevision === null
            ? null
            : placementRevision(body.expectedRevision)
    };
}

export function parseFudabaCardPlacementRemoval(value: unknown): number {
    const body = object(value);
    exactKeys(body, ['expectedRevision']);
    return placementRevision(body.expectedRevision);
}
