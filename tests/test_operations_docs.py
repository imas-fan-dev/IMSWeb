import json
from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RUNBOOK = PROJECT_ROOT / "docs" / "operations-runbook.md"
DATABASE_CONFIGURATION = PROJECT_ROOT / "docs" / "database-configuration.md"
OBJECT_STORAGE = PROJECT_ROOT / "docs" / "object-storage.md"
AI_DEVELOPMENT_ENVIRONMENT = PROJECT_ROOT / "docs" / "ai-development-environment.md"
SCRIPTS_README = PROJECT_ROOT / "apps" / "api" / "scripts" / "README.md"
API_ENVIRONMENT = PROJECT_ROOT / "apps" / "api" / ".env.example"
WEB_ENVIRONMENT = PROJECT_ROOT / "apps" / "web" / ".env.example"
DEPLOY_ENVIRONMENT = PROJECT_ROOT / "deploy" / ".env.example"
MIGRATION_ENVIRONMENT = PROJECT_ROOT / "scripts" / "migration" / ".env.example"


class OperationsDocumentationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runbook = RUNBOOK.read_text(encoding="utf-8")
        cls.database_configuration = DATABASE_CONFIGURATION.read_text(encoding="utf-8")
        cls.object_storage = OBJECT_STORAGE.read_text(encoding="utf-8")
        cls.ai_development_environment = AI_DEVELOPMENT_ENVIRONMENT.read_text(encoding="utf-8")
        cls.scripts_readme = SCRIPTS_README.read_text(encoding="utf-8")

    def test_database_configuration_covers_both_databases_and_safe_activation(self):
        for token in (
            "IMS_DB_PATH",
            "IMS_STORY_DB_PATH",
            "Hono Node",
            "Legacy Express",
            "Legacy Flask",
            "不会自动读取",
            "test -f",
            "PRAGMA quick_check",
            "不能同时写入",
            "-wal",
            "-shm",
        ):
            self.assertIn(token, self.database_configuration)

        for readme in (
            PROJECT_ROOT / "README.md",
            PROJECT_ROOT / "apps" / "api" / "README.md",
            PROJECT_ROOT / "apps" / "legacy" / "README.md",
        ):
            self.assertIn("database-configuration.md", readme.read_text(encoding="utf-8"))

    def test_ai_development_environment_is_executable_and_linked(self):
        for token in (
            "pnpm install --frozen-lockfile",
            "IMS_DB_PATH",
            "pnpm run dev:node",
            "pnpm run dev:web",
            "curl --fail",
            "git status --short",
            "保留",
            "deploy/compose.yaml",
        ):
            self.assertIn(token, self.ai_development_environment)

        self.assertIn(
            "docs/ai-development-environment.md",
            (PROJECT_ROOT / "AGENTS.md").read_text(encoding="utf-8"),
        )
        self.assertIn(
            "docs/ai-development-environment.md",
            (PROJECT_ROOT / "README.md").read_text(encoding="utf-8"),
        )

    def test_environment_templates_are_owned_by_their_runtime_surfaces(self):
        self.assertFalse((PROJECT_ROOT / ".env.example").exists())
        api_environment = API_ENVIRONMENT.read_text(encoding="utf-8")
        web_environment = WEB_ENVIRONMENT.read_text(encoding="utf-8")
        deploy_environment = DEPLOY_ENVIRONMENT.read_text(encoding="utf-8")
        migration_environment = MIGRATION_ENVIRONMENT.read_text(encoding="utf-8")

        for token in ("IMS_JWT_SECRET", "IMS_DB_PATH", "IMS_OBJECT_STORAGE"):
            self.assertIn(token, api_environment)
        for token in ("IMS_API_ORIGIN", "E2E_BASE_URL"):
            self.assertIn(token, web_environment)
        for token in ("IMS_NGINX_IMAGE", "IMS_NODE_UPSTREAM"):
            self.assertIn(token, deploy_environment)
        for token in (
            "IMS_INVENTORY_CORE_DB_PATH",
            "IMS_INVENTORY_STORY_DB_PATH",
            "IMS_INVENTORY_RUN_ID",
        ):
            self.assertIn(token, migration_environment)

        self.assertNotIn("IMS_NGINX_IMAGE", api_environment)
        self.assertNotIn("IMS_JWT_SECRET", web_environment)

    def test_node_s3_storage_is_configured_without_absorbing_local_state(self):
        for token in (
            "IMS_OBJECT_STORAGE",
            "IMS_S3_BUCKET",
            "IMS_S3_REGION",
            "IMS_S3_ENDPOINT",
            "IMS_S3_FORCE_PATH_STYLE",
            "IMS_S3_PREFIX",
            "IMS_IDEMPOTENCY_DIR",
            "AWS_ACCESS_KEY_ID",
            "ListBucket",
            "GetObject",
            "PutObject",
            "DeleteObject",
            "IMS_EVENT_BASE_DIR/.idempotency",
            "SHA-256 manifest",
            "不会自动搬迁",
        ):
            self.assertIn(token, self.object_storage)

        for document in (
            API_ENVIRONMENT.read_text(encoding="utf-8"),
            (PROJECT_ROOT / "README.md").read_text(encoding="utf-8"),
            (PROJECT_ROOT / "apps" / "api" / "README.md").read_text(encoding="utf-8"),
            self.runbook,
        ):
            self.assertIn("IMS_OBJECT_STORAGE", document)
        for readme in (
            PROJECT_ROOT / "README.md",
            PROJECT_ROOT / "apps" / "api" / "README.md",
        ):
            self.assertIn("object-storage.md", readme.read_text(encoding="utf-8"))

    def test_unity_payloads_have_audited_manifest_and_full_bucket_acceptance(self):
        for document in (self.runbook, self.scripts_readme):
            self.assertIn("migration:media:manifest", document)
            self.assertIn("unity/runninggame/Build/webgame.data", document)
            self.assertIn("unity/runninggame/BuildMobile/webgame.data", document)
        self.assertIn("migration:r2:transfer -- transfer", self.runbook)
        self.assertIn("migration:r2:transfer -- verify", self.runbook)
        self.assertIn('--prune-exact-scopes --confirm-prune-run-id "$STAMP"', self.runbook)
        self.assertIn("--bucket-exact", self.runbook)
        self.assertIn("physicalCoverage=full-bucket", self.runbook)
        self.assertIn("专用", self.runbook)
        self.assertIn("--scope unity/runninggame", self.runbook)
        self.assertNotIn("--scope runninggame", self.runbook)

    def test_chronicle_chain_follows_r2_index_and_has_exact_gates(self):
        for document in (self.runbook, self.scripts_readme):
            self.assertIn("migration:d1:chronicle -- export", document)
            self.assertIn("migration:d1:chronicle -- reconcile", document)
            self.assertIn("chronicle_metadata", document)
            self.assertIn("chronicle_items", document)
            self.assertIn("object_index", document)
        final_window = self.runbook.split("### 7.2 最终 Cloudflare 停写窗口", 1)[1]
        transfer = final_window.index("r2-remote-transfer-$STAMP.json")
        chronicle_sql = final_window.index('--file "$BACKUP_DIR/chronicle-$STAMP.sql"')
        reconciliation = final_window.index("chronicle-reconciliation-$STAMP.rejects.json")
        self.assertLess(transfer, chronicle_sql)
        self.assertLess(chronicle_sql, reconciliation)
        self.assertIn("_ims_chronicle_snapshot_guard", final_window)
        self.assertIn("_ims_chronicle_snapshot_stage_*", final_window)

        local_rehearsal = self.runbook.split("### 7.1 离线迁移制品闸门", 1)[1].split(
            "### 7.2 最终 Cloudflare 停写窗口", 1
        )[0]
        fixture_index = local_rehearsal.index("r2-object-index-$STAMP.sql")
        local_sql = local_rehearsal.index('--file "$BACKUP_DIR/chronicle-$STAMP.sql"')
        local_reconcile = local_rehearsal.index("chronicle-local-reconciliation-$STAMP.rejects.json")
        self.assertLess(fixture_index, local_sql)
        self.assertLess(local_sql, local_reconcile)

    def test_compensation_drain_and_disposition_are_executable(self):
        for token in (
            "compensation.outstanding_entries == 0",
            "/api/wiki/test",
            "retain-completed-for-audit",
            "purge-completed-after-backup",
            "journal_files",
            "approved_by",
            "approved_at",
            "--compensation-disposition",
            "sourceProof",
        ):
            self.assertIn(token, self.runbook)

    def test_write_cutover_is_one_window_and_importer_is_forbidden_afterward(self):
        for document in (self.runbook, self.scripts_readme):
            self.assertIn("同一最终停写窗口", document)
            self.assertIn("切写后不得再次运行 legacy exact importer", document)
        self.assertIn("Core 六表", self.runbook)
        self.assertIn("隔离 D1 不得收到新写", self.scripts_readme)
        self.assertNotIn("关闭该业务域写入口", self.runbook)
        self.assertNotIn("最终增量", self.runbook)
        self.assertNotIn("再补一次增量同步", self.runbook)

    def test_core_target_export_preserves_sqlite_sequence_high_water_marks(self):
        query = (
            "SELECT name,seq FROM sqlite_sequence WHERE name IN "
            "('users','news','logs','cards','events','card_emojis') ORDER BY name;"
        )
        self.assertIn(query, self.runbook)
        self.assertIn(
            "(.[6].results | map({key:.name,value:.seq}) | from_entries) as $seq",
            self.runbook,
        )
        self.assertIn("sqliteSequence:{", self.runbook)
        for table in ("users", "news", "logs", "cards", "events", "card_emojis"):
            self.assertIn(f"{table}:($seq.{table} // null)", self.runbook)
        self.assertIn("六张表 arrays", self.runbook)
        self.assertIn("JSON `null`", self.runbook)

    def test_release_is_complete_and_never_overwrites_live_code(self):
        package = json.loads((PROJECT_ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertIn("migration:release:activate", package["scripts"])
        self.assertIn("migration:release:rollback", package["scripts"])
        for token in (
            "migration:release:activate", "host-installed", "node_modules",
            "dist/client", "dist/node-client", "dist/server", "/srv/ims/current",
            'IMS_PUBLIC_DIR="$IMS_CURRENT_LINK/apps/api/dist/node-client"',
            'migration:release:rollback -- "$PREVIOUS_RELEASE_ID"',
        ):
            self.assertIn(token, self.runbook)
        root_readme = (PROJECT_ROOT / "README.md").read_text(encoding="utf-8")
        self.assertNotIn("pnpm install --frozen-lockfile --prod", root_readme)
        install = root_readme.index("pnpm install --frozen-lockfile")
        build = root_readme.index("pnpm run build", install)
        check = root_readme.index("pnpm run check", build)
        test = root_readme.index("pnpm run test:fast", check)
        self.assertLess(install, build)
        self.assertLess(build, check)
        self.assertLess(check, test)
        for obsolete in (
            "再覆盖代码",
            "覆盖代码或切换 release",
            "现网目录运行 `pnpm run check`",
            "原目录兼容发布",
        ):
            self.assertNotIn(obsolete, self.runbook)


if __name__ == "__main__":
    unittest.main()
