from pathlib import Path
import re
import shutil
import subprocess
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
DOCS_ROOT = PROJECT_ROOT / "docs"
CHECKER = PROJECT_ROOT / "scripts/check-docs.mjs"


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


class RepositoryLinkScopeTests(unittest.TestCase):
    """Fixture tests proving links outside docs/ are part of the checker."""

    def make_fixture(self, root: Path) -> None:
        script = root / "scripts/check-docs.mjs"
        script.parent.mkdir(parents=True)
        shutil.copyfile(CHECKER, script)

        docs = root / "docs"
        docs.mkdir()
        (docs / "README.md").write_text(
            "# 文档中心\n\n"
            "> 文档类型：导航与规范\n"
            "> 状态：Active\n"
            "> 权威来源：本文件\n\n"
            "## 文档地图\n\n## 文档规范\n\n## 自动检查\n",
            encoding="utf-8",
        )
        (root / ".rules").write_text(
            "# Repository Guidelines\n\nSee [docs](docs/README.md).\n",
            encoding="utf-8",
        )
        (root / "AGENTS.md").symlink_to(".rules")
        (root / "CLAUDE.md").symlink_to(".rules")
        (root / "README.md").write_text(
            "# IMSWeb\n\nSee [docs](docs/README.md) and [rules](AGENTS.md).\n",
            encoding="utf-8",
        )

    def run_checker(self, root: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["node", "scripts/check-docs.mjs"],
            cwd=root,
            capture_output=True,
            text=True,
            check=False,
        )

    def test_repository_markdown_and_scope_rules_links_pass(self):
        with tempfile.TemporaryDirectory(prefix="ims-docs-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            result = self.run_checker(root)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("1 Markdown files", result.stdout)
        self.assertIn("1 .rules file", result.stdout)

    def test_root_markdown_links_are_checked_without_docs_header_rules(self):
        with tempfile.TemporaryDirectory(prefix="ims-docs-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            (root / "README.md").write_text(
                "# IMSWeb\n\nSee [missing](CONTRIBUTING-MISSING.md).\n",
                encoding="utf-8",
            )
            result = self.run_checker(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("README.md: broken relative link CONTRIBUTING-MISSING.md", result.stderr)
        self.assertNotIn("missing required metadata", result.stderr)

    def test_workspace_markdown_and_scope_rules_links_are_checked(self):
        with tempfile.TemporaryDirectory(prefix="ims-docs-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            workspace = root / "apps/web"
            workspace.mkdir(parents=True)
            (workspace / "README.md").write_text(
                "# Web\n\nSee [design](DESIGN-MISSING.md).\n",
                encoding="utf-8",
            )
            (workspace / ".rules").write_text(
                "# Web Rules\n\nSee [api](../api/README.md).\n",
                encoding="utf-8",
            )
            result = self.run_checker(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("apps/web/README.md: broken relative link DESIGN-MISSING.md", result.stderr)
        self.assertIn("apps/web/.rules: broken relative link ../api/README.md", result.stderr)

    def test_tool_and_generated_directories_are_ignored(self):
        with tempfile.TemporaryDirectory(prefix="ims-docs-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            for relative in (
                ".pi/teams/artifact.md",
                ".worktrees/topic/README.md",
                "apps/web/src-tauri/plugins/example/ios/.build/checkouts/README.md",
            ):
                document = root / relative
                document.parent.mkdir(parents=True, exist_ok=True)
                document.write_text(
                    "# Generated\n\n[missing](MISSING.md)\n", encoding="utf-8"
                )
            result = self.run_checker(root)

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("1 Markdown files", result.stdout)

    def test_agent_skill_markdown_is_scanned(self):
        with tempfile.TemporaryDirectory(prefix="ims-docs-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            skill = root / ".agents/skills/example/SKILL.md"
            skill.parent.mkdir(parents=True, exist_ok=True)
            skill.write_text("# Skill\n\nSee [missing](MISSING.md).\n", encoding="utf-8")
            result = self.run_checker(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(".agents/skills/example/SKILL.md: broken relative link MISSING.md", result.stderr)

    def test_scope_rules_and_agent_aliases_are_scanned(self):
        with tempfile.TemporaryDirectory(prefix="ims-docs-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            (root / ".rules").write_text(
                "# Repository Guidelines\n\nSee [missing](apps/api/MISSING.md).\n",
                encoding="utf-8",
            )
            result = self.run_checker(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(".rules: broken relative link apps/api/MISSING.md", result.stderr)
        self.assertIn("AGENTS.md: broken relative link apps/api/MISSING.md", result.stderr)


if __name__ == "__main__":
    unittest.main()
