#!/usr/bin/env bash
set -euo pipefail
umask 077

# Use the same filesystem lock as preview deployment. Cron must run on that host
# under the preview deployment user. No source or target credentials in argv.
if [[ $# -lt 2 || $# -gt 3 ]]; then
    echo 'Usage: bash sync-preview-data.sh PREVIEW_DEPLOY_ROOT PRIVATE_CONFIG [--apply]' >&2
    exit 1
fi
deploy_root=$1
config_file=$2
mode=${3:-}
[[ -d "$deploy_root" && -f "$config_file" ]] || exit 1
[[ -z "$mode" || "$mode" == '--apply' ]] || exit 1
exec 9>"$deploy_root/.deploy.lock"
flock -n 9 || { echo 'Preview deployment or sync is active.' >&2; exit 1; }
script_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
args=("$script_root/apps/api/scripts/migration/preview-data-sync.js" "$config_file")
[[ -z "$mode" ]] || args+=("$mode")
exec node "${args[@]}"
