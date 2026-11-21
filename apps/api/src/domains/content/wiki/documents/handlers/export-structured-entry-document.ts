import type { Env } from 'hono';
import {
    wikiErrorBody,
    wikiJson,
    type WikiServicesResolver,
} from '@/domains/content/wiki/handler-support';
import { requireWikiServices } from '@/domains/content/wiki/service';
import {
    exportStructuredDocument,
    type StructuredExportCard,
    type StructuredExportCategory,
    type StructuredExportLink,
} from '@/domains/content/wiki/documents/structured-document-exporter';
import type {
    WikiEntryDocumentExportStructuredRequest,
    WikiEntryDocumentParams,
} from '@/domains/content/wiki/documents/document-request';
import type { WikiValidatedInput } from '@/domains/content/wiki/request';
import type { WikiRouteHandler } from '@/domains/content/wiki/response';
import type {
    StoryCardRecord,
    StoryRecord,
} from '@/ports/repositories/wiki';

/** One `wiki_story_links` row in the exporter's narrow shape. */
function sourceLinkFromRecord(record: StoryRecord): StructuredExportLink {
    return {
        up: record.up_name,
        title: record.video_title,
        url: record.url,
        contentType: record.content_type_name,
        sourcePlatform: record.source_platform_name,
    };
}

/**
 * One `wiki_story_cards` row plus its links.
 *
 * A card whose artwork is only a legacy image file keeps `legacyImage: true`, so
 * the exporter reports the unrepresentable artwork instead of silently writing a
 * text-only card.
 */
function exportCardFromRecord(
    record: StoryCardRecord,
    links: readonly StructuredExportLink[],
): StructuredExportCard {
    const coverAssetId = record.cover_asset_id ?? null;
    return {
        id: record.card_id,
        title: record.card_name,
        subtitle: record.subtitle ?? '',
        fit: record.image_fit,
        coverAssetId,
        legacyImage: coverAssetId === null && Boolean(record.image_file),
        links: [...links],
    };
}

/**
 * Builds the exporter's category list from the entry's declared categories.
 *
 * `listWikiCategories` is the authority for which categories the page has, in
 * display order, so a category that currently holds no cards still reaches the
 * exporter and is reported as `empty-category` instead of vanishing. Cards are
 * grouped in `listStoryCards` order (category display order, then card order), and
 * a card whose category somehow is not declared is appended rather than dropped.
 */
function exportCategories(
    declaredNames: readonly string[],
    cardRows: readonly StoryCardRecord[],
    storyRows: readonly StoryRecord[],
): StructuredExportCategory[] {
    const linksByCard = new Map<number, StructuredExportLink[]>();
    for (const row of storyRows) {
        const links = linksByCard.get(row.card_id);
        if (links) links.push(sourceLinkFromRecord(row));
        else linksByCard.set(row.card_id, [sourceLinkFromRecord(row)]);
    }
    const byName = new Map<string, StructuredExportCard[]>();
    for (const row of cardRows) {
        const cards = byName.get(row.category);
        const card = exportCardFromRecord(
            row,
            linksByCard.get(row.card_id) ?? [],
        );
        if (cards) cards.push(card);
        else byName.set(row.category, [card]);
    }
    const names = [...declaredNames];
    for (const name of byName.keys()) {
        if (!names.includes(name)) names.push(name);
    }
    return names.map((name) => ({ name, cards: byName.get(name) ?? [] }));
}

/**
 * Read-only structured-to-Markdown export for one entry.
 *
 * The handler only reads `wiki_story_cards` and `wiki_story_links` and returns a
 * draft: it never writes the document, the cards, or the links, so a maintainer
 * decides in the workbench whether to insert or replace the editor source.
 */
export function createHandleExportStructuredWikiEntryDocument<E extends Env>(
    resolveServices: WikiServicesResolver<E>
): WikiRouteHandler<
    E,
    WikiValidatedInput<'json', WikiEntryDocumentExportStructuredRequest> &
        WikiValidatedInput<'param', WikiEntryDocumentParams>
> {
    return async (context) => {
        const services = await resolveServices(context);
        requireWikiServices(services, ['story']);
        const { entryId } = context.req.valid('param');
        const options = context.req.valid('json');
        const repository = services.story!;
        const entry = await repository.findWikiEntryDocumentTarget(entryId);
        if (!entry) return wikiJson(wikiErrorBody('找不到该内容页'), 404);
        const [cardRows, storyRows, categoryRows] = await Promise.all([
            repository.listStoryCards(entry.projectCode, entryId),
            repository.listStories(entry.projectCode, entryId),
            repository.listWikiCategories(entry.projectId, entryId),
        ]);
        return wikiJson({
            status: 'success',
            ...exportStructuredDocument(
                {
                    categories: exportCategories(
                        categoryRows.map((category) => category.name),
                        cardRows,
                        storyRows,
                    ),
                },
                options,
            ),
        });
    };
}
