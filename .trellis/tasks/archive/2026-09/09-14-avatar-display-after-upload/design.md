# 头像上传后显示修复设计

## 1. Root Cause And Scope

本任务包含两个已确认且相互关联的缺陷：

1. 资料写入成功后只更新 `CommunityExchangeMePage` 的局部 profile，没有更新 `PlatformSessionProvider`。顶部账户按钮、账户弹层和 App 账户页继续读取旧 session。
2. 打包 App 使用跨源 Bearer 认证，直接 `<img src>` 无法附加 token。通过 API client 获取 Blob 时，现有头像读取又会 `307` 到对象存储；仓库没有为 Tauri origin 配置 RustFS、R2 或通用 S3 CORS，因此最终响应不能作为可靠的 Blob 来源。

后端头像对象键持久化与版本化 `avatarUrl` 生成保持不变。

## 2. Target Flow

```text
ProfileEditor mutation succeeds
  -> one server-returned PlatformProfile
  -> update workspace profile, including updatedAt
  -> acceptProfile(accountId, profile)
  -> update only the matching live Platform session profile
  -> Web account trigger and popover rerender immediately

Packaged App renders a managed avatar URL
  -> detect bearer mode plus exact IMSWeb API origin/path
  -> GET fixed /api/platform/me/avatar through platformApiClient
  -> API authenticates bearer token and reads protected object bytes
  -> create a temporary object URL
  -> AvatarImage renders it
  -> URL change/unmount aborts the method and revokes the object URL
```

Ordinary same-origin Web and external OAuth avatar URLs continue to render directly.

## 3. Session Synchronization

Extend `PlatformSessionContextValue` with an account-scoped profile update:

```ts
acceptProfile(accountId, profile): void
```

The provider uses a functional state update. It changes only `current.session.profile` when a live session exists and `current.session.account.id === accountId`. It projects the four session profile fields and does not put mutation-only `updatedAt` into the session payload.

`acceptProfile` does not increment `requestGeneration`, replace the full session, call `resolvedSessionState`, or start a request. This gives the existing reload, logout and account-switch flows precedence. A delayed mutation becomes a no-op while the provider is loading, anonymous or on another account.

`CommunityExchangeMePage.saveProfile()` remains the single callback for text edits, upload and removal. It keeps the complete returned profile in workspace state and calls `acceptProfile` with the captured account ID. Both `/community/exchange/me` and `/account/me/profile` reuse this path.

The page also keys its inner workspace by the live account scope. A logout, reload or account switch synchronously retires the prior component state. Profile callbacks capture the workspace generation that rendered the editor: `onSaved` returns `false`, `onReload` returns `null`, and `isOperationCurrent` returns `false` when a newer workspace load has started. `ProfileEditor` checks that scope before handling both success and failure, so a superseded save, upload, removal or reload cannot update its draft, feedback or toast, or close writes. This local fence is required even though `acceptProfile` already protects global session state.

Using `acceptSession({ ...platform.session, profile })` is rejected because it copies a render-time account/token snapshot and can invalidate a newer reload or logout generation.

## 4. Authenticated Avatar Source

Add a fixed-path Web API method beside the existing Platform profile endpoints:

```ts
getPlatformAvatar(): Method<Blob>
```

It uses `platformApiClient.Get<Blob>` with the explicit Platform auth realm, `responseType: "blob"` and the existing Platform HTTP error schema. The caller never supplies the request host or path, so a third-party `avatarUrl` cannot receive Platform credentials. Alova's `Method.abort()` is the cancellation boundary, and the existing platform client continues to own token attachment and one refresh/replay cycle.

Add a focused Platform avatar source hook under `app/components/platform/`. It returns:

- the original safe media URL for same-origin Web;
- the original URL for external OAuth images;
- a temporary Blob URL only when bearer mode is active and the input URL matches the configured IMSWeb API origin plus the exact `/api/platform/me/avatar` pathname.

