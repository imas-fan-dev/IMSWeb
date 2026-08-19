import type { ImsHonoApp } from '@/app';
import { handleGetInformation } from '@/domains/information/handlers/get-information';
import { handleListInformation } from '@/domains/information/handlers/list-information';
import { handleServeInformationContent } from '@/domains/information/handlers/serve-information-content';
import { validateInformationCardParams } from '@/domains/information/request';
import { coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';
import { paramValidator } from '@/middleware/request-validation';

const informationCardParamValidator = paramValidator(validateInformationCardParams);

function informationAdminRetired(): Response {
    return Response.json({
        error: '活动资讯后台已整合至社区帖子，请使用 /api/admin/community-posts'
    }, { status: 410 });
}

export function registerInformationRoutes(app: ImsHonoApp): void {
    app.get(
        '/information/:id/content',
        informationCardParamValidator,
        handleServeInformationContent
    );
    app.get('/api/information', handleListInformation);
    app.get('/api/information/:id', informationCardParamValidator, handleGetInformation);
    app.get('/api/admin/information', coreAuth, opOnly, informationAdminRetired);
    app.post('/api/admin/information', coreAuth, opOnly, coreCsrf, informationAdminRetired);
    app.put('/api/admin/information/order', coreAuth, opOnly, coreCsrf, informationAdminRetired);
    app.put('/api/admin/information/:id', coreAuth, opOnly, coreCsrf, informationAdminRetired);
    app.delete('/api/admin/information/:id', coreAuth, opOnly, coreCsrf, informationAdminRetired);
    app.post('/api/admin/information/assets', coreAuth, opOnly, coreCsrf, informationAdminRetired);
    app.delete('/api/admin/information/assets', coreAuth, opOnly, coreCsrf, informationAdminRetired);
}
