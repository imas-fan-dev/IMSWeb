from pathlib import Path
import os
import subprocess
import tarfile
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
BACKUP_SCRIPT = PROJECT_ROOT / "scripts/operations/backups/backup-legacy-source.sh"


class LegacySourceBackupTests(unittest.TestCase):
    def test_archive_contains_self_consistent_frozen_restore_inputs(self):
        with tempfile.TemporaryDirectory(prefix="ims-backup-") as temporary:
            backup_root = Path(temporary) / "output"
            environment = os.environ.copy()
            environment.update(
                IMS_BACKUP_ROOT=str(backup_root),
                IMS_BACKUP_ID="test-fixture",
            )
            result = subprocess.run(
                ["sh", str(BACKUP_SCRIPT)],
                cwd=PROJECT_ROOT,
                env=environment,
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

            archive = backup_root / "ims-legacy-source-test-fixture.tar.gz"
            checksum = Path(f"{archive}.sha256")
            self.assertTrue(archive.is_file())
            self.assertTrue(checksum.is_file())
            with tarfile.open(archive, "r:gz") as source_archive:
                members = {
                    member.name.removeprefix("./") for member in source_archive.getmembers()
                }

            required = {
                ".npmrc",
                ".nvmrc",
                "package.json",
                "pnpm-lock.yaml",
                "pnpm-workspace.yaml",
                "apps/api/package.json",
                "apps/legacy/.python-version",
                "apps/legacy/pyproject.toml",
                "apps/legacy/uv.lock",
                "apps/web/package.json",
                "RESTORE-VERIFY.sh",
                "SHA256SUMS",
            }
            self.assertTrue(required.issubset(members), required - members)


if __name__ == "__main__":
    unittest.main()
