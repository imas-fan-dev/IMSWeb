#!/bin/sh

# Emit a deterministic JSON Lines manifest to stdout. The filesystem is only
# read; callers choose whether and where to redirect the output.
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd)

exec python3 - "$ROOT_DIR" <<'PY'
import hashlib
import json
import mimetypes
import os
import pathlib
import re
import sys
import unicodedata

root = pathlib.Path(sys.argv[1]).resolve()
runtime_env = os.getenv("NODE_ENV", "development").strip().lower()
if runtime_env not in {"development", "test", "production"}:
    print("ERROR NODE_ENV must be development, test, or production", file=sys.stderr)
    raise SystemExit(1)
production = runtime_env == "production"
run_id = os.getenv("IMS_INVENTORY_RUN_ID", "local-audit")
if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", run_id):
    print("ERROR IMS_INVENTORY_RUN_ID must be a safe 1-80 byte identifier", file=sys.stderr)
    raise SystemExit(1)
if production and "IMS_INVENTORY_RUN_ID" not in os.environ:
    print("ERROR IMS_INVENTORY_RUN_ID is required in production", file=sys.stderr)
    raise SystemExit(1)


def configured_path(name, default):
    raw_value = os.getenv(name)
    explicit = bool(raw_value)
    candidate = pathlib.Path(raw_value if explicit else default)
    if not candidate.is_absolute():
        candidate = (root / candidate).resolve(strict=False)
    return candidate, explicit


live_core_db, _ = configured_path("IMS_DB_PATH", "apps/legacy/data/core/news.db")
live_story_db, _ = configured_path(
    "IMS_STORY_DB_PATH", "apps/legacy/data/story/idol_data.db"
)
inventory_core_value = os.getenv("IMS_INVENTORY_CORE_DB_PATH")
inventory_story_value = os.getenv("IMS_INVENTORY_STORY_DB_PATH")
if production and (not inventory_core_value or not inventory_story_value):
    print(
        "ERROR IMS_INVENTORY_CORE_DB_PATH and IMS_INVENTORY_STORY_DB_PATH "
        "must point to SQLite online backup files in production",
        file=sys.stderr,
    )
    raise SystemExit(1)
core_db, core_db_explicit = configured_path(
    "IMS_INVENTORY_CORE_DB_PATH", str(live_core_db)
)
story_db, story_db_explicit = configured_path(
    "IMS_INVENTORY_STORY_DB_PATH", str(live_story_db)
)
if not production and not inventory_core_value:
    print("WARN  using live development core DB; not a migration snapshot", file=sys.stderr)
if not production and not inventory_story_value:
    print("WARN  using live development story DB; not a migration snapshot", file=sys.stderr)
story_media, story_media_explicit = configured_path(
    "IMS_STORY_DATA_DIR", "apps/legacy/data/story/images"
)
event_base, event_base_explicit = configured_path(
    "IMS_EVENT_BASE_DIR", "apps/legacy/data/chronicle"
)
uploads, uploads_explicit = configured_path(
    "IMS_UPLOADS_DIR", "apps/legacy/data/uploads"
)

sources = (
    (
        "core-db",
        core_db,
        "database-snapshots/news.db",
        "file",
        "IMS_INVENTORY_CORE_DB_PATH",
        core_db_explicit,
    ),
    (
        "story-db",
        story_db,
        "database-snapshots/idol_data.db",
        "file",
        "IMS_INVENTORY_STORY_DB_PATH",
        story_db_explicit,
    ),
    (
        "uploads",
        uploads,
        "legacy/uploads",
        "directory",
        "IMS_UPLOADS_DIR",
        uploads_explicit,
    ),
    (
        "story-media",
        story_media,
        "legacy/story-media",
        "directory",
        "IMS_STORY_DATA_DIR",
        story_media_explicit,
    ),
    (
        "event-chronicle-upload",
        event_base / "upload",
        "legacy/event-chronicle/upload",
        "directory",
        "IMS_EVENT_BASE_DIR/upload",
        event_base_explicit,
    ),
    (
        "event-chronicle-used",
        event_base / "used",
        "legacy/event-chronicle/used",
        "directory",
        "IMS_EVENT_BASE_DIR/used",
        event_base_explicit,
    ),
    (
        "event-chronicle-meta",
        event_base / "meta",
        "legacy/event-chronicle/meta",
        "directory",
        "IMS_EVENT_BASE_DIR/meta",
        event_base_explicit,
    ),
    (
        "unity",
        (root / "apps/legacy/public/runninggame").resolve(strict=False),
        "legacy/unity",
        "directory",
        "apps/legacy/public/runninggame",
        False,
    ),
)


