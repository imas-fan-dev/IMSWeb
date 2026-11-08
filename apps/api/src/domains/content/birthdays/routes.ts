import { apiPath } from '@imsweb/contracts/paths';
import type { ImsHonoApp } from '@/app';
import { handleListBirthdays } from '@/domains/content/birthdays/handlers/list-birthdays';

export function registerBirthdayRoutes(app: ImsHonoApp): void {
    app.get(apiPath('/birthdays'), handleListBirthdays);
}
