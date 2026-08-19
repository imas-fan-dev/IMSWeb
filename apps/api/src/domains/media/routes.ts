import type { ImsHonoApp } from '@/app';
import { handleServeNamecard } from '@/domains/media/handlers/serve-namecard';
import { handleServePublicUpload } from '@/domains/media/handlers/serve-public-upload';
import {
    validateNamecardMediaParams,
    validateNamecardThumbnailMediaParams
} from '@/domains/media/request';
import { paramValidator } from '@/middleware/request-validation';

const namecardMediaValidator = paramValidator(validateNamecardMediaParams);
const namecardThumbnailMediaValidator = paramValidator(
    validateNamecardThumbnailMediaParams
);

export function registerMediaRoutes(app: ImsHonoApp): void {
    for (const route of [
        '/uploads/news/original/:filename',
        '/uploads/news/thumb/:filename',
        '/uploads/event/original/:filename',
        '/uploads/about/hero/:filename',
        '/uploads/about/member-avatars/:filename',
        '/uploads/information/:filename',
        '/uploads/information/original/:filename',
        '/uploads/articles/:articleId/:filename',
        '/uploads/producer-map/:filename'
    ]) {
        app.get(route, handleServePublicUpload);
        app.on('HEAD', route, handleServePublicUpload);
    }

    app.get(
        '/uploads/namecard/original/:filename',
        namecardMediaValidator,
        handleServeNamecard
    );
    app.on(
        'HEAD',
        '/uploads/namecard/original/:filename',
        namecardMediaValidator,
        handleServeNamecard
    );
    app.get(
        '/uploads/namecard/thumbnail/:filename',
        namecardThumbnailMediaValidator,
        handleServeNamecard
    );
    app.on(
        'HEAD',
        '/uploads/namecard/thumbnail/:filename',
        namecardThumbnailMediaValidator,
        handleServeNamecard
    );
}
