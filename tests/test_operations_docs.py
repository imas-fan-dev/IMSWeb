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

    def test_database_configuration_covers_one_database_and_provider_selection(self):
        for token in (
            "IMS_DATABASE",
            "IMS_SQLITE_PATH",
            "DATABASE_URL",
            "一个实例、一个物理数据库",
            "migration:sqlite:merge",
            "--allow-foreign-key-violations",
            "IMS_DB_PATH",
            "IMS_STORY_DB_PATH",
            "Hono Node",
            "Legacy Express/Flask",
            "不会自动读取",
            "test -f",
            "PRAGMA quick_check",
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
            "IMS_SQLITE_PATH",
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

        for token in (
            "IMS_JWT_SECRET", "IMS_DATABASE", "IMS_SQLITE_PATH", "IMS_OBJECT_STORAGE"
        ):
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
            "IMS_S3_READ_URL_TTL_SECONDS",
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

    def test_current_database_architecture_excludes_serverless_runtime(self):
        architecture = (
            PROJECT_ROOT / "docs" / "database-architecture.md"
        ).read_text(encoding="utf-8")
        for token in (
            "one SQLite connection OR one PostgreSQL pool",
            "capability Repository ports + StoryRepository",
            "ports/repositories.ts",
            "IMS_SQLITE_PATH",
            "DATABASE_URL",
            "不包含 Worker、D1 或 R2",
        ):
            self.assertIn(token, architecture)

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
        ):
            self.assertIn(token, self.runbook)

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
