import type { InformationCard, InformationCardSummary } from '@/domains/content/information/data';
import type {
    PublicInformationCardResponse,
    PublicInformationCardSummaryResponse
} from '@/domains/content/information/response';
import type { ObjectStorage } from '@/ports/object-storage';
import { resolvePublicMediaUrl } from '@/utils/storage/public-object-url';

interface HtmlNode {
    attrs?: Array<{ name: string; value: string }>;
    childNodes?: HtmlNode[];
    tagName?: string;
}

async function resolveHtmlImageUrls(storage: ObjectStorage, html: string): Promise<string> {
    const { parseFragment, serialize } = await import('parse5');
    const fragment = parseFragment(html);
    const root = fragment as unknown as HtmlNode;
    const sources = new Set<string>();
    const visit = (node: HtmlNode): void => {
        if (node.tagName === 'img') {
            const source = node.attrs?.find((attribute) => attribute.name === 'src')?.value;
            if (source) sources.add(source);
        }
        node.childNodes?.forEach(visit);
    };
    visit(root);
    const resolved = new Map(await Promise.all([...sources].map(async (source) => [
        source,
        await resolvePublicMediaUrl(storage, source)
    ] as const)));
    const rewrite = (node: HtmlNode): void => {
        if (node.tagName === 'img') {
            const source = node.attrs?.find((attribute) => attribute.name === 'src');
            if (source) source.value = resolved.get(source.value) ?? source.value;
        }
        node.childNodes?.forEach(rewrite);
    };
    rewrite(root);
    return serialize(fragment);
}

export async function publicInformationSummary(
    storage: ObjectStorage,
    card: InformationCardSummary
): Promise<PublicInformationCardSummaryResponse> {
    return { ...card, image: await resolvePublicMediaUrl(storage, card.image) };
}

export async function publicInformationCard(
    storage: ObjectStorage,
    card: InformationCard
): Promise<PublicInformationCardResponse> {
    if (card.contentType !== 'html' || !card.html) {
        throw new Error('Public information detail must contain hosted HTML');
    }
    return {
        ...card,
        contentType: 'html',
        image: await resolvePublicMediaUrl(storage, card.image),
        html: await resolveHtmlImageUrls(storage, card.html)
    };
}
