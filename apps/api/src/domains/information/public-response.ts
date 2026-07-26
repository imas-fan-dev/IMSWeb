import type { InformationCard, InformationCardSummary } from '@/domains/information/data';
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
): Promise<InformationCardSummary> {
    return { ...card, image: await resolvePublicMediaUrl(storage, card.image) };
}

export async function publicInformationCard(
    storage: ObjectStorage,
    card: InformationCard
): Promise<InformationCard> {
    return {
        ...card,
        image: await resolvePublicMediaUrl(storage, card.image),
        ...(card.html ? { html: await resolveHtmlImageUrls(storage, card.html) } : {})
    };
}
