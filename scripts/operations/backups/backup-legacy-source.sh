#!/bin/sh

set -eu

umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
PROJECT_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../../.." && pwd -P)
BACKUP_ROOT=${IMS_BACKUP_ROOT:-"$PROJECT_ROOT/.backups/legacy"}
BACKUP_ID=${IMS_BACKUP_ID:-$(date -u +%Y%m%dT%H%M%SZ)}

case "$BACKUP_ID" in
    *[!A-Za-z0-9._-]*|'')
        printf '%s\n' 'IMS_BACKUP_ID may only contain letters, numbers, dot, underscore, and hyphen.' >&2
        exit 2
        ;;
esac

ARCHIVE_NAME="ims-legacy-source-$BACKUP_ID.tar.gz"
ARCHIVE_PATH="$BACKUP_ROOT/$ARCHIVE_NAME"
CHECKSUM_PATH="$ARCHIVE_PATH.sha256"

if [ -e "$ARCHIVE_PATH" ] || [ -e "$CHECKSUM_PATH" ]; then
    printf 'Backup already exists: %s\n' "$ARCHIVE_PATH" >&2
    exit 2
fi

TEMP_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/ims-legacy-backup.XXXXXX")
SNAPSHOT_ROOT="$TEMP_ROOT/snapshot"

