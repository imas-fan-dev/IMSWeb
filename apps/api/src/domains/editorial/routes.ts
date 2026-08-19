import type { ImsHonoApp } from '@/app';
import { handleEditorialRoutes } from '@/domains/editorial/handlers/editorial-routes';

/** Route composition stays declarative; editorial request handlers live in handlers/. */
export function registerEditorialRoutes(app: ImsHonoApp): void {
    handleEditorialRoutes(app);
}
