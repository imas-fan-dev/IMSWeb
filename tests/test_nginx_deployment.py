from pathlib import Path
import re
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
TEMPLATE_PATH = PROJECT_ROOT / "deploy/nginx/templates/default.conf.template"
PROXY_SNIPPET_PATH = PROJECT_ROOT / "deploy/nginx/snippets/proxy-common.conf"
COMPOSE_PATH = PROJECT_ROOT / "deploy/compose.yaml"
EMERGENCY_COMPOSE_PATH = PROJECT_ROOT / "deploy/compose.emergency.yaml"


def render_template(template: str, values: dict[str, str]) -> str:
    pattern = re.compile(r"\$\{(IMS_[A-Z0-9_]+)\}")
    referenced = set(pattern.findall(template))
    missing = referenced - values.keys()
    if missing:
        raise AssertionError(f"missing template values: {sorted(missing)}")
    return pattern.sub(lambda match: values[match.group(1)], template)


class NginxDeploymentTests(unittest.TestCase):
    def test_template_routes_all_backend_paths_to_single_node_upstream(self):
        rendered = render_template(
            TEMPLATE_PATH.read_text(encoding="utf-8"),
            {
                "IMS_NODE_UPSTREAM": "127.0.0.1:3000",
                "IMS_NGINX_LISTEN_PORT": "8080",
                "IMS_NGINX_SERVER_NAME": "_",
                "IMS_CLIENT_MAX_BODY_SIZE": "50m",
                "IMS_EMERGENCY_INCLUDE": "/etc/nginx/snippets/ims-normal-mode.conf",
            },
        )
        self.assertNotIn("${IMS_", rendered)
        mounted_configuration = rendered + PROXY_SNIPPET_PATH.read_text(encoding="utf-8")

        self.assertIn("upstream ims_node", rendered)
        self.assertIn("server 127.0.0.1:3000;", rendered)
        for location in ("/wiki/", "/story", "/image/", "/api/wiki/"):
            with self.subTest(location=location):
                self.assertRegex(
                    rendered,
                    rf"(?s)location\s+{re.escape(location)}\s*\{{.*?"
                    r"proxy_pass\s+http://ims_node;.*?\}",
                )

        self.assertNotIn("ims_flask", rendered)
        self.assertNotIn("IMS_FLASK_UPSTREAM", rendered)
        self.assertNotIn("5000", rendered)
        self.assertIn("include /etc/nginx/snippets/ims-security.conf;", rendered)

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
            "proxy_set_header X-Forwarded-Port $server_port;",
            "proxy_set_header X-Forwarded-Proto $scheme;",
            "proxy_set_header Upgrade $http_upgrade;",
            "proxy_set_header Connection $connection_upgrade;",
        ):
            self.assertIn(forwarded_header, mounted_configuration)

    def test_compose_uses_official_image_and_read_only_mounts_without_build(self):
        compose = COMPOSE_PATH.read_text(encoding="utf-8")
        self.assertIn("image: ${IMS_NGINX_IMAGE:-nginx:", compose)
        self.assertIn("entrypoint: /docker-entrypoint.sh", compose)
        self.assertNotRegex(compose, r"(?m)^\s+build:")
        self.assertIn("./nginx/templates:/etc/nginx/templates:ro", compose)
        self.assertIn("./nginx/snippets:/etc/nginx/snippets:ro", compose)
        self.assertIn("network_mode: host", compose)
        self.assertNotRegex(compose, r"(?m)^\s+ports:")
        self.assertIn(
            'wget -q -O /dev/null "http://127.0.0.1:$${IMS_NGINX_LISTEN_PORT}/readyz"',
            compose,
        )
        self.assertNotIn(
            'wget -q -O /dev/null "http://127.0.0.1:$${IMS_NGINX_LISTEN_PORT}/healthz"',
            compose,
        )

    def test_emergency_override_only_selects_the_emergency_snippet(self):
        override = EMERGENCY_COMPOSE_PATH.read_text(encoding="utf-8")
        self.assertIn(
            "IMS_EMERGENCY_INCLUDE: /etc/nginx/snippets/ims-emergency-deny.conf",
            override,
        )
        self.assertNotIn("volumes:", override)

    def test_legacy_nginx_distribution_is_removed(self):
        self.assertFalse((PROJECT_ROOT / "nginx-1.26.3").exists())

    def test_compose_files_are_owned_by_deploy(self):
        self.assertTrue(COMPOSE_PATH.is_file())
        self.assertTrue(EMERGENCY_COMPOSE_PATH.is_file())
        self.assertFalse((PROJECT_ROOT / "compose.yaml").exists())
        self.assertFalse((PROJECT_ROOT / "compose.emergency.yaml").exists())


if __name__ == "__main__":
    unittest.main()
