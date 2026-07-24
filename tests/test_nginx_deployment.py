from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATH = PROJECT_ROOT / "deploy/nginx/templates/default.conf.template"
PROXY_SNIPPET_PATH = PROJECT_ROOT / "deploy/nginx/snippets/proxy-common.conf"
COMPOSE_PATH = PROJECT_ROOT / "deploy/compose.yaml"


def render_template(template: str, values: dict[str, str]) -> str:
    pattern = re.compile(r"\$\{(IMS_[A-Z0-9_]+)\}")
    referenced = set(pattern.findall(template))
    missing = referenced - values.keys()
    if missing:
        raise AssertionError(f"missing template values: {sorted(missing)}")
    return pattern.sub(lambda match: values[match.group(1)], template)


class NginxDeploymentTests(unittest.TestCase):
    def test_template_uses_one_generic_node_proxy(self):
        rendered = render_template(
            TEMPLATE_PATH.read_text(encoding="utf-8"),
            {
                "IMS_NODE_UPSTREAM": "127.0.0.1:3000",
                "IMS_NGINX_LISTEN_PORT": "8080",
                "IMS_NGINX_SERVER_NAME": "_",
                "IMS_SITE_PACKAGE_SERVER_NAME": "ims-content.example.net",
                "IMS_TRUST_OUTER_PROXY": "true",
                "IMS_CLIENT_MAX_BODY_SIZE": "50m",
            },
        )
        self.assertNotIn("${IMS_", rendered)
        mounted = rendered + PROXY_SNIPPET_PATH.read_text(encoding="utf-8")

        self.assertIn("upstream ims_node", rendered)
        self.assertIn("server 127.0.0.1:3000;", rendered)
        self.assertRegex(
            rendered,
            r"(?s)location\s+/\s*\{.*?proxy_pass\s+http://ims_node;.*?\}",
        )
        self.assertNotIn("ims_flask", rendered)
        self.assertNotIn("5000", rendered)
        self.assertIn("include /etc/nginx/snippets/ims-security.conf;", rendered)
        self.assertIn("server_name ims-content.example.net;", rendered)
        self.assertRegex(
            rendered,
            r"(?s)location\s+=\s+/healthz\s*\{.*?return\s+204;.*?\}",
        )
        self.assertRegex(
            rendered,
            r"(?s)location\s+=\s+/readyz\s*\{.*?"
            r"proxy_pass\s+http://ims_node/api/wiki/test;.*?\}",
        )
        for header in (
            "proxy_set_header Host $host;",
            "proxy_set_header X-Real-IP $remote_addr;",
            "proxy_set_header X-Forwarded-For $remote_addr;",
            "proxy_set_header X-Forwarded-Proto $ims_forwarded_proto;",
        ):
            self.assertIn(header, mounted)

    def test_compose_owns_nginx_postgres_and_minio_without_app_builds(self):
        compose = COMPOSE_PATH.read_text(encoding="utf-8")
        self.assertIn("image: ${IMS_NGINX_IMAGE:-nginx:", compose)
        self.assertRegex(compose, r"(?s)nginx:\s+profiles:\s+- proxy")
        self.assertIn("image: ${IMS_POSTGRES_IMAGE:-postgres:18.4-alpine}", compose)
        self.assertIn("image: ${IMS_MINIO_IMAGE:-minio/minio:", compose)
        self.assertIn("postgresql-data:/var/lib/postgresql/data", compose)
        self.assertIn("minio-data:/data", compose)
        self.assertNotRegex(compose, r"(?m)^\s+build:")
        self.assertIn("./nginx/templates:/etc/nginx/templates:ro", compose)
        self.assertIn("./nginx/snippets:/etc/nginx/snippets:ro", compose)
        self.assertIn("network_mode: host", compose)

    def test_only_current_compose_is_present(self):
        self.assertTrue(COMPOSE_PATH.is_file())
        self.assertEqual(
            sorted(path.name for path in (PROJECT_ROOT / "deploy").glob("compose*.yaml")),
            ["compose.yaml"],
        )
        self.assertFalse((PROJECT_ROOT / "compose.yaml").exists())
        self.assertFalse((PROJECT_ROOT / "compose.emergency.yaml").exists())
        self.assertFalse((PROJECT_ROOT / "apps/legacy").exists())


if __name__ == "__main__":
    unittest.main()
