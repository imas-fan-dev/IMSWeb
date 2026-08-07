import os
from pathlib import Path
import re
import secrets
import stat
import subprocess
import sys
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
CI_WORKFLOW = PROJECT_ROOT / ".github/workflows/ci.yml"
DEPLOY_WORKFLOW = PROJECT_ROOT / ".github/workflows/deploy.yml"
DEPLOY_SCRIPT = PROJECT_ROOT / "scripts/deployment/deploy-compose-release.sh"
AUTH_DEPLOY_SCRIPT = (
    PROJECT_ROOT / "scripts/deployment/run-authenticated-compose-release.sh"
)
COMPOSE = PROJECT_ROOT / "deploy/compose.yaml"
DEPLOYMENT_GUIDE = PROJECT_ROOT / "docs/github-actions-deployment.md"
PNPM_SETUP_ACTION = (
    "pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10"
)


FAKE_CONTAINER_CLI = r"""#!/usr/bin/env bash
set -euo pipefail
printf '%s|%s\n' "${IMS_API_IMAGE:-none}" "$*" >> "$FAKE_CONTAINER_LOG"
joined=" $* "
if [[ "$joined" == " info " && "${FAKE_FAIL_CONTAINER_INFO:-}" == "true" ]]; then
    exit 1
elif [[ "$joined" == *" exec -T postgres "*"pg_dump "* ]]; then
    printf 'PGDMPimsweb-test-backup\n'
elif [[ "$joined" == *" exec -T postgres "*"pg_restore "* ]]; then
    cat >/dev/null
elif [[ "$joined" == *" exec -T api node -e "* &&
        -n "${FAKE_FAIL_IMAGE:-}" && "${IMS_API_IMAGE:-}" == "$FAKE_FAIL_IMAGE" ]]; then
    exit 1
fi
"""


FAKE_CURL = r"""#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$*" >> "$FAKE_CURL_LOG"
"""


FAKE_STAT = r"""#!/usr/bin/env bash
set -euo pipefail
if [[ "$1" == "-c" && "$2" == "%a" ]]; then
    exec /usr/bin/stat -f '%Lp' "$3"
fi
exit 2
"""


FAKE_SHA256SUM = r"""#!/usr/bin/env bash
set -euo pipefail
/usr/bin/shasum -a 256 "$1" | awk '{ print $1 "  " $2 }'
"""


FAKE_BASE64 = r"""#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "--decode" ]]; then
    exec /usr/bin/base64 -D
fi
exec /usr/bin/base64 "$@"
"""


FAKE_FLOCK = r"""#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == "-n" && "$2" =~ ^[0-9]+$ ]]
"""


FAKE_MV = r"""#!/usr/bin/env bash
set -euo pipefail
if [[ "${1:-}" == "-Tf" ]]; then
    exec /bin/mv -f "$2" "$3"
fi
exec /bin/mv "$@"
"""


FAKE_AUTH_DOCKER = r"""#!/usr/bin/env bash
set -euo pipefail
printf '%s|%s\n' "$DOCKER_CONFIG" "$*" >> "$FAKE_AUTH_CONTAINER_LOG"
[[ "$1" == "login" && "$2" == "ghcr.io" ]]
[[ -f "$DOCKER_CONFIG/config.json" ]]
[[ -f "$DOCKER_CONFIG/contexts/rootless-marker" ]]
token=$(cat)
[[ "$token" == "$EXPECTED_GHCR_TOKEN" ]]
printf '%s\n' authenticated > "$DOCKER_CONFIG/auth-created"
[[ "${FAKE_AUTH_LOGIN_FAIL:-}" != "true" ]]
"""


FAKE_AUTH_DEPLOYMENT = r"""#!/usr/bin/env bash
set -euo pipefail
[[ -f "$DOCKER_CONFIG/auth-created" ]]
if IFS= read -r unexpected; then
    exit 20
fi
printf '%s\n' "$DOCKER_CONFIG" > "$FAKE_AUTH_DEPLOYMENT_LOG"
printf '%s\n' "$*" >> "$FAKE_AUTH_DEPLOYMENT_LOG"
printf '%s\n' "Deployment completed."
"""


