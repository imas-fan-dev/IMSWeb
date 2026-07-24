import type { Env, Hono } from 'hono';
import { createHandleAddWikiStory } from '@/domains/wiki/handlers/add-story';
import { createHandleDeleteWikiCategory } from '@/domains/wiki/handlers/delete-category';
import { createHandleDeleteWikiIdolMedia } from '@/domains/wiki/handlers/delete-idol-media';
import { createHandleDeleteWikiStory } from '@/domains/wiki/handlers/delete-story';
import { createHandleEditWikiStory } from '@/domains/wiki/handlers/edit-story';
import { createHandleImportLegacyWikiIdolMedia } from '@/domains/wiki/handlers/import-legacy-idol-media';
import { createHandleListWikiIdolMedia } from '@/domains/wiki/handlers/list-idol-media';
import { createHandleParseBilibili } from '@/domains/wiki/handlers/parse-bilibili';
import { createHandleRandomWikiBackground } from '@/domains/wiki/handlers/random-background';
import { createHandleSaveWikiStoryLayout } from '@/domains/wiki/handlers/save-story-layout';
import { createHandleServeWikiHome } from '@/domains/wiki/handlers/serve-wiki-home';
import { createHandleServeWikiIdolImage } from '@/domains/wiki/handlers/serve-wiki-idol-image';
import { createHandleServeWikiStaticAssets } from '@/domains/wiki/handlers/serve-wiki-static-assets';
import { createHandleServeWikiStory } from '@/domains/wiki/handlers/serve-wiki-story';
import { handleWikiTest } from '@/domains/wiki/handlers/wiki-test';
import { createHandleUploadWikiIdolMedia } from '@/domains/wiki/handlers/upload-idol-media';
import type { WikiServicesResolver } from '@/domains/wiki/handler-support';

export type { WikiServicesResolver } from '@/domains/wiki/handler-support';

export function registerWikiRoutes<E extends Env>(
    app: Hono<E>,
    resolveServices: WikiServicesResolver<E>
): void {
    app.get('/api/wiki/test', handleWikiTest);
    app.on(['GET', 'HEAD'], '/icon/*', createHandleServeWikiStaticAssets(
        resolveServices,
        'icon'
    ));
    app.on(['GET', 'HEAD'], '/css/*', createHandleServeWikiStaticAssets(
        resolveServices,
        'css'
    ));
    app.on(
        ['GET', 'HEAD'],
        '/image/:agency/:idol/*',
        createHandleServeWikiIdolImage(resolveServices)
    );
    app.get('/wiki/', createHandleServeWikiHome(resolveServices));
    app.get('/story', createHandleServeWikiStory(resolveServices));
    app.get('/api/wiki/idol-media', createHandleListWikiIdolMedia(resolveServices));
    app.post('/api/wiki/idol-media', createHandleUploadWikiIdolMedia(resolveServices));
    app.delete('/api/wiki/idol-media', createHandleDeleteWikiIdolMedia(resolveServices));
    app.post(
        '/api/wiki/idol-media/import-legacy',
        createHandleImportLegacyWikiIdolMedia(resolveServices)
    );
    app.post('/api/wiki/add_story', createHandleAddWikiStory(resolveServices));
    app.post('/api/wiki/edit_story', createHandleEditWikiStory(resolveServices));
    app.post('/api/wiki/delete_story', createHandleDeleteWikiStory(resolveServices));
    app.post('/api/wiki/delete_category', createHandleDeleteWikiCategory(resolveServices));
    app.post('/api/wiki/parse_bilibili', createHandleParseBilibili(resolveServices));
    app.post('/api/wiki/save_story_layout', createHandleSaveWikiStoryLayout(resolveServices));
    app.get('/api/wiki/random_bg', createHandleRandomWikiBackground(resolveServices));
}
