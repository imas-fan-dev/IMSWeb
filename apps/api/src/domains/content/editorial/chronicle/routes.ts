import { editorialArticlePayloadSchema, editorialChronicleQuerySchema, editorialIdParamsSchema, editorialStatusQuerySchema } from '@imsweb/contracts/editorial';
import { handleCreateChronicleEntry } from '@/domains/content/editorial/chronicle/handlers/create-entry';
import { handleDeleteChronicleEntry } from '@/domains/content/editorial/chronicle/handlers/delete-entry';
import { handleGetAdminChronicleEntry } from '@/domains/content/editorial/chronicle/handlers/get-admin-entry';
import { handleGetPublicChronicleEntry } from '@/domains/content/editorial/chronicle/handlers/get-public-entry';
import { handleListAdminChronicleEntries } from '@/domains/content/editorial/chronicle/handlers/list-admin-entries';
import { handleListPublicChronicleEntries } from '@/domains/content/editorial/chronicle/handlers/list-public-entries';
import { createHandleChronicleEntryStatus } from '@/domains/content/editorial/chronicle/handlers/set-entry-status';
import { handleUpdateChronicleEntry } from '@/domains/content/editorial/chronicle/handlers/update-entry';
import {
    validateEditorialArticlePayload,
    validateEditorialChronicleQuery,
    validateEditorialIdParams,
    validateEditorialStatusQuery
} from '@/domains/content/editorial/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import {
    jsonSchemaValidator,
    paramSchemaValidator,
    querySchemaValidator
} from '@/middleware/request-validation';
import {
    createCapabilityRouter,
    type ImsCapabilityRouter
} from '@/routing/capability-router';

const idParams = paramSchemaValidator(editorialIdParamsSchema, {}, validateEditorialIdParams);
const statusQuery = querySchemaValidator(editorialStatusQuerySchema, {}, validateEditorialStatusQuery);
const chronicleQuery = querySchemaValidator(editorialChronicleQuerySchema, {}, validateEditorialChronicleQuery);
const articlePayload = jsonSchemaValidator(editorialArticlePayloadSchema, {}, validateEditorialArticlePayload);

const read = [backofficeAuth, opOnly] as const;
const write = [backofficeAuth, opOnly, backofficeCsrf] as const;

export function editorialPublicChronicleRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/chronicle', chronicleQuery, handleListPublicChronicleEntries);
    routes.get('/chronicle/:id', idParams, handleGetPublicChronicleEntry);
    return routes;
}

export function editorialAdminChronicleRoutes(): ImsCapabilityRouter {
    const routes = createCapabilityRouter();
    routes.get('/chronicle', ...read, statusQuery, handleListAdminChronicleEntries);
    routes.post('/chronicle', ...write, articlePayload, handleCreateChronicleEntry);
    routes.get('/chronicle/:id', ...read, idParams, handleGetAdminChronicleEntry);
    routes.put(
        '/chronicle/:id',
        ...write,
        idParams,
        articlePayload,
        handleUpdateChronicleEntry
    );
    routes.delete('/chronicle/:id', ...write, idParams, handleDeleteChronicleEntry);
    routes.post(
        '/chronicle/:id/publish',
        ...write,
        idParams,
        articlePayload,
        createHandleChronicleEntryStatus('published')
    );
    routes.post(
        '/chronicle/:id/unpublish',
        ...write,
        idParams,
        articlePayload,
        createHandleChronicleEntryStatus('draft')
    );
    routes.post(
        '/chronicle/:id/archive',
        ...write,
        idParams,
        articlePayload,
        createHandleChronicleEntryStatus('archived')
    );
    return routes;
}
