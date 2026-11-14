# Community landing content

Public reads return enabled entries and an empty list when configuration is missing. Admin reads and revisioned writes allow op and editor accounts. Cookie writes require Backoffice CSRF. Configuration uses `community/landing/config.json`; normalized public image assets use `community/landing/assets/`. Save and upload handlers record audit events. Successful uploads remain available to unsaved and concurrent drafts.

Routes are registered in `routes.ts`; `data.ts` validates local persistence and safe links. Storage, images and multipart parsing use runtime ports. Focused regressions live in `tests/server/community-content.test.ts`.
