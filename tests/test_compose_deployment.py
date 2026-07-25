from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
COMPOSE_PATH = PROJECT_ROOT / "deploy/compose.yaml"


class ComposeDeploymentTests(unittest.TestCase):
    def test_compose_owns_only_local_data_services(self):
        compose = COMPOSE_PATH.read_text(encoding="utf-8")
        services_source = compose.split("\nvolumes:\n", maxsplit=1)[0]
        services = re.findall(r"^  ([a-z0-9][a-z0-9-]*):$", services_source, re.MULTILINE)

        self.assertEqual(services, ["postgres", "minio", "minio-init"])
        self.assertIn("image: ${IMS_POSTGRES_IMAGE:-postgres:18.4-alpine}", compose)
        self.assertIn("image: ${IMS_MINIO_IMAGE:-minio/minio:", compose)
        self.assertIn("postgresql-data:/var/lib/postgresql", compose)
        self.assertIn("minio-data:/data", compose)
        self.assertNotRegex(compose, r"(?m)^\s+build:")
        self.assertNotRegex(compose, r"(?i)nginx")
        self.assertNotIn("network_mode: host", compose)

    def test_minio_creates_one_public_bucket_with_a_protected_prefix(self):
        compose = COMPOSE_PATH.read_text(encoding="utf-8")
        policy = (PROJECT_ROOT / "deploy/minio-public-policy.json").read_text(
            encoding="utf-8"
        )
        self.assertNotIn("IMS_MINIO_PUBLIC_BUCKET", compose)
        self.assertNotRegex(compose, r"(?m)^\s+sed\s")
        self.assertIn('mc anonymous set-json /tmp/policy.json', compose)
        self.assertIn('mc version enable "local/$${IMS_MINIO_BUCKET}"', compose)
        self.assertIn("/__protected/*", policy)
        self.assertIn("/*/__protected/*", policy)

    def test_only_current_compose_is_present(self):
        self.assertTrue(COMPOSE_PATH.is_file())
        self.assertEqual(
            sorted(path.name for path in (PROJECT_ROOT / "deploy").glob("compose*.yaml")),
            ["compose.yaml"],
        )
        self.assertFalse((PROJECT_ROOT / "deploy/nginx").exists())
        self.assertFalse((PROJECT_ROOT / "compose.yaml").exists())
        self.assertFalse((PROJECT_ROOT / "compose.emergency.yaml").exists())
        self.assertFalse((PROJECT_ROOT / "apps/legacy").exists())


if __name__ == "__main__":
    unittest.main()
