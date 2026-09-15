from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RULE_CHECK = PROJECT_ROOT / "scripts/check-agent-rules.mjs"


class AgentRulesTests(unittest.TestCase):
    def make_fixture(self, root: Path) -> None:
        script = root / "scripts/check-agent-rules.mjs"
        script.parent.mkdir(parents=True)
        shutil.copyfile(RULE_CHECK, script)

        for relative_directory in (".", "apps/api", "apps/web", "packages/contracts"):
            directory = root / relative_directory
            directory.mkdir(parents=True, exist_ok=True)
            (directory / ".rules").write_text("# Rules\n", encoding="utf-8")
            (directory / "AGENTS.md").symlink_to(".rules")
            (directory / "CLAUDE.md").symlink_to(".rules")

    def run_fixture(self, root: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["node", "scripts/check-agent-rules.mjs"],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_repository_rules_are_canonical_and_linked(self):
        result = self.run_fixture(PROJECT_ROOT)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("4 scope(s)", result.stdout)

    def test_missing_alias_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="ims-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            (root / "apps/api/CLAUDE.md").unlink()
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("apps/api/CLAUDE.md", result.stderr)
        self.assertIn("symbolic link to .rules", result.stderr)

    def test_regular_alias_file_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="ims-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            agents = root / "AGENTS.md"
            agents.unlink()
            agents.write_text("# Diverged rules\n", encoding="utf-8")
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("AGENTS.md", result.stderr)
        self.assertIn("symbolic link to .rules", result.stderr)

    def test_non_local_rule_target_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="ims-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            claude = root / "apps/web/CLAUDE.md"
            claude.unlink()
            claude.symlink_to("../api/.rules")
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("apps/web/CLAUDE.md", result.stderr)
        self.assertIn("must target .rules", result.stderr)


if __name__ == "__main__":
    unittest.main()
