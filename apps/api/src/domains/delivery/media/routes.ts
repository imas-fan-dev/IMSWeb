import { publicUploadsPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleServePublicUpload } from '@/domains/delivery/media/handlers/serve-public-upload';

export function registerMediaRoutes(app: ImsHonoApp): void {
    for (const route of [
        publicUploadsPath('/news/original/:filename'),
        publicUploadsPath('/news/thumb/:filename'),
        publicUploadsPath('/event/original/:filename'),
        publicUploadsPath('/about/hero/:filename'),
        publicUploadsPath('/about/member-avatars/:filename'),
        publicUploadsPath('/information/:filename'),
        publicUploadsPath('/information/original/:filename'),
        publicUploadsPath('/articles/:articleId/:filename'),
        publicUploadsPath('/producer-map/:filename'),
        publicUploadsPath('/community-content/:filename')
    ]) {
        app.get(route, handleServePublicUpload);
        app.on('HEAD', route, handleServePublicUpload);
    }
}