def sha256(path):
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def emit(domain, path, object_key):
    try:
        source_path = path.relative_to(root).as_posix()
    except ValueError:
        source_path = str(path)
    source_path.encode("utf-8")
    before = path.stat()
    digest = sha256(path)
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise RuntimeError(f"source changed while hashing: {path}")
    mime = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    record = {
        "bytes": after.st_size,
        "domain": domain,
        "mime": mime,
        "mime_source": "extension",
        "object_key": object_key,
        "sha256": digest,
        "source_path": source_path,
    }
    print(json.dumps(record, ensure_ascii=False, sort_keys=True))


valid_sources = []
missing_sources = False
for domain, source, object_prefix, expected_kind, label, explicit in sources:
    exists_as_expected = source.is_file() if expected_kind == "file" else source.is_dir()
    if exists_as_expected:
        valid_sources.append((domain, source, object_prefix))
        continue
    if source.exists():
        print(
            f"ERROR {label}: {source} is not a {expected_kind}",
            file=sys.stderr,
        )
        missing_sources = True
    elif explicit or production:
        source_type = "configured" if explicit else "production default"
        print(
            f"ERROR {label}: missing {source_type} path {source}",
            file=sys.stderr,
        )
        missing_sources = True
    else:
        print(
            f"WARN  {label}: development default path is absent: {source}",
            file=sys.stderr,
        )

if missing_sources:
    raise SystemExit(1)

for private_name in (".staging", ".trash"):
    private_dir = event_base / private_name
    private_files = [path for path in private_dir.rglob("*") if path.is_file()] \
        if private_dir.is_dir() else []
    if private_files:
        print(
            f"ERROR {private_dir} contains {len(private_files)} unresolved private files",
            file=sys.stderr,
        )
        raise SystemExit(1)

entries = []
seen_keys = {}
run_prefix = f"inventory/{run_id}"
for domain, source, object_prefix in valid_sources:
    if source.is_file():
        candidates = [(source, object_prefix)]
    else:
        candidates = []
        for path in sorted(source.rglob("*")):
            if path.is_symlink():
                print(f"ERROR internal symbolic link is not allowed: {path}", file=sys.stderr)
                raise SystemExit(1)
            if path.is_file():
                suffix = path.relative_to(source).as_posix()
                candidates.append((path, f"{object_prefix}/{suffix}"))

    for path, candidate_key in candidates:
        object_key = unicodedata.normalize("NFC", f"{run_prefix}/{candidate_key}")
        try:
            encoded_key = object_key.encode("utf-8")
        except UnicodeEncodeError as error:
            print(f"ERROR object key is not valid UTF-8: {path}: {error}", file=sys.stderr)
            raise SystemExit(1)
        if len(encoded_key) > 1024:
            print(f"ERROR object key exceeds 1024 UTF-8 bytes: {object_key}", file=sys.stderr)
            raise SystemExit(1)
        previous = seen_keys.get(object_key)
        if previous is not None:
            print(
                f"ERROR normalized object key collision: {previous} and {path}",
                file=sys.stderr,
            )
            raise SystemExit(1)
        seen_keys[object_key] = path
        entries.append((domain, path, object_key))

for domain, path, object_key in entries:
    try:
        emit(domain, path, object_key)
    except (OSError, UnicodeError, RuntimeError) as error:
        print(f"ERROR unable to inventory {path}: {error}", file=sys.stderr)
        raise SystemExit(1)
PY
