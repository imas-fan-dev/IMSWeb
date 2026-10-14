# Preview client IP flow research

## Confirmed request path

```text
client
  -> preview.idol-master.top:443
  -> host Nginx
  -> 127.0.0.1:13000
  -> container port forwarding
  -> Hono API on 0.0.0.0:3000
```

The public domain resolved directly to one IPv4 address during planning and returned `server: nginx`. The Compose service publishes the API port on host loopback only, so the host Nginx is the public trust boundary.

The user supplied the active Preview virtual host. Its `location /` block sets both `X-Real-IP` and `X-Forwarded-For` to `$remote_addr`, replacing client-provided values. The production virtual host uses the same policy apart from upstream and log locations. The tracked example in `deploy/nginx/imsweb.conf.example` also uses the same replacement policy.

## Root cause

`scripts/deployment/deploy-compose-preview.sh` currently requires `IMS_CLIENT_ADDRESS_SOURCE=direct`. In that mode, `apps/api/src/middleware/hono-context.ts` reads the connection peer returned by Hono's Node adapter. Container port forwarding changes that peer to a bridge or NAT address, which is why Preview records a shared `172.*` address.

The API already supports `IMS_CLIENT_ADDRESS_SOURCE=nginx`. In that mode it reads `X-Forwarded-For` and falls back to `X-Real-IP`. Switching Preview to this explicit mode matches the deployed request path and the existing Nginx trust contract.

## Consumers and consistency

The shared address feeds global and endpoint-specific rate limits, public upload idempotency, Backoffice audit logs, guest submission metadata, Platform refresh sessions, and Platform security events. A shared container address combines unrelated users into the same rate-limit identity and makes persisted audit data inaccurate.

Most consumers call `getClientAddress`. `apps/api/src/domains/content/wiki/handler-support.ts` is an exception: `writeWikiAudit` parses the forwarding headers itself. That path should delegate to the same request-level resolver so `direct`, `nginx`, validation, and fallback behavior remain consistent.

## Security contract

- `direct` trusts only the connection peer and ignores forwarding headers.
- `nginx` is valid only when the application port cannot be reached from the public network and the trusted Nginx replaces incoming forwarding headers.
- The Preview Compose loopback binding and the supplied Nginx configuration satisfy those conditions.
- Trusted headers must contain one valid IPv4 or IPv6 literal. Missing, invalid, or comma-separated values should return `unknown` rather than selecting an ambiguous chain member.
- No current request layer requires RFC `Forwarded` or CDN-specific headers.

## Planned repository changes

- Require `IMS_CLIENT_ADDRESS_SOURCE=nginx` in the Preview deployment script and its deployment fixture.
- Add a negative deployment test proving that `direct` is rejected before container mutation.
- Centralize request address selection and IP validation, then migrate Wiki audit to it.
- Document the Preview Nginx and private environment requirements.
- Keep the tracked Nginx template unchanged because it already replaces both forwarding headers.

## Remote application evidence

On 2026-09-15, the production environment already reported `IMS_CLIENT_ADDRESS_SOURCE=nginx`, so it required no change. The Preview private environment reported `direct` and was updated atomically to `nginx` with mode `0600`. The previous file is preserved at `/home/imas-web/preview/config/preview.env.bak-client-address-20260915T143126Z`.

The running Preview API was recreated from the image digest recorded in the active release metadata and became `healthy` with `IMS_CLIENT_ADDRESS_SOURCE=nginx`. A public HTTPS request to `https://preview.idol-master.top/` then returned `200` with successful certificate verification.

The private environment still contains a legacy `IMS_API_IMAGE=imsweb-api:preview` value. The controlled deployment script overrides it with the immutable digest from release metadata. Manual Compose recovery must do the same; using the legacy tag selected an old image whose migration catalog did not match the Preview database. The failed container was replaced without changing migration records, and the active API now uses `ghcr.io/imas-fan-dev/imsweb-api@sha256:9bd2b306c8ff47e3559350462fe231ad632aebb8c0a6508f99c5db22356fae47` from release `preview-7604a874dbdd`.

## Relevant guidance

- `.trellis/spec/api/backend/index.md`
- `.trellis/spec/api/backend/observability-and-security.md`
- `.trellis/spec/api/backend/testing.md`
- `.trellis/spec/repository/index.md`
- `.trellis/spec/repository/ci.md`
- `.trellis/spec/guides/cross-layer-thinking-guide.md`
