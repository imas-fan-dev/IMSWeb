# 修复 App 我的名片图片加载

## Goal

修复 App 场景下交换名片的我的名片图片认证加载，覆盖清单和正反面预览并完成回归验收。

## Requirements

- App inventory and editor previews must load private owner images with the current platform session, including access-token refresh.
- Stored front/back previews and their lightbox must render; local upload blob previews must continue working.
- Only the configured API origin and exact owner-media route may receive platform credentials. Public and external images keep their existing behavior.
- Session changes, source replacement and unmount must discard old private images and release object URLs. Failures offer a retry.
- Preserve server owner authorization, same-origin Web cookies and public exchange delivery. Keep changes separate from map work and existing staged files.

## Acceptance Criteria

- [x] Authenticated App renders front/back private media and both lightboxes at decoded width 120 with storage signing enabled; upload width 90 and clearing restoration to width 120 pass in small Chromium, iPhone Chromium and WebKit.
- [x] Expired access token refreshes through the existing platform client.
- [x] Anonymous and another account cannot read owner media.
- [x] URL allowlisting prevents credentials reaching external/public routes.
- [x] Session/source changes abort loading and revoke owned object URLs; local previews remain usable.
- [x] Focused unit, browser, type and lint checks pass, with commands and limitations recorded. Final Web suite has 103 passing tests; Web lint/typecheck/build, API typecheck and App/Web browser acceptance pass.
- [x] Bearer media reads return private API bytes without a storage redirect when signing is available; anonymous and other-owner reads access no bytes. Cookie GET/HEAD retain existing delivery.
- [x] Real local S3/RustFS private object reads work behind the authenticated gateway and native Tauri-origin API CORS; unsigned storage reads remain forbidden and temporary objects are cleaned.

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- Lightweight tasks can remain PRD-only.
- For complex tasks, add `design.md` for technical design and `implement.md` for execution planning before `task.py start`.
