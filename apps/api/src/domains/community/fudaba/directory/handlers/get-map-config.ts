import { fudabaMapStyleUrlForPrefix } from '@imsweb/contracts/fudaba';
import type { Context } from 'hono';
import type { AppEnvironment } from '@/app';
import { assertNoFudabaQuery } from '@/domains/community/fudaba/directory/request';
import { readFudabaMapDelivery } from '@/domains/community/fudaba/map-delivery/map-delivery-store';
import { services } from '@/middleware/hono-context';

/**
 * Resolve the style URL the browser is handed.
 *
 * The operator-selected delivery prefix is re-validated against the env
 * allowlist on this read path, so a stored value that has drifted out of the
 * allowlist — or been poisoned in object storage — falls back to
 * IMS_FUDABA_MAP_STYLE_URL instead of reaching a browser. With no object and
 * no selection, the response is byte-identical to the pre-feature behaviour.
 */
export async function handleGetFudabaMapConfig(
    c: Context<AppEnvironment>
): Promise<Response> {
    assertNoFudabaQuery(c.req.url);
    const runtime = services(c);
    const styleUrl = runtime.config?.fudabaMapStyleUrl;
    if (!styleUrl) {
        throw Object.assign(new Error('Fudaba map style is unavailable'), { status: 503 });
    }
    const storage = runtime.storage;
    if (!storage) return c.json({ styleUrl });
    try {
        const { selection } = await readFudabaMapDelivery(
            storage,
            runtime.config?.fudabaMapPrefixes ?? []
        );
        if (!selection) return c.json({ styleUrl });
        return c.json({
            styleUrl: fudabaMapStyleUrlForPrefix(selection.prefix, styleUrl)
        });
    } catch (error) {
        console.error('Failed to read fudaba map delivery selection', error);
        return c.json({ styleUrl });
    }
}
