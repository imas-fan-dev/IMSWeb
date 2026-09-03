import { apiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleGetEvent } from '@/domains/content/events/handlers/get-event';
import { handleListEvents } from '@/domains/content/events/handlers/list-events';
import { handleRetiredEventMutation } from '@/domains/content/events/handlers/retire-event-mutation';
import {
    validateEventIdParams,
    validateEventListQuery
} from '@/domains/content/events/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { paramValidator, queryValidator } from '@/middleware/request-validation';

const eventIdValidator = paramValidator(validateEventIdParams);

export function registerEventRoutes(app: ImsHonoApp): void {
    app.post(apiPath('/events'), backofficeAuth, opOnly, backofficeCsrf, handleRetiredEventMutation);
    app.get(apiPath('/events'), queryValidator(validateEventListQuery), handleListEvents);
    app.get(apiPath('/events/:id'), eventIdValidator, handleGetEvent);
    app.put(
        apiPath('/events/:id'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        eventIdValidator,
        handleRetiredEventMutation
    );
    app.delete(
        apiPath('/events/:id'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        eventIdValidator,
        handleRetiredEventMutation
    );
}
