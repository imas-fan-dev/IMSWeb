import { adminExchangePath, exchangePath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { privateFudabaResponse } from '@/domains/community/fudaba/access-policy';
import { fudabaCardRoutes } from '@/domains/community/fudaba/cards/routes';
import { fudabaClaimRoutes } from '@/domains/community/fudaba/claims/routes';
import { fudabaDirectoryRoutes } from '@/domains/community/fudaba/directory/routes';
import { fudabaLocationRoutes } from '@/domains/community/fudaba/locations/routes';
import { fudabaMapDeliveryRoutes } from '@/domains/community/fudaba/map-delivery/routes';
import { fudabaModerationRoutes } from '@/domains/community/fudaba/moderation/routes';
import { fudabaOfficeRoutes } from '@/domains/community/fudaba/offices/routes';

const EXCHANGE_PREFIX = exchangePath();
const EXCHANGE_ADMIN_PREFIX = adminExchangePath();

export function registerFudabaRoutes(app: ImsHonoApp): void {
    app.use(`${EXCHANGE_PREFIX}/*`, privateFudabaResponse);
    app.use(`${EXCHANGE_ADMIN_PREFIX}/*`, privateFudabaResponse);
    app.route(EXCHANGE_PREFIX, fudabaDirectoryRoutes());
    app.route(EXCHANGE_PREFIX, fudabaCardRoutes());
    app.route(EXCHANGE_PREFIX, fudabaOfficeRoutes());
    app.route(EXCHANGE_PREFIX, fudabaLocationRoutes());
    app.route(EXCHANGE_PREFIX, fudabaClaimRoutes());
    app.route(EXCHANGE_ADMIN_PREFIX, fudabaModerationRoutes());
    app.route(EXCHANGE_ADMIN_PREFIX, fudabaMapDeliveryRoutes());
}
