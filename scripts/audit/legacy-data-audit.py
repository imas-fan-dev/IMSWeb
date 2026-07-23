#!/usr/bin/env python3
"""Build a read-only migration readiness report for legacy IMS data."""

from __future__ import annotations

import argparse
from datetime import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import sqlite3
import sys


ROOT = Path(__file__).resolve().parents[2]


def configured_path(variable: str, default: str) -> Path:
    value = os.environ.get(variable, default)
    path = Path(value).expanduser()
    if not path.is_absolute():
        path = ROOT / path
    return path.resolve()


PATHS = {
    "core_db": configured_path("IMS_DB_PATH", "apps/legacy/data/core/news.db"),
    "story_db": configured_path(
        "IMS_STORY_DB_PATH", "apps/legacy/data/story/idol_data.db"
    ),
    "story_data": configured_path(
        "IMS_STORY_DATA_DIR", "apps/legacy/data/story/images"
    ),
    "event_base": configured_path(
        "IMS_EVENT_BASE_DIR",
        "apps/legacy/data/chronicle",
    ),
    "uploads": configured_path("IMS_UPLOADS_DIR", "apps/legacy/data/uploads"),
    "compensation": configured_path(
        "IMS_COMPENSATION_DIR", "apps/legacy/data/core/compensation"
    ),
}

CORE_SCHEMA = {
    "users": {"id", "username", "password", "dept", "producername"},
    "news": {"id", "title", "image", "thumbnail", "content", "date", "author"},
    "logs": {"id", "username", "producername", "action", "target", "ip", "time"},
    "cards": {"id", "image1_url", "image2_url", "hash1", "hash2", "ip", "status"},
    "events": {"id", "title", "name", "contact", "image_url", "created_at"},
    "card_emojis": {"id", "card_id", "emoji", "count"},
}

STORY_COLUMNS = {
    "id", "idol_id", "category", "card_name", "up_name", "video_title",
    "url", "subtitle", "image_file",
}
STORY_SCHEMA = {
    "agencies": {"id", "code", "name_cn"},
    "idols": {"id", "agency_id", "name_cn", "folder_name"},
    "theme_colors": {"name", "color"},
    **{
        table: STORY_COLUMNS
        for table in (
            "765_stories", "876_stories", "cg_stories", "ml_stories",
            "sidem_stories", "sc_stories", "gk_stories",
        )
    },
}


def relative_display(path: Path) -> str:
    try:
        return path.relative_to(ROOT).as_posix()
    except ValueError:
        return str(path)


def open_read_only(path: Path) -> sqlite3.Connection:
    wal_path = Path(f"{path}-wal")
    immutable = not wal_path.is_file() or wal_path.stat().st_size == 0
    query = "mode=ro&immutable=1" if immutable else "mode=ro"
    connection = sqlite3.connect(f"{path.as_uri()}?{query}", uri=True)
    connection.row_factory = sqlite3.Row
    return connection


