import type { ImsHonoApp } from '@/app';
import { handleCreateThumbnail } from '@/domains/media/handlers/create-thumbnail';
import { handleServeNamecard } from '@/domains/media/handlers/serve-namecard';
import { handleServePublicUpload } from '@/domains/media/handlers/serve-public-upload';

export function registerMediaRoutes(app: ImsHonoApp): void {
    for (const route of [
        '/uploads/news/original/:filename',
        '/uploads/news/thumb/:filename',
        '/uploads/event/original/:filename',
        '/uploads/about/hero/:filename',
        '/uploads/information/:filename',
        '/uploads/information/original/:filename',
        '/uploads/producer-map/:filename'
    ]) {
        app.get(route, handleServePublicUpload);
        app.on('HEAD', route, handleServePublicUpload);
    }

    app.get('/uploads/namecard/original/:filename', handleServeNamecard);
    app.on('HEAD', '/uploads/namecard/original/:filename', handleServeNamecard);
    app.get('/api/thumbnail', handleCreateThumbnail);
}
