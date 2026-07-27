from pathlib import Path
import os
import shutil
import stat
import subprocess
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
HOOK_INSTALLER = PROJECT_ROOT / ".husky/install.mjs"
PRE_COMMIT_HOOK = PROJECT_ROOT / ".husky/pre-commit"


class GitHooksTests(unittest.TestCase):
    def test_repository_pre_commit_hook_is_executable(self):
        mode = PRE_COMMIT_HOOK.stat().st_mode

        self.assertTrue(mode & stat.S_IXUSR)
        self.assertIn(
            "exec pnpm run check:pre-commit",
            PRE_COMMIT_HOOK.read_text(encoding="utf-8"),
        )

    def test_installer_skips_when_husky_is_disabled_without_dev_dependencies(self):
        with tempfile.TemporaryDirectory(prefix="ims-husky-") as temporary:
            root = Path(temporary)
            script = root / ".husky/install.mjs"
            script.parent.mkdir(parents=True)
            shutil.copyfile(HOOK_INSTALLER, script)
            environment = {**os.environ, "HUSKY": "0"}

            install = subprocess.run(
                ["node", ".husky/install.mjs"],
                cwd=root,
                check=False,
                capture_output=True,
                env=environment,
                text=True,
            )

        self.assertEqual(install.returncode, 0, install.stderr)
        self.assertEqual(install.stdout, "")

    def test_husky_installer_configures_repository_hooks_path(self):
        with tempfile.TemporaryDirectory(prefix="ims-husky-") as temporary:
            root = Path(temporary)
            subprocess.run(["git", "init", "--quiet"], cwd=root, check=True)
            environment = {
                key: value
                for key, value in os.environ.items()
                if key not in {"CI", "HUSKY", "NODE_ENV"}
            }

            install = subprocess.run(
                ["node", str(HOOK_INSTALLER)],
                cwd=root,
                check=False,
                capture_output=True,
                env=environment,
                text=True,
            )
            configured_path = subprocess.run(
                ["git", "config", "--local", "--get", "core.hooksPath"],
                cwd=root,
                check=True,
                capture_output=True,
                text=True,
            )

        self.assertEqual(install.returncode, 0, install.stderr)
        self.assertEqual(configured_path.stdout.strip(), ".husky/_")


if __name__ == "__main__":
    unittest.main()
