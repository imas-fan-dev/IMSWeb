const CMS_API_BASE =
    'https://cmsapi-frontend.idolmaster-official.jp/sitern/api/';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const LIVE_CATEGORY = 'ライブ・イベント';
const REQUEST_TIMEOUT_MS = 30_000;
export const LIVE_SCHEDULE_START_MONTH = '2020-08';

const BRAND_NAMES: Record<string, string> = {
    IDOLMASTER: '765PRO ALLSTARS',
    CINDERELLAGIRLS: '灰姑娘女孩',
    MILLIONLIVE: '百万现场！',
    SIDEM: 'SideM',
    SHINYCOLORS: '闪耀色彩',
    GAKUEN: '学园偶像大师',
    'VA-LIV': 'VA-LIV',
    OTHER: '其他'
};

interface CmsBrand {
    code?: unknown;
}

interface CmsCategory {
    name?: unknown;
}

interface CmsArticle {
    _id?: unknown;
    title?: unknown;
    event_title?: unknown;
    event_startdate?: unknown;
    event_dspdate?: unknown;
    event_url?: unknown;
    path?: unknown;
    content?: unknown;
    brand?: CmsBrand | CmsBrand[] | null;
    categories?: {
        subcategory?: CmsCategory[] | null;
    } | null;
}

interface CmsListResponse {
    data?: {
        article_list?: CmsArticle[] | null;
    };
}

interface CmsTokenResponse {
    data?: {
        token?: unknown;
    };
}

export interface LiveScheduleEvent {
    id: string;
    year: number;
    month: number;
    day: number;
    title: string;
    time: string;
    location: string;
    detailUrl?: string;
    franchises: string[];
    brandCodes: string[];
}

interface CachedSchedule {
    expiresAt: number;
    events: LiveScheduleEvent[];
}

const cache = new Map<string, CachedSchedule>();
const refreshes = new Map<string, Promise<LiveScheduleEvent[]>>();

function monthEnd(month: Date): Date {
    return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
}

function dateText(date: Date): string {
    return date.toISOString().slice(0, 10);
}

export function isLiveScheduleMonth(value: string): boolean {
    if (!/^\d{4}-(?:0[1-9]|1[0-2])$/.test(value)) return false;
    return value >= LIVE_SCHEDULE_START_MONTH;
}

function monthDate(month: string): Date {
    const [year, monthNumber] = month.split('-').map(Number);
    return new Date(Date.UTC(year, monthNumber - 1, 1));
}

function stringValue(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function brandCodes(article: CmsArticle): string[] {
    const brands = Array.isArray(article.brand)
        ? article.brand
        : article.brand
            ? [article.brand]
            : [];
    let codes = brands
        .map((brand) => stringValue(brand.code))
        .filter(Boolean);
    const searchable = [
        article.title,
        article.event_url,
        article.path,
        article.content
    ].map(stringValue).join(' ').toLowerCase();
    if (/va-liv|valiv|ヴイアライヴ/.test(searchable)) {
        codes = codes.map((code) => code === 'OTHER' ? 'VA-LIV' : code);
        if (!codes.length) codes = ['VA-LIV'];
    }
    if (codes.length > 1) codes = codes.filter((code) => code !== 'OTHER');
    return [...new Set(codes.length ? codes : ['OTHER'])];
}

function isLiveEvent(article: CmsArticle): boolean {
    const categories = article.categories?.subcategory;
    return Array.isArray(categories) && categories.some(
        (category) => stringValue(category.name) === LIVE_CATEGORY
    );
}

function detailUrl(article: CmsArticle): string | undefined {
    const value = stringValue(article.event_url) || stringValue(article.path);
    if (!value) return undefined;
    try {
        return new URL(value, 'https://idolmaster-official.jp').toString();
    } catch {
        return undefined;
    }
}

export function normalizeLiveScheduleArticle(
    article: CmsArticle
): LiveScheduleEvent | null {
    if (!isLiveEvent(article)) return null;
    const timestamp = Number(article.event_startdate);
    if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
    const date = new Date(timestamp * 1000);
    if (Number.isNaN(date.getTime())) return null;
    const title = stringValue(article.title) || stringValue(article.event_title);
    if (!title) return null;
    const codes = brandCodes(article);
    const id = stringValue(article._id) || [
        title,
        dateText(date),
        detailUrl(article) || ''
    ].join('|');
    return {
        id,
        year: date.getUTCFullYear(),
        month: date.getUTCMonth() + 1,
        day: date.getUTCDate(),
        title,
        time: stringValue(article.event_dspdate),
        location: '',
        detailUrl: detailUrl(article),
        franchises: codes.map((code) => BRAND_NAMES[code] || code),
        brandCodes: codes
    };
}

async function readJson<T>(response: Response): Promise<T> {
    if (!response.ok) {
        throw new Error(`Official CMS returned ${response.status}`);
    }
    return response.json() as Promise<T>;
}

async function fetchToken(fetcher: typeof fetch): Promise<string> {
    const url = new URL('cmsbase/Token/get', CMS_API_BASE);
    url.searchParams.set('site', 'jp');
    url.searchParams.set('ip', 'idolmaster');
    const payload = await readJson<CmsTokenResponse>(await fetcher(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    }));
    const token = stringValue(payload.data?.token);
    if (!token) throw new Error('Official CMS token is unavailable');
    return token;
}

