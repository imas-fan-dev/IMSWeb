#!/bin/sh

# Checks the unified Hono Node deployment. This script never modifies application data;
# its module smoke test creates and removes isolated files under the system temp dir.
set -u

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)
cd "$ROOT_DIR" || exit 1

failures=0
warnings=0

pass() {
    printf '%s\n' "PASS  $1"
}

warn() {
    warnings=$((warnings + 1))
    printf '%s\n' "WARN  $1"
}

fail() {
    failures=$((failures + 1))
    printf '%s\n' "FAIL  $1" >&2
}

require_file() {
    if [ -f "$1" ]; then
        pass "required file: $1"
    else
        fail "missing required file: $1"
    fi
}

runtime_env=$(printf '%s' "${NODE_ENV:-development}" \
    | sed 's/^[[:space:]]*//;s/[[:space:]]*$//' \
    | tr '[:upper:]' '[:lower:]')
case "$runtime_env" in
    development|test|production) ;;
    *)
        fail "NODE_ENV must be development, test, or production"
        ;;
esac

for file in \
    package.json \
    .npmrc \
    .nvmrc \
    pnpm-lock.yaml \
    pnpm-workspace.yaml \
    apps/api/.env.example \
    apps/web/.env.example \
    deploy/.env.example \
    scripts/migration/.env.example \
    deploy/compose.yaml \
    deploy/compose.legacy.yaml \
    deploy/nginx/README.md \
    deploy/nginx/templates/default.conf.template \
    deploy/nginx/templates-legacy/default.conf.template \
    deploy/nginx/snippets/ims-emergency-deny.conf \
    deploy/nginx/snippets/ims-security.conf \
    deploy/nginx/snippets/proxy-common.conf \
    apps/api/package.json \
    apps/api/.assetsignore \
    apps/api/tsconfig.server.json \
    apps/api/src/app.ts \
    apps/api/src/main.ts \
    apps/api/dist/server/main.js \
    apps/api/js/server.js \
    apps/api/scripts/README.md \
    apps/api/scripts/build/build-client.js \
    apps/api/scripts/build/build-server.js \
    apps/api/scripts/build/check-client.js \
    apps/api/scripts/build/client-allowlist.json \
    apps/api/scripts/checks/hono-architecture.js \
    apps/api/scripts/operations/accounts/add-user.js \
    apps/api/scripts/operations/accounts/hash-password.js \
    apps/legacy/.python-version \
    apps/legacy/pyproject.toml \
    apps/legacy/uv.lock \
    apps/legacy/public/index.html \
    scripts/audit/legacy-data-audit.py \
    scripts/checks/legacy-readiness-check.sh \
    scripts/migration/legacy-inventory.sh; do
    require_file "$file"
done

if [ -e package-lock.json ]; then
    fail "package-lock.json must not coexist with the authoritative pnpm-lock.yaml"
else
    pass "pnpm-lock.yaml is the only JavaScript lock file"
fi

if [ -e nginx-1.26.3 ]; then
    fail "legacy bundled Nginx directory must not be shipped: nginx-1.26.3"
else
    pass "legacy bundled Nginx directory is absent"
fi

if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    if docker compose -f deploy/compose.yaml config --quiet >/dev/null 2>&1 && \
        docker compose -f deploy/compose.legacy.yaml config --quiet >/dev/null 2>&1; then
        pass "Current and Legacy Docker Compose configuration"
    else
        fail "Current or Legacy Docker Compose configuration"
    fi
elif command -v docker-compose >/dev/null 2>&1; then
    if docker-compose -f deploy/compose.yaml config --quiet >/dev/null 2>&1 && \
        docker-compose -f deploy/compose.legacy.yaml config --quiet >/dev/null 2>&1; then
        pass "Current and Legacy Docker Compose configuration"
    else
        fail "Current or Legacy Docker Compose configuration"
    fi
else
    warn "Docker Compose is unavailable; container config must be checked on the deployment host"
fi

