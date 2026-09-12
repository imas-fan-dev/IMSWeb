#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

fail() {
    printf '%s\n' "preview deployment refused: $*" >&2
    exit 1
}

if [[ $# -ne 6 ]]; then
    fail "usage: deploy-compose-preview.sh <preview-id> <commit-sha> <image@digest> <compose-source> <deploy-root> <compose-override-source>"
fi

preview_id=$1
release_sha=$2
image_ref=$3
compose_source=$4
deploy_root=$5
compose_override_source=$6
runtime_env=${IMS_PREVIEW_RUNTIME_ENV_FILE:-$deploy_root/config/preview.env}
container_cli=${IMS_CONTAINER_CLI:-docker}
probe_attempts=${IMS_DEPLOY_PROBE_ATTEMPTS:-45}
probe_delay=${IMS_DEPLOY_PROBE_DELAY_SECONDS:-2}

[[ "$preview_id" =~ ^preview-[0-9a-f]{12}$ ]] ||
    fail "preview ID must use preview-<12-character commit prefix> syntax"
[[ "$release_sha" =~ ^[0-9a-f]{40}$ ]] ||
    fail "commit SHA must contain 40 lowercase hexadecimal characters"
[[ "$preview_id" == "preview-${release_sha:0:12}" ]] ||
    fail "preview ID must match the commit SHA"
[[ "$image_ref" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]*@sha256:[0-9a-f]{64}$ ]] ||
    fail "API image must be an immutable GHCR digest reference"
[[ "$compose_source" =~ ^/tmp/imsweb-preview-compose-[0-9]+-[0-9]+\.yaml$ ]] ||
    fail "Compose source must be the expected workflow staging path"
[[ "$compose_override_source" =~ ^/tmp/imsweb-preview-override-[0-9]+-[0-9]+\.yaml$ ]] ||
    fail "Compose override source must be the expected workflow staging path"
deploy_root_segments="/${deploy_root#/}/"
[[ "$deploy_root" =~ ^/[A-Za-z0-9._/-]+$ && "$deploy_root" != "/" &&
    "$deploy_root_segments" != *"/../"* && "$deploy_root_segments" != *"/./"* &&
    "$deploy_root_segments" != *"//"* ]] ||
    fail "deploy root must be a constrained absolute path"
[[ -n "${HOME:-}" && "$deploy_root" == "$HOME/"* ]] ||
    fail "deploy root must stay under the deployment user's home"
[[ "$runtime_env" == "$deploy_root/"* ]] ||
    fail "preview environment file must stay under the deploy root"
[[ "$container_cli" == "docker" || "$container_cli" == "podman" ]] ||
    fail "IMS_CONTAINER_CLI must be docker or podman"
[[ "$probe_attempts" =~ ^[1-9][0-9]*$ ]] ||
    fail "IMS_DEPLOY_PROBE_ATTEMPTS must be a positive integer"
[[ "$probe_delay" =~ ^[0-9]+$ ]] ||
    fail "IMS_DEPLOY_PROBE_DELAY_SECONDS must be a non-negative integer"

for command_name in awk cmp curl date env flock grep install ln mktemp mv rm sed seq sleep stat; do
    command -v "$command_name" >/dev/null || fail "$command_name is not installed"
done
command -v "$container_cli" >/dev/null || fail "$container_cli is not installed"
"$container_cli" info >/dev/null 2>&1 ||
    fail "$container_cli daemon is not accessible to the deployment user"
"$container_cli" compose version >/dev/null 2>&1 ||
    fail "$container_cli compose is not available to the deployment user"

if [[ "$container_cli" == "docker" ]]; then
    container_root=$("$container_cli" info --format '{{.DockerRootDir}}')
else
    container_root=$("$container_cli" info --format '{{.Store.GraphRoot}}')
fi
[[ "$container_root" == "$HOME/"* ]] ||
    fail "$container_cli data root must stay under the deployment user's home"

for source_file in "$compose_source" "$compose_override_source" "$runtime_env"; do
    [[ -f "$source_file" && ! -L "$source_file" ]] ||
        fail "$source_file is missing or is a symbolic link"
done

runtime_mode=$(stat -c '%a' "$runtime_env")
runtime_mode=${runtime_mode#0}
[[ "$runtime_mode" =~ ^[0-7]{3,4}$ ]] ||
    fail "cannot determine preview environment file permissions"
if (((8#$runtime_mode & 077) != 0)); then
    fail "preview environment file must not be readable or writable by group or others"
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
    [[ -n "$value" && "$value" != "\"\"" && "$value" != "''" ]] ||
        fail "preview environment is missing $key"
}

[[ "$(environment_value COMPOSE_PROJECT_NAME)" == "imsweb-preview" ]] ||
    fail "COMPOSE_PROJECT_NAME must be imsweb-preview"
[[ "$(environment_value COMPOSE_PROFILES)" == "local-cache" ]] ||
    fail "COMPOSE_PROFILES must enable only local-cache; object storage uses the R2 test bucket directly"
[[ "$(environment_value IMS_API_NODE_ENV)" == "development" ]] ||
    fail "IMS_API_NODE_ENV must be development for the isolated preview"
[[ "$(environment_value IMS_COOKIE_SECURE)" == "false" ]] ||
    fail "IMS_COOKIE_SECURE must be false for the loopback preview"
[[ "$(environment_value IMS_CLIENT_ADDRESS_SOURCE)" == "direct" ]] ||
    fail "IMS_CLIENT_ADDRESS_SOURCE must be direct"
[[ "$(environment_value IMS_OBJECT_STORAGE)" == "s3" ]] ||
    fail "IMS_OBJECT_STORAGE must be s3"
[[ "$(environment_value IMS_S3_ENDPOINT)" =~ ^https://[0-9a-f]{32}\.r2\.cloudflarestorage\.com$ ]] ||
    fail "IMS_S3_ENDPOINT must be a credential-free Cloudflare R2 HTTPS S3 API endpoint"
[[ "$(environment_value IMS_S3_REGION)" == "auto" ]] ||
    fail "IMS_S3_REGION must be auto for the R2 test bucket"
[[ "$(environment_value IMS_S3_FORCE_PATH_STYLE)" == "false" ]] ||
    fail "IMS_S3_FORCE_PATH_STYLE must be false for the R2 test bucket"
bucket_name=$(environment_value IMS_S3_BUCKET)
[[ "$bucket_name" =~ (^|[-_])test([-_]|$) ]] ||
    fail "IMS_S3_BUCKET must include a distinct test segment; refusing a non-test bucket"

for required_key in \
    IMS_POSTGRES_PASSWORD \
    IMS_API_DATABASE_URL \
    IMS_BACKOFFICE_JWT_SECRET \
    IMS_PLATFORM_JWT_SECRET \
    IMS_S3_BUCKET \
    IMS_PUBLIC_READ_URL_BASE \
    AWS_ACCESS_KEY_ID \
    AWS_SECRET_ACCESS_KEY; do
    require_environment_value "$required_key"
done

port_keys=(
    IMS_API_PORT
    IMS_POSTGRES_PORT
    IMS_VALKEY_PORT
)
declare -A observed_ports=()
for port_key in "${port_keys[@]}"; do
    port_value=$(environment_value "$port_key")
    [[ "$port_value" =~ ^[0-9]+$ ]] || fail "$port_key must be an integer"
    ((port_value >= 1024 && port_value <= 65535)) ||
        fail "$port_key must be an unprivileged TCP port"
    [[ -z "${observed_ports[$port_value]:-}" ]] ||
        fail "preview host ports must be unique"
    observed_ports[$port_value]=$port_key
done

api_port=$(environment_value IMS_API_PORT)
[[ "$(environment_value IMS_PUBLIC_READ_URL_BASE)" =~ ^https:// ]] ||
    fail "IMS_PUBLIC_READ_URL_BASE must be an HTTPS URL for the R2 test bucket"

install -d -m 0700 "$deploy_root"
[[ ! -L "$deploy_root" ]] || fail "deploy root must not be a symbolic link"
deploy_root=$(cd "$deploy_root" && pwd -P)
releases_dir=$deploy_root/releases
deployments_dir=$deploy_root/deployments
current_link=$deploy_root/current
previous_link=$deploy_root/previous
lock_file=$deploy_root/.deploy.lock

install -d -m 0700 "$releases_dir" "$deployments_dir"
for managed_dir in "$releases_dir" "$deployments_dir"; do
    [[ -d "$managed_dir" && ! -L "$managed_dir" ]] ||
        fail "managed preview directories must not be symbolic links"
done
exec 9>"$lock_file"
flock -n 9 || fail "another preview deployment is active"

compose() {
    local compose_file=$1
    local compose_override=$2
    local selected_image=$3
    shift 3
    env COMPOSE_PROFILES=local-cache IMS_API_IMAGE="$selected_image" \
        "$container_cli" compose \
        --project-name imsweb-preview \
        --env-file "$runtime_env" \
        -f "$compose_file" \
        -f "$compose_override" \
        --profile local-cache \
        "$@"
}

metadata_value() {
    local metadata_file=$1
    local key=$2
    sed -n "s/^${key}=//p" "$metadata_file"
}

desired_metadata=$(mktemp "$releases_dir/.metadata-${preview_id}.XXXXXX")
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

printf 'release=%s\ncommit=%s\nimage=%s\n' \
    "$preview_id" "$release_sha" "$image_ref" >"$desired_metadata"
release_dir=$releases_dir/$preview_id

if [[ -e "$release_dir" || -L "$release_dir" ]]; then
    [[ -d "$release_dir" && ! -L "$release_dir" ]] ||
        fail "existing preview release is not a regular directory"
    [[ -f "$release_dir/metadata" && -f "$release_dir/compose.yaml" &&
        -f "$release_dir/compose.preview.yaml" ]] ||
        fail "existing preview release is incomplete"
    cmp --silent "$desired_metadata" "$release_dir/metadata" ||
        fail "existing preview metadata differs from the requested immutable release"
    cmp --silent "$compose_source" "$release_dir/compose.yaml" ||
        fail "existing preview Compose file differs from the requested immutable release"
    cmp --silent "$compose_override_source" "$release_dir/compose.preview.yaml" ||
        fail "existing preview Compose override differs from the requested immutable release"
else
    candidate_stage=$(mktemp -d "$releases_dir/.staging-${preview_id}.XXXXXX")
    install -m 0600 "$compose_source" "$candidate_stage/compose.yaml"
    install -m 0600 "$compose_override_source" "$candidate_stage/compose.preview.yaml"
    install -m 0600 "$desired_metadata" "$candidate_stage/metadata"
    mv "$candidate_stage" "$release_dir"
    candidate_stage=
fi

compose "$release_dir/compose.yaml" "$release_dir/compose.preview.yaml" \
    "$image_ref" config --quiet

current_dir=
current_compose=
current_override=
current_image=
current_release=none
if [[ -e "$current_link" || -L "$current_link" ]]; then
    [[ -L "$current_link" ]] || fail "current preview pointer is not a symbolic link"
    current_dir=$(cd "$current_link" && pwd -P)
    [[ "$current_dir" == "$releases_dir"/* && -d "$current_dir" ]] ||
        fail "current preview pointer escapes the releases directory"

    if [[ -f "$current_dir/metadata" && -f "$current_dir/compose.yaml" &&
        -f "$current_dir/compose.preview.yaml" ]]; then
        current_image=$(metadata_value "$current_dir/metadata" image)
        current_release=$(metadata_value "$current_dir/metadata" release)
        current_compose=$current_dir/compose.yaml
        current_override=$current_dir/compose.preview.yaml
        [[ "$current_image" =~ ^ghcr\.io/[a-z0-9][a-z0-9._/-]*@sha256:[0-9a-f]{64}$ ]] ||
            fail "current preview release image is not an immutable GHCR digest"
    elif [[ -f "$current_dir/.preview-release" &&
        -f "$current_dir/deploy/compose.yaml" &&
        -f "$deploy_root/config/compose.preview.yaml" ]]; then
        current_image=$(environment_value IMS_API_IMAGE)
        current_release=bootstrap
        current_compose=$current_dir/deploy/compose.yaml
        current_override=$deploy_root/config/compose.preview.yaml
        require_environment_value IMS_API_IMAGE
    else
        fail "current preview release is incomplete"
    fi
fi

internal_probe() {
    local compose_file=$1
    local compose_override=$2
    local selected_image=$3
    compose "$compose_file" "$compose_override" "$selected_image" exec -T api node -e '
        const paths = ["/api/health/ready", "/api/wiki/test", "/api/news", "/"];
        Promise.all(paths.map(async (path) => {
            const response = await fetch(`http://127.0.0.1:3000${path}`);
            if (!response.ok) throw new Error(`${path}: ${response.status}`);
        })).catch((error) => { console.error(error.message); process.exit(1); });
    ' >/dev/null 2>&1
}

host_probe() {
    local path
    for path in /api/health/ready /api/wiki/test /api/news /; do
        curl --fail --silent --show-error "http://127.0.0.1:$api_port$path" >/dev/null ||
            return 1
    done
}

wait_for_preview() {
    local compose_file=$1
    local compose_override=$2
    local selected_image=$3
    for _ in $(seq 1 "$probe_attempts"); do
        if internal_probe "$compose_file" "$compose_override" "$selected_image" && host_probe; then
            return 0
        fi
        sleep "$probe_delay"
    done
    return 1
}

deployment_error=
printf '%s\n' "Pulling and starting $image_ref"
if ! compose "$release_dir/compose.yaml" "$release_dir/compose.preview.yaml" \
    "$image_ref" pull api; then
    deployment_error="candidate image pull failed"
elif ! compose "$release_dir/compose.yaml" "$release_dir/compose.preview.yaml" \
    "$image_ref" up -d --no-build; then
    deployment_error="candidate Compose startup failed"
elif ! wait_for_preview "$release_dir/compose.yaml" \
    "$release_dir/compose.preview.yaml" "$image_ref"; then
    deployment_error="candidate preview health checks failed"
fi

if [[ -n "$deployment_error" ]]; then
    printf '%s\n' "$deployment_error" >&2
    compose "$release_dir/compose.yaml" "$release_dir/compose.preview.yaml" \
        "$image_ref" ps >&2 || true
    compose "$release_dir/compose.yaml" "$release_dir/compose.preview.yaml" \
        "$image_ref" logs --no-color --tail 200 api >&2 || true

    if [[ -n "$current_dir" && "$current_dir" != "$release_dir" ]]; then
        printf '%s\n' "Restoring previous preview release $current_release" >&2
        if compose "$current_compose" "$current_override" "$current_image" \
            up -d --no-build --no-deps api &&
            wait_for_preview "$current_compose" "$current_override" "$current_image"; then
            printf '%s\n' \
                "Previous preview release restored; database and object storage were not restored." >&2
        else
            fail "$deployment_error; automatic preview code rollback also failed"
        fi
    elif [[ -z "$current_dir" ]]; then
        compose "$release_dir/compose.yaml" "$release_dir/compose.preview.yaml" \
            "$image_ref" stop api >/dev/null 2>&1 || true
    fi
    fail "$deployment_error; current preview pointer was not changed"
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

timestamp=$(date -u +%Y%m%dT%H%M%SZ)
record_file=$deployments_dir/${timestamp}-${preview_id}.json
printf '{\n  "action": "preview-deploy",\n  "release": "%s",\n  "commit": "%s",\n  "image": "%s",\n  "previousRelease": "%s",\n  "completedAt": "%s"\n}\n' \
    "$preview_id" \
    "$release_sha" \
    "$image_ref" \
    "$current_release" \
    "$timestamp" >"$record_file"
printf '%s\n' \
    "Preview deployment completed." \
    "release=$preview_id" \
    "commit=$release_sha" \
    "image=$image_ref" \
    "record=$record_file"