async function fetchMonth(
    fetcher: typeof fetch,
    token: string,
    month: string
): Promise<CmsArticle[]> {
    const start = monthDate(month);
    const url = new URL('idolmaster/Article/list', CMS_API_BASE);
    const payload = {
        category: ['SCHEDULE'],
        target_start_date: dateText(start),
        target_end_date: dateText(monthEnd(start))
    };
    url.searchParams.set('site', 'jp');
    url.searchParams.set('ip', 'idolmaster');
    url.searchParams.set('token', token);
    url.searchParams.set('sort', 'asc');
    url.searchParams.set('limit', '200');
    url.searchParams.set('data', JSON.stringify(payload));
    const response = await readJson<CmsListResponse>(await fetcher(url, {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    }));
    return Array.isArray(response.data?.article_list)
        ? response.data.article_list
        : [];
}

async function fetchMonthWithRetry(
    fetcher: typeof fetch,
    token: string,
    month: string
): Promise<CmsArticle[]> {
    try {
        return await fetchMonth(fetcher, token, month);
    } catch (firstError) {
        try {
            return await fetchMonth(fetcher, token, month);
        } catch (secondError) {
            throw new AggregateError(
                [firstError, secondError],
                `Failed to fetch official schedule for ${month}`
            );
        }
    }
}

function normalizeArticles(
    articles: CmsArticle[],
    month?: string
): LiveScheduleEvent[] {
    const unique = new Map<string, LiveScheduleEvent>();
    for (const article of articles) {
        const event = normalizeLiveScheduleArticle(article);
        if (
            event &&
            (!month || `${event.year}-${String(event.month).padStart(2, '0')}` === month)
        ) {
            unique.set(event.id, event);
        }
    }
    return sortEvents([...unique.values()]);
}

function sortEvents(events: LiveScheduleEvent[]): LiveScheduleEvent[] {
    return events.sort((a, b) => {
        if (a.year !== b.year) return a.year - b.year;
        if (a.month !== b.month) return a.month - b.month;
        if (a.day !== b.day) return a.day - b.day;
        return a.title.localeCompare(b.title, 'ja');
    });
}

export async function fetchLiveScheduleMonths(
    fetcher: typeof fetch,
    months: string[]
): Promise<Map<string, LiveScheduleEvent[]>> {
    const token = await fetchToken(fetcher);
    const entries = await Promise.all(months.map(async (month) => [
        month,
        normalizeArticles(await fetchMonthWithRetry(fetcher, token, month), month)
    ] as const));
    return new Map(entries);
}

export async function getLiveSchedule(
    fetcher: typeof fetch,
    requestedMonths: string[],
    now = Date.now()
): Promise<LiveScheduleEvent[]> {
    const months = [...new Set(requestedMonths)];
    const missing = months.filter((month) => {
        const cached = cache.get(month);
        return (!cached || cached.expiresAt <= now) && !refreshes.has(month);
    });
    if (missing.length) {
        const batch = fetchLiveScheduleMonths(fetcher, missing);
        for (const month of missing) {
            const refresh = batch
                .then((eventsByMonth) => {
                    const events = eventsByMonth.get(month) || [];
                    cache.set(month, { events, expiresAt: now + CACHE_TTL_MS });
                    return events;
                })
                .finally(() => refreshes.delete(month));
            refreshes.set(month, refresh);
        }
    }
    const entries = await Promise.all(months.map(async (month) => {
        const cached = cache.get(month);
        if (cached && cached.expiresAt > now) return cached.events;
        const refresh = refreshes.get(month);
        if (!refresh) return cached?.events || [];
        try {
            return await refresh;
        } catch (error) {
            if (cached) return cached.events;
            throw error;
        }
    }));
    const unique = new Map<string, LiveScheduleEvent>();
    for (const events of entries) {
        for (const event of events) unique.set(event.id, event);
    }
    return sortEvents([...unique.values()]);
}

export function clearLiveScheduleCache(): void {
    cache.clear();
    refreshes.clear();
}