The full input URL, including its revision query, and the live account ID are hook dependencies. A revision or account change starts a fresh fixed-path request, including the case where two accounts expose the same URL string. The hook resets the managed source, aborts the prior Method, rejects stale completion through an active or generation fence, and revokes every created object URL on replacement or unmount. Rejection leaves the source null so the existing `AvatarFallback` renders.

`PlatformAccountMenu` calls the hook once and shares the resolved source between its trigger and popover, avoiding duplicate authenticated downloads. `AccountMePage` and `ProfileWorkspaceNavigation` use the same hook for consistent ownership.

## 5. API Byte Proxy

Extend `objectReadResponse()` with an explicit proxy mode while preserving redirect-first behavior as the default. In proxy mode it skips `createReadUrl`, calls `storage.get`, and delegates status, body, `HEAD`, Range, ETag and content headers to `storedObjectResponse()`.

`handleServePlatformAvatar()` selects proxy mode and keeps:

- Platform authentication from route middleware;
- `Cache-Control: private, no-store`;
- `Vary: Authorization, Cookie`;
- existing `404` behavior for missing profile keys or dangling objects.

Only this bounded avatar route changes from object-storage redirect to API bytes. The upload is capped at 5 MiB and converted to WebP, so the current byte-oriented storage port provides a bounded implementation. A streaming object-storage port is outside scope. `HEAD` may require the adapter to read the bounded object because the port has no metadata-only method; this is accepted to keep GET and HEAD response semantics consistent.

## 6. Security And Compatibility

- Uploaded avatars remain protected objects. No bucket policy or public URL changes.
- Bearer tokens remain in the Platform API request header and are never embedded in URLs or forwarded to OAuth hosts.
- External OAuth avatar behavior is unchanged.
- The API route remains a registered binary non-JSON boundary. Its success status changes from redirect to bytes, while JSON authentication errors and text `404` compatibility remain unchanged.
- `objectReadResponse()` callers outside Platform avatar delivery retain their current `307` behavior.
- No shared JSON contract or route path changes.

## 7. Test Strategy

### Session and page flow

- Provider tests prove matching-account profile updates and preservation of session fields/status.
- Deferred reload/logout and account-switch tests prove delayed profile writes cannot restore stale state.
- Community profile tests perform upload and removal and assert both local profile revision and `acceptProfile` input.
- Deferred upload and reload tests switch accounts before completion and prove the retired workspace cannot replace the new account's profile or revision.
- Stale mutation and reload rejection tests prove expired operations cannot publish errors or close writes.
- Account menu tests rerender from null to a versioned avatar and assert the trigger and popover share the new source.

### Authenticated media

- Endpoint tests assert fixed path, Platform realm, Blob response type and error contract.
- Hook tests cover direct Web URLs, external OAuth URLs, bearer-managed URLs, success, failure, abort, URL revision races and object URL revocation.
- App account tests serve the document from `localhost` and the API from `127.0.0.1`, assert Bearer-authenticated fixed-path reads produce a `blob:` source, run on Chromium iPhone/Android and WebKit portrait projects, and keep fallback available.

### API delivery

- `object-read-response` tests prove default signed redirects remain unchanged and proxy mode bypasses `createReadUrl`.
- Platform profile contract tests assert Bearer and cookie GET/HEAD byte delivery, private headers, missing-key and dangling-object `404` bodies and headers, unauthenticated HEAD and Range rejection before storage, content type and Range behavior.
- Non-JSON manifest liveness and route inventory checks must remain clean.

### Browser verification

Exercise the profile upload flow in ordinary Web and the App account/profile flow in representative desktop and mobile projects. The App test must force cross-origin Bearer mode with separate loopback hostnames. Verify both reported avatar locations, a final `blob:` source, fallback behavior, no visible overflow, no page errors and no unexpected object-storage request from the App flow.

## 8. Rollback

The changes are code-only and require no migration. Reverting the provider capability, authenticated avatar hook/endpoint and route proxy selection restores the previous behavior. The object-read helper default remains redirect-first throughout, so unrelated media delivery has no rollback dependency.