if command -v node >/dev/null 2>&1; then
    node_engine=$(node -p "require('./package.json').engines.node")
    if node -e "const expected=require('./package.json').engines.node; const match=/^>=(\\d+)\\.(\\d+)\\.(\\d+)$/.exec(expected); const current=process.versions.node.split('.').map(Number); process.exit(match && (current[0] > +match[1] || (current[0] === +match[1] && (current[1] > +match[2] || (current[1] === +match[2] && current[2] >= +match[3])))) ? 0 : 1)"; then
        pass "Node version satisfies package engines: $node_engine"
    else
        fail "Node version does not satisfy package engines: $node_engine"
    fi

    if node --check apps/api/js/server.js >/dev/null 2>&1 && \
        node --check apps/api/dist/server/main.js >/dev/null 2>&1; then
        pass "Node syntax: compatibility and compiled entries"
    else
        fail "Node syntax: compatibility and compiled entries"
    fi

    hono_tsc=apps/api/node_modules/typescript/bin/tsc
    if [ -f "$hono_tsc" ]; then
        if node "$hono_tsc" -p apps/api/tsconfig.server.json --noEmit >/dev/null 2>&1; then
            pass "Node TypeScript strict typecheck"
        else
            fail "TypeScript strict typecheck"
        fi
    else
        warn "TypeScript compiler is unavailable; verify types in the build pipeline"
    fi

    if node - "$ROOT_DIR" <<'NODE'
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const root = process.argv[2];
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'ims-readiness-'));
Object.assign(process.env, {
    NODE_ENV: 'test',
    IMS_JWT_SECRET: 'readiness-only-secret-with-sufficient-entropy',
    IMS_SQLITE_PATH: path.join(tempRoot, 'imsweb.db'),
    IMS_PUBLIC_DIR: path.join(tempRoot, 'public'),
    IMS_UPLOADS_DIR: path.join(tempRoot, 'uploads'),
    IMS_EVENT_BASE_DIR: path.join(tempRoot, 'chronicle'),
    IMS_STORY_DATA_DIR: path.join(tempRoot, 'story-data')
});

(async () => {
    try {
        const compiled = require(path.join(root, 'apps/api/dist/server/main.js'));
        const compatibility = require(path.join(root, 'apps/api/js/server.js'));
        if (
            typeof compiled.app !== 'function' ||
            typeof compiled.startServer !== 'function' ||
            typeof compiled.closeDatabase !== 'function' ||
            compatibility.app !== compiled.app ||
            compatibility.startServer !== compiled.startServer
        ) {
            throw new Error('server lifecycle export contract is invalid');
        }
        await compiled.closeDatabase();
    } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    }
})().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
NODE
    then
        pass "Compiled module graph and compatibility entry"
    else
        fail "Compiled module graph and compatibility entry"
    fi
else
    fail "node is not available"
fi

if command -v python3 >/dev/null 2>&1; then
    python3 - "$ROOT_DIR" <<'PY'
import os
import pathlib
import sqlite3
import sys

root = pathlib.Path(sys.argv[1]).resolve()
production = os.getenv("NODE_ENV", "development").strip().lower() == "production"
failed = False


def configured_path(name, default):
    raw_value = os.getenv(name)
    explicit = bool(raw_value)
    candidate = pathlib.Path(raw_value if explicit else default)
    if not candidate.is_absolute():
        candidate = (root / candidate).resolve(strict=False)
    return candidate, explicit


def display(path):
    try:
        return path.relative_to(root).as_posix()
    except ValueError:
        return str(path)


storage_type = os.getenv("IMS_OBJECT_STORAGE", "filesystem").strip().lower()
paths = (
    ("IMS_SQLITE_PATH", "apps/legacy/data/imsweb.db", "file"),
    ("IMS_PUBLIC_DIR", "apps/legacy/public", "directory"),
) + ((
    ("IMS_UPLOADS_DIR", "apps/legacy/data/uploads", "directory"),
    ("IMS_STORY_DATA_DIR", "apps/legacy/data/story/images", "directory"),
    ("IMS_EVENT_BASE_DIR", "apps/legacy/data/chronicle", "directory"),
) if storage_type == "filesystem" else ())

resolved = {}
for name, default, expected_kind in paths:
    path, explicit = configured_path(name, default)
    resolved[name] = path
    exists_as_expected = path.is_file() if expected_kind == "file" else path.is_dir()
    if exists_as_expected:
        source = "configured" if explicit else (
            "production default" if production else "development default"
        )
        print(f"PASS  {name}: {display(path)} ({source})")
        continue

    if path.exists():
        print(
            f"FAIL  {name}: {display(path)} is not a {expected_kind}",
            file=sys.stderr,
        )
        failed = True
    elif explicit or production:
        source = "configured" if explicit else "production default"
        print(
            f"FAIL  {name}: missing {source} path {display(path)}",
            file=sys.stderr,
        )
        failed = True
    else:
        print(f"WARN  {name}: development default path is absent: {display(path)}")

