from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RULE_CHECK = PROJECT_ROOT / "scripts/check-source-rules.mjs"


class SourceRulesTests(unittest.TestCase):
    def make_fixture(self, root: Path) -> None:
        script = root / "scripts/check-source-rules.mjs"
        script.parent.mkdir(parents=True)
        shutil.copyfile(RULE_CHECK, script)

        (root / "apps/api/src/domains/orders").mkdir(parents=True)
        (root / "apps/web/app/pages/orders").mkdir(parents=True)
        (root / "packages/contracts/src").mkdir(parents=True)
        (root / "apps/api/src/domains/orders/routes.ts").write_text(
            "export const route = apiPath('/orders')\n", encoding="utf-8"
        )
        (root / "apps/web/app/pages/orders/page.tsx").write_text(
            'export const page = apiPath("/orders")\n', encoding="utf-8"
        )
        (root / "packages/contracts/src/paths.ts").write_text(
            'export const API_PATH_PREFIX = "/api"\n', encoding="utf-8"
        )

    def run_fixture(self, root: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["node", "scripts/check-source-rules.mjs"],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_repository_source_rules_pass(self):
        result = subprocess.run(
            ["node", "scripts/check-source-rules.mjs"],
            cwd=PROJECT_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_raw_shared_path_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            page = root / "apps/web/app/pages/orders/page.tsx"
            page.write_text('export const page = "/api/orders"\n', encoding="utf-8")
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("shared path", result.stderr)

    def test_direct_zod_import_is_rejected_outside_contracts(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            page = root / "apps/web/app/pages/orders/page.tsx"
            page.write_text('import { z } from "zod"\n', encoding="utf-8")
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("import z through @imsweb/contracts/z", result.stderr)

    def test_domain_infra_import_and_forbidden_paths_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            handler = root / "apps/api/src/domains/orders/routes.ts"
            handler.write_text(
                'import { db } from "@/infra/db"\n', encoding="utf-8"
            )
            (root / "apps/api/src/shared").mkdir(parents=True)
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("domain code must use injected ports", result.stderr)
        self.assertIn("apps/api/src/shared", result.stderr)

    def test_web_tests_must_stay_outside_app(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            test_file = root / "apps/web/app/pages/orders/page.test.tsx"
            test_file.write_text("export const testValue = true\n", encoding="utf-8")
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Web tests belong under apps/web/tests", result.stderr)


if __name__ == "__main__":
    unittest.main()
