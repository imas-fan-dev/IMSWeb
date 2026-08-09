const MAX_GROUPS = 8;
const MAX_PEOPLE_PER_GROUP = 24;
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const DEFAULT_HERO_IMAGE_URL = '/brand/about/gakuen-arisa.png';
const DEFAULT_HERO_IMAGE_ALT = '亚里沙老师全身立绘';
const DEFAULT_HERO_IMAGE_SCALE = 100;
const DEFAULT_HERO_IMAGE_OFFSET_X = 0;
const DEFAULT_HERO_IMAGE_OFFSET_Y = 0;
const DEFAULT_ACCENT_COLOR_START = '#B4E04B';
const DEFAULT_ACCENT_COLOR_END = '#E6F9E5';
const DEFAULT_STAFF_AVATAR_URLS: Record<string, string> = {
    'iris-radio-p': '/brand/about/staff/iris-radio-p.webp',
    'edge-of-dream': '/brand/about/staff/edge-of-dream.webp',
    'tata-is-eating': '/brand/about/staff/tata.jpg',
    'album-hnn-kaori': '/brand/about/staff/album-hnn-kaori.webp',
    asahikari: '/brand/about/staff/asahikari.webp',
    'rainbow-notes': '/brand/about/staff/rainbow-notes.webp',
    'sakuragaoka-unnamed': '/brand/about/staff/sakuragaoka-unnamed.webp'
};

export interface AboutPerson {
    id: string;
    name: string;
    role: string;
    description: string;
    since: string;
    profileUrl: string | null;
    avatarUrl: string | null;
}

export interface AboutGroup {
    id: string;
    title: string;
    subtitle: string;
    people: AboutPerson[];
}

export interface AboutPageDraft {
    version: 1;
    siteName: string;
    siteNameEn: string;
    tagline: string;
    heroImageUrl: string | null;
    heroImageAlt: string;
    heroImageScale: number;
    heroImageOffsetX: number;
    heroImageOffsetY: number;
    accentColorStart: string;
    accentColorEnd: string;
    welcome: string;
    manifesto: string[];
    sinceYear: number;
    overviewTitle: string;
    overview: string[];
    groups: AboutGroup[];
}

export interface AboutPageContent extends AboutPageDraft {
    updatedAt: string | null;
}

function invalid(message: string): never {
    throw Object.assign(new Error(message), { status: 400 });
}

function record(value: unknown, message = '关于页配置格式无效'): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(message);
    return value as Record<string, unknown>;
}

function text(value: unknown, label: string, maxLength: number, allowEmpty = false): string {
    const normalized = typeof value === 'string' ? value.trim() : '';
    if ((!normalized && !allowEmpty) || normalized.length > maxLength) {
        invalid(`${label}必须为${allowEmpty ? '0' : '1'}-${maxLength}个字符`);
    }
    return normalized;
}

function textList(
    value: unknown,
    label: string,
    options: { maxItems: number; maxLength: number }
): string[] {
    if (!Array.isArray(value) || value.length < 1 || value.length > options.maxItems) {
        invalid(`${label}数量必须为1-${options.maxItems}项`);
    }
    return value.map((item, index) =>
        text(item, `${label}第${index + 1}项`, options.maxLength)
    );
}

function identifier(value: unknown, label: string): string {
    const normalized = text(value, label, 80);
    if (!ID_PATTERN.test(normalized)) invalid(`${label}必须为小写 kebab-case`);
    return normalized;
}

function integer(
    value: unknown,
    label: string,
    min: number,
    max: number,
    fallback: number
): number {
    if (value === undefined) return fallback;
    if (value === null || value === '') invalid(`${label}必须为${min}-${max}之间的整数`);
    const normalized = Number(value);
    if (!Number.isInteger(normalized) || normalized < min || normalized > max) {
        invalid(`${label}必须为${min}-${max}之间的整数`);
    }
    return normalized;
}

function hexColor(value: unknown, label: string, fallback: string): string {
    if (value === undefined) return fallback;
    const normalized = text(value, label, 7);
    if (!HEX_COLOR_PATTERN.test(normalized)) invalid(`${label}必须为六位十六进制颜色`);
    return normalized.toUpperCase();
}

function profileUrl(value: unknown, label: string): string | null {
    if (value === null || value === undefined || value === '') return null;
    const normalized = text(value, label, 500);
    try {
        const url = new URL(normalized);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') invalid(`${label}无效`);
    } catch {
        invalid(`${label}无效`);
    }
    return normalized;
}

function imageUrl(
    value: unknown,
    label: string,
    fallback: string | null = null
): string | null {
    if (value === undefined) return fallback;
    if (value === null || value === '') return null;
    const normalized = text(value, label, 500);
    if (normalized.startsWith('/') && !normalized.startsWith('//')) {
        if (normalized.includes('\\') || normalized.split('/').includes('..')) {
            invalid(`${label}无效`);
        }
        return normalized;
    }
    try {
        const url = new URL(normalized);
        if (url.protocol !== 'https:' && url.protocol !== 'http:') invalid(`${label}无效`);
    } catch {
        invalid(`${label}无效`);
    }
    return normalized;
}

