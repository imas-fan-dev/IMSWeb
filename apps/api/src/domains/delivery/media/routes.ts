import { publicUploadsPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleServeNamecard } from '@/domains/delivery/media/handlers/serve-namecard';
import { handleServePublicUpload } from '@/domains/delivery/media/handlers/serve-public-upload';
import {
    validateNamecardMediaParams,
    validateNamecardThumbnailMediaParams
} from '@/domains/delivery/media/request';
import { paramValidator } from '@/middleware/request-validation';

const namecardMediaValidator = paramValidator(validateNamecardMediaParams);
const namecardThumbnailMediaValidator = paramValidator(
    validateNamecardThumbnailMediaParams
);

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
        publicUploadsPath('/producer-map/:filename')
    ]) {
        app.get(route, handleServePublicUpload);
        app.on('HEAD', route, handleServePublicUpload);
    }

    app.get(
        publicUploadsPath('/namecard/original/:filename'),
        namecardMediaValidator,
        handleServeNamecard
    );
    app.on(
        'HEAD',
        publicUploadsPath('/namecard/original/:filename'),
        namecardMediaValidator,
        handleServeNamecard
    );
    app.get(
        publicUploadsPath('/namecard/thumbnail/:filename'),
        namecardThumbnailMediaValidator,
        handleServeNamecard
    );
    app.on(
        'HEAD',
        publicUploadsPath('/namecard/thumbnail/:filename'),
        namecardThumbnailMediaValidator,
        handleServeNamecard
    );
}
