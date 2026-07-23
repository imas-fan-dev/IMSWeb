import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import subprocess
import sys
import tempfile
import unittest
from unittest import mock


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = PROJECT_ROOT / "scripts" / "migration" / "build-active-media-manifest.py"
WORKER = PROJECT_ROOT / "apps" / "api" / "src" / "server" / "worker.ts"
STORY_TABLES = (
    "765_stories", "876_stories", "cg_stories", "ml_stories",
    "sidem_stories", "sc_stories", "gk_stories",
)

BUILDER_SPEC = importlib.util.spec_from_file_location("active_media_builder", SCRIPT)
assert BUILDER_SPEC is not None and BUILDER_SPEC.loader is not None
BUILDER = importlib.util.module_from_spec(BUILDER_SPEC)
sys.modules[BUILDER_SPEC.name] = BUILDER
BUILDER_SPEC.loader.exec_module(BUILDER)


def create_core_database(path: Path) -> None:
    connection = sqlite3.connect(path)
    connection.executescript(
        "CREATE TABLE users (id INTEGER, username TEXT, password TEXT, dept TEXT, producername TEXT);"
        "CREATE TABLE news (id INTEGER, title TEXT, image TEXT, thumbnail TEXT, content TEXT, date TEXT, author TEXT);"
        "CREATE TABLE logs (id INTEGER, username TEXT, producername TEXT, action TEXT, target TEXT, ip TEXT, time TEXT);"
        "CREATE TABLE cards (id INTEGER, image1_url TEXT, image2_url TEXT, hash1 TEXT, hash2 TEXT, ip TEXT, status TEXT);"
        "CREATE TABLE events (id INTEGER, title TEXT, name TEXT, contact TEXT, image_url TEXT, created_at TEXT);"
        "CREATE TABLE card_emojis (id INTEGER, card_id INTEGER, emoji TEXT, count INTEGER);"
        "INSERT INTO news VALUES (1, 'active', '/uploads/news/original/active.png', NULL, '', '', '');"
    )
    connection.close()


def create_story_database(path: Path) -> None:
    connection = sqlite3.connect(path)
    connection.executescript(
        "CREATE TABLE agencies (id INTEGER, code TEXT, name_cn TEXT);"
        "CREATE TABLE idols (id INTEGER, agency_id INTEGER, name_cn TEXT, folder_name TEXT);"
        "CREATE TABLE theme_colors (name TEXT, color TEXT);"
    )
    story_columns = (
        "id INTEGER, idol_id INTEGER, category TEXT, card_name TEXT, "
        "up_name TEXT, video_title TEXT, url TEXT, subtitle TEXT, image_file TEXT"
    )
    for table in STORY_TABLES:
        connection.execute(f'CREATE TABLE "{table}" ({story_columns})')
    connection.close()


def create_fixture(root: Path) -> dict[str, Path]:
    core_db = root / "core.db"
    story_db = root / "story.db"
    create_core_database(core_db)
    create_story_database(story_db)

    uploads = root / "uploads"
    active = uploads / "news" / "original" / "active.png"
    active.parent.mkdir(parents=True)
    active.write_bytes(b"active-upload")
    story_data = root / "Data"
    story_data.mkdir()
    event_base = root / "events"
    for directory in ("meta", "upload", "used"):
        (event_base / directory).mkdir(parents=True)
    compensation = root / "compensation"
    compensation.mkdir()
    unity_root = root / "runninggame"
    for directory in ("Build", "BuildMobile"):
        (unity_root / directory).mkdir(parents=True)
        (unity_root / directory / "webgame.data").write_bytes(
            f"{directory}-data".encode("ascii")
        )
        (unity_root / directory / "webgame.wasm").write_bytes(
            f"{directory}-wasm".encode("ascii")
        )
    return {
        "core_db": core_db,
        "story_db": story_db,
        "uploads": uploads,
        "active": active,
        "story_data": story_data,
        "event_base": event_base,
        "compensation": compensation,
        "unity_root": unity_root,
    }