function person(value: unknown, groupIndex: number, personIndex: number): AboutPerson {
    const source = record(value);
    const prefix = `第${groupIndex + 1}组第${personIndex + 1}位成员`;
    const id = identifier(source.id, `${prefix} ID`);
    return {
        id,
        name: text(source.name, `${prefix}名称`, 80),
        role: text(source.role, `${prefix}身份`, 80),
        description: text(source.description, `${prefix}简介`, 500, true),
        since: text(source.since, `${prefix}加入时间`, 40, true),
        profileUrl: profileUrl(source.profileUrl, `${prefix}主页链接`),
        avatarUrl: imageUrl(
            source.avatarUrl,
            `${prefix}头像链接`,
            DEFAULT_STAFF_AVATAR_URLS[id] ?? null
        )
    };
}

function group(value: unknown, index: number): AboutGroup {
    const source = record(value);
    if (!Array.isArray(source.people) || source.people.length > MAX_PEOPLE_PER_GROUP) {
        invalid(`第${index + 1}组成员数量必须为0-${MAX_PEOPLE_PER_GROUP}人`);
    }
    const people = source.people.map((item, personIndex) => person(item, index, personIndex));
    const personIds = new Set(people.map((item) => item.id));
    if (personIds.size !== people.length) invalid(`第${index + 1}组成员 ID 不能重复`);
    return {
        id: identifier(source.id, `第${index + 1}组 ID`),
        title: text(source.title, `第${index + 1}组标题`, 80),
        subtitle: text(source.subtitle, `第${index + 1}组英文标题`, 80, true),
        people
    };
}

export function validateAboutPageDraft(value: unknown): AboutPageDraft {
    const source = record(value);
    if (source.version !== 1) invalid('关于页配置版本无效');
    const sinceYear = Number(source.sinceYear);
    if (!Number.isInteger(sinceYear) || sinceYear < 2005 || sinceYear > 2100) {
        invalid('成立年份必须为2005-2100之间的整数');
    }
    if (!Array.isArray(source.groups) || source.groups.length < 1 || source.groups.length > MAX_GROUPS) {
        invalid(`名单分组数量必须为1-${MAX_GROUPS}组`);
    }
    const groups = source.groups.map(group);
    const groupIds = new Set(groups.map((item) => item.id));
    if (groupIds.size !== groups.length) invalid('名单分组 ID 不能重复');
    return {
        version: 1,
        siteName: text(source.siteName, '站点名称', 80),
        siteNameEn: text(source.siteNameEn, '站点英文说明', 160, true),
        tagline: text(source.tagline, '站点简介', 240),
        heroImageUrl: imageUrl(
            source.heroImageUrl,
            '角色主视觉图链接',
            DEFAULT_HERO_IMAGE_URL
        ),
        heroImageAlt: source.heroImageAlt === undefined
            ? DEFAULT_HERO_IMAGE_ALT
            : text(source.heroImageAlt, '角色主视觉替代文本', 120),
        heroImageScale: integer(
            source.heroImageScale,
            '角色主视觉缩放',
            60,
            160,
            DEFAULT_HERO_IMAGE_SCALE
        ),
        heroImageOffsetX: integer(
            source.heroImageOffsetX,
            '角色主视觉水平偏移',
            -40,
            40,
            DEFAULT_HERO_IMAGE_OFFSET_X
        ),
        heroImageOffsetY: integer(
            source.heroImageOffsetY,
            '角色主视觉垂直偏移',
            -40,
            40,
            DEFAULT_HERO_IMAGE_OFFSET_Y
        ),
        accentColorStart: hexColor(
            source.accentColorStart,
            '主视觉渐变起始色',
            DEFAULT_ACCENT_COLOR_START
        ),
        accentColorEnd: hexColor(
            source.accentColorEnd,
            '主视觉渐变结束色',
            DEFAULT_ACCENT_COLOR_END
        ),
        welcome: text(source.welcome, '欢迎语', 120),
        manifesto: textList(source.manifesto, '站点宣言', {
            maxItems: 8,
            maxLength: 120
        }),
        sinceYear,
        overviewTitle: text(source.overviewTitle, '概要标题', 80),
        overview: textList(source.overview, '概要段落', {
            maxItems: 12,
            maxLength: 1_000
        }),
        groups
    };
}

export function parseAboutPageContent(body: Uint8Array): AboutPageContent {
    let value: unknown;
    try {
        value = JSON.parse(new TextDecoder().decode(body));
    } catch {
        throw new Error('Stored about page config is not valid JSON');
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Stored about page config is invalid');
    }
    const source = value as Record<string, unknown>;
    const updatedAt = source.updatedAt;
    if (updatedAt !== null && (
        typeof updatedAt !== 'string' ||
        !Number.isFinite(Date.parse(updatedAt))
    )) {
        throw new Error('Stored about page update time is invalid');
    }
    try {
        return { ...validateAboutPageDraft(source), updatedAt };
    } catch (error) {
        throw new Error('Stored about page config is invalid', { cause: error });
    }
}

