from pathlib import Path
import re
import subprocess
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS_ROOT = PROJECT_ROOT / "docs"


class DocumentationStructureTests(unittest.TestCase):
    def test_documentation_checker_passes(self):
        result = subprocess.run(
            ["node", "scripts/check-docs.mjs"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        document_count = len(list(DOCS_ROOT.rglob("*.md")))
        self.assertIn(f"{document_count} Markdown files", result.stdout)

    def test_docs_taxonomy_and_metadata_are_present(self):
        index = (DOCS_ROOT / "README.md").read_text(encoding="utf-8")
        for heading in ("## 文档地图", "## 文档规范", "## 自动检查"):
            self.assertIn(heading, index)

        expected_directories = (
            "architecture",
            "development",
            "operations",
            "migrations",
            "governance",
        )
        for directory in expected_directories:
            self.assertTrue((DOCS_ROOT / directory).is_dir(), directory)

        documents = sorted(DOCS_ROOT.rglob("*.md"))
        for document in documents:
            content = document.read_text(encoding="utf-8")
            self.assertIsNotNone(re.search(r"^# .+", content, re.MULTILINE), document)
            self.assertIsNotNone(re.search(r"^> 文档类型：", content, re.MULTILINE), document)
            self.assertIsNotNone(re.search(r"^> 状态：(?:Active|Decision)", content, re.MULTILINE), document)
            self.assertIsNotNone(re.search(r"^> 权威来源：", content, re.MULTILINE), document)

    def test_removed_flat_paths_and_duplicate_asset_registry_are_absent(self):
        for relative_path in (
            "docs/ASSET_PROVENANCE.md",
            "docs/ai-development-environment.md",
            "docs/database-architecture.md",
            "docs/operations-runbook.md",
            "apps/web/docs/ASSET_PROVENANCE.md",
        ):
            self.assertFalse((PROJECT_ROOT / relative_path).exists(), relative_path)

        self.assertTrue((DOCS_ROOT / "governance/assets.md").is_file())
        for directory in ("archive", "evidence", "screenshots"):
            self.assertFalse((DOCS_ROOT / directory).exists(), directory)


if __name__ == "__main__":
    unittest.main()
