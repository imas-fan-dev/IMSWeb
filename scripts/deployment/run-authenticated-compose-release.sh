#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

fail() {
    printf '%s\n' "authenticated deployment refused: $*" >&2
    exit 1
}

if [[ $# -ne 8 ]]; then
    fail "usage: run-authenticated-compose-release.sh <registry-username> <deployment-script> <release-id> <commit-sha> <image@digest> <compose-source> <deploy-root> <public-origin-base64>"
fi

registry_username=$1
deployment_script=$2
shift 2

container_cli=${IMS_CONTAINER_CLI:-docker}
temporary_root=${TMPDIR:-/tmp}
auth_directory=

[[ "$registry_username" =~ ^[A-Za-z0-9][A-Za-z0-9-]{0,38}$ && \
    "$registry_username" != *- ]] || fail "registry username is invalid"
[[ "$deployment_script" =~ ^/tmp/imsweb-deploy-[0-9]+-[0-9]+\.sh$ ]] || \
    fail "deployment script must be the expected workflow staging path"
[[ -f "$deployment_script" && ! -L "$deployment_script" ]] || \
    fail "deployment script is missing or is a symbolic link"
[[ "$container_cli" == "docker" || "$container_cli" == "podman" ]] || \
    fail "IMS_CONTAINER_CLI must be docker or podman"
[[ "$temporary_root" == /* && -d "$temporary_root" && ! -L "$temporary_root" ]] || \
    fail "TMPDIR must be an existing absolute directory"

for command_name in bash cp grep ln mktemp rm; do
    command -v "$command_name" >/dev/null || fail "$command_name is not installed"
done
command -v "$container_cli" >/dev/null || fail "$container_cli is not installed"

cleanup() {
    if [[ -n "$auth_directory" && "$auth_directory" == "$temporary_root"/imsweb-registry-auth.* ]]; then
        rm -rf -- "$auth_directory"
    fi
}
trap cleanup EXIT
trap 'exit 130' HUP INT TERM

auth_directory=$(mktemp -d "$temporary_root/imsweb-registry-auth.XXXXXX") || \
    fail "could not create a temporary registry authentication directory"

if [[ "$container_cli" == "docker" ]]; then
    docker_config_source=${DOCKER_CONFIG:-$HOME/.docker}
    [[ "$docker_config_source" == /* ]] || fail "DOCKER_CONFIG must be an absolute path"

    if [[ -e "$docker_config_source/config.json" ]]; then
        [[ -f "$docker_config_source/config.json" && ! -L "$docker_config_source/config.json" ]] || \
            fail "Docker config must be a regular file"
        cp -p "$docker_config_source/config.json" "$auth_directory/config.json"
        if grep -Eq '"(credsStore|credHelpers)"[[:space:]]*:' "$auth_directory/config.json"; then
            fail "Docker configs backed by external credential helpers are not supported"
        fi
    fi

    if [[ -e "$docker_config_source/contexts" ]]; then
        [[ -d "$docker_config_source/contexts" && ! -L "$docker_config_source/contexts" ]] || \
            fail "Docker contexts must be stored in a regular directory"
        cp -a "$docker_config_source/contexts" "$auth_directory/contexts"
    fi

    if [[ -d "$docker_config_source/cli-plugins" && ! -L "$docker_config_source/cli-plugins" ]]; then
        ln -s "$docker_config_source/cli-plugins" "$auth_directory/cli-plugins"
    fi

    export DOCKER_CONFIG=$auth_directory
    unset DOCKER_AUTH_CONFIG
    "$container_cli" login ghcr.io \
        --username "$registry_username" \
        --password-stdin >/dev/null
else
    export REGISTRY_AUTH_FILE=$auth_directory/auth.json
    "$container_cli" login \
        --authfile "$REGISTRY_AUTH_FILE" \
        ghcr.io \
        --username "$registry_username" \
        --password-stdin >/dev/null
fi

bash "$deployment_script" "$@" </dev/null
