#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

fail() {
    printf '%s\n' "production deployment refused: $*" >&2
    exit 1
}

if [[ $# -ne 6 ]]; then
    fail "usage: deploy-compose-release.sh <release-id> <commit-sha> <image@digest> <compose-source> <deploy-root> <public-origin-base64>"
fi

release_id=$1
release_sha=$2
image_ref=$3
compose_source=$4
deploy_root=$5
public_origin_base64=$6
runtime_env=${IMS_RUNTIME_ENV_FILE:-/etc/imsweb/production.env}
container_cli=${IMS_CONTAINER_CLI:-docker}
database_attempts=${IMS_DEPLOY_DATABASE_ATTEMPTS:-30}
probe_attempts=${IMS_DEPLOY_PROBE_ATTEMPTS:-45}
probe_delay=${IMS_DEPLOY_PROBE_DELAY_SECONDS:-2}

[[ "$release_id" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$ ]] || \
    fail "release ID must use stable SemVer syntax"
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] || fail "commit SHA must contain 40 lowercase hexadecimal characters"
[[ "$image_ref" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]*@sha256:[0-9a-f]{64}$ ]] || \
    fail "API image must be an immutable GHCR digest reference"
[[ "$compose_source" =~ ^/tmp/imsweb-compose-[0-9]+-[0-9]+\.yaml$ ]] || \
    fail "compose source must be the expected workflow staging path"
deploy_root_segments="/${deploy_root#/}/"
[[ "$deploy_root" =~ ^/[A-Za-z0-9._/-]+$ && "$deploy_root" != "/" && \
    "$deploy_root_segments" != *"/../"* && "$deploy_root_segments" != *"/./"* && \
    "$deploy_root_segments" != *"//"* ]] || \
    fail "deploy root must be a constrained absolute path"