export function serializeAboutPageContent(content: AboutPageContent): Uint8Array {
    return new TextEncoder().encode(`${JSON.stringify(content)}\n`);
}

export function defaultAboutPageContent(): AboutPageContent {
    return {
        version: 1,
        siteName: '偶像大师交流站',
        siteNameEn: 'A website for producers to communicate.',
        tagline: '由制作人共同维护的偶像大师中文资料与社区站点。',
        heroImageUrl: DEFAULT_HERO_IMAGE_URL,
        heroImageAlt: DEFAULT_HERO_IMAGE_ALT,
        heroImageScale: DEFAULT_HERO_IMAGE_SCALE,
        heroImageOffsetX: DEFAULT_HERO_IMAGE_OFFSET_X,
        heroImageOffsetY: DEFAULT_HERO_IMAGE_OFFSET_Y,
        accentColorStart: DEFAULT_ACCENT_COLOR_START,
        accentColorEnd: DEFAULT_ACCENT_COLOR_END,
        welcome: '欢迎全世界的普罗丢瑟！',
        manifesto: ['为了「Top Idol」之名，', '奋斗不止吧！', '不要停下来啊！'],
        sinceYear: 2026,
        overviewTitle: '本站概要',
        overview: [
            '偶像大师交流站（idol-master.top）于2026年正式开始运作。',
            '网站成立的目的是让普罗丢瑟们能够快速获取自己所需要的各类信息。目前网站还在初期建设阶段，如有建议和意见，欢迎联系站长与副站长。',
            '网站正在持续招募运营成员。有想法的制作人可以毛遂自荐，帮助我们一起完善这里。',
            '如果您想支持网站的服务器与长期维护，欢迎通过B站充电或私信联系我们。希望本网站能对您有所帮助。'
        ],
        groups: [
            {
                id: 'creators',
                title: '创始人',
                subtitle: 'Creator',
                people: [
                    {
                        id: 'iris-radio-p',
                        name: '鸢尾收音机P',
                        role: '站长',
                        description: '向全世界传递快乐！！！',
                        since: 'Since 2026',
                        profileUrl: 'https://space.bilibili.com/41356186',
                        avatarUrl: DEFAULT_STAFF_AVATAR_URLS['iris-radio-p']
                    },
                    {
                        id: 'edge-of-dream',
                        name: '梦想之边',
                        role: '副站长',
                        description: '新人一个',
                        since: 'Since 2026',
                        profileUrl: 'https://space.bilibili.com/244756131',
                        avatarUrl: DEFAULT_STAFF_AVATAR_URLS['edge-of-dream']
                    }
                ]
            },
            {
                id: 'special-thanks',
                title: '特别鸣谢',
                subtitle: 'Special Thanks',
                people: [
                    {
                        id: 'tata-is-eating',
                        name: 'TaTa在吃饭',
                        role: '特别鸣谢',
                        description: '在加拿大摸鱼的制作人，amn坚定支持者。愿大家都有美好的未来。',
                        since: '',
                        profileUrl: 'https://space.bilibili.com/102897637/dynamic',
                        avatarUrl: DEFAULT_STAFF_AVATAR_URLS['tata-is-eating']
                    }
                ]
            },
            {
                id: 'outstanding-contribution',
                title: '卓越贡献',
                subtitle: 'Outstanding Contribution',
                people: [
                    {
                        id: 'album-hnn-kaori',
                        name: '相簿- Hnn·Kaori担当',
                        role: '卓越贡献',
                        description: '水组／星组组推，765 Million Allstars箱推。请支持偶像大师百万色彩。',
                        since: '',
                        profileUrl: 'https://space.bilibili.com/22441985',
                        avatarUrl: DEFAULT_STAFF_AVATAR_URLS['album-hnn-kaori']
                    },
                    {
                        id: 'asahikari',
                        name: '朝日光_あさひかり',
                        role: '卓越贡献',
                        description: 'asahikari.cn · spine.asahikari.cn',
                        since: '',
                        profileUrl: 'https://space.bilibili.com/28216419',
                        avatarUrl: DEFAULT_STAFF_AVATAR_URLS.asahikari
                    },
                    {
                        id: 'rainbow-notes',
                        name: '虹色笔记',
                        role: '卓越贡献',
                        description: '',
                        since: '',
                        profileUrl: 'https://space.bilibili.com/8023589',
                        avatarUrl: DEFAULT_STAFF_AVATAR_URLS['rainbow-notes']
                    },
                    {
                        id: 'sakuragaoka-unnamed',
                        name: '樱丘的无名丶',
                        role: '卓越贡献',
                        description: '好累',
                        since: '',
                        profileUrl: 'https://space.bilibili.com/612303',
                        avatarUrl: DEFAULT_STAFF_AVATAR_URLS['sakuragaoka-unnamed']
                    }
                ]
            }
        ],
        updatedAt: null
    };
}
