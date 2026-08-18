import type { ImsHonoApp } from '@/app';
import { handleCreateEvent } from '@/domains/content/events/handlers/create-event';
import { handleDeleteEvent } from '@/domains/content/events/handlers/delete-event';
import { handleGetEvent } from '@/domains/content/events/handlers/get-event';
import { handleListEvents } from '@/domains/content/events/handlers/list-events';
import { handleUpdateEvent } from '@/domains/content/events/handlers/update-event';
import {
    validateEventIdParams,
    validateEventListQuery
} from '@/domains/content/events/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { paramValidator, queryValidator } from '@/middleware/request-validation';

const eventIdValidator = paramValidator(validateEventIdParams);

export function registerEventRoutes(app: ImsHonoApp): void {
    app.post('/api/events', backofficeAuth, opOnly, backofficeCsrf, handleCreateEvent);
    app.get('/api/events', queryValidator(validateEventListQuery), handleListEvents);
    app.get('/api/events/:id', eventIdValidator, handleGetEvent);
    app.put(
        '/api/events/:id',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        eventIdValidator,
        handleUpdateEvent
    );
    app.delete(
        '/api/events/:id',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        eventIdValidator,
        handleDeleteEvent
    );
}