def write_executable(path: Path, content: str) -> None:
    path.write_text(content, encoding="utf-8")
    path.chmod(path.stat().st_mode | stat.S_IXUSR)


class GitHubWorkflowContractTests(unittest.TestCase):
    def test_ci_and_deployment_workflows_use_expected_gates(self):
        ci = CI_WORKFLOW.read_text(encoding="utf-8")
        deployment = DEPLOY_WORKFLOW.read_text(encoding="utf-8")

        for token in (
            "pull_request:",
            "push:",
            "pnpm install --frozen-lockfile",
            "pnpm run check",
            "pnpm run test",
            PNPM_SETUP_ACTION,
        ):
            self.assertIn(token, ci)

        for token in (
            '      - "v*.*.*"',
            "workflow_dispatch:",
            "confirm_data_compatibility:",
            "refs/remotes/origin/main",
            PNPM_SETUP_ACTION,
            "docker/build-push-action@",
            "actions/attest-build-provenance@",
            "gh attestation verify",
            "GH_TOKEN: ${{ github.token }}",
            "--source-digest",
            "--source-ref",
            "--deny-self-hosted-runners",
            "image_ref=${IMAGE_NAME}@${digest}",
            "name: production",
            "group: imsweb-production",
            "cancel-in-progress: false",
            "scripts/deployment/deploy-compose-release.sh",
            "scripts/deployment/run-authenticated-compose-release.sh",
            "ref: ${{ github.workflow_sha }}",
            "path: .deployment-workflow",
            'remote_script="/tmp/imsweb-deploy-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.sh"',
            'remote_auth_script="/tmp/imsweb-auth-deploy-${GITHUB_RUN_ID}-${GITHUB_RUN_ATTEMPT}.sh"',
            '"$target:$remote_script"',
            'GHCR_TOKEN: ${{ github.token }}',
            'GHCR_USERNAME: ${{ github.actor }}',
            'printf \'%s\' "$GHCR_TOKEN"',
            ".deployment-workflow/scripts/deployment/run-authenticated-compose-release.sh",
            'grep -Fxq "Deployment completed." "$deployment_log"',
        ):
            self.assertIn(token, deployment)

        deploy_job = deployment.split("\n  deploy:\n", maxsplit=1)[1]
        self.assertIn("      packages: read", deploy_job)
        self.assertIn("needs.prepare.result == 'success'", deploy_job)
        self.assertIn("needs.resolve-image.result == 'success'", deploy_job)

        authenticated_deployment = AUTH_DEPLOY_SCRIPT.read_text(encoding="utf-8")
        for token in (
            "--password-stdin",
            "export DOCKER_CONFIG=$auth_directory",
            "export REGISTRY_AUTH_FILE=$auth_directory/auth.json",
            'bash "$deployment_script" "$@" </dev/null',
            'rm -rf -- "$auth_directory"',
        ):
            self.assertIn(token, authenticated_deployment)

        self.assertNotIn('remote_command="bash -s --', deployment)
        self.assertNotIn("< scripts/deployment/deploy-compose-release.sh", deployment)
        self.assertNotIn("secrets.IMS_JWT_SECRET", deployment)
        self.assertNotIn("secrets.AWS_SECRET_ACCESS_KEY", deployment)
        self.assertNotIn("secrets.GHCR_TOKEN", deployment)

    def test_deployment_guide_covers_setup_release_and_recovery_boundaries(self):
        guide = DEPLOYMENT_GUIDE.read_text(encoding="utf-8")
        for token in (
            "DEPLOY_SSH_PRIVATE_KEY",
            "DEPLOY_SSH_KNOWN_HOSTS",
            "GITHUB_TOKEN",
            "packages: read",
            "`main` branch",
            "`v*.*.*` tag",
            "/etc/imsweb/production.env",
            "IMS_S3_REGION=auto",
            "IMS_S3_FORCE_PATH_STYLE=false",
            "Tag ruleset",
            "pg_dump",
            "expand/contract",
            "不恢复 PostgreSQL 或 R2",
            "不宣称",
        ):
            self.assertIn(token, guide)

    def test_external_actions_are_pinned_to_full_commit_shas(self):
        workflows = "\n".join(
            path.read_text(encoding="utf-8") for path in (CI_WORKFLOW, DEPLOY_WORKFLOW)
        )
        action_references = re.findall(r"uses:\s+[^@\s]+@([^\s]+)", workflows)
        self.assertGreater(len(action_references), 0)
        for reference in action_references:
            with self.subTest(reference=reference):
                self.assertRegex(reference, r"^[0-9a-f]{40}$")


class AuthenticatedDeploymentWrapperTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="ims-authenticated-deploy-")
        self.root = Path(self.temporary.name)
        self.bin_dir = self.root / "bin"
        self.bin_dir.mkdir()
        self.home = self.root / "home"
        self.docker_config = self.home / ".docker"
        self.contexts = self.docker_config / "contexts"
        self.contexts.mkdir(parents=True)
        (self.contexts / "rootless-marker").write_text("rootless\n", encoding="utf-8")
        self.config_contents = '{"currentContext":"rootless"}\n'
        (self.docker_config / "config.json").write_text(
            self.config_contents,
            encoding="utf-8",
        )
        self.container_log = self.root / "container.log"
        self.deployment_log = self.root / "deployment.log"
        write_executable(self.bin_dir / "docker", FAKE_AUTH_DOCKER)

        unique = f"{os.getpid()}-{secrets.randbelow(1_000_000_000)}"
        self.remote_script = Path(f"/tmp/imsweb-deploy-{unique}.sh")
        write_executable(self.remote_script, FAKE_AUTH_DEPLOYMENT)
        self.token = f"github-token-{unique}"

    def tearDown(self):
        self.remote_script.unlink(missing_ok=True)
        self.temporary.cleanup()

    def environment(self, *, login_failure: bool = False) -> dict[str, str]:
        environment = os.environ.copy()
        environment.update(
            {
                "PATH": f"{self.bin_dir}:{environment['PATH']}",
                "HOME": str(self.home),
                "DOCKER_CONFIG": str(self.docker_config),
                "EXPECTED_GHCR_TOKEN": self.token,
                "FAKE_AUTH_CONTAINER_LOG": str(self.container_log),
                "FAKE_AUTH_DEPLOYMENT_LOG": str(self.deployment_log),
                "FAKE_AUTH_LOGIN_FAIL": "true" if login_failure else "",
            }
        )
        return environment

    def run_wrapper(self, *, login_failure: bool = False) -> subprocess.CompletedProcess[str]:
        image = f"ghcr.io/example/imsweb-api@sha256:{'2' * 64}"
        return subprocess.run(
            (
                str(AUTH_DEPLOY_SCRIPT),
                "TexasOct",
                str(self.remote_script),
                "v1.2.3",
                "1" * 40,
                image,
                "/tmp/imsweb-compose-1-1.yaml",
                "/srv/imsweb",
                "aHR0cHM6Ly9leGFtcGxlLmNvbQ==",
            ),
            cwd=PROJECT_ROOT,
            env=self.environment(login_failure=login_failure),
            input=self.token,
            text=True,
            capture_output=True,
            check=False,
        )

    def test_uses_and_removes_an_isolated_docker_authentication_config(self):
        result = self.run_wrapper()

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("Deployment completed.\n", result.stdout)
        observed_config = Path(self.deployment_log.read_text(encoding="utf-8").splitlines()[0])
        self.assertNotEqual(observed_config, self.docker_config)
        self.assertFalse(observed_config.exists())
        self.assertEqual(
            (self.docker_config / "config.json").read_text(encoding="utf-8"),
            self.config_contents,
        )

    def test_login_failure_cleans_authentication_and_skips_deployment(self):
        result = self.run_wrapper(login_failure=True)

        self.assertNotEqual(result.returncode, 0)
        observed_config = Path(
            self.container_log.read_text(encoding="utf-8").split("|", maxsplit=1)[0]
        )
        self.assertFalse(observed_config.exists())
        self.assertFalse(self.deployment_log.exists())

    def test_external_docker_credential_helpers_are_refused(self):
        (self.docker_config / "config.json").write_text(
            '{"credsStore":"secretservice"}\n',
            encoding="utf-8",
        )

        result = self.run_wrapper()

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("external credential helpers", result.stderr)
        self.assertFalse(self.container_log.exists())
        self.assertFalse(self.deployment_log.exists())


class ComposeReleaseDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="ims-github-deploy-")
        self.root = Path(self.temporary.name)
        self.bin_dir = self.root / "bin"
        self.bin_dir.mkdir()
        self.deploy_root = self.root / "production"
        self.runtime_env = self.root / "production.env"
        self.container_log = self.root / "container.log"
        self.curl_log = self.root / "curl.log"
        write_executable(self.bin_dir / "docker", FAKE_CONTAINER_CLI)
        write_executable(self.bin_dir / "curl", FAKE_CURL)
        if sys.platform == "darwin":
            write_executable(self.bin_dir / "stat", FAKE_STAT)
            write_executable(self.bin_dir / "sha256sum", FAKE_SHA256SUM)
            write_executable(self.bin_dir / "base64", FAKE_BASE64)
            write_executable(self.bin_dir / "flock", FAKE_FLOCK)
            write_executable(self.bin_dir / "mv", FAKE_MV)
        self.runtime_env.write_text(
            "\n".join(
                (
                    "COMPOSE_PROFILES=",
                    "IMS_POSTGRES_PASSWORD=postgres-secret",
                    "IMS_API_NODE_ENV=production",
                    "IMS_API_DATABASE_URL=postgresql://imsweb:secret@postgres:5432/imsweb",
                    "IMS_JWT_SECRET=jwt-secret",
                    "IMS_COOKIE_SECURE=true",
                    "IMS_CLIENT_ADDRESS_SOURCE=nginx",
                    "IMS_OBJECT_STORAGE=s3",
                    "IMS_S3_BUCKET=imsweb-media-public-prod",
                    "IMS_S3_REGION=auto",
                    "IMS_S3_ENDPOINT=https://account.r2.cloudflarestorage.com",
                    "IMS_S3_FORCE_PATH_STYLE=false",
                    "IMS_PUBLIC_READ_URL_BASE=https://objects.example.com",
                    "AWS_ACCESS_KEY_ID=r2-access-key",
                    "AWS_SECRET_ACCESS_KEY=r2-secret-key",
                    "",
                )
            ),
            encoding="utf-8",
        )
        self.runtime_env.chmod(0o600)
        unique = f"{os.getpid()}-{secrets.randbelow(1_000_000_000)}"
        self.compose_source = Path(f"/tmp/imsweb-compose-{unique}.yaml")
        self.compose_source.write_bytes(COMPOSE.read_bytes())

    def tearDown(self):
        self.compose_source.unlink(missing_ok=True)
        self.temporary.cleanup()

    def environment(
        self,
        *,
        fail_container_info: bool = False,
        fail_image: str = "",
    ) -> dict[str, str]:
        environment = os.environ.copy()
        environment.update(
            {
                "PATH": f"{self.bin_dir}:{environment['PATH']}",
                "IMS_RUNTIME_ENV_FILE": str(self.runtime_env),
                "IMS_DEPLOY_DATABASE_ATTEMPTS": "1",
                "IMS_DEPLOY_PROBE_ATTEMPTS": "1",
                "IMS_DEPLOY_PROBE_DELAY_SECONDS": "0",
                "FAKE_CONTAINER_LOG": str(self.container_log),
                "FAKE_CURL_LOG": str(self.curl_log),
                "FAKE_FAIL_CONTAINER_INFO": "true" if fail_container_info else "",
                "FAKE_FAIL_IMAGE": fail_image,
            }
        )
        return environment

    def deploy(
        self,
        release: str,
        commit: str,
        image: str,
        *,
        fail_container_info: bool = False,
        fail_image: str = "",
    ) -> subprocess.CompletedProcess[str]:
        public_origin = "aHR0cHM6Ly93d3cuZXhhbXBsZS5jb20="
        return subprocess.run(
            [
                "bash",
                str(DEPLOY_SCRIPT),
                release,
                commit,
                image,
                str(self.compose_source),
                str(self.deploy_root),
                public_origin,
            ],
            cwd=PROJECT_ROOT,
            env=self.environment(
                fail_container_info=fail_container_info,
                fail_image=fail_image,
            ),
            text=True,
            capture_output=True,
            check=False,
        )

    def test_successful_deployment_records_digest_backup_and_current_release(self):
        image = f"ghcr.io/imas-fan-dev/idol-master-community-api@sha256:{'a' * 64}"
        result = self.deploy("v1.2.3", "1" * 40, image)

        self.assertEqual(result.returncode, 0, result.stderr)
        current = self.deploy_root / "current"
        self.assertTrue(current.is_symlink())
        self.assertEqual(current.resolve(), (self.deploy_root / "releases/v1.2.3").resolve())
        metadata = (current / "metadata").read_text(encoding="utf-8")
        self.assertIn("release=v1.2.3", metadata)
        self.assertIn(f"image={image}", metadata)
        backups = list((self.deploy_root / "backups").glob("*/postgresql.dump"))
        records = list((self.deploy_root / "deployments").glob("*.json"))
        self.assertEqual(len(backups), 1)
        self.assertEqual(len(records), 1)
        self.assertIn(image, records[0].read_text(encoding="utf-8"))
        self.assertIn("/api/news", self.curl_log.read_text(encoding="utf-8"))
        self.assertIn("Deployment completed.\n", result.stdout)

    def test_failed_candidate_restores_previous_image_without_moving_current(self):
        first_image = f"ghcr.io/imas-fan-dev/idol-master-community-api@sha256:{'a' * 64}"
        second_image = f"ghcr.io/imas-fan-dev/idol-master-community-api@sha256:{'b' * 64}"
        first = self.deploy("v1.2.3", "1" * 40, first_image)
        self.assertEqual(first.returncode, 0, first.stderr)

        second = self.deploy(
            "v1.2.4",
            "2" * 40,
            second_image,
            fail_image=second_image,
        )

        self.assertNotEqual(second.returncode, 0)
        self.assertIn("Previous release restored", second.stderr)
        self.assertEqual(
            (self.deploy_root / "current").resolve(),
            (self.deploy_root / "releases/v1.2.3").resolve(),
        )
        command_log = self.container_log.read_text(encoding="utf-8")
        self.assertIn(second_image, command_log)
        self.assertIn(first_image, command_log)

    def test_runtime_secrets_must_not_be_group_readable(self):
        self.runtime_env.chmod(0o640)
        image = f"ghcr.io/imas-fan-dev/idol-master-community-api@sha256:{'a' * 64}"
        result = self.deploy("v1.2.3", "1" * 40, image)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must not be readable or writable by group or others", result.stderr)
        self.assertFalse(self.deploy_root.exists())

    def test_container_daemon_must_be_accessible_to_deployment_user(self):
        image = f"ghcr.io/imas-fan-dev/idol-master-community-api@sha256:{'a' * 64}"
        result = self.deploy(
            "v1.2.3",
            "1" * 40,
            image,
            fail_container_info=True,
        )

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("daemon is not accessible to the deployment user", result.stderr)
        self.assertFalse(self.deploy_root.exists())

    def test_managed_deployment_directories_must_not_be_symbolic_links(self):
        redirected = self.root / "redirected-releases"
        redirected.mkdir()
        self.deploy_root.mkdir()
        (self.deploy_root / "releases").symlink_to(redirected, target_is_directory=True)
        image = f"ghcr.io/imas-fan-dev/idol-master-community-api@sha256:{'a' * 64}"

        result = self.deploy("v1.2.3", "1" * 40, image)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must not be symbolic links", result.stderr)
        self.assertEqual(list(redirected.iterdir()), [])


if __name__ == "__main__":
    unittest.main()
