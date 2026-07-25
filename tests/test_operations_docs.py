import json
from pathlib import Path
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RUNBOOK = PROJECT_ROOT / "docs/operations-runbook.md"
DATABASE_CONFIGURATION = PROJECT_ROOT / "docs/database-configuration.md"
OBJECT_STORAGE = PROJECT_ROOT / "docs/object-storage.md"
AI_DEVELOPMENT_ENVIRONMENT = PROJECT_ROOT / "docs/ai-development-environment.md"
API_ENVIRONMENT = PROJECT_ROOT / "apps/api/.env.example"
WEB_ENVIRONMENT = PROJECT_ROOT / "apps/web/.env.example"
DEPLOY_ENVIRONMENT = PROJECT_ROOT / "deploy/.env.example"


class OperationsDocumentationTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.runbook = RUNBOOK.read_text(encoding="utf-8")
        cls.database_configuration = DATABASE_CONFIGURATION.read_text(encoding="utf-8")
        cls.object_storage = OBJECT_STORAGE.read_text(encoding="utf-8")
        cls.ai_guide = AI_DEVELOPMENT_ENVIRONMENT.read_text(encoding="utf-8")

    def test_database_configuration_covers_one_database_and_provider_selection(self):
        for token in (
            "IMS_DATABASE",
            "IMS_SQLITE_PATH",
            "DATABASE_URL",
            "一个实例、一个物理数据库",
            "migration:sqlite:merge",
            "--allow-foreign-key-violations",
            "Hono Node",
            "自动读取 `apps/api/.env`",
            "PRAGMA quick_check",
            "-wal",
            "-shm",
        ):
            self.assertIn(token, self.database_configuration)

        for readme in (
            PROJECT_ROOT / "README.md",
            PROJECT_ROOT / "apps/api/README.md",
        ):
            self.assertIn("database-configuration.md", readme.read_text(encoding="utf-8"))

    def test_ai_development_environment_is_executable_and_linked(self):
        for token in (
            "pnpm install --frozen-lockfile",
            "IMS_DATABASE=postgresql",
            "DATABASE_URL=postgresql://imsweb:",
            "IMS_OBJECT_STORAGE=s3",
            "IMS_S3_BUCKET=imsweb-media-local",
            "自动读取 `apps/api/.env`",
            "pnpm run dev:postgresql:up",
            "pnpm run dev:minio:up",
            "pnpm run dev:node",
            "pnpm run dev:web",
            "curl --fail",
            "git status --short",
            "deploy/compose.yaml",
        ):
            self.assertIn(token, self.ai_guide)

        for document in (PROJECT_ROOT / "AGENTS.md", PROJECT_ROOT / "README.md"):
            self.assertIn(
                "docs/ai-development-environment.md",
                document.read_text(encoding="utf-8"),
            )

    def test_api_development_command_hot_reloads_source_and_environment(self):
        package = json.loads(
            (PROJECT_ROOT / "apps/api/package.json").read_text(encoding="utf-8")
        )
        command = package["scripts"]["dev:node"]
        self.assertIn("tsx watch", command)
        self.assertIn("--include .env", command)

    def test_environment_templates_are_owned_by_runtime_surfaces(self):
        self.assertFalse((PROJECT_ROOT / ".env.example").exists())
        api_environment = API_ENVIRONMENT.read_text(encoding="utf-8")
        web_environment = WEB_ENVIRONMENT.read_text(encoding="utf-8")
        deploy_environment = DEPLOY_ENVIRONMENT.read_text(encoding="utf-8")

        for token in (
            "IMS_JWT_SECRET",
            "IMS_DATABASE",
            "IMS_SQLITE_PATH",
            "IMS_OBJECT_STORAGE",
        ):
            self.assertIn(token, api_environment)
        self.assertIn("IMS_DATABASE=postgresql", api_environment)
        self.assertIn("IMS_OBJECT_STORAGE=s3", api_environment)
        self.assertIn("DATABASE_URL=", api_environment)
        for token in ("IMS_API_ORIGIN", "E2E_BASE_URL"):
            self.assertIn(token, web_environment)
        for token in ("IMS_POSTGRES_IMAGE", "IMS_MINIO_IMAGE", "IMS_MINIO_BUCKET"):
            self.assertIn(token, deploy_environment)

        self.assertNotIn("IMS_NGINX_IMAGE", api_environment)
        self.assertNotIn("IMS_NGINX_IMAGE", deploy_environment)
        self.assertNotIn("IMS_NODE_UPSTREAM", deploy_environment)
        self.assertNotIn("IMS_JWT_SECRET", web_environment)
        self.assertNotIn("IMS_LEGACY", deploy_environment)

    def test_node_s3_storage_is_documented(self):
        for token in (
            "IMS_OBJECT_STORAGE",
            "IMS_S3_BUCKET",
            "IMS_S3_REGION",
            "IMS_S3_ENDPOINT",
            "IMS_S3_FORCE_PATH_STYLE",
            "IMS_S3_PREFIX",
            "IMS_S3_READ_URL_TTL_SECONDS",
            "AWS_ACCESS_KEY_ID",
            "GetObject",
            "PutObject",
            "DeleteObject",
            "不会自动搬迁",
        ):
            self.assertIn(token, self.object_storage)

    def test_release_runbook_uses_complete_atomic_artifacts(self):
        package = json.loads((PROJECT_ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertIn("migration:release:activate", package["scripts"])
        self.assertIn("migration:release:rollback", package["scripts"])
        for token in (
            "migration:release:activate",
            "migration:release:rollback",
            "host-installed `node_modules`",
            "dist/client",
            "dist/node-client",
            "dist/server",
            "client-manifest.json",
            "/srv/ims/current",
            "SQLite 使用在线备份接口",
            "数据库与媒体必须在同一停写窗口",
        ):
            self.assertIn(token, self.runbook)

    def test_public_docs_do_not_reference_removed_workspace(self):
        documents = [
            PROJECT_ROOT / "README.md",
            PROJECT_ROOT / "CONTRIBUTING.md",
            PROJECT_ROOT / "AGENTS.md",
            RUNBOOK,
            DATABASE_CONFIGURATION,
            OBJECT_STORAGE,
            AI_DEVELOPMENT_ENVIRONMENT,
        ]
        for document in documents:
            with self.subTest(document=document):
                self.assertNotIn("apps/legacy", document.read_text(encoding="utf-8"))

    def test_public_docs_do_not_offer_compose_nginx(self):
        documents = [
            PROJECT_ROOT / "README.md",
            PROJECT_ROOT / "apps/api/README.md",
            RUNBOOK,
            AI_DEVELOPMENT_ENVIRONMENT,
        ]
        for document in documents:
            with self.subTest(document=document):
                content = document.read_text(encoding="utf-8")
                self.assertNotIn("deploy/nginx", content)
                self.assertNotIn("ops:nginx", content)

        package = json.loads((PROJECT_ROOT / "package.json").read_text(encoding="utf-8"))
        self.assertFalse(any(name.startswith("ops:nginx") for name in package["scripts"]))


if __name__ == "__main__":
    unittest.main()
