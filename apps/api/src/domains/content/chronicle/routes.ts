import { eventChroniclePath, publicAssetsPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleApproveChronicleMedia } from '@/domains/content/chronicle/handlers/approve-chronicle-media';
import { handleDeleteUsedChronicleMedia } from '@/domains/content/chronicle/handlers/delete-used-chronicle-media';
import { handleGetChronicleActivity } from '@/domains/content/chronicle/handlers/get-chronicle-activity';
import { handleListChronicleActivities } from '@/domains/content/chronicle/handlers/list-chronicle-activities';
import { handleListPendingChronicleMedia } from '@/domains/content/chronicle/handlers/list-pending-chronicle-media';
import { handleListUsedChronicleMedia } from '@/domains/content/chronicle/handlers/list-used-chronicle-media';
import { handleRejectChronicleMedia } from '@/domains/content/chronicle/handlers/reject-chronicle-media';
import { handleServeChronicleAdmin } from '@/domains/content/chronicle/handlers/serve-chronicle-admin';
import { handleServeApprovedChronicleMedia } from '@/domains/content/chronicle/handlers/serve-approved-chronicle-media';
import { handleServePendingChronicleMedia } from '@/domains/content/chronicle/handlers/serve-pending-chronicle-media';
import { handleUploadChronicleMedia } from '@/domains/content/chronicle/handlers/upload-chronicle-media';
import {
    validateChronicleActivityParams,
    validateChronicleMediaParams
} from '@/domains/content/chronicle/request';
import { backofficeAuth, backofficeCsrf, opOnly } from '@/middleware/hono-auth';
import { paramValidator } from '@/middleware/request-validation';

export function registerChronicleRoutes(app: ImsHonoApp): void {
    const activityParams = paramValidator(validateChronicleActivityParams);
    const mediaParams = paramValidator(validateChronicleMediaParams);
    const pendingMediaRoute =
        publicAssetsPath('/images/eventchronicle/events/upload/:activityId/:filename');
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
        publicAssetsPath('/images/eventchronicle/events/used/:activityId/:filename');
    app.get(approvedMediaRoute, mediaParams, handleServeApprovedChronicleMedia);
    app.on('HEAD', approvedMediaRoute, mediaParams, handleServeApprovedChronicleMedia);

    app.post(eventChroniclePath('/upload'), handleUploadChronicleMedia);
    app.get(eventChroniclePath('/activities/:id'), activityParams, handleGetChronicleActivity);
    app.get(eventChroniclePath('/admin'), backofficeAuth, opOnly, handleServeChronicleAdmin);
    app.get(
        eventChroniclePath('/admin/pending'),
        backofficeAuth,
        opOnly,
        handleListPendingChronicleMedia
    );
    app.get(eventChroniclePath('/admin/used'), backofficeAuth, opOnly, handleListUsedChronicleMedia);
    app.post(
        eventChroniclePath('/admin/approve/:activityId/:filename'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        mediaParams,
        handleApproveChronicleMedia
    );
    app.post(
        eventChroniclePath('/admin/reject/:activityId/:filename'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        mediaParams,
        handleRejectChronicleMedia
    );
    app.get(eventChroniclePath('/activities'), handleListChronicleActivities);
    app.delete(
        eventChroniclePath('/admin/delete-used/:activityId/:filename'),
        backofficeAuth,
        opOnly,
        backofficeCsrf,
        mediaParams,
        handleDeleteUsedChronicleMedia
    );
}