[[ "$runtime_env" == /* ]] || fail "IMS_RUNTIME_ENV_FILE must be an absolute path"
[[ "$container_cli" == "docker" || "$container_cli" == "podman" ]] || \
    fail "IMS_CONTAINER_CLI must be docker or podman"
[[ "$database_attempts" =~ ^[1-9][0-9]*$ ]] || fail "IMS_DEPLOY_DATABASE_ATTEMPTS must be a positive integer"
[[ "$probe_attempts" =~ ^[1-9][0-9]*$ ]] || fail "IMS_DEPLOY_PROBE_ATTEMPTS must be a positive integer"
[[ "$probe_delay" =~ ^[0-9]+$ ]] || fail "IMS_DEPLOY_PROBE_DELAY_SECONDS must be a non-negative integer"

command -v "$container_cli" >/dev/null || fail "$container_cli is not installed"
command -v base64 >/dev/null || fail "base64 is not installed"
command -v curl >/dev/null || fail "curl is not installed"
command -v flock >/dev/null || fail "flock is not installed"
command -v sha256sum >/dev/null || fail "sha256sum is not installed"

[[ -f "$compose_source" && ! -L "$compose_source" ]] || fail "compose source is missing or is a symbolic link"
[[ -f "$runtime_env" && ! -L "$runtime_env" ]] || fail "production environment file is missing or is a symbolic link"

runtime_mode=$(stat -c '%a' "$runtime_env")
runtime_mode=${runtime_mode#0}
[[ "$runtime_mode" =~ ^[0-7]{3,4}$ ]] || fail "cannot determine production environment file permissions"
if (( (8#$runtime_mode & 077) != 0 )); then
    fail "production environment file must not be readable or writable by group or others"
fi

environment_value() {
    local key=$1
    awk -v key="$key" '
        $0 ~ "^[[:space:]]*" key "=" {
            value = $0
            sub("^[[:space:]]*" key "=", "", value)
            found = value
        }
        END { print found }
    ' "$runtime_env"
}

require_environment_value() {
    local key=$1
    local value
    value=$(environment_value "$key")
    [[ -n "$value" && "$value" != "\"\"" && "$value" != "''" ]] || \
        fail "production environment is missing $key"
}

[[ "$(environment_value IMS_API_NODE_ENV)" == "production" ]] || \
    fail "IMS_API_NODE_ENV must be production"
[[ "$(environment_value IMS_COOKIE_SECURE)" == "true" ]] || \
    fail "IMS_COOKIE_SECURE must be true"
[[ "$(environment_value IMS_CLIENT_ADDRESS_SOURCE)" == "nginx" ]] || \
    fail "IMS_CLIENT_ADDRESS_SOURCE must be nginx"
[[ "$(environment_value IMS_OBJECT_STORAGE)" == "s3" ]] || \
    fail "IMS_OBJECT_STORAGE must be s3"
[[ "$(environment_value IMS_S3_REGION)" == "auto" ]] || \
    fail "IMS_S3_REGION must be auto for production R2"
[[ "$(environment_value IMS_S3_FORCE_PATH_STYLE)" == "false" ]] || \
    fail "IMS_S3_FORCE_PATH_STYLE must be false for production R2"
for required_key in \
    IMS_POSTGRES_PASSWORD \
    IMS_API_DATABASE_URL \
    IMS_JWT_SECRET \
    IMS_S3_BUCKET \
    IMS_S3_REGION \
    IMS_S3_ENDPOINT \
    IMS_PUBLIC_READ_URL_BASE \
    AWS_ACCESS_KEY_ID \
    AWS_SECRET_ACCESS_KEY; do
    require_environment_value "$required_key"
done

if ! public_origin=$(printf '%s' "$public_origin_base64" | base64 --decode 2>/dev/null); then
    fail "public origin is not valid base64"
fi
[[ "$public_origin" =~ ^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?/?$ ]] || \
    fail "public origin must be a simple HTTPS origin"
public_origin=${public_origin%/}

install -d -m 0700 "$deploy_root"
[[ ! -L "$deploy_root" ]] || fail "deploy root must not be a symbolic link"
deploy_root=$(cd "$deploy_root" && pwd -P)
releases_dir=$deploy_root/releases
backups_dir=$deploy_root/backups
records_dir=$deploy_root/deployments
current_link=$deploy_root/current
previous_link=$deploy_root/previous
lock_file=$deploy_root/.deploy.lock

install -d -m 0700 "$releases_dir" "$backups_dir" "$records_dir"
for managed_dir in "$releases_dir" "$backups_dir" "$records_dir"; do
    [[ -d "$managed_dir" && ! -L "$managed_dir" ]] || \
        fail "managed deployment directories must not be symbolic links"
done
exec 9>"$lock_file"
flock -n 9 || fail "another production deployment is active"

compose() {
    local compose_file=$1
    local selected_image=$2
    shift 2
    env COMPOSE_PROFILES= IMS_API_IMAGE="$selected_image" \
        "$container_cli" compose \
        --project-name imsweb \
        --env-file "$runtime_env" \
        -f "$compose_file" \
        "$@"
}

metadata_value() {
    local metadata_file=$1
    local key=$2
    sed -n "s/^${key}=//p" "$metadata_file"
}

desired_metadata=$(mktemp "$releases_dir/.metadata-${release_id}.XXXXXX")
candidate_stage=
next_link=
previous_next_link=
cleanup() {
    rm -f "$desired_metadata"
    [[ -z "$next_link" ]] || rm -f "$next_link"
    [[ -z "$previous_next_link" ]] || rm -f "$previous_next_link"
    [[ -z "$candidate_stage" || ! -d "$candidate_stage" ]] || rm -rf "$candidate_stage"
}
trap cleanup EXIT

printf 'release=%s\ncommit=%s\nimage=%s\n' "$release_id" "$release_sha" "$image_ref" > "$desired_metadata"
release_dir=$releases_dir/$release_id

if [[ -e "$release_dir" || -L "$release_dir" ]]; then
    [[ -d "$release_dir" && ! -L "$release_dir" ]] || fail "existing release is not a regular directory"
    [[ -f "$release_dir/metadata" && -f "$release_dir/compose.yaml" ]] || \
        fail "existing release is incomplete"
    cmp --silent "$desired_metadata" "$release_dir/metadata" || \
        fail "existing release metadata differs from the requested immutable release"
    cmp --silent "$compose_source" "$release_dir/compose.yaml" || \
        fail "existing release Compose file differs from the requested immutable release"
else
    candidate_stage=$(mktemp -d "$releases_dir/.staging-${release_id}.XXXXXX")
    install -m 0600 "$compose_source" "$candidate_stage/compose.yaml"
    install -m 0600 "$desired_metadata" "$candidate_stage/metadata"
    mv "$candidate_stage" "$release_dir"
    candidate_stage=
fi

compose "$release_dir/compose.yaml" "$image_ref" config --quiet

current_dir=
current_image=
current_release=none
if [[ -e "$current_link" || -L "$current_link" ]]; then
    [[ -L "$current_link" ]] || fail "current release pointer is not a symbolic link"
    current_dir=$(cd "$current_link" && pwd -P)
    [[ "$current_dir" == "$releases_dir"/* && -d "$current_dir" ]] || \
        fail "current release pointer escapes the releases directory"
    [[ -f "$current_dir/metadata" && -f "$current_dir/compose.yaml" ]] || \
        fail "current release is incomplete"
    current_image=$(metadata_value "$current_dir/metadata" image)
    current_release=$(metadata_value "$current_dir/metadata" release)
    [[ "$current_image" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]*@sha256:[0-9a-f]{64}$ ]] || \
        fail "current release image is not an immutable GHCR digest"
fi

database_compose=$release_dir/compose.yaml
database_image=$image_ref
if [[ -n "$current_dir" ]]; then
    database_compose=$current_dir/compose.yaml
    database_image=$current_image
fi

printf '%s\n' "Starting PostgreSQL from the current deployment configuration."
compose "$database_compose" "$database_image" up -d --no-build postgres
database_ready=false
for _ in $(seq 1 "$database_attempts"); do
    if compose "$database_compose" "$database_image" exec -T postgres \
        sh -ec 'pg_isready --username="$POSTGRES_USER" --dbname="$POSTGRES_DB"' >/dev/null 2>&1; then
        database_ready=true
        break
    fi
    sleep "$probe_delay"
done
[[ "$database_ready" == "true" ]] || fail "PostgreSQL did not become ready"

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
backup_dir=$backups_dir/${timestamp}-${release_id}
install -d -m 0700 "$backup_dir"
backup_file=$backup_dir/postgresql.dump
backup_staging=$backup_dir/.postgresql.dump.tmp

printf '%s\n' "Creating the pre-deployment PostgreSQL recovery point."
compose "$database_compose" "$database_image" exec -T postgres \
    sh -ec 'exec pg_dump --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom' \
    > "$backup_staging"
[[ -s "$backup_staging" ]] || fail "PostgreSQL backup is empty"
compose "$database_compose" "$database_image" exec -T postgres \
    sh -ec 'exec pg_restore --list >/dev/null' < "$backup_staging"
mv "$backup_staging" "$backup_file"
sha256sum "$backup_file" > "$backup_file.sha256"
backup_sha=$(awk '{ print $1 }' "$backup_file.sha256")

internal_probe() {
    local compose_file=$1
    local selected_image=$2
    compose "$compose_file" "$selected_image" exec -T api node -e '
        const paths = ["/api/wiki/test", "/api/news", "/"];
        Promise.all(paths.map(async (path) => {
            const response = await fetch(`http://127.0.0.1:3000${path}`);
            if (!response.ok) throw new Error(`${path}: ${response.status}`);
        })).catch((error) => { console.error(error.message); process.exit(1); });
    ' >/dev/null 2>&1
}

wait_for_internal_probe() {
    local compose_file=$1
    local selected_image=$2
    for _ in $(seq 1 "$probe_attempts"); do
        if internal_probe "$compose_file" "$selected_image"; then
            return 0
        fi
        sleep "$probe_delay"
    done
    return 1
}

public_probe() {
    local path
    for path in /api/wiki/test /api/news /; do
        curl --fail --silent --show-error \
            --retry 3 --retry-all-errors --retry-delay 2 \
            "$public_origin$path" >/dev/null || return 1
    done
}

deployment_error=
printf '%s\n' "Pulling and starting $image_ref"
if ! compose "$release_dir/compose.yaml" "$image_ref" pull api; then
    deployment_error="candidate image pull failed"
elif ! compose "$release_dir/compose.yaml" "$image_ref" up -d --no-build --no-deps api; then
    deployment_error="candidate Compose startup failed"
elif ! wait_for_internal_probe "$release_dir/compose.yaml" "$image_ref"; then
    deployment_error="candidate internal health checks failed"
elif ! public_probe; then
    deployment_error="candidate public health checks failed"
fi

if [[ -n "$deployment_error" ]]; then
    printf '%s\n' "$deployment_error" >&2
    compose "$release_dir/compose.yaml" "$image_ref" ps >&2 || true
    compose "$release_dir/compose.yaml" "$image_ref" logs --no-color --tail 200 api >&2 || true

    if [[ -n "$current_dir" && "$current_dir" != "$release_dir" ]]; then
        printf '%s\n' "Restoring previous release $current_release" >&2
        if compose "$current_dir/compose.yaml" "$current_image" pull api && \
            compose "$current_dir/compose.yaml" "$current_image" up -d --no-build --no-deps api && \
            wait_for_internal_probe "$current_dir/compose.yaml" "$current_image" && \
            public_probe; then
            printf '%s\n' "Previous release restored; database recovery was not performed." >&2
        else
            fail "$deployment_error; automatic code rollback also failed"
        fi
    elif [[ -z "$current_dir" ]]; then
        compose "$release_dir/compose.yaml" "$image_ref" stop api >/dev/null 2>&1 || true
    fi
    fail "$deployment_error; current release pointer was not changed"
fi

if [[ "$current_dir" != "$release_dir" ]]; then
    if [[ -n "$current_dir" ]]; then
        previous_next_link=$deploy_root/.previous.$$
        ln -s "$current_dir" "$previous_next_link"
        mv -Tf "$previous_next_link" "$previous_link"
        previous_next_link=
    fi
    next_link=$deploy_root/.current.$$
    ln -s "$release_dir" "$next_link"
    mv -Tf "$next_link" "$current_link"
    next_link=
fi

record_file=$records_dir/${timestamp}-${release_id}.json
printf '{\n  "action": "deploy",\n  "release": "%s",\n  "commit": "%s",\n  "image": "%s",\n  "previousRelease": "%s",\n  "databaseBackup": "%s",\n  "databaseBackupSha256": "%s",\n  "completedAt": "%s"\n}\n' \
    "$release_id" \
    "$release_sha" \
    "$image_ref" \
    "$current_release" \
    "$backup_file" \
    "$backup_sha" \
    "$timestamp" > "$record_file"
printf '%s\n' \
    "Deployment completed." \
    "release=$release_id" \
    "commit=$release_sha" \
    "image=$image_ref" \
    "database_backup=$backup_file" \
    "record=$record_file"
