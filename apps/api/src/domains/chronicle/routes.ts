import type { ImsHonoApp } from '@/app';
import { handleApproveChronicleMedia } from '@/domains/chronicle/handlers/approve-chronicle-media';
import { handleDeleteUsedChronicleMedia } from '@/domains/chronicle/handlers/delete-used-chronicle-media';
import { handleGetChronicleActivity } from '@/domains/chronicle/handlers/get-chronicle-activity';
import { handleListChronicleActivities } from '@/domains/chronicle/handlers/list-chronicle-activities';
import { handleListPendingChronicleMedia } from '@/domains/chronicle/handlers/list-pending-chronicle-media';
import { handleListUsedChronicleMedia } from '@/domains/chronicle/handlers/list-used-chronicle-media';
import { handleRejectChronicleMedia } from '@/domains/chronicle/handlers/reject-chronicle-media';
import { handleServeChronicleAdmin } from '@/domains/chronicle/handlers/serve-chronicle-admin';
import { handleServeApprovedChronicleMedia } from '@/domains/chronicle/handlers/serve-approved-chronicle-media';
import { handleServePendingChronicleMedia } from '@/domains/chronicle/handlers/serve-pending-chronicle-media';
import { handleUploadChronicleMedia } from '@/domains/chronicle/handlers/upload-chronicle-media';
import {
    validateChronicleActivityParams,
    validateChronicleMediaParams
} from '@/domains/chronicle/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { paramValidator } from '@/middleware/request-validation';

export function registerChronicleRoutes(app: ImsHonoApp): void {
    const activityParams = paramValidator(validateChronicleActivityParams);
    const mediaParams = paramValidator(validateChronicleMediaParams);
    const pendingMediaRoute =
        '/assets/images/eventchronicle/events/upload/:activityId/:filename';
    app.get(
        pendingMediaRoute,
        backofficeAuth,
        opOnly,
        mediaParams,
        handleServePendingChronicleMedia
    );
    app.on(
        'HEAD',
        pendingMediaRoute,
        backofficeAuth,
        opOnly,
        mediaParams,
        handleServePendingChronicleMedia
    );

    const approvedMediaRoute =
        '/assets/images/eventchronicle/events/used/:activityId/:filename';
    app.get(approvedMediaRoute, mediaParams, handleServeApprovedChronicleMedia);
    app.on('HEAD', approvedMediaRoute, mediaParams, handleServeApprovedChronicleMedia);

    app.post('/eventchronicle/upload', handleUploadChronicleMedia);
    app.get('/eventchronicle/activities/:id', activityParams, handleGetChronicleActivity);
    app.get('/eventchronicle/admin', backofficeAuth, opOnly, handleServeChronicleAdmin);
    app.get(
        '/eventchronicle/admin/pending',
        backofficeAuth,
        opOnly,
        handleListPendingChronicleMedia
    );
    app.get('/eventchronicle/admin/used', backofficeAuth, opOnly, handleListUsedChronicleMedia);
    app.post(
        '/eventchronicle/admin/approve/:activityId/:filename',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        mediaParams,
        handleApproveChronicleMedia
    );
    app.post(
        '/eventchronicle/admin/reject/:activityId/:filename',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        mediaParams,
        handleRejectChronicleMedia
    );
    app.get('/eventchronicle/activities', handleListChronicleActivities);
    app.delete(
        '/eventchronicle/admin/delete-used/:activityId/:filename',
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        mediaParams,
        handleDeleteUsedChronicleMedia
    );
}