def table_names(connection: sqlite3.Connection) -> list[str]:
    return [
        row[0]
        for row in connection.execute(
            "SELECT name FROM sqlite_master "
            "WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        )
    ]


def quote_identifier(value: str) -> str:
    return '"' + value.replace('"', '""') + '"'


def database_summary(
    path: Path, expected_schema: dict[str, set[str]], details: bool = False
) -> tuple[dict, sqlite3.Connection | None]:
    summary = {
        "path": relative_display(path),
        "exists": path.is_file(),
        "quick_check": None,
        "tables": {},
    }
    if not path.is_file():
        summary["error"] = "database is missing"
        return summary, None

    connection = None
    try:
        connection = open_read_only(path)
        summary["quick_check"] = connection.execute("PRAGMA quick_check").fetchone()[0]
        foreign_key_rows = connection.execute("PRAGMA foreign_key_check").fetchall()
        summary["foreign_key_violations"] = len(foreign_key_rows)
        if details:
            summary["foreign_key_errors"] = [
                {
                    "table": row[0],
                    "rowid": row[1],
                    "parent": row[2],
                    "foreign_key_index": row[3],
                }
                for row in foreign_key_rows
            ]
        for table in table_names(connection):
            summary["tables"][table] = connection.execute(
                f"SELECT COUNT(*) FROM {quote_identifier(table)}"
            ).fetchone()[0]
        schema_errors = []
        actual_tables = set(summary["tables"])
        for table, expected_columns in expected_schema.items():
            if table not in actual_tables:
                schema_errors.append(f"missing table: {table}")
                continue
            actual_columns = {
                row[1]
                for row in connection.execute(
                    f"PRAGMA table_info({quote_identifier(table)})"
                )
            }
            missing_columns = sorted(expected_columns - actual_columns)
            if missing_columns:
                schema_errors.append(
                    f"{table} missing columns: {', '.join(missing_columns)}"
                )
        summary["schema_errors"] = schema_errors
        return summary, connection
    except sqlite3.Error as error:
        if connection is not None:
            connection.close()
        summary["error"] = str(error)
        return summary, None


def contains_internal_symlink(root: Path, candidate: Path) -> bool:
    try:
        relative = candidate.relative_to(root)
    except ValueError:
        return True
    current = root
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            return True
    return False


def safe_url_file(public_url: str) -> Path | None:
    if (
        not isinstance(public_url, str)
        or not public_url.startswith("/uploads/")
        or "\\" in public_url
    ):
        return None
    relative = PurePosixPath(public_url.lstrip("/"))
    if any(part in {"", ".", ".."} for part in relative.parts):
        return None
    candidate = PATHS["uploads"].joinpath(*relative.parts[1:])
    return None if contains_internal_symlink(PATHS["uploads"], candidate) else candidate


def actual_directory_entry(path: Path, cache: dict[str, dict[tuple[int, int], Path]]) -> Path:
    key = str(path.parent)
    if key not in cache:
        entries = {}
        try:
            for candidate in path.parent.iterdir():
                if candidate.is_file():
                    stat = candidate.stat()
                    entries[(stat.st_dev, stat.st_ino)] = candidate
        except OSError:
            pass
        cache[key] = entries
    stat = path.stat()
    return cache[key].get((stat.st_dev, stat.st_ino), path)


def reference_summary(references: list[tuple[str, Path | None]], details: bool) -> dict:
    unique = {}
    invalid = set()
    for source, path in references:
        if path is None:
            invalid.add(source)
        else:
            unique[str(path)] = path

    missing_paths = sorted(relative_display(path) for path in unique.values() if not path.is_file())
    aliases = []
    directory_cache = {}
    for path in unique.values():
        if not path.is_file():
            continue
        actual_path = actual_directory_entry(path, directory_cache)
        if str(actual_path) != str(path):
            aliases.append(
                {
                    "metadata_path": relative_display(path),
                    "filesystem_path": relative_display(actual_path),
                }
            )
    result = {
        "rows_with_references": len(references),
        "unique_files": len(unique),
        "present_files": len(unique) - len(missing_paths),
        "missing_files": len(missing_paths),
        "invalid_references": len(invalid),
        "filesystem_path_aliases": len(aliases),
    }
    if details:
        result["missing_paths"] = missing_paths
        result["invalid_values"] = sorted(invalid)
        result["path_aliases"] = aliases
    return result


def core_media_summary(connection: sqlite3.Connection | None, details: bool) -> dict:
    if connection is None:
        return {"error": "core database is unavailable"}

    references = []
    sources = {
        "news": ("image", "thumbnail"),
        "events": ("image_url",),
        "cards": ("image1_url", "image2_url"),
    }
    tables = set(table_names(connection))
    for table, columns in sources.items():
        if table not in tables:
            continue
        available = {
            row[1]
            for row in connection.execute(
                f"PRAGMA table_info({quote_identifier(table)})"
            )
        }
        selected = [column for column in columns if column in available]
        if not selected:
            continue
        column_sql = ", ".join(quote_identifier(column) for column in selected)
        for row in connection.execute(
            f"SELECT {column_sql} FROM {quote_identifier(table)}"
        ):
            for column in selected:
                value = row[column]
                if value:
                    references.append((f"{table}.{column}:{value}", safe_url_file(value)))
    result = reference_summary(references, details)
    referenced_paths = {
        str(path)
        for _, path in references
        if path is not None
    }
    upload_files = regular_files(PATHS["uploads"])
    unreferenced_paths = sorted(
        relative_display(path)
        for path in upload_files
        if str(path) not in referenced_paths
    )
    result.update(
        {
            "upload_files": len(upload_files),
            "unreferenced_files": len(unreferenced_paths),
        }
    )
    if details:
        result["referenced_paths"] = sorted(
            relative_display(path)
            for path in {path for _, path in references if path is not None}
        )
        result["unreferenced_paths"] = unreferenced_paths
    return result


def safe_story_file(code: str, folder: str, image_file: str) -> Path | None:
    values = (code, folder, image_file)
    if not all(isinstance(value, str) and value and "\\" not in value for value in values):
        return None
    parts = [PurePosixPath(value) for value in values]
    if any(path.is_absolute() or any(part in {"", ".", ".."} for part in path.parts) for path in parts):
        return None
    flattened = [part for path in parts for part in path.parts]
    candidate = PATHS["story_data"].joinpath(*flattened)
    return None if contains_internal_symlink(PATHS["story_data"], candidate) else candidate


def story_media_summary(connection: sqlite3.Connection | None, details: bool) -> dict:
    if connection is None:
        return {"error": "story database is unavailable"}

    references = []
    story_tables = [name for name in table_names(connection) if name.endswith("_stories")]
    for table in story_tables:
        query = (
            f"SELECT a.code, i.folder_name, s.image_file "
            f"FROM {quote_identifier(table)} s "
            "JOIN idols i ON i.id = s.idol_id "
            "JOIN agencies a ON a.id = i.agency_id "
            "WHERE s.image_file IS NOT NULL AND s.image_file <> ''"
        )
        try:
            rows = connection.execute(query)
            for row in rows:
                source = f"{table}:{row['code']}/{row['folder_name']}/{row['image_file']}"
                references.append(
                    (
                        source,
                        safe_story_file(row["code"], row["folder_name"], row["image_file"]),
                    )
                )
        except sqlite3.Error as error:
            return {"error": f"{table}: {error}"}
    return reference_summary(references, details)


def regular_files(path: Path) -> list[Path]:
    if not path.is_dir():
        return []
    return [candidate for candidate in path.rglob("*") if candidate.is_file()]


def safe_chronicle_segment(value: str) -> bool:
    if (
        not isinstance(value, str)
        or not value
        or value != value.strip()
        or value in {".", ".."}
        or re.search(r'[\x00-\x1f\x7f\\/<>:"|?*]', value) is not None
    ):
        return False
    try:
        return len(value.encode("utf-16-le")) // 2 <= 180
    except UnicodeEncodeError:
        return False


def chronicle_summary(details: bool) -> dict:
    base = PATHS["event_base"]
    meta_dir = base / "meta"
    upload_dir = base / "upload"
    used_dir = base / "used"
    references = []
    duplicate_records = []
    invalid_meta = []

    for meta_path in sorted(meta_dir.glob("*.json")) if meta_dir.is_dir() else []:
        try:
            if not safe_chronicle_segment(meta_path.stem):
                raise ValueError("activity id cannot be addressed by the application")
            payload = json.loads(meta_path.read_text(encoding="utf-8"))
            if isinstance(payload, dict):
                records = payload.get("records", [])
            elif isinstance(payload, list):
                records = payload
            else:
                raise ValueError("metadata must be an object or array")
            if not isinstance(records, list):
                raise ValueError("records is not an array")
            seen_records = set()
            for record in records:
                if not isinstance(record, dict):
                    references.append((f"{meta_path.name}:non-object-record", None))
                    continue
                filename = record.get("filename")
                status = record.get("status")
                if not safe_chronicle_segment(filename):
                    references.append((f"{meta_path.name}:invalid-record", None))
                    continue
                if status not in {"pending", "approved"}:
                    references.append((f"{meta_path.name}:{filename}:invalid-status", None))
                    continue
                state_dir = used_dir if status == "approved" else upload_dir
                record_key = (filename, status)
                if record_key in seen_records:
                    duplicate_records.append(f"{meta_path.name}:{status}:{filename}")
                    references.append((f"{meta_path.name}:{filename}:duplicate", None))
                    continue
                seen_records.add(record_key)
                candidate = state_dir / meta_path.stem / filename
                references.append(
                    (
                        f"{meta_path.name}:{filename}",
                        None if contains_internal_symlink(base, candidate) else candidate,
                    )
                )
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
            invalid_meta.append({"file": relative_display(meta_path), "error": str(error)})

    media_files = regular_files(upload_dir) + regular_files(used_dir)
    staging_files = regular_files(base / ".staging")
    trash_files = regular_files(base / ".trash")
    media_by_identity = {}
    for path in media_files:
        stat = path.stat()
        media_by_identity[(stat.st_dev, stat.st_ino)] = path

    referenced_identities = set()
    alias_paths = []
    for _, path in references:
        if path is None or not path.is_file():
            continue
        stat = path.stat()
        identity = (stat.st_dev, stat.st_ino)
        referenced_identities.add(identity)
        actual_path = media_by_identity.get(identity)
        if actual_path is not None and str(actual_path) != str(path):
            alias_paths.append(
                {
                    "metadata_path": relative_display(path),
                    "filesystem_path": relative_display(actual_path),
                }
            )
    orphan_paths = sorted(
        relative_display(path)
        for identity, path in media_by_identity.items()
        if identity not in referenced_identities
    )
    result = reference_summary(references, details)
    result.update(
        {
            "metadata_files": len(list(meta_dir.glob("*.json"))) if meta_dir.is_dir() else 0,
            "invalid_metadata_files": len(invalid_meta),
            "media_files": len(media_files),
            "orphan_files": len(orphan_paths),
            "filesystem_path_aliases": len(alias_paths),
            "duplicate_records": len(duplicate_records),
            "staging_files": len(staging_files),
            "trash_files": len(trash_files),
            "required_directories_missing": [
                relative_display(path)
                for path in (meta_dir, upload_dir, used_dir)
                if not path.is_dir()
            ],
        }
    )
    if details:
        result["invalid_metadata"] = invalid_meta
        result["orphan_paths"] = orphan_paths
        result["path_aliases"] = alias_paths
        result["duplicate_record_values"] = duplicate_records
        result["staging_paths"] = [relative_display(path) for path in staging_files]
        result["trash_paths"] = [relative_display(path) for path in trash_files]
    return result


def directory_summary(path: Path) -> dict:
    files = regular_files(path)
    return {
        "path": relative_display(path),
        "exists": path.is_dir(),
        "files": len(files),
        "bytes": sum(file.stat().st_size for file in files),
    }


def javascript_json_quote(value: str) -> str:
    """Serialize a string as JSON.stringify does for a delete payload key."""
    escaped = []
    index = 0
    short_escapes = {
        "\b": "\\b",
        "\t": "\\t",
        "\n": "\\n",
        "\f": "\\f",
        "\r": "\\r",
        '"': '\\"',
        "\\": "\\\\",
    }
    while index < len(value):
        character = value[index]
        codepoint = ord(character)
        if character in short_escapes:
            escaped.append(short_escapes[character])
        elif codepoint <= 0x1F:
            escaped.append(f"\\u{codepoint:04x}")
        elif 0xD800 <= codepoint <= 0xDBFF:
            if index + 1 < len(value) and 0xDC00 <= ord(value[index + 1]) <= 0xDFFF:
                low = ord(value[index + 1])
                escaped.append(chr(0x10000 + ((codepoint - 0xD800) << 10) + low - 0xDC00))
                index += 1
            else:
                escaped.append(f"\\u{codepoint:04x}")
        elif 0xDC00 <= codepoint <= 0xDFFF:
            escaped.append(f"\\u{codepoint:04x}")
        else:
            escaped.append(character)
        index += 1
    return f'"{"".join(escaped)}"'


def delete_object_journal_id(payload: dict) -> str:
    serialized = f'{{"key":{javascript_json_quote(payload["key"])}}}'
    identity = f"delete-object\0{serialized}".encode("utf-8")
    return hashlib.sha256(identity).hexdigest()


def parse_journal_json(journal_path: Path) -> dict:
    def reject_constant(value: str) -> None:
        raise ValueError(f"invalid JSON constant: {value}")

    def reject_duplicate_keys(pairs: list[tuple[str, object]]) -> dict:
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError(f"duplicate JSON field: {key}")
            result[key] = value
        return result

    payload = json.loads(
        journal_path.read_text(encoding="utf-8"),
        parse_constant=reject_constant,
        object_pairs_hook=reject_duplicate_keys,
    )
    if not isinstance(payload, dict):
        raise ValueError("journal entry must be an object")
    return payload


def validate_journal_entry(journal_path: Path, entry: dict) -> str:
    required_fields = {"id", "kind", "payload", "state", "attempts", "updatedAt"}
    allowed_fields = required_fields | {"lastError"}
    missing_fields = sorted(required_fields - entry.keys())
    extra_fields = sorted(entry.keys() - allowed_fields)
    if missing_fields:
        raise ValueError(f"journal entry is missing fields: {', '.join(missing_fields)}")
    if extra_fields:
        raise ValueError(f"journal entry has unsupported fields: {', '.join(extra_fields)}")

    entry_id = entry["id"]
    if not isinstance(entry_id, str) or re.fullmatch(r"[0-9a-f]{64}", entry_id) is None:
        raise ValueError("journal id must be 64 lowercase hexadecimal characters")
    if journal_path.name != f"{entry_id}.json":
        raise ValueError("journal filename must be <id>.json")
    if entry["kind"] != "delete-object":
        raise ValueError("journal kind must be delete-object")

    journal_payload = entry["payload"]
    if not isinstance(journal_payload, dict):
        raise ValueError("delete-object journal requires an object payload")
    if set(journal_payload) != {"key"}:
        raise ValueError("delete-object payload must contain only key")
    object_key = journal_payload["key"]
    if not isinstance(object_key, str) or not object_key:
        raise ValueError("delete-object journal requires a non-empty payload.key")
    if entry_id != delete_object_journal_id(journal_payload):
        raise ValueError("journal id does not match kind and payload")

    state = entry["state"]
    if not isinstance(state, str) or state not in {
        "pending", "running", "completed", "failed"
    }:
        raise ValueError("journal state must be pending, running, completed, or failed")
    attempts = entry["attempts"]
    if type(attempts) is not int or attempts < 0:
        raise ValueError("journal attempts must be a non-negative integer")
    if state == "pending" and attempts != 0:
        raise ValueError("pending journal attempts must be zero")
    if state in {"running", "completed", "failed"} and attempts < 1:
        raise ValueError(f"{state} journal attempts must be at least one")

    has_last_error = "lastError" in entry
    if has_last_error and not isinstance(entry["lastError"], str):
        raise ValueError("journal lastError must be a string when present")
    if state == "failed" and not has_last_error:
        raise ValueError("failed journal requires lastError")
    if state == "completed" and has_last_error:
        raise ValueError("completed journal must not contain lastError")

    updated_at_value = entry["updatedAt"]
    if not isinstance(updated_at_value, str):
        raise ValueError("updatedAt must be an ISO-8601 timestamp")
    normalized_updated_at = (
        f"{updated_at_value[:-1]}+00:00"
        if updated_at_value.endswith("Z")
        else updated_at_value
    )
    try:
        updated_at = datetime.fromisoformat(normalized_updated_at)
    except ValueError as error:
        raise ValueError("updatedAt must be an ISO-8601 timestamp") from error
    if updated_at.tzinfo is None:
        raise ValueError("updatedAt must include a timezone")
    return state


def compensation_summary(
    path: Path, disposition_path: Path | None, details: bool
) -> dict:
    journal_files = sorted(path.iterdir()) if path.is_dir() else []
    states = {state: 0 for state in ("pending", "running", "completed", "failed")}
    invalid_entries = []
    completed_files = []
    for journal_path in journal_files:
        try:
            if journal_path.is_symlink() or not journal_path.is_file() or journal_path.suffix != ".json":
                raise ValueError("journal entry must be a regular .json file")
            payload = parse_journal_json(journal_path)
            if payload.get("state") == "completed":
                completed_files.append(journal_path.name)
            state = validate_journal_entry(journal_path, payload)
            states[state] += 1
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
            invalid_entries.append(
                {"file": relative_display(journal_path), "error": str(error)}
            )

    disposition_error = None
    disposition = None
    disposition_evidence = None
    if disposition_path is not None:
        try:
            disposition_bytes = disposition_path.read_bytes()
            disposition_evidence = {
                "path": str(disposition_path.resolve()),
                "sha256": hashlib.sha256(disposition_bytes).hexdigest(),
            }
        except OSError as error:
            disposition_error = str(error)
    if journal_files:
        try:
            if disposition_path is None:
                raise ValueError("completed journals require --compensation-disposition")
            if disposition_path.is_symlink() or not disposition_path.is_file():
                raise ValueError("compensation disposition must be a regular file")
            disposition = parse_journal_json(disposition_path)
            if not isinstance(disposition, dict):
                raise ValueError("compensation disposition must be an object")
            action = disposition.get("action")
            if not isinstance(action, str) or action not in {
                "retain-completed-for-audit", "purge-completed-after-backup"
            }:
                raise ValueError("unsupported compensation disposition action")
            declared = disposition.get("journal_files")
            if not isinstance(declared, list) or not all(
                isinstance(name, str) and name for name in declared
            ):
                raise ValueError("journal_files must be an array of filenames")
            if sorted(declared) != sorted(completed_files):
                raise ValueError("journal_files must exactly match completed journals")
            for field in ("approved_by", "approved_at"):
                if not isinstance(disposition.get(field), str) or not disposition[field].strip():
                    raise ValueError(f"{field} is required")
            try:
                approved_at = datetime.fromisoformat(
                    disposition["approved_at"].replace("Z", "+00:00")
                )
            except ValueError as error:
                raise ValueError("approved_at must be an ISO-8601 timestamp") from error
            if approved_at.tzinfo is None:
                raise ValueError("approved_at must include a timezone")
        except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as error:
            disposition_error = str(error)

    result = {
        "path": relative_display(path),
        "exists": path.is_dir(),
        "journal_files": len(journal_files),
        "states": states,
        "invalid_entries": len(invalid_entries),
        "outstanding_entries": states["pending"] + states["running"] + states["failed"],
        "disposition_required": bool(journal_files),
        "disposition_valid": not journal_files or disposition_error is None,
        "disposition": None,
    }
    if disposition is not None and disposition_error is None:
        result["disposition_action"] = disposition["action"]
        result["disposition"] = {
            **(disposition_evidence or {}),
            "action": disposition["action"],
            "journal_files": disposition["journal_files"],
            "approved_by": disposition["approved_by"],
            "approved_at": disposition["approved_at"],
        }
    elif disposition_evidence is not None:
        result["disposition_evidence"] = disposition_evidence
    if disposition_error:
        result["disposition_error"] = disposition_error
    if details:
        result["invalid_entry_details"] = invalid_entries
        result["completed_journal_files"] = completed_files
    return result


def has_blocking_issue(report: dict) -> bool:
    databases = report["databases"].values()
    if any(
        database.get("error")
        or database.get("quick_check") != "ok"
        or database.get("foreign_key_violations", 0) > 0
        or database.get("schema_errors")
        for database in databases
    ):
        return True
    for section in report["references"].values():
        if section.get("error"):
            return True
        if section.get("missing_files", 0) or section.get("invalid_references", 0):
            return True
        if section.get("filesystem_path_aliases", 0):
            return True
    if any(not directory.get("exists") for directory in report["directories"].values()):
        return True
    chronicle = report["references"]["event_chronicle"]
    compensation = report["compensation"]
    return (
        report["references"]["core_media"].get("unreferenced_files", 0) > 0
        or chronicle.get("orphan_files", 0) > 0
        or chronicle.get("invalid_metadata_files", 0) > 0
        or chronicle.get("filesystem_path_aliases", 0) > 0
        or chronicle.get("duplicate_records", 0) > 0
        or chronicle.get("staging_files", 0) > 0
        or chronicle.get("trash_files", 0) > 0
        or bool(chronicle.get("required_directories_missing"))
        or not compensation.get("exists", False)
        or compensation.get("invalid_entries", 0) > 0
        or compensation.get("outstanding_entries", 0) > 0
        or not compensation.get("disposition_valid", False)
    )


def build_report(
    details: bool = False, compensation_disposition: Path | None = None
) -> dict:
    core_database, core_connection = database_summary(
        PATHS["core_db"], CORE_SCHEMA, details
    )
    story_database, story_connection = database_summary(
        PATHS["story_db"], STORY_SCHEMA, details
    )
    try:
        report = {
            "databases": {"core": core_database, "story": story_database},
            "directories": {
                "uploads": directory_summary(PATHS["uploads"]),
                "story_data": directory_summary(PATHS["story_data"]),
                "event_chronicle": directory_summary(PATHS["event_base"]),
                "compensation": directory_summary(PATHS["compensation"]),
            },
            "references": {
                "core_media": core_media_summary(core_connection, details),
                "story_media": story_media_summary(story_connection, details),
                "event_chronicle": chronicle_summary(details),
            },
            "compensation": compensation_summary(
                PATHS["compensation"], compensation_disposition, details
            ),
        }
    finally:
        if core_connection is not None:
            core_connection.close()
        if story_connection is not None:
            story_connection.close()
    report["migration_ready"] = not has_blocking_issue(report)
    return report


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--details", action="store_true", help="include paths for missing/orphan data")
    parser.add_argument("--strict", action="store_true", help="exit non-zero when blocking issues are found")
    parser.add_argument(
        "--compensation-disposition", type=Path,
        help="JSON disposition covering every completed compensation journal",
    )
    args = parser.parse_args()
    disposition = args.compensation_disposition
    if disposition is not None:
        disposition = disposition.expanduser()
        if not disposition.is_absolute():
            disposition = Path.cwd() / disposition
        # Resolve the parent for a stable absolute location, but preserve the final
        # path component so compensation_summary can reject a symlink itself.
        disposition = disposition.parent.resolve() / disposition.name
    report = build_report(args.details, disposition)
    json.dump(report, sys.stdout, ensure_ascii=False, indent=2, sort_keys=True)
    sys.stdout.write("\n")
    return 2 if args.strict and not report["migration_ready"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
