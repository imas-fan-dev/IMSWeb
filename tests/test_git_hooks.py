from pathlib import Path
import shutil
import stat
import subprocess
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
HOOK_INSTALLER = PROJECT_ROOT / "scripts/install-git-hooks.mjs"
PRE_COMMIT_HOOK = PROJECT_ROOT / ".githooks/pre-commit"


class GitHooksTests(unittest.TestCase):
    def test_repository_pre_commit_hook_is_executable(self):
        mode = PRE_COMMIT_HOOK.stat().st_mode

        self.assertTrue(mode & stat.S_IXUSR)
        self.assertIn(
            "exec pnpm run check:pre-commit",
            PRE_COMMIT_HOOK.read_text(encoding="utf-8"),
        )

    def test_installer_skips_non_git_dependency_layer(self):
        with tempfile.TemporaryDirectory(prefix="ims-git-hooks-") as temporary:
            root = Path(temporary)
            script = root / "scripts/install-git-hooks.mjs"
            script.parent.mkdir(parents=True)
            shutil.copyfile(HOOK_INSTALLER, script)

            install = subprocess.run(
                ["node", "scripts/install-git-hooks.mjs"],
                cwd=root,
                check=False,
                capture_output=True,
                text=True,
            )

        self.assertEqual(install.returncode, 0, install.stderr)
        self.assertIn("not inside a Git worktree", install.stdout)

    def test_installer_configures_repository_hooks_path(self):
        with tempfile.TemporaryDirectory(prefix="ims-git-hooks-") as temporary:
            root = Path(temporary)
            script = root / "scripts/install-git-hooks.mjs"
            hook = root / ".githooks/pre-commit"
            script.parent.mkdir(parents=True)
            hook.parent.mkdir(parents=True)
            shutil.copyfile(HOOK_INSTALLER, script)
            shutil.copyfile(PRE_COMMIT_HOOK, hook)
            subprocess.run(["git", "init", "--quiet"], cwd=root, check=True)

            install = subprocess.run(
                ["node", "scripts/install-git-hooks.mjs"],
                cwd=root,
                check=False,
                capture_output=True,
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
        self.assertEqual(configured_path.stdout.strip(), ".githooks")


if __name__ == "__main__":
    unittest.main()