def add_completed_disposition(paths: dict[str, Path], root: Path) -> Path:
    payload = {"key": "uploads/news/original/retired.png"}
    serialized = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    journal_id = hashlib.sha256(
        f"delete-object\0{serialized}".encode("utf-8")
    ).hexdigest()
    journal = paths["compensation"] / f"{journal_id}.json"
    journal.write_text(
        json.dumps(
            {
                "id": journal_id,
                "kind": "delete-object",
                "payload": payload,
                "state": "completed",
                "attempts": 1,
                "updatedAt": "2026-07-21T00:00:00.000Z",
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    disposition = root / "compensation-disposition.json"
    disposition.write_text(
        json.dumps(
            {
                "action": "retain-completed-for-audit",
                "journal_files": [journal.name],
                "approved_by": "migration-owner",
                "approved_at": "2026-07-21T00:30:00Z",
            },
            separators=(",", ":"),
        ),
        encoding="utf-8",
    )
    paths["disposition"] = disposition
    return disposition


def builder_arguments(paths: dict[str, Path], output: Path, report: Path) -> list[str]:
    arguments = [
        "--core-db", str(paths["core_db"]),
        "--story-db", str(paths["story_db"]),
        "--uploads", str(paths["uploads"]),
        "--story-data", str(paths["story_data"]),
        "--event-base", str(paths["event_base"]),
        "--compensation-dir", str(paths["compensation"]),
        "--unity-root", str(paths["unity_root"]),
        "--run-id", "formal-test-run",
        "--output", str(output),
        "--audit-report", str(report),
    ]
    if "disposition" in paths:
        arguments.extend(["--compensation-disposition", str(paths["disposition"])])
    return arguments


def run_builder(paths: dict[str, Path], output: Path, report: Path) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, str(SCRIPT), *builder_arguments(paths, output, report)],
        cwd=PROJECT_ROOT,
        capture_output=True,
        text=True,
        timeout=20,
        check=False,
    )


class ActiveMediaManifestTests(unittest.TestCase):
    def test_empty_compensation_gate_is_accepted_by_remote_validator(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            paths = create_fixture(root)
            output = root / "formal.json"
            report = root / "audit.json"

            result = run_builder(paths, output, report)
            self.assertEqual(result.returncode, 0, result.stderr)
            document = json.loads(output.read_text(encoding="utf-8"))
            audit = json.loads(report.read_text(encoding="utf-8"))
            self.assertIn("disposition", audit["compensation"])
            self.assertIsNone(audit["compensation"]["disposition"])
            self.assertIsNone(document["auditGate"]["compensationDisposition"])

            validation = subprocess.run(
                [
                    "node",
                    "-e",
                    (
                        "const fs=require('node:fs');"
                        "const {validateRemoteAuditGate}=require("
                        "'./apps/api/scripts/migration/r2-transfer');"
                        "const document=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));"
                        "validateRemoteAuditGate(document,document.manifest);"
                    ),
                    str(output),
                ],
                cwd=PROJECT_ROOT,
                capture_output=True,
                text=True,
                timeout=20,
                check=False,
            )
            self.assertEqual(validation.returncode, 0, validation.stderr)

    def test_formal_manifest_is_audited_and_contains_only_selected_unity_data(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            paths = create_fixture(root)
            disposition = add_completed_disposition(paths, root)
            output = root / "formal.json"
            report = root / "audit.json"

            result = run_builder(paths, output, report)
            self.assertEqual(result.returncode, 0, result.stderr)
            document = json.loads(output.read_text(encoding="utf-8"))
            audit = json.loads(report.read_text(encoding="utf-8"))
            self.assertTrue(audit["migration_ready"])
            self.assertTrue(document["auditGate"]["migrationReady"])
            self.assertEqual(audit["run_id"], "formal-test-run")
            self.assertEqual(document["auditGate"]["version"], 1)
            self.assertEqual(document["auditGate"]["runId"], "formal-test-run")
            disposition_sha = hashlib.sha256(disposition.read_bytes()).hexdigest()
            evidence = audit["compensation"]["disposition"]
            self.assertEqual(evidence["path"], str(disposition.resolve()))
            self.assertEqual(evidence["sha256"], disposition_sha)
            self.assertEqual(evidence["approved_by"], "migration-owner")
            self.assertEqual(evidence["approved_at"], "2026-07-21T00:30:00Z")
            self.assertEqual(document["auditGate"]["compensationDisposition"], evidence)
            self.assertEqual(document["auditGate"]["sourceProof"], audit["source_proof"])
            self.assertEqual(
                audit["source_proof"]["files"][str(disposition.resolve())]["sha256"],
                disposition_sha,
            )
            self.assertEqual(
                document["auditGate"]["sha256"],
                hashlib.sha256(report.read_bytes()).hexdigest(),
            )
            self.assertEqual(
                document["manifest"]["scopes"],
                [
                    "Data",
                    "assets/images/eventchronicle/events/upload",
                    "assets/images/eventchronicle/events/used",
                    "unity/runninggame",
                    "uploads",
                ],
            )
            logical_keys = [
                entry["logicalKey"] for entry in document["manifest"]["entries"]
            ]
            unity_logical_keys = [
                "unity/runninggame/Build/webgame.data",
                "unity/runninggame/BuildMobile/webgame.data",
            ]
            self.assertEqual(
                [key for key in logical_keys if key.startswith("unity/runninggame/")],
                unity_logical_keys,
            )
            self.assertEqual(
                json.loads(result.stdout)["unityLogicalKeys"], unity_logical_keys
            )
            self.assertNotIn("unity/runninggame/Build/webgame.wasm", logical_keys)
            self.assertIn("uploads/news/original/active.png", logical_keys)

            worker_source = WORKER.read_text(encoding="utf-8")
            self.assertIn(
                r"^\/runninggame\/(?:Build|BuildMobile)\/[^/]+\.data$",
                worker_source,
            )
            self.assertIn("`unity${pathname}`", worker_source)
            unity_urls = (
                "/runninggame/Build/webgame.data",
                "/runninggame/BuildMobile/webgame.data",
            )
            self.assertEqual(
                [f"unity{pathname}" for pathname in unity_urls],
                unity_logical_keys,
            )

    def test_disposition_mutation_after_audit_blocks_formal_manifest(self):
        with tempfile.TemporaryDirectory() as temporary_directory:
            root = Path(temporary_directory)
            paths = create_fixture(root)
            disposition = add_completed_disposition(paths, root)
            output = root / "formal.json"
            report = root / "audit.json"
            args = BUILDER.parse_args(builder_arguments(paths, output, report))
            original = BUILDER.run_manifest_command
            mutated = False

            def mutate_then_run(arguments: list[str]) -> None:
                nonlocal mutated
                if not mutated:
                    disposition.write_text(
                        disposition.read_text(encoding="utf-8").replace(
                            "migration-owner", "different-approver"
                        ),
                        encoding="utf-8",
                    )
                    mutated = True
                original(arguments)

            with mock.patch.object(BUILDER, "run_manifest_command", side_effect=mutate_then_run):
                with self.assertRaisesRegex(RuntimeError, "frozen source changed"):
                    BUILDER.build_formal_manifest(args)

            self.assertTrue(mutated)
            self.assertTrue(report.is_file())
            self.assertFalse(output.exists())
            recorded = json.loads(report.read_text(encoding="utf-8"))
            self.assertEqual(
                recorded["compensation"]["disposition"]["approved_by"],
                "migration-owner",
            )

    def test_missing_extra_or_pending_delete_blocks_formal_manifest(self):
        scenarios = ("missing", "extra", "pending-delete")
        for scenario in scenarios:
            with self.subTest(scenario=scenario), tempfile.TemporaryDirectory() as temporary_directory:
                root = Path(temporary_directory)
                paths = create_fixture(root)
                if scenario == "missing":
                    paths["active"].unlink()
                elif scenario == "extra":
                    (paths["uploads"] / "extra.bin").write_bytes(b"not referenced")
                else:
                    (paths["compensation"] / "delete.json").write_text(
                        json.dumps(
                            {
                                "kind": "delete-object",
                                "payload": {"key": "uploads/news/original/active.png"},
                                "state": "pending",
                            }
                        ),
                        encoding="utf-8",
                    )
                output = root / "formal.json"
                report = root / "audit.json"

                result = run_builder(paths, output, report)
                self.assertEqual(result.returncode, 2, result.stderr)
                self.assertTrue(report.is_file())
                self.assertFalse(output.exists())
                self.assertFalse(
                    json.loads(report.read_text(encoding="utf-8"))["migration_ready"]
                )


if __name__ == "__main__":
    unittest.main()