cleanup() {
    rm -rf "$TEMP_ROOT"
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$BACKUP_ROOT" "$SNAPSHOT_ROOT"

BACKUP_PATHS='
.npmrc
.nvmrc
package.json
pnpm-lock.yaml
pnpm-workspace.yaml
apps/api/package.json
apps/legacy/.python-version
apps/legacy/README.md
apps/legacy/flask/app.py
apps/legacy/flask/gunicorn_conf.py
apps/legacy/flask/templates
apps/legacy/flask/uwsgi.ini
apps/legacy/js/server.js
apps/legacy/package.json
apps/legacy/pyproject.toml
apps/legacy/PROVENANCE.md
apps/legacy/scripts/build
apps/legacy/scripts/operations/accounts
apps/legacy/src/server
apps/legacy/tests
apps/legacy/tsconfig.server.json
apps/legacy/uv.lock
apps/web/package.json
scripts/operations/backups/backup-legacy-source.sh
'

for RELATIVE_PATH in $BACKUP_PATHS; do
    SOURCE_PATH="$PROJECT_ROOT/$RELATIVE_PATH"
    if [ ! -e "$SOURCE_PATH" ]; then
        printf 'Required backup path is missing: %s\n' "$RELATIVE_PATH" >&2
        exit 1
    fi
    TARGET_PATH="$SNAPSHOT_ROOT/$RELATIVE_PATH"
    mkdir -p "$(dirname -- "$TARGET_PATH")"
    cp -R "$SOURCE_PATH" "$TARGET_PATH"
done

cat > "$SNAPSHOT_ROOT/RESTORE-VERIFY.sh" <<'VERIFY_SCRIPT'
#!/bin/sh

set -eu

RESTORE_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
cd "$RESTORE_ROOT"

shasum -a 256 -c SHA256SUMS

# pnpm may normalize a semantically valid lockfile even in lockfile-only mode.
# Verify the frozen workspace against a disposable copy so archived inputs stay byte-exact.
VERIFY_ROOT=$(mktemp -d "${TMPDIR:-/tmp}/ims-legacy-restore-verify.XXXXXX")
cleanup_verify() {
    rm -rf "$VERIFY_ROOT"
}
trap cleanup_verify EXIT HUP INT TERM

mkdir -p "$VERIFY_ROOT/apps/api" "$VERIFY_ROOT/apps/legacy" "$VERIFY_ROOT/apps/web"
cp .npmrc .nvmrc package.json pnpm-lock.yaml pnpm-workspace.yaml "$VERIFY_ROOT/"
cp apps/api/package.json "$VERIFY_ROOT/apps/api/package.json"
cp apps/legacy/package.json "$VERIFY_ROOT/apps/legacy/package.json"
cp apps/web/package.json "$VERIFY_ROOT/apps/web/package.json"

CI=1 pnpm --config.verify-deps-before-run=false --dir "$VERIFY_ROOT" install \
    --lockfile-only --frozen-lockfile --ignore-scripts --trust-lockfile

UV_CACHE_DIR="$VERIFY_ROOT/uv-cache" uv lock --project apps/legacy --check

# Frozen package-manager checks must not rewrite any archived input.
shasum -a 256 -c SHA256SUMS >/dev/null

printf '%s\n' 'Legacy source restore verification passed.'
VERIFY_SCRIPT
chmod 0700 "$SNAPSHOT_ROOT/RESTORE-VERIFY.sh"

if find "$SNAPSHOT_ROOT" -type l -print -quit | grep -q .; then
    printf '%s\n' 'Legacy source snapshot must not contain symbolic links.' >&2
    exit 1
fi

if find "$SNAPSHOT_ROOT" -type d \( \
    -name dist -o -name node_modules -o -name __pycache__ -o \
    -name .venv -o -name venv -o -name '*_venv' \
\) -print -quit | grep -q .; then
    printf '%s\n' 'Legacy source snapshot unexpectedly contains generated dependencies, builds, or caches.' >&2
    exit 1
fi

if find "$SNAPSHOT_ROOT" -type f \( \
    -iname desktop.ini -o \
    -name '*.pyc' -o -name '*.pyo' -o \
    -name '*.db' -o -name '*.db-*' -o \
    -name '*.sqlite' -o -name '*.sqlite3' -o \
    -name '*.log' -o -name '*.pid' \
\) -print -quit | grep -q .; then
    printf '%s\n' 'Legacy source snapshot unexpectedly contains a runtime or desktop artifact.' >&2
    exit 1
fi

{
    printf 'backup_format=ims-legacy-workspace-source-v2\n'
    printf 'backup_id=%s\n' "$BACKUP_ID"
    printf 'created_at_utc=%s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
    printf 'project_root_at_backup=%s\n' "$PROJECT_ROOT"
    printf 'git_head=%s\n' "$(git -C "$PROJECT_ROOT" rev-parse --verify HEAD 2>/dev/null || printf unknown)"
    printf '\n[git-status-short]\n'
    git -C "$PROJECT_ROOT" status --short 2>/dev/null || true
} > "$SNAPSHOT_ROOT/BACKUP-METADATA.txt"

(
    cd "$SNAPSHOT_ROOT"
    find . -type f ! -name SHA256SUMS -print | LC_ALL=C sort |
        while IFS= read -r FILE_PATH; do
            shasum -a 256 "$FILE_PATH"
        done > SHA256SUMS
)

(
    cd "$SNAPSHOT_ROOT"
    ./RESTORE-VERIFY.sh >/dev/null
)

if find "$SNAPSHOT_ROOT" -type d \( \
    -name dist -o -name node_modules -o -name __pycache__ -o \
    -name .venv -o -name venv -o -name '*_venv' \
\) -print -quit | grep -q .; then
    printf '%s\n' 'Restore verification unexpectedly created generated dependencies, builds, or caches.' >&2
    exit 1
fi

TEMP_ARCHIVE="$TEMP_ROOT/$ARCHIVE_NAME"
tar -czf "$TEMP_ARCHIVE" -C "$SNAPSHOT_ROOT" .
tar -tzf "$TEMP_ARCHIVE" >/dev/null
mv "$TEMP_ARCHIVE" "$ARCHIVE_PATH"

(
    cd "$BACKUP_ROOT"
    shasum -a 256 "$ARCHIVE_NAME" > "$ARCHIVE_NAME.sha256"
    shasum -a 256 -c "$ARCHIVE_NAME.sha256" >/dev/null
)

printf 'Legacy workspace source backup created: %s\n' "$ARCHIVE_PATH"
printf 'Archive checksum: %s\n' "$CHECKSUM_PATH"
printf '%s\n' 'Runtime databases and media are intentionally excluded; back them up separately.'
