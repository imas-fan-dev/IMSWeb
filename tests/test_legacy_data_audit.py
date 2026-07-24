import importlib.util
import hashlib
import io
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


PROJECT_ROOT = Path(__file__).resolve().parents[1]
AUDIT_PATH = PROJECT_ROOT / "scripts" / "audit" / "legacy-data-audit.py"
SPEC = importlib.util.spec_from_file_location("legacy_data_audit_test", AUDIT_PATH)
AUDIT = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = AUDIT
SPEC.loader.exec_module(AUDIT)


def journal_id(key):
    serialized = json.dumps(
        {"key": key}, ensure_ascii=False, separators=(",", ":")
    )
    return hashlib.sha256(
        f"delete-object\0{serialized}".encode("utf-8")
    ).hexdigest()


def journal_entry(key, state, attempts, **fields):
    entry_id = journal_id(key)
    return entry_id, {
        "id": entry_id,
        "kind": "delete-object",
        "payload": {"key": key},
        "state": state,
        "attempts": attempts,
        "updatedAt": "2026-07-21T00:00:00.000Z",
        **fields,
    }


class ChronicleAuditTests(unittest.TestCase):
    def test_unified_path_is_reported_as_one_physical_database(self):
        original_paths = {
            "core_db": AUDIT.PATHS["core_db"],
            "story_db": AUDIT.PATHS["story_db"],
        }
        database_path = Path("/tmp/imsweb-unified.db")
        connection = mock.Mock()
        AUDIT.PATHS.update({"core_db": database_path, "story_db": database_path})
        try:
            with (
                mock.patch.object(
                    AUDIT,
                    "database_summary",
                    return_value=({"path": str(database_path), "quick_check": "ok"}, connection),
                ) as database_summary,
                mock.patch.object(AUDIT, "directory_summary", return_value={"exists": True}),
                mock.patch.object(AUDIT, "core_media_summary", return_value={}),
                mock.patch.object(AUDIT, "story_media_summary", return_value={}),
                mock.patch.object(AUDIT, "chronicle_summary", return_value={}),
                mock.patch.object(
                    AUDIT,
                    "compensation_summary",
                    return_value={"exists": True, "disposition_valid": True},
                ),
                mock.patch.object(AUDIT, "has_blocking_issue", return_value=False),
            ):
                report = AUDIT.build_report()
        finally:
            AUDIT.PATHS.update(original_paths)

        self.assertEqual(list(report["databases"]), ["unified"])
        schema = database_summary.call_args.args[1]
        self.assertIn("users", schema)
        self.assertIn("agencies", schema)
        connection.close.assert_called_once_with()

    def test_core_media_is_an_exact_db_referenced_upload_set(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            uploads = Path(temporary_directory) / "uploads"
            active = uploads / "news" / "original" / "active.png"
            extra = uploads / "news" / "original" / "orphan.png"
            active.parent.mkdir(parents=True)
            active.write_bytes(b"active")
            extra.write_bytes(b"orphan")
            connection = sqlite3.connect(":memory:")
            connection.row_factory = sqlite3.Row
            connection.executescript(
                "CREATE TABLE news (image TEXT, thumbnail TEXT);"
                "CREATE TABLE events (image_url TEXT);"
                "CREATE TABLE cards (image1_url TEXT, image2_url TEXT);"
                "INSERT INTO news VALUES "
                "('/uploads/news/original/active.png', "
                "'/uploads/news/thumb/missing.png');"
            )
            original = AUDIT.PATHS["uploads"]
            AUDIT.PATHS["uploads"] = uploads
            try:
                summary = AUDIT.core_media_summary(connection, details=True)
            finally:
                AUDIT.PATHS["uploads"] = original
                connection.close()

            self.assertEqual(summary["missing_files"], 1)
            self.assertEqual(summary["unreferenced_files"], 1)
            self.assertEqual(
                summary["unreferenced_paths"],
                [str(extra)],
            )
            self.assertIn(str(active), summary["referenced_paths"])

    def test_pending_delete_and_undisposed_completed_journals_block(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory) / "compensation"
            root.mkdir()
            pending_id, pending_entry = journal_entry(
                "uploads/news/original/deleted.png",
                "pending",
                0,
                lastError="delete failed",
            )
            pending = root / f"{pending_id}.json"
            pending.write_text(
                json.dumps(pending_entry),
                encoding="utf-8",
            )
            summary = AUDIT.compensation_summary(root, None, details=True)
            self.assertEqual(summary["outstanding_entries"], 1)
            self.assertEqual(summary["invalid_entries"], 0)
            self.assertFalse(summary["disposition_valid"])
            self.assertIsNone(summary["disposition"])

            pending.unlink()
            completed_id, completed_entry = journal_entry(
                "uploads/news/original/deleted.png", "completed", 1
            )
            completed = root / f"{completed_id}.json"
            completed.write_text(
                json.dumps(completed_entry),
                encoding="utf-8",
            )
            undisposed = AUDIT.compensation_summary(root, None, details=True)
            self.assertEqual(undisposed["outstanding_entries"], 0)
            self.assertEqual(undisposed["invalid_entries"], 0)
            self.assertFalse(undisposed["disposition_valid"])

            disposition = root.parent / "disposition.json"
            disposition.write_text(
                json.dumps(
                    {
                        "action": "purge-completed-after-backup",
                        "journal_files": [completed.name],
                        "approved_by": "migration-owner",
                        "approved_at": "2026-07-21T00:00:00Z",
                    }
                ),
                encoding="utf-8",
            )
            disposed = AUDIT.compensation_summary(root, disposition, details=True)
            self.assertTrue(disposed["disposition_valid"])
            self.assertEqual(disposed["disposition_action"], "purge-completed-after-backup")

            disposition_link = root.parent / "disposition-link.json"
            disposition_link.symlink_to(disposition)
            linked = AUDIT.compensation_summary(root, disposition_link, details=True)
            self.assertFalse(linked["disposition_valid"])
            self.assertIn("regular file", linked["disposition_error"])

            with (
                mock.patch.object(
                    sys,
                    "argv",
                    [str(AUDIT_PATH), "--strict", "--compensation-disposition", str(disposition_link)],
                ),
                mock.patch.object(
                    AUDIT, "build_report", return_value={"migration_ready": True}
                ) as build_report,
                mock.patch.object(sys, "stdout", new=io.StringIO()),
            ):
                self.assertEqual(AUDIT.main(), 0)
            cli_disposition = build_report.call_args.args[1]
            self.assertTrue(cli_disposition.is_absolute())
            self.assertTrue(cli_disposition.is_symlink())

    def test_forged_completed_journal_blocks_even_with_valid_disposition(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory) / "compensation"
            root.mkdir()
            entry_id, entry = journal_entry(
                "uploads/news/original/original.png", "completed", 1
            )
            entry["payload"]["key"] = "uploads/news/original/forged.png"
            journal = root / f"{entry_id}.json"
            journal.write_text(json.dumps(entry), encoding="utf-8")
            disposition = root.parent / "disposition.json"
            disposition.write_text(
                json.dumps(
                    {
                        "action": "retain-completed-for-audit",
                        "journal_files": [journal.name],
                        "approved_by": "migration-owner",
                        "approved_at": "2026-07-21T00:00:00Z",
                    }
                ),
                encoding="utf-8",
            )

            summary = AUDIT.compensation_summary(root, disposition, details=True)
            self.assertTrue(summary["disposition_valid"])
            self.assertEqual(summary["invalid_entries"], 1)
            self.assertIn(
                "journal id does not match kind and payload",
                summary["invalid_entry_details"][0]["error"],
            )
            self.assertTrue(
                AUDIT.has_blocking_issue(
                    {
                        "databases": {},
                        "directories": {},
                        "references": {"core_media": {}, "event_chronicle": {}},
                        "compensation": summary,
                    }
                )
            )

    def test_compensation_journal_contract_rejects_invalid_shapes(self):
        key = "uploads/news/original/deleted.png"
        _, valid = journal_entry(key, "completed", 1)
        cases = {
            "extra field": ({**valid, "unexpected": True}, "unsupported fields"),
            "extra payload field": (
                {**valid, "payload": {"key": key, "other": "value"}},
                "payload must contain only key",
            ),
            "boolean attempts": ({**valid, "attempts": True}, "non-negative integer"),
            "pending attempted": (
                {**valid, "state": "pending"},
                "pending journal attempts must be zero",
            ),
            "failed without error": (
                {**valid, "state": "failed"},
                "failed journal requires lastError",
            ),
            "completed error": ({**valid, "lastError": "stale"}, "must not contain lastError"),
            "missing timestamp": (
                {field: value for field, value in valid.items() if field != "updatedAt"},
                "missing fields: updatedAt",
            ),
            "timezone-less timestamp": (
                {**valid, "updatedAt": "2026-07-21T00:00:00"},
                "must include a timezone",
            ),
        }
        for label, (entry, expected_error) in cases.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary_directory:
                root = Path(temporary_directory)
                journal = root / f"{valid['id']}.json"
                journal.write_text(json.dumps(entry), encoding="utf-8")
                summary = AUDIT.compensation_summary(root, None, details=True)
                self.assertEqual(summary["invalid_entries"], 1)
                self.assertIn(expected_error, summary["invalid_entry_details"][0]["error"])

        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            (root / f"{'0' * 64}.json").write_text(
                json.dumps(valid), encoding="utf-8"
            )
            summary = AUDIT.compensation_summary(root, None, details=True)
            self.assertEqual(summary["invalid_entries"], 1)
            self.assertIn(
                "journal filename must be <id>.json",
                summary["invalid_entry_details"][0]["error"],
            )

    def test_delete_object_journal_id_uses_javascript_json_stringify_bytes(self):
        self.assertEqual(
            AUDIT.delete_object_journal_id({"key": "uploads/偶像/é\n.png"}),
            "4d28a7a14f0b186c28210b244c464724f82d8f3e6df5c0ff0e118ad413af9fa4",
        )
        self.assertEqual(
            AUDIT.delete_object_journal_id({"key": "\ud800"}),
            "8a8d0407bd3f48ab0a2412c1953c9327407f16d4a5f955c713c040bfc5d63e9b",
        )

    def test_malformed_compensation_journal_is_a_structured_blocker(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            (root / "malformed.json").write_text("[]", encoding="utf-8")
            summary = AUDIT.compensation_summary(root, None, details=True)
            self.assertEqual(summary["invalid_entries"], 1)
            self.assertIn(
                "journal entry must be an object",
                summary["invalid_entry_details"][0]["error"],
            )

    def test_chronicle_orphan_is_reported_as_a_blocker(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            event_base = Path(temporary_directory) / "events"
            (event_base / "meta").mkdir(parents=True)
            (event_base / "upload").mkdir()
            orphan = event_base / "used" / "activity" / "orphan.png"
            orphan.parent.mkdir(parents=True)
            orphan.write_bytes(b"orphan")
            original = AUDIT.PATHS["event_base"]
            AUDIT.PATHS["event_base"] = event_base
            try:
                summary = AUDIT.chronicle_summary(details=True)
            finally:
                AUDIT.PATHS["event_base"] = original

            self.assertEqual(summary["orphan_files"], 1)
            self.assertEqual(summary["orphan_paths"], [str(orphan)])

    def test_upload_path_can_be_moved_outside_the_release(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            uploads = Path(temporary_directory) / "shared-uploads"
            previous = os.environ.get("IMS_UPLOADS_DIR")
            os.environ["IMS_UPLOADS_DIR"] = str(uploads)
            try:
                configured = AUDIT.configured_path(
                    "IMS_UPLOADS_DIR", "apps/legacy/data/uploads"
                )
            finally:
                if previous is None:
                    os.environ.pop("IMS_UPLOADS_DIR", None)
                else:
                    os.environ["IMS_UPLOADS_DIR"] = previous

            self.assertEqual(configured, uploads.resolve())

            original = AUDIT.PATHS["uploads"]
            AUDIT.PATHS["uploads"] = uploads
            try:
                resolved_media = AUDIT.safe_url_file(
                    "/uploads/namecard/original/card.webp"
                )
            finally:
                AUDIT.PATHS["uploads"] = original

            self.assertEqual(
                resolved_media,
                uploads / "namecard" / "original" / "card.webp",
            )

    def test_legacy_array_metadata_is_counted(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            event_base = Path(temporary_directory) / "events"
            meta_dir = event_base / "meta"
            used_dir = event_base / "used" / "legacy-activity"
            meta_dir.mkdir(parents=True)
            used_dir.mkdir(parents=True)
            (used_dir / "photo.png").write_bytes(b"image fixture")
            (meta_dir / "legacy-activity.json").write_text(
                json.dumps(
                    [
                        {
                            "filename": "photo.png",
                            "status": "approved",
                            "uploader": "fixture",
                        }
                    ]
                ),
                encoding="utf-8",
            )

            original = AUDIT.PATHS["event_base"]
            AUDIT.PATHS["event_base"] = event_base
            try:
                summary = AUDIT.chronicle_summary(details=True)
            finally:
                AUDIT.PATHS["event_base"] = original

            self.assertEqual(summary["rows_with_references"], 1)
            self.assertEqual(summary["present_files"], 1)
            self.assertEqual(summary["missing_files"], 0)
            self.assertEqual(summary["orphan_files"], 0)
            self.assertEqual(summary["invalid_metadata_files"], 0)

    def test_empty_sqlite_schema_is_not_migration_ready(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            database_path = Path(temporary_directory) / "empty.db"
            sqlite3.connect(database_path).close()
            summary, connection = AUDIT.database_summary(
                database_path, AUDIT.CORE_SCHEMA, details=True
            )
            if connection is not None:
                connection.close()

            self.assertEqual(summary["quick_check"], "ok")
            self.assertGreater(len(summary["schema_errors"]), 0)

    def test_production_inventory_requires_online_backup_paths(self):
        env = os.environ.copy()
        env.update({"NODE_ENV": "production", "IMS_INVENTORY_RUN_ID": "test-run"})
        env.pop("IMS_INVENTORY_CORE_DB_PATH", None)
        env.pop("IMS_INVENTORY_STORY_DB_PATH", None)
        result = subprocess.run(
            [
                "sh",
                str(PROJECT_ROOT / "scripts" / "migration" / "legacy-inventory.sh"),
            ],
            cwd=PROJECT_ROOT,
            env=env,
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        self.assertEqual(result.returncode, 1)
        self.assertIn("online backup files", result.stderr)


if __name__ == "__main__":
    unittest.main()
