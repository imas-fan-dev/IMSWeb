from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATH = PROJECT_ROOT / "deploy/nginx/templates/default.conf.template"
LEGACY_TEMPLATE_PATH = PROJECT_ROOT / "deploy/nginx/templates-legacy/default.conf.template"
PROXY_SNIPPET_PATH = PROJECT_ROOT / "deploy/nginx/snippets/proxy-common.conf"
COMPOSE_PATH = PROJECT_ROOT / "deploy/compose.yaml"
LEGACY_COMPOSE_PATH = PROJECT_ROOT / "deploy/compose.legacy.yaml"


def render_template(template: str, values: dict[str, str]) -> str:
    pattern = re.compile(r"\$\{(IMS_[A-Z0-9_]+)\}")
    referenced = set(pattern.findall(template))
    missing = referenced - values.keys()
    if missing:
        raise AssertionError(f"missing template values: {sorted(missing)}")
    return pattern.sub(lambda match: values[match.group(1)], template)


class NginxDeploymentTests(unittest.TestCase):
    def test_optional_template_uses_one_generic_node_proxy(self):
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
        mounted_configuration = rendered + PROXY_SNIPPET_PATH.read_text(encoding="utf-8")

        self.assertIn("upstream ims_node", rendered)
        self.assertIn("server 127.0.0.1:3000;", rendered)
        self.assertRegex(
            rendered,
            r"(?s)location\s+/\s*\{.*?proxy_pass\s+http://ims_node;.*?\}",
        )
        for location in ("/wiki/", "/story", "/image/", "/api/wiki/"):
            self.assertNotIn(f"location {location}", rendered)

        self.assertNotIn("ims_flask", rendered)
        self.assertNotIn("IMS_FLASK_UPSTREAM", rendered)
        self.assertNotIn("5000", rendered)
        self.assertIn("include /etc/nginx/snippets/ims-security.conf;", rendered)
        self.assertIn("server_name ims-content.example.net;", rendered)
        main_server = rendered[
            rendered.index("server_name _;"):
            rendered.index("server_name ims-content.example.net;")
        ]
        content_server = rendered[rendered.index("server_name ims-content.example.net;"):]
        preview_location = (
            r"location\s+\^~\s+/site-content/_preview/\s*\{.*?"
            r"access_log\s+off;.*?proxy_pass\s+http://ims_node;.*?\}"
        )
        self.assertRegex(main_server, rf"(?s){preview_location}")
        self.assertRegex(content_server, rf"(?s){preview_location}")
        self.assertRegex(
            rendered,
            r"(?s)server_name\s+ims-content\.example\.net;.*?"
            r"location\s+\^~\s+/site-content/\s*\{.*?"
            r"proxy_pass\s+http://ims_node;.*?\}",
        )
        self.assertRegex(
            rendered,
            r"(?s)server_name\s+ims-content\.example\.net;.*?"
            r"location\s+/\s*\{\s*return\s+404;\s*\}",
        )

        self.assertRegex(
            rendered,
            r"(?s)location\s+=\s+/healthz\s*\{.*?return\s+204;.*?\}",
        )
        self.assertRegex(
            rendered,
            r"(?s)location\s+=\s+/readyz\s*\{.*?"
            r"proxy_pass\s+http://ims_node/api/wiki/test;.*?\}",
        )

        for forwarded_header in (
            "proxy_set_header Host $host;",
            "proxy_set_header X-Real-IP $remote_addr;",
            "proxy_set_header X-Forwarded-For $remote_addr;",
            "proxy_set_header X-Forwarded-Host $host;",
            "proxy_set_header X-Forwarded-Port $ims_forwarded_port;",
            "proxy_set_header X-Forwarded-Proto $ims_forwarded_proto;",
            "proxy_set_header Upgrade $http_upgrade;",
            "proxy_set_header Connection $connection_upgrade;",
        ):
            self.assertIn(forwarded_header, mounted_configuration)
        self.assertIn(
            'map "true:$http_x_forwarded_proto" $ims_forwarded_proto',
            rendered,
        )
        self.assertIn("default $scheme;", rendered)
        self.assertIn("~*^true:https$ https;", rendered)
        self.assertIn("~*^true:https:$ 443;", rendered)
        self.assertIn("default $server_port;", rendered)
        self.assertNotIn("proxy_set_header X-Forwarded-Port $server_port;", mounted_configuration)
        self.assertNotIn("proxy_set_header X-Forwarded-Proto $scheme;", mounted_configuration)

    def test_current_compose_owns_nginx_postgres_and_minio_without_app_builds(self):
        compose = COMPOSE_PATH.read_text(encoding="utf-8")
        self.assertIn("image: ${IMS_NGINX_IMAGE:-nginx:", compose)
        self.assertRegex(compose, r"(?s)nginx:\s+profiles:\s+- proxy")
        self.assertIn("image: ${IMS_POSTGRES_IMAGE:-postgres:18.4-alpine}", compose)
        self.assertIn("image: ${IMS_MINIO_IMAGE:-minio/minio:", compose)
        self.assertIn("postgresql-data:/var/lib/postgresql/data", compose)
        self.assertIn("minio-data:/data", compose)
        self.assertIn("entrypoint: /docker-entrypoint.sh", compose)
        self.assertNotRegex(compose, r"(?m)^\s+build:")
        self.assertIn("./nginx/templates:/etc/nginx/templates:ro", compose)
        self.assertIn("./nginx/snippets:/etc/nginx/snippets:ro", compose)
        self.assertIn("network_mode: host", compose)
        self.assertIn("IMS_SITE_PACKAGE_SERVER_NAME", compose)
        self.assertIn("IMS_TRUST_OUTER_PROXY", compose)
        self.assertIn('"127.0.0.1:${IMS_POSTGRES_PORT:-5432}:5432"', compose)
        self.assertIn('"127.0.0.1:${IMS_MINIO_API_PORT:-9000}:9000"', compose)
        self.assertIn("name: imsweb-postgresql_postgresql-data", compose)
        self.assertIn("name: imsweb-minio_minio-data", compose)
        self.assertIn(
            'wget -q -O /dev/null "http://127.0.0.1:$${IMS_NGINX_LISTEN_PORT}/readyz"',
            compose,
        )
        self.assertNotIn(
            'wget -q -O /dev/null "http://127.0.0.1:$${IMS_NGINX_LISTEN_PORT}/healthz"',
            compose,
        )

    def test_legacy_compose_routes_node_and_flask_with_rollback_protection(self):
        compose = LEGACY_COMPOSE_PATH.read_text(encoding="utf-8")
        template = LEGACY_TEMPLATE_PATH.read_text(encoding="utf-8")

        self.assertIn("IMS_LEGACY_NODE_UPSTREAM", compose)
        self.assertIn("IMS_LEGACY_FLASK_UPSTREAM", compose)
        self.assertIn("./nginx/templates-legacy:/etc/nginx/templates:ro", compose)
        self.assertNotRegex(compose, r"(?m)^\s+build:")
        self.assertIn("upstream ims_legacy_node", template)
        self.assertIn("upstream ims_legacy_flask", template)
        self.assertIn("include /etc/nginx/snippets/ims-emergency-deny.conf;", template)
        self.assertRegex(
            template,
            r"(?s)location\s+/wiki/\s*\{.*?"
            r"proxy_pass\s+http://ims_legacy_flask/;.*?\}",
        )
        for location in ("/story", "/image/", "/api/wiki/"):
            with self.subTest(location=location):
                self.assertRegex(
                    template,
                    rf"(?s)location\s+{re.escape(location)}\s*\{{.*?"
                    r"proxy_pass\s+http://ims_legacy_flask;.*?\}",
                )

    def test_legacy_nginx_distribution_is_removed(self):
        self.assertFalse((PROJECT_ROOT / "nginx-1.26.3").exists())

    def test_compose_files_are_owned_by_deploy(self):
        self.assertTrue(COMPOSE_PATH.is_file())
        self.assertTrue(LEGACY_COMPOSE_PATH.is_file())
        self.assertEqual(
            sorted(path.name for path in (PROJECT_ROOT / "deploy").glob("compose*.yaml")),
            ["compose.legacy.yaml", "compose.yaml"],
        )
        self.assertFalse((PROJECT_ROOT / "compose.yaml").exists())
        self.assertFalse((PROJECT_ROOT / "compose.emergency.yaml").exists())


if __name__ == "__main__":
    unittest.main()
