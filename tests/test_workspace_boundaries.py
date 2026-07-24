import json
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BOUNDARY_SCRIPT = PROJECT_ROOT / "scripts/check-workspace-boundaries.mjs"
READINESS_SCRIPT = PROJECT_ROOT / "scripts/checks/legacy-readiness-check.sh"


class WorkspaceBoundaryTests(unittest.TestCase):
    def test_readiness_typecheck_uses_direct_node_entrypoint(self):
        source = READINESS_SCRIPT.read_text(encoding="utf-8")

        self.assertIn("apps/api/node_modules/typescript/bin/tsc", source)
        self.assertNotIn("apps/api/node_modules/.bin/tsc", source)

    def make_fixture(self, root: Path) -> None:
        root_package = json.loads(
            (PROJECT_ROOT / "package.json").read_text(encoding="utf-8")
        )
        root_package["scripts"].update(
            {
                "build": (
                    "pnpm run check:boundaries && pnpm run build:api "
                    "&& pnpm run build:web"
                ),
                "check": (
                    "pnpm run check:root && pnpm run check:api "
                    "&& pnpm run check:web"
                ),
                "test": (
                    "pnpm run check:root && pnpm run test:infra "
                    "&& pnpm run test:api && pnpm run test:web:unit"
                ),
                "test:fast": "pnpm run test",
                "test:web:unit": (
                    "pnpm --filter @imsweb/web run test:unit"
                ),
            }
        )
        files = {
            "package.json": json.dumps(root_package),
            "pnpm-workspace.yaml": (
                "packages:\n"
                "  - apps/api\n"
                "  - apps/legacy\n"
                "  - apps/web\n"
            ),
            ".npmrc": "registry=https://registry.npmjs.org/\n",
            ".nvmrc": "22.13.0\n",
            "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
            "apps/api/.env.example": "IMS_JWT_SECRET=\n",
            "apps/web/.env.example": "IMS_API_ORIGIN=http://127.0.0.1:3000\n",
            "deploy/.env.example": "IMS_NODE_UPSTREAM=127.0.0.1:3000\n",
            "scripts/migration/.env.example": "IMS_INVENTORY_RUN_ID=\n",
            "apps/api/package.json": (
                PROJECT_ROOT / "apps/api/package.json"
            ).read_text(encoding="utf-8"),
            "apps/legacy/package.json": (
                PROJECT_ROOT / "apps/legacy/package.json"
            ).read_text(encoding="utf-8"),
            "apps/web/package.json": (
                PROJECT_ROOT / "apps/web/package.json"
            ).read_text(encoding="utf-8"),
            "apps/legacy/public/index.html": "<!doctype html>\n",
            "apps/legacy/data/.gitignore": "*\n!.gitignore\n",
            "apps/api/src/app.ts": "export {};\n",
            "apps/api/src/main.ts": "export {};\n",
            "apps/legacy/src/server/main.ts": "export {};\n",
            "apps/legacy/flask/app.py": "\n",
            "apps/legacy/.python-version": "3.12\n",
            "apps/legacy/pyproject.toml": (
                "[project]\nname='imsweb-legacy'\nversion='1.0.0'\n"
                "requires-python='>=3.12,<3.13'\n"
                "dependencies=['Flask','requests','PyJWT','Pillow','pypinyin','gunicorn']\n"
                "[tool.uv]\npackage=false\n"
            ),
            "apps/legacy/uv.lock": "version = 1\nrevision = 2\nrequires-python = '>=3.12,<3.13'\n",
            "apps/legacy/PROVENANCE.md": "# Fixture\n",
            "scripts/operations/backups/backup-legacy-source.sh": "#!/bin/sh\n",
            "deploy/compose.yaml": "services: {}\n",
            "deploy/compose.legacy.yaml": "services: {}\n",
            "deploy/nginx/templates/default.conf.template": "server {}\n",
            "deploy/nginx/templates-legacy/default.conf.template": "server {}\n",
        }
        for relative_path, content in files.items():
            destination = root / relative_path
            destination.parent.mkdir(parents=True, exist_ok=True)
            destination.write_text(content, encoding="utf-8")
        script_path = root / "scripts/check-workspace-boundaries.mjs"
        script_path.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(BOUNDARY_SCRIPT, script_path)

    def run_fixture(self, root: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["node", "scripts/check-workspace-boundaries.mjs"],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_fixture_with_recursive_workspace_aliases_passes(self):
        with tempfile.TemporaryDirectory(prefix="ims-boundary-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            result = self.run_fixture(root)

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_api_source_cannot_restore_server_subdirectory(self):
        with tempfile.TemporaryDirectory(prefix="ims-boundary-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            nested_source = root / "apps/api/src/server/old-entry.ts"
            nested_source.parent.mkdir(parents=True)
            nested_source.write_text("export {};\n", encoding="utf-8")
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("apps/api/src/server", result.stderr)
        self.assertIn("rooted directly at apps/api/src", result.stderr)

    def test_api_cannot_restore_retired_worker_runtime(self):
        for relative_path, reported_path in [
            ("apps/api/src/worker.ts", "apps/api/src/worker.ts"),
            (
                "apps/api/src/infra/media/cloudflare-images/image-processor.ts",
                "apps/api/src/infra/media/cloudflare-images",
            ),
            ("apps/api/tests/worker/runtime.test.ts", "apps/api/tests/worker"),
            ("apps/api/wrangler.jsonc", "apps/api/wrangler.jsonc"),
        ]:
            with self.subTest(relative_path=relative_path):
                with tempfile.TemporaryDirectory(prefix="ims-boundary-") as temporary:
                    root = Path(temporary)
                    self.make_fixture(root)
                    candidate = root / relative_path
                    candidate.parent.mkdir(parents=True, exist_ok=True)
                    candidate.write_text("export {};\n", encoding="utf-8")
                    result = self.run_fixture(root)

                self.assertNotEqual(result.returncode, 0)
                self.assertIn(reported_path, result.stderr)
                self.assertIn("Worker runtime is retired", result.stderr)

    def test_root_environment_template_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="ims-boundary-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            (root / ".env.example").write_text("MIXED_CONFIG=true\n", encoding="utf-8")
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "environment templates must be owned by their runtime surface",
            result.stderr,
        )

    def test_legacy_python_commands_cannot_bypass_uv(self):
        with tempfile.TemporaryDirectory(prefix="ims-boundary-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            package_path = root / "apps/legacy/package.json"
            package = json.loads(package_path.read_text(encoding="utf-8"))
            package["scripts"]["start:flask"] = "python3 flask/app.py"
            package_path.write_text(json.dumps(package), encoding="utf-8")

            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("start:flask must use uv run --frozen", result.stderr)

    def test_web_must_be_covered_by_default_lifecycle(self):
        api_only_aliases = {
            "build": "pnpm run build:api",
            "check": "pnpm run check:api",
            "test": "pnpm run test:api",
            "test:fast": "pnpm run test:api",
        }
        for script_name, replacement in api_only_aliases.items():
            with self.subTest(script_name=script_name):
                with tempfile.TemporaryDirectory(prefix="ims-boundary-") as temporary:
                    root = Path(temporary)
                    self.make_fixture(root)
                    package_path = root / "package.json"
                    package = json.loads(package_path.read_text(encoding="utf-8"))
                    package["scripts"][script_name] = replacement
                    package_path.write_text(json.dumps(package), encoding="utf-8")

                    result = self.run_fixture(root)

                self.assertNotEqual(result.returncode, 0)
                self.assertIn(
                    f"default command {script_name} never resolves to @imsweb/web",
                    result.stderr,
                )

    def test_api_runtime_commands_cannot_target_web(self):
        web_scripts = {
            "start": "start",
            "dev:node": "dev",
        }
        for script_name, web_script in web_scripts.items():
            with self.subTest(script_name=script_name):
                with tempfile.TemporaryDirectory(prefix="ims-boundary-") as temporary:
                    root = Path(temporary)
                    self.make_fixture(root)
                    package_path = root / "package.json"
                    package = json.loads(package_path.read_text(encoding="utf-8"))
                    package["scripts"][script_name] = (
                        f"pnpm --filter @imsweb/api run {script_name} && "
                        f"pnpm --filter @imsweb/web run {web_script}"
                    )
                    package_path.write_text(json.dumps(package), encoding="utf-8")

                    result = self.run_fixture(root)

                self.assertNotEqual(result.returncode, 0)
                self.assertIn(
                    f"default command {script_name} must remain API-only",
                    result.stderr,
                )

    def test_nested_alias_cannot_hide_legacy_filter(self):
        with tempfile.TemporaryDirectory(prefix="ims-boundary-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            package_path = root / "package.json"
            package = json.loads(package_path.read_text(encoding="utf-8"))
            package["scripts"]["test"] = "pnpm run apparently:safe"
            package["scripts"]["apparently:safe"] = "pnpm run hidden:target"
            package["scripts"]["hidden:target"] = (
                "pnpm --filter=@imsweb/legacy run test"
            )
            package_path.write_text(json.dumps(package), encoding="utf-8")

            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("unsupported pnpm filter(s)", result.stderr)
        self.assertIn("@imsweb/legacy", result.stderr)

    def test_non_official_lockfile_tarball_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="ims-boundary-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            (root / "pnpm-lock.yaml").write_text(
                "lockfileVersion: '9.0'\n"
                "packages:\n"
                "  fixture@1.0.0:\n"
                "    resolution: {tarball: https://registry.npmmirror.com/fixture.tgz}\n",
                encoding="utf-8",
            )

            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("non-official tarball source(s)", result.stderr)
        self.assertIn("registry.npmmirror.com", result.stderr)

    def test_nested_web_repository_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="ims-boundary-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            nested_git = root / "apps/web/.git"
            nested_git.mkdir()

            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("apps/web/.git", result.stderr)
        self.assertIn("repository root Git and pnpm workspace", result.stderr)

    def test_nested_web_pnpm_roots_are_rejected(self):
        for relative_path in [
            "apps/web/pnpm-lock.yaml",
            "apps/web/pnpm-workspace.yaml",
        ]:
            with self.subTest(relative_path=relative_path):
                with tempfile.TemporaryDirectory(prefix="ims-boundary-") as temporary:
                    root = Path(temporary)
                    self.make_fixture(root)
                    (root / relative_path).write_text("fixture: true\n", encoding="utf-8")

                    result = self.run_fixture(root)

                self.assertNotEqual(result.returncode, 0)
                self.assertIn(relative_path, result.stderr)
                self.assertIn("repository root Git and pnpm workspace", result.stderr)

    def test_workspace_environment_dependency_roots_are_skipped(self):
        with tempfile.TemporaryDirectory(prefix="ims-boundary-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            dependency_files = [
                "apps/legacy/.venv/lib/python/site-packages/fixture.pyc",
                "apps/legacy/venv/lib/python/site-packages/fixture.pyc",
                "apps/legacy/test_venv/lib/python/site-packages/fixture.pyc",
                "apps/legacy/node_modules/fixture/__pycache__/fixture.pyc",
                "apps/api/.wrangler/tmp/generated.py",
                "apps/api/node_modules/fixture/generated.py",
            ]
            for relative_path in dependency_files:
                dependency_file = root / relative_path
                dependency_file.parent.mkdir(parents=True, exist_ok=True)
                dependency_file.write_bytes(b"generated dependency artifact\n")

            result = self.run_fixture(root)

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_legacy_title_archive_must_live_under_data(self):
        with tempfile.TemporaryDirectory(prefix="ims-boundary-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            title_file = root / "apps/legacy/public/title/event_title/example.png"
            title_file.parent.mkdir(parents=True)
            title_file.write_bytes(b"fixture")

            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("apps/legacy/public/title", result.stderr)
        self.assertIn("mutable Legacy data", result.stderr)

    def test_nested_dependency_like_directories_cannot_hide_source_caches(self):
        with tempfile.TemporaryDirectory(prefix="ims-boundary-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            source_files = [
                "apps/legacy/flask/__pycache__/app.pyc",
                "apps/legacy/flask/.venv/lib/hidden.pyc",
                "apps/legacy/flask/tool_venv/lib/hidden.pyc",
                "apps/legacy/flask/node_modules/fixture/hidden.pyc",
                "apps/api/.venv/lib/python/site-packages/hidden.py",
                "apps/api/src/node_modules/fixture/hidden.py",
            ]
            for relative_path in source_files:
                source_file = root / relative_path
                source_file.parent.mkdir(parents=True, exist_ok=True)
                source_file.write_bytes(b"source artifact\n")

            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        for relative_path in source_files:
            self.assertIn(relative_path, result.stderr)


if __name__ == "__main__":
    unittest.main()
