import type { FudabaMapProviderConfig, FudabaMapSource } from '@imsweb/contracts/fudaba/map-delivery';
import { describeMapProvider } from '@/domains/community/fudaba/map-delivery/map-provider-policy';

/** Collection mechanics only; providers own naming, validation and identity. */
export function seedFudabaMapSources(configs: readonly FudabaMapProviderConfig[], limit: number): FudabaMapSource[] {
    const sources: FudabaMapSource[] = [];
    const identities = new Set<string>();
    const names = new Set<string>();
    for (const config of configs) {
        if (sources.length >= limit) break;
        const description = describeMapProvider(config);
        if (identities.has(description.identity)) continue;
        identities.add(description.identity);
        const preferred = description.suggestedName;
        let name = preferred;
        let suffix = 2;
        while (names.has(name.toLocaleLowerCase())) {
            const marker = ` (${suffix++})`;
            name = `${preferred.slice(0, 80 - marker.length)}${marker}`;
        }
        names.add(name.toLocaleLowerCase());
        sources.push({ id: `seed-${sources.length + 1}`, name, ...description.config });
    }
    return sources;
}