for name in ("IMS_SQLITE_PATH",):
    database = resolved[name]
    if not database.is_file():
        continue
    try:
        wal_path = pathlib.Path(f"{database}-wal")
        immutable = not wal_path.is_file() or wal_path.stat().st_size == 0
        query = "mode=ro&immutable=1" if immutable else "mode=ro"
        connection = sqlite3.connect(f"{database.as_uri()}?{query}", uri=True)
        result = connection.execute("PRAGMA quick_check").fetchone()
        connection.close()
    except sqlite3.Error as error:
        print(
            f"FAIL  SQLite quick_check: {name} ({display(database)}): {error}",
            file=sys.stderr,
        )
        failed = True
        continue
    if result == ("ok",):
        print(f"PASS  SQLite quick_check: {name} ({display(database)})")
    else:
        print(
            f"FAIL  SQLite quick_check: {name} ({display(database)}): {result}",
            file=sys.stderr,
        )
        failed = True

raise SystemExit(1 if failed else 0)
PY
    if [ "$?" -ne 0 ]; then
        failures=$((failures + 1))
    fi
else
    fail "python3 is not available"
fi

object_storage=$(printf '%s' "${IMS_OBJECT_STORAGE:-filesystem}" | tr '[:upper:]' '[:lower:]')
case "$object_storage" in
    filesystem) pass "IMS_OBJECT_STORAGE selects filesystem media" ;;
    s3)
        if [ -z "${IMS_S3_BUCKET:-}" ]; then
            fail "IMS_S3_BUCKET is required when IMS_OBJECT_STORAGE=s3"
        else
            pass "IMS_S3_BUCKET is configured"
        fi
        if [ -z "${IMS_S3_REGION:-${AWS_REGION:-}}" ]; then
            fail "IMS_S3_REGION or AWS_REGION is required when IMS_OBJECT_STORAGE=s3"
        else
            pass "S3 region is configured"
        fi
        case "$(printf '%s' "${IMS_S3_FORCE_PATH_STYLE:-false}" | tr '[:upper:]' '[:lower:]')" in
            1|true|yes|on|0|false|no|off) ;;
            *) fail "IMS_S3_FORCE_PATH_STYLE must be true or false" ;;
        esac
        ;;
    *) fail "IMS_OBJECT_STORAGE must be filesystem or s3" ;;
esac

if [ -z "${IMS_JWT_SECRET:-}" ]; then
    if [ "$runtime_env" = "production" ]; then
        fail "IMS_JWT_SECRET is required when NODE_ENV=production"
    else
        warn "IMS_JWT_SECRET is unset (expected for local syntax checks, required for deployment)"
    fi
else
    jwt_secret_bytes=$(printf '%s' "$IMS_JWT_SECRET" | LC_ALL=C wc -c | tr -d ' ')
    if [ "$jwt_secret_bytes" -lt 32 ]; then
        if [ "$runtime_env" = "production" ]; then
            fail "IMS_JWT_SECRET must be at least 32 UTF-8 bytes in production"
        else
            warn "IMS_JWT_SECRET is shorter than 32 UTF-8 bytes"
        fi
    else
        pass "IMS_JWT_SECRET is present and at least 32 UTF-8 bytes"
    fi
fi

cookie_secure=$(printf '%s' "${IMS_COOKIE_SECURE:-}" | tr '[:upper:]' '[:lower:]')
if [ "$runtime_env" = "production" ] && [ "$cookie_secure" != "true" ]; then
    fail "IMS_COOKIE_SECURE must be true behind production HTTPS"
fi

story_upload_limit=${IMS_STORY_MAX_UPLOAD_BYTES:-52428800}
case "$story_upload_limit" in
    ''|*[!0-9]*) fail "IMS_STORY_MAX_UPLOAD_BYTES must be a positive integer" ;;
    0) fail "IMS_STORY_MAX_UPLOAD_BYTES must be greater than zero" ;;
    *) pass "IMS_STORY_MAX_UPLOAD_BYTES is a positive integer" ;;
esac

if [ "$runtime_env" = "production" ] && [ "$story_upload_limit" -lt 52428800 ]; then
    warn "IMS_STORY_MAX_UPLOAD_BYTES is below the 50 MiB compatibility value"
fi

if [ -f apps/legacy/data/story/idol_data.db ]; then
    pass "legacy story database is contained by apps/legacy"
fi

if [ -d apps/legacy/public/venv ] || find apps/legacy/public -maxdepth 1 -type d -name '*_venv' -print -quit 2>/dev/null | grep -q .; then
    fail "a Python virtual environment exists under apps/legacy/public; use the package UV project"
fi

if command -v uv >/dev/null 2>&1; then
    if uv lock --project apps/legacy --check >/dev/null 2>&1; then
        pass "Legacy UV lock is current"
    else
        fail "Legacy UV lock is stale"
    fi
else
    fail "uv is required for apps/legacy Python management"
fi

printf '%s\n' "SUMMARY failures=$failures warnings=$warnings"
[ "$failures" -eq 0 ]
