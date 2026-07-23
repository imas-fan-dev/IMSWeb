#!/bin/sh
set -eu

fail() {
    printf '%s\n' "release activation refused: $*" >&2
    exit 1
}

validate_release_id() {
    candidate=$1
    case "$candidate" in
        ''|*[!A-Za-z0-9._-]*|[!A-Za-z0-9]*) fail "invalid release ID: $candidate" ;;
    esac
    [ "${#candidate}" -le 80 ] || fail "release ID exceeds 80 characters"
}

validate_current_link() {
    target_path=
    [ "$current" != "$lock" ] || fail "IMS_CURRENT_LINK must not collide with the activation lock"
    case "$current" in
        "$releases"|"$releases"/*) fail "IMS_CURRENT_LINK must be outside IMS_RELEASES_DIR" ;;
    esac
    if [ -e "$current" ] || [ -L "$current" ]; then
        [ -L "$current" ] || fail "IMS_CURRENT_LINK must be absent or a symbolic link"
        current_target=$(readlink "$current")
        case "$current_target" in
            /*) current_target_path=$current_target ;;
            *) current_target_path=$current_parent/$current_target ;;
        esac
        [ -d "$current_target_path" ] || fail "IMS_CURRENT_LINK target must be an existing release directory"
        [ ! -L "$current_target_path" ] || fail "IMS_CURRENT_LINK target must not be a symbolic link"
        target_parent=$(cd "$(dirname "$current_target_path")" && pwd -P)
        target_path=$target_parent/$(basename "$current_target_path")
        case "$target_path" in
            "$releases"/*) ;;
            *) fail "IMS_CURRENT_LINK target must be inside IMS_RELEASES_DIR" ;;
        esac
    fi
}

if [ "$#" -ne 2 ]; then
    fail "usage: activate-node-release.sh <staging-directory> <release-id> | --rollback <release-id>"
fi
case "$1" in
    --rollback)
        mode=rollback
        release_id=$2
        staging=
        ;;
    *)
        mode=activate
        staging=$1
        release_id=$2
        ;;
esac
validate_release_id "$release_id"

script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd -P)
preflight=$script_dir/preflight-node-release.cjs
[ -f "$preflight" ] || fail "release preflight helper is missing: $preflight"

releases=${IMS_RELEASES_DIR:-}
current=${IMS_CURRENT_LINK:-}
case "$releases" in /*) ;; *) fail "IMS_RELEASES_DIR must be an absolute path" ;; esac
case "$current" in /*) ;; *) fail "IMS_CURRENT_LINK must be an absolute path" ;; esac
[ -d "$releases" ] || fail "IMS_RELEASES_DIR must exist"
[ ! -L "$releases" ] || fail "IMS_RELEASES_DIR must not be a symbolic link"
releases=$(cd "$releases" && pwd -P)

current_parent=$(dirname "$current")
[ -d "$current_parent" ] || fail "IMS_CURRENT_LINK parent must exist"
[ ! -L "$current_parent" ] || fail "IMS_CURRENT_LINK parent must not be a symbolic link"
current_parent=$(cd "$current_parent" && pwd -P)
current=$current_parent/$(basename "$current")
lock=$releases/.activate.lock
next=$current.next.$$
validate_current_link

if [ "$mode" = activate ]; then
    case "$staging" in /*) ;; *) fail "staging directory must be an absolute path" ;; esac
    [ -d "$staging" ] || fail "staging directory does not exist: $staging"
    [ ! -L "$staging" ] || fail "staging directory must not be a symbolic link"
    staging_parent=$(cd "$(dirname "$staging")" && pwd -P)
    [ "$staging_parent" = "$releases" ] || fail "staging directory must be a direct child of IMS_RELEASES_DIR"
    [ "$(basename "$staging")" = ".staging-$release_id" ] || fail "staging directory must be named .staging-$release_id"
    staging=$releases/.staging-$release_id
    final=$releases/$release_id
    candidate=$staging
    [ ! -e "$final" ] && [ ! -L "$final" ] || fail "release already exists: $final"
else
    final=$releases/$release_id
    candidate=$final
    [ -d "$final" ] || fail "rollback release does not exist: $final"
    [ ! -L "$final" ] || fail "rollback release must not be a symbolic link"
    if [ -L "$current" ] && [ "$target_path" = "$final" ]; then
        fail "rollback target is already current: $final"
    fi
fi

if ! mkdir "$lock" 2>/dev/null; then
    fail "another activation is running or left $lock for investigation"
fi
cleanup() {
    rm -f "$next"
    rmdir "$lock" 2>/dev/null || true
}
trap cleanup EXIT
trap 'exit 129' HUP
trap 'exit 130' INT
trap 'exit 143' TERM

# The lock is advisory, so repeat all cheap destination checks after acquiring it.
validate_current_link
[ ! -e "$next" ] && [ ! -L "$next" ] || fail "temporary link already exists: $next"
if [ "$mode" = activate ]; then
    [ -d "$staging" ] && [ ! -L "$staging" ] || fail "staging directory changed before activation"
    [ ! -e "$final" ] && [ ! -L "$final" ] || fail "release appeared before activation: $final"
else
    [ -d "$final" ] && [ ! -L "$final" ] || fail "rollback release changed before activation"
fi

node "$preflight" "$candidate" "$current" || fail "candidate release preflight failed"

previous=none
if [ -L "$current" ]; then
    previous=$(readlink "$current")
fi
ln -s "$final" "$next"

if [ "$mode" = activate ]; then
    # Staging and final are direct children of the same directory, so the rename is atomic.
    mv "$staging" "$final"
    if ! node -e 'require("node:fs").renameSync(process.argv[1], process.argv[2])' "$next" "$current"; then
        rm -f "$next"
        if mv "$final" "$staging"; then
            fail "current link swap failed; staging release restored"
        fi
        fail "current link swap failed and staging release could not be restored"
    fi
else
    node -e 'require("node:fs").renameSync(process.argv[1], process.argv[2])' "$next" "$current" || \
        fail "rollback current link swap failed"
fi

printf '%s\n' "action=$mode" "release=$final" "current=$current" "previous=$previous"
