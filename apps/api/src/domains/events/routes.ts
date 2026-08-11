import type { ImsHonoApp } from '@/app';
import { handleCreateEvent } from '@/domains/events/handlers/create-event';
import { handleDeleteEvent } from '@/domains/events/handlers/delete-event';
import { handleGetEvent } from '@/domains/events/handlers/get-event';
import { handleListEvents } from '@/domains/events/handlers/list-events';
import { handleUpdateEvent } from '@/domains/events/handlers/update-event';
import {
    validateEventIdParams,
    validateEventListQuery
} from '@/domains/events/request';
import { coreAuth, coreCsrf, opOnly } from '@/middleware/hono-auth';
import { paramValidator, queryValidator } from '@/middleware/request-validation';

const eventIdValidator = paramValidator(validateEventIdParams);

export function registerEventRoutes(app: ImsHonoApp): void {
    app.post('/api/events', coreAuth, opOnly, coreCsrf, handleCreateEvent);
    app.get('/api/events', queryValidator(validateEventListQuery), handleListEvents);
    app.get('/api/events/:id', eventIdValidator, handleGetEvent);
    app.put(
        '/api/events/:id',
        coreAuth,
        opOnly,
        coreCsrf,
        eventIdValidator,
        handleUpdateEvent
    );
    app.delete(
        '/api/events/:id',
        coreAuth,
        opOnly,
        coreCsrf,
        eventIdValidator,
        handleDeleteEvent
    );
}
