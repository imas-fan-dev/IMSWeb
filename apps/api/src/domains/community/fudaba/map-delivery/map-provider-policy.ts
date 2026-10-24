import type { FudabaRegionalProviderMapConfig, FudabaMapProviderConfig, FudabaSingleMapSearchConfig } from '@imsweb/contracts/fudaba/map-delivery';
import {
    isFudabaAMapKey,
    isFudabaAMapSecurityProxyUrl,
    isFudabaAMapStyle,
    isFudabaMapboxStyle,
    isFudabaMapboxToken,
    isFudabaMapStyleUrl,
} from '@imsweb/contracts/fudaba/runtime';

interface ProviderDescription {
    config: FudabaMapProviderConfig;
    publicConfig: FudabaMapProviderConfig;
    searchConfig: FudabaSingleMapSearchConfig;
    identity: string;
    styleUrl: string | null;
    auditLabel: string;
    suggestedName: string;
}

interface ProviderPolicy {
    fields: readonly string[];
    invalidRequestMessage: string;
    search(config: FudabaMapProviderConfig): FudabaSingleMapSearchConfig;
    read(source: Record<string, unknown>): Omit<ProviderDescription, 'searchConfig'>;
}

function invalid(message: string): never {
    throw Object.assign(new Error(message), { status: 422 });
}

const policies: Readonly<Record<string, ProviderPolicy>> = {
    maplibre: {
        fields: ['provider', 'styleUrl'],
        invalidRequestMessage: '地图样式地址格式无效',
        search: () => ({ provider: 'nominatim' }),
        read(source) {
            if (typeof source.styleUrl !== 'string' ||
                !isFudabaMapStyleUrl(source.styleUrl.trim())) {
                invalid('地图样式地址格式无效');
            }
            const styleUrl = source.styleUrl.trim();
            let suggestedName: string;
            try {
                suggestedName = styleUrl.startsWith('/')
                    ? '站点自托管'
                    : `MapLibre · ${new URL(styleUrl).hostname}`.slice(0, 80);
            } catch {
                invalid('地图样式地址格式无效');
            }
            return {
                config: { provider: 'maplibre', styleUrl },
                publicConfig: { provider: 'maplibre', styleUrl },
                identity: JSON.stringify(['maplibre', styleUrl]),
                styleUrl,
                auditLabel: styleUrl,
                suggestedName,
            };
        },
    },
    amap: {
        fields: ['provider', 'apiKey', 'securityProxyUrl', 'mapStyle'],
        invalidRequestMessage: '高德地图配置格式无效（Key、代理地址或样式）',
        search(config) {
            if (config.provider !== 'amap') invalid('高德搜索配置不匹配');
            return { provider: 'amap', apiKey: config.apiKey, securityProxyUrl: config.securityProxyUrl };
        },
        read(source) {
            if (typeof source.apiKey !== 'string' || !isFudabaAMapKey(source.apiKey) ||
                typeof source.securityProxyUrl !== 'string' || !isFudabaAMapSecurityProxyUrl(source.securityProxyUrl) ||
                typeof source.mapStyle !== 'string' || !isFudabaAMapStyle(source.mapStyle)) {
                invalid('高德地图配置格式无效');
            }
            const config = {
                provider: 'amap' as const,
                apiKey: source.apiKey,
                securityProxyUrl: source.securityProxyUrl,
                mapStyle: source.mapStyle,
            };
            return {
                config,
                publicConfig: config,
                identity: JSON.stringify(['amap', config.apiKey, config.securityProxyUrl, config.mapStyle]),
                styleUrl: null,
                auditLabel: 'amap',
                suggestedName: '高德地图',
            };
        },
    },
    mapbox: {
        fields: ['provider', 'accessToken', 'styleUrl'],
        invalidRequestMessage: 'Mapbox 配置格式无效（公开 Token 或样式）',
        search(config) {
            if (config.provider !== 'mapbox') invalid('Mapbox 搜索配置不匹配');
            return { provider: 'mapbox', accessToken: config.accessToken };
        },
        read(source) {
            if (typeof source.accessToken !== 'string' || !isFudabaMapboxToken(source.accessToken) ||
                typeof source.styleUrl !== 'string' || !isFudabaMapboxStyle(source.styleUrl)) {
                invalid('Mapbox 配置格式无效');
            }
            const config = {
                provider: 'mapbox' as const,
                accessToken: source.accessToken,
                styleUrl: source.styleUrl,
            };
            return {
                config,
                publicConfig: config,
                identity: JSON.stringify(['mapbox', config.accessToken, config.styleUrl]),
                styleUrl: config.styleUrl,
                auditLabel: config.styleUrl,
                suggestedName: 'Mapbox',
            };
        },
    },
};

function policyFor(source: { provider?: unknown }): ProviderPolicy {
    const id = source.provider;
    if (typeof id !== 'string' || !Object.hasOwn(policies, id)) {
        invalid('地图 provider 无效');
    }
    return policies[id]!;
}

/** Storage validation is strict; HTTP schemas remain at request boundaries. */
export function decodeStoredMapProvider(source: Record<string, unknown>): FudabaMapProviderConfig {
    const policy = policyFor(source);
    const allowed = new Set(['id', 'name', ...policy.fields]);
    if (Object.keys(source).some((key) => !allowed.has(key))) {
        invalid('地图源配置包含未知字段');
    }
    return policy.read(source).config;
}

/** A single projection for public delivery, deduplication, audit and persistence. */
export function describeMapProvider(source: FudabaMapProviderConfig): ProviderDescription {
    const policy = policyFor(source);
    const description = policy.read(source);
    return { ...description, searchConfig: policy.search(description.config) };
}

/** Fixed Mapbox basemap, with AMap mainland and Mapbox overseas search credentials. */
export function describeRegionalSearchMap(mainland: FudabaMapProviderConfig, overseas: FudabaMapProviderConfig): FudabaRegionalProviderMapConfig {
    const first = describeMapProvider(mainland);
    const second = describeMapProvider(overseas);
    if (first.publicConfig.provider !== 'amap' || first.searchConfig.provider !== 'amap' ||
        second.publicConfig.provider !== 'mapbox' || second.searchConfig.provider !== 'mapbox') {
        invalid('大陆搜索需要高德源，统一底图和海外搜索需要 Mapbox 源');
    }
    return {
        provider: 'regional',
        mainland: first.publicConfig,
        overseas: second.publicConfig,
        defaultRegion: 'mainland',
        search: { provider: 'federated', mainland: first.searchConfig, overseas: second.searchConfig },
    };
}

/** Called only after the shared request schema rejects a source write. */
export function mapSourceRequestError(body: Record<string, unknown>): string {
    let policy: ProviderPolicy;
    try {
        policy = policyFor(body);
    } catch {
        return '地图源请求格式无效';
    }
    const expected = ['name', 'revision', ...policy.fields];
    const keys = Object.keys(body);
    if (keys.length !== expected.length || expected.some((key) => !Object.hasOwn(body, key))) {
        return '地图源请求格式无效';
    }
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name || name.length > 80 || /[\0-\x1f\x7f]/.test(name)) {
        return '地图源名称格式无效';
    }
    if (body.revision !== null && typeof body.revision !== 'string') {
        return '地图源 revision 格式无效';
    }
    return policy.invalidRequestMessage;
}
