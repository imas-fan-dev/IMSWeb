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
ROOT_PACKAGE = PROJECT_ROOT / "package.json"
CI_WORKFLOW = PROJECT_ROOT / ".github/workflows/ci.yml"
DEPLOY_WORKFLOW = PROJECT_ROOT / ".github/workflows/deploy.yml"
PREVIEW_DEPLOY_WORKFLOW = PROJECT_ROOT / ".github/workflows/deploy-preview.yml"
PREVIEW_APP_WORKFLOW = PROJECT_ROOT / ".github/workflows/release-preview-app.yml"
APP_RELEASE_SCRIPT = PROJECT_ROOT / "apps/web/scripts/app-release.js"
RENDER_PREVIEW_APP_NOTES_SCRIPT = (
    PROJECT_ROOT / "scripts/deployment/render-preview-app-release-notes.sh"
)
DEPLOY_SCRIPT = PROJECT_ROOT / "scripts/deployment/deploy-compose-release.sh"
PREVIEW_DEPLOY_SCRIPT = PROJECT_ROOT / "scripts/deployment/deploy-compose-preview.sh"
AUTH_DEPLOY_SCRIPT = (
    PROJECT_ROOT / "scripts/deployment/run-authenticated-compose-release.sh"
)
COMPOSE = PROJECT_ROOT / "deploy/compose.yaml"
PREVIEW_COMPOSE = PROJECT_ROOT / "deploy/compose.preview.yaml"
DEPLOYMENT_GUIDE = PROJECT_ROOT / "docs/operations/github-actions-deployment.md"
CHECKOUT_ACTION = (
    "actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803 # v6"
)
NODE_SETUP_ACTION = (
    "actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38 # v6"
)
PNPM_SETUP_ACTION = (
    "pnpm/action-setup@0977fd99725f1db4007ccb2928dbb4e90d06cc86 # v6.0.10"
)
GOOGLE_CHROME_APT_CLEANUP = (
    "sudo rm -f /etc/apt/sources.list.d/google-chrome.list "
    "/etc/apt/sources.list.d/google-chrome.sources"
)
DOCKER_SETUP_BUILDX_ACTION = (
    "docker/setup-buildx-action@bb05f3f5519dd87d3ba754cc423b652a5edd6d2c # v4.2.0"
)
DOCKER_LOGIN_ACTION = (
    "docker/login-action@dbcb813823bdd20940b903addbd779551569679f # v4.6.0"
)
DOCKER_BUILD_PUSH_ACTION = (
    "docker/build-push-action@53b7df96c91f9c12dcc8a07bcb9ccacbed38856a # v7.3.0"
)


FAKE_CONTAINER_CLI = r"""#!/usr/bin/env bash
set -euo pipefail
printf '%s|%s\n' "${IMS_API_IMAGE:-none}" "$*" >> "$FAKE_CONTAINER_LOG"
joined=" $* "
if [[ "$joined" == " info " && "${FAKE_FAIL_CONTAINER_INFO:-}" == "true" ]]; then
    exit 1
elif [[ "$joined" == " info --format {{.DockerRootDir}} " ]]; then
    printf '%s\n' "$FAKE_CONTAINER_ROOT"
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
    def test_root_check_parses_each_deployment_script(self):
        package = ROOT_PACKAGE.read_text(encoding="utf-8")
        for script in (
            "scripts/deployment/deploy-compose-release.sh",
            "scripts/deployment/deploy-compose-preview.sh",
            "scripts/deployment/run-authenticated-compose-release.sh",
        ):
            self.assertIn(f"bash -n {script}", package)

    def test_ci_workflow_splits_affected_validation_lanes(self):
        ci = CI_WORKFLOW.read_text(encoding="utf-8")
        jobs_text = ci.split("\njobs:\n", maxsplit=1)[1]
        job_matches = list(
            re.finditer(r"^  ([a-z][a-z0-9-]*):\n", jobs_text, re.MULTILINE)
        )
        job_names = [match.group(1) for match in job_matches]
        jobs = {}
        for index, match in enumerate(job_matches):
            end = (
                job_matches[index + 1].start()
                if index + 1 < len(job_matches)
                else len(jobs_text)
            )
            jobs[match.group(1)] = jobs_text[match.start():end]

        self.assertEqual(
            job_names,
            ["changes", "repository", "app", "web", "api", "integration", "result"],
        )
        for token in (
            "pull_request:",
            "push:",
            "branches:\n      - main",
            "permissions:\n  contents: read",
            "group: ci-${{ github.workflow }}-${{ github.ref }}",
            "cancel-in-progress: true",
        ):
            self.assertIn(token, ci)

        changes = jobs["changes"]
        self.assertIn("fetch-depth: 0", changes)
        self.assertIn("persist-credentials: false", changes)
        self.assertIn("id: affected", changes)
        self.assertIn("node scripts/ci/detect-affected-workspaces.mjs", changes)
        for token in (
            "CI_EVENT_NAME: ${{ github.event_name }}",
            "CI_BEFORE_SHA: ${{ github.event.before }}",
            "CI_BASE_SHA: ${{ github.event.pull_request.base.sha }}",
            "CI_HEAD_SHA: ${{ github.event_name == 'pull_request' && "
            "github.event.pull_request.head.sha || github.sha }}",
        ):
            self.assertIn(token, changes)
        for output in ("repo", "app", "web", "api", "integration"):
            self.assertIn(
                f"{output}: ${{{{ steps.affected.outputs.{output} }}}}",
                changes,
            )

        lane_outputs = {
            "repository": "repo",
            "app": "app",
            "web": "web",
            "api": "api",
            "integration": "integration",
        }
        for job_name, output in lane_outputs.items():
            job = jobs[job_name]
            self.assertIn("needs: changes", job)
            self.assertIn(f"needs.changes.outputs.{output} == 'true'", job)
            self.assertIn(CHECKOUT_ACTION, job)
            self.assertIn("persist-credentials: false", job)
            self.assertIn(NODE_SETUP_ACTION, job)
            self.assertIn("node-version-file: .nvmrc", job)
            self.assertIn(PNPM_SETUP_ACTION, job)
            self.assertIn("version: 11.10.0", job)
            self.assertIn("run_install: false", job)
            self.assertIn("run: pnpm install --frozen-lockfile", job)

        repository = jobs["repository"]
        for token in (
            "run: pnpm run check:root",
            "node scripts/testing/run-test-owner.mjs governance",
            "node scripts/testing/run-test-owner.mjs contracts",
            "node scripts/testing/run-test-owner.mjs delivery repository",
        ):
            self.assertIn(token, repository)

        app = jobs["app"]
        for token in (
            "node scripts/testing/run-test-owner.mjs delivery app",
            "test:unit tests/unit/scripts/build-app.test.ts",
            GOOGLE_CHROME_APT_CLEANUP,
            "playwright install --with-deps chromium webkit",
            "run build:app",
            "run test:e2e:app",
        ):
            self.assertIn(token, app)

        web = jobs["web"]
        self.assertIn("timeout-minutes: 60", web)
        self.assertIn("node scripts/testing/run-test-owner.mjs delivery web", web)
        self.assertIn(GOOGLE_CHROME_APT_CLEANUP, web)
        self.assertIn("playwright install --with-deps chromium firefox", web)
        self.assertEqual(ci.count(GOOGLE_CHROME_APT_CLEANUP), 2)
        self.assertIn("pnpm --filter @imsweb/web run test -- ci", web)
        self.assertNotIn("--unit-prepared", web)

        api = jobs["api"]
        self.assertIn("pnpm --filter @imsweb/api run test", api)
        for command in ("check", "test:node", "test:server", "test:wiki", "test:migration"):
            self.assertNotIn(f"pnpm --filter @imsweb/api run {command}", api)

        integration = jobs["integration"]
        self.assertIn("pnpm run test:web-routing", integration)
        self.assertNotIn("pnpm --filter @imsweb/api run check:assets", integration)

        for job_name, job in jobs.items():
            if job_name == "api":
                self.assertIn("IMS_TEST_DATABASE_URL:", job)
                self.assertIn("services:\n      postgres:", job)
            else:
                self.assertNotIn("IMS_TEST_DATABASE_URL:", job)
                self.assertNotIn("services:\n      postgres:", job)

        result = jobs["result"]
        self.assertIn("name: Validate repository", result)
        self.assertIn("if: always()", result)
        for dependency in job_names[:-1]:
            self.assertIn(f"- {dependency}", result)
        self.assertIn("needs.changes.result", result)
        for lane, prefix in (
            ("repository", "REPOSITORY"),
            ("app", "APP"),
            ("web", "WEB"),
            ("api", "API"),
            ("integration", "INTEGRATION"),
        ):
            self.assertIn(
                f'verify_lane {lane} "${prefix}_SELECTED" "${prefix}_RESULT"',
                result,
            )
        self.assertIn("success|skipped", result)
        self.assertIn("validation selection/result mismatch", result)
        self.assertNotIn("success|skipped|cancelled", result)

        self.assertEqual(ci.count(CHECKOUT_ACTION), 6)
        self.assertEqual(ci.count(NODE_SETUP_ACTION), 6)
        self.assertEqual(ci.count(PNPM_SETUP_ACTION), 5)
        self.assertEqual(ci.count("node-version-file: .nvmrc"), 6)
        self.assertEqual(ci.count("run: pnpm install --frozen-lockfile"), 5)

    def test_deployment_workflow_uses_complete_release_gates(self):
        deployment = DEPLOY_WORKFLOW.read_text(encoding="utf-8")

        for token in (
            '      - "v*.*.*"',
            "workflow_dispatch:",
            "confirm_data_compatibility:",
            "refs/remotes/origin/main",
            'image_name="ghcr.io/${REPOSITORY,,}-api"',
            "IMAGE_NAME: ${{ needs.prepare.outputs.image_name }}",
            NODE_SETUP_ACTION,
            PNPM_SETUP_ACTION,
            DOCKER_BUILD_PUSH_ACTION,
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

        self.assertEqual(deployment.count("node-version-file: .nvmrc"), 2)
        self.assertEqual(deployment.count(NODE_SETUP_ACTION), 2)

        expected_docker_actions = [
            DOCKER_SETUP_BUILDX_ACTION,
            DOCKER_LOGIN_ACTION,
            DOCKER_BUILD_PUSH_ACTION,
            DOCKER_SETUP_BUILDX_ACTION,
            DOCKER_LOGIN_ACTION,
        ]
        observed_docker_actions = re.findall(
            r"uses:\s+(docker/[^@\s]+@[0-9a-f]{40}\s+#\s+v[^\s]+)",
            deployment,
        )
        self.assertEqual(observed_docker_actions, expected_docker_actions)

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
        self.assertNotIn(
            "IMAGE_NAME: ghcr.io/${{ github.repository }}-api",
            deployment,
        )

    def test_preview_workflow_builds_signs_and_deploys_only_release_branch(self):
        preview = PREVIEW_DEPLOY_WORKFLOW.read_text(encoding="utf-8")

        for token in (
            "name: Deploy preview",
            "push:\n    branches:\n      - release/v1.1",
            "workflow_dispatch:",
            "confirm_preview_deploy:",
            "github.event_name == 'push' || inputs.confirm_preview_deploy",
            'expected_ref="refs/heads/${source_branch}"',
            'source_branch="release/v1.1"',
            'preview_id=preview-${release_sha:0:12}',
            'image_name="ghcr.io/${REPOSITORY,,}-api"',
            "name: Test and publish preview image\n    if: github.event_name == 'push'",
            "run: pnpm run check",
            "run: pnpm run test",
            NODE_SETUP_ACTION,
            PNPM_SETUP_ACTION,
            DOCKER_SETUP_BUILDX_ACTION,
            DOCKER_LOGIN_ACTION,
            DOCKER_BUILD_PUSH_ACTION,
            "preview-sha-${{ needs.prepare.outputs.release_sha }}",
            "actions/attest-build-provenance@",
            "gh attestation verify",
            "github.event_name == 'workflow_dispatch' || needs.publish.result == 'success'",
            '[[ -n "$PUBLISHED_DIGEST" && "$digest" != "$PUBLISHED_DIGEST" ]]',
            ".github/workflows/deploy-preview.yml",
            '--source-ref "refs/heads/${SOURCE_BRANCH}"',
            "name: preview",
            "group: imsweb-preview-build",
            "cancel-in-progress: true",
            "group: imsweb-preview",
            "cancel-in-progress: false",
            "PREVIEW_DEPLOY_SSH_PRIVATE_KEY",
            "PREVIEW_DEPLOY_SSH_KNOWN_HOSTS",
            "PREVIEW_SOURCE_BRANCH",
            "git ls-remote --exit-code",
            'echo "deploy=false" >> "$GITHUB_OUTPUT"',
            "deploy/compose.preview.yaml",
            "scripts/deployment/deploy-compose-preview.sh",
            "scripts/deployment/run-authenticated-compose-release.sh",
            'GHCR_TOKEN: ${{ github.token }}',
            'printf \'%s\' "$GHCR_TOKEN"',
            'grep -Fxq "Preview deployment completed." "$deployment_log"',
            "/api/health/ready",
            "/api/wiki/test",
            "/api/news",
        ):
            self.assertIn(token, preview)

        self.assertNotIn("pull_request:", preview)
        self.assertNotIn("secrets.IMS_JWT_SECRET", preview)
        self.assertNotIn("secrets.AWS_SECRET_ACCESS_KEY", preview)
        self.assertNotIn("secrets.GHCR_TOKEN", preview)
        self.assertNotIn("deploy-compose-release.sh", preview)

        deploy_job = preview.split("\n  deploy:\n", maxsplit=1)[1]
        self.assertIn("      packages: read", deploy_job)
        self.assertIn("environment:\n      name: preview", deploy_job)
        self.assertIn("steps.freshness.outputs.deploy == 'true'", deploy_job)

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
            "deploy-preview.yml",
            "PREVIEW_DEPLOY_SSH_PRIVATE_KEY",
            "PREVIEW_SOURCE_BRANCH",
            "release/v1.1",
            "/home/<deploy-user>/preview",
            "pg_dump",
            "expand/contract",
            "不恢复 PostgreSQL 或 R2",
            "不宣称",
        ):
            self.assertIn(token, guide)

    def test_external_actions_are_pinned_to_full_commit_shas(self):
        workflows = "\n".join(
            path.read_text(encoding="utf-8")
            for path in (
                CI_WORKFLOW,
                DEPLOY_WORKFLOW,
                PREVIEW_DEPLOY_WORKFLOW,
                PREVIEW_APP_WORKFLOW,
            )
        )
        action_references = re.findall(r"uses:\s+[^@\s]+@([^\s]+)", workflows)
        self.assertGreater(len(action_references), 0)
        for reference in action_references:
            with self.subTest(reference=reference):
                self.assertRegex(reference, r"^[0-9a-f]{40}$")

    def test_preview_app_workflow_builds_platforms_independently_from_release_v1_1(self):
        workflow = PREVIEW_APP_WORKFLOW.read_text(encoding="utf-8")

        for token in (
            '      - "app-preview-ios-*"',
            '      - "app-preview-android-*"',
            "workflow_dispatch:",
            "confirm_preview_app_release:",
            "type: choice",
            "permissions:\n  contents: read",
            "if: github.event_name == 'push' || inputs.confirm_preview_app_release",
            'source_branch="release/v1.1"',
            "app-preview-ios-*) platform=\"ios\" ;;",
            "app-preview-android-*) platform=\"android\" ;;",
            "git merge-base --is-ancestor",
            "TZ='America/Los_Angeles' date +%Y%m%d%H%M",
            "date -u -d '2026-01-01T00:00:00Z' +%s",
            "build_number < 1 || build_number > 2100000000",
            'release_tag="app-preview-${platform}-${version_suffix}"',
            "needs.resolve.outputs.platform == 'ios'",
            "needs.resolve.outputs.platform == 'android'",
            "runs-on: macos-26",
            "group: imsweb-preview-app-ios",
            "group: imsweb-preview-app-android",
            "cancel-in-progress: false",
            "node scripts/app-release.js ios",
            "node scripts/app-release.js android",
            "VITE_IMS_API_ORIGIN: https://preview.idol-master.top",
            "VITE_IMS_PUBLIC_SITE_ORIGIN: https://preview.idol-master.top",
            "PREVIEW_ANDROID_KEYSTORE_BASE64: ${{ secrets.PREVIEW_ANDROID_KEYSTORE_BASE64 }}",
            "name: preview",
            "gh release create",
            "--prerelease",
            "render-preview-app-release-notes.sh",
            CHECKOUT_ACTION,
            NODE_SETUP_ACTION,
            PNPM_SETUP_ACTION,
        ):
            with self.subTest(token=token):
                self.assertIn(token, workflow)

        # Both platform jobs need contents: write only to create the release
        # tag; nothing else in the workflow should carry that permission.
        self.assertEqual(workflow.count("contents: write"), 2)

        jobs_text = workflow.split("\njobs:\n", maxsplit=1)[1]
        job_matches = list(
            re.finditer(r"^  ([a-z][a-z0-9-]*):\n", jobs_text, re.MULTILINE)
        )
        job_names = [match.group(1) for match in job_matches]
        self.assertEqual(job_names, ["resolve", "build-ios", "build-android"])

    def test_app_release_script_is_syntax_checked_and_documented(self):
        package = ROOT_PACKAGE.read_text(encoding="utf-8")
        self.assertIn("node --check apps/web/scripts/app-release.js", package)
        self.assertIn(
            "bash -n scripts/deployment/render-preview-app-release-notes.sh",
            package,
        )
        self.assertTrue(APP_RELEASE_SCRIPT.is_file())
        self.assertTrue(RENDER_PREVIEW_APP_NOTES_SCRIPT.is_file())
        mode = RENDER_PREVIEW_APP_NOTES_SCRIPT.stat().st_mode
        self.assertTrue(mode & stat.S_IXUSR, "release notes script must be executable")

        notes = RENDER_PREVIEW_APP_NOTES_SCRIPT.read_text(encoding="utf-8")
        for token in ("Sideloadly", "Apple ID", "未知来源", "7 天"):
            with self.subTest(token=token):
                self.assertIn(token, notes)

        release_script = APP_RELEASE_SCRIPT.read_text(encoding="utf-8")
        for token in (
            "--no-sign",
            "--build-number",
            "bundle: { android: { versionCode: options.buildNumber } }",
            "signApkLocally",
        ):
            with self.subTest(token=token):
                self.assertIn(token, release_script)


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


class ComposePreviewDeploymentTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="ims-preview-deploy-")
        self.root = Path(self.temporary.name)
        self.bin_dir = self.root / "bin"
        self.bin_dir.mkdir()
        self.home = self.root / "home"
        self.deploy_root = self.home / "preview"
        self.config_dir = self.deploy_root / "config"
        self.config_dir.mkdir(parents=True)
        self.container_root = self.home / ".local/share/docker"
        self.container_root.mkdir(parents=True)
        self.runtime_env = self.config_dir / "preview.env"
        self.container_log = self.root / "container.log"
        self.curl_log = self.root / "curl.log"
        write_executable(self.bin_dir / "docker", FAKE_CONTAINER_CLI)
        write_executable(self.bin_dir / "curl", FAKE_CURL)
        if sys.platform == "darwin":
            write_executable(self.bin_dir / "stat", FAKE_STAT)
            write_executable(self.bin_dir / "flock", FAKE_FLOCK)
            write_executable(self.bin_dir / "mv", FAKE_MV)
        self.runtime_env.write_text(
            "\n".join(
                (
                    "COMPOSE_PROJECT_NAME=imsweb-preview",
                    "COMPOSE_PROFILES=local-cache",
                    "IMS_API_IMAGE=imsweb-api:preview",
                    "IMS_API_NODE_ENV=development",
                    "IMS_API_PORT=13000",
                    "IMS_POSTGRES_PORT=15432",
                    "IMS_VALKEY_PORT=16379",
                    "IMS_POSTGRES_PASSWORD=postgres-secret",
                    "IMS_API_DATABASE_URL=postgresql://imsweb_preview:secret@postgres:5432/imsweb_preview",
                    "IMS_BACKOFFICE_JWT_SECRET=backoffice-secret",
                    "IMS_PLATFORM_JWT_SECRET=platform-secret",
                    "IMS_COOKIE_SECURE=false",
                    "IMS_CLIENT_ADDRESS_SOURCE=direct",
                    "IMS_OBJECT_STORAGE=s3",
                    f"IMS_S3_ENDPOINT=https://{'0' * 32}.r2.cloudflarestorage.com",
                    "IMS_S3_REGION=auto",
                    "IMS_S3_FORCE_PATH_STYLE=false",
                    "IMS_S3_BUCKET=imsweb-media-public-test",
                    "IMS_PUBLIC_READ_URL_BASE=https://test.example.com",
                    "AWS_ACCESS_KEY_ID=r2-test-access",
                    "AWS_SECRET_ACCESS_KEY=r2-test-secret",
                    "",
                )
            ),
            encoding="utf-8",
        )
        self.runtime_env.chmod(0o600)
        unique = f"{os.getpid()}-{secrets.randbelow(1_000_000_000)}"
        self.compose_source = Path(f"/tmp/imsweb-preview-compose-{unique}.yaml")
        self.compose_override_source = Path(
            f"/tmp/imsweb-preview-override-{unique}.yaml"
        )
        self.compose_source.write_bytes(COMPOSE.read_bytes())
        self.compose_override_source.write_bytes(PREVIEW_COMPOSE.read_bytes())

    def tearDown(self):
        self.compose_source.unlink(missing_ok=True)
        self.compose_override_source.unlink(missing_ok=True)
        self.temporary.cleanup()

    def environment(self, *, fail_image: str = "") -> dict[str, str]:
        environment = os.environ.copy()
        environment.update(
            {
                "PATH": f"{self.bin_dir}:{environment['PATH']}",
                "HOME": str(self.home),
                "IMS_DEPLOY_PROBE_ATTEMPTS": "1",
                "IMS_DEPLOY_PROBE_DELAY_SECONDS": "0",
                "FAKE_CONTAINER_LOG": str(self.container_log),
                "FAKE_CONTAINER_ROOT": str(self.container_root),
                "FAKE_CURL_LOG": str(self.curl_log),
                "FAKE_FAIL_CONTAINER_INFO": "",
                "FAKE_FAIL_IMAGE": fail_image,
            }
        )
        return environment

    def deploy(
        self,
        commit: str,
        image: str,
        *,
        deploy_root: Path | None = None,
        fail_image: str = "",
    ) -> subprocess.CompletedProcess[str]:
        target_root = deploy_root or self.deploy_root
        return subprocess.run(
            (
                "bash",
                str(PREVIEW_DEPLOY_SCRIPT),
                f"preview-{commit[:12]}",
                commit,
                image,
                str(self.compose_source),
                str(target_root),
                str(self.compose_override_source),
            ),
            cwd=PROJECT_ROOT,
            env=self.environment(fail_image=fail_image),
            text=True,
            capture_output=True,
            check=False,
        )

    def test_successful_preview_deployment_records_digest_and_current_release(self):
        commit = "1" * 40
        image = f"ghcr.io/imas-fan-dev/imsweb-api@sha256:{'a' * 64}"

        result = self.deploy(commit, image)

        self.assertEqual(result.returncode, 0, result.stderr)
        current = self.deploy_root / "current"
        self.assertTrue(current.is_symlink())
        self.assertEqual(
            current.resolve(),
            (self.deploy_root / f"releases/preview-{commit[:12]}").resolve(),
        )
        metadata = (current / "metadata").read_text(encoding="utf-8")
        self.assertIn(f"commit={commit}", metadata)
        self.assertIn(f"image={image}", metadata)
        records = list((self.deploy_root / "deployments").glob("*.json"))
        self.assertEqual(len(records), 1)
        self.assertIn(image, records[0].read_text(encoding="utf-8"))
        command_log = self.container_log.read_text(encoding="utf-8")
        self.assertIn("--project-name imsweb-preview", command_log)
        self.assertIn("up -d --no-build", command_log)
        self.assertIn("--profile local-cache", command_log)
        self.assertNotIn("local-storage", command_log)
        self.assertNotIn("--build", command_log)
        self.assertIn("Preview deployment completed.\n", result.stdout)

    def test_failed_candidate_restores_previous_preview_image(self):
        first_commit = "1" * 40
        second_commit = "2" * 40
        first_image = f"ghcr.io/imas-fan-dev/imsweb-api@sha256:{'a' * 64}"
        second_image = f"ghcr.io/imas-fan-dev/imsweb-api@sha256:{'b' * 64}"
        first = self.deploy(first_commit, first_image)
        self.assertEqual(first.returncode, 0, first.stderr)

        second = self.deploy(second_commit, second_image, fail_image=second_image)

        self.assertNotEqual(second.returncode, 0)
        self.assertIn("Restoring previous preview release", second.stderr)
        self.assertEqual(
            (self.deploy_root / "current").resolve(),
            (self.deploy_root / f"releases/preview-{first_commit[:12]}").resolve(),
        )
        command_log = self.container_log.read_text(encoding="utf-8")
        self.assertIn(second_image, command_log)
        self.assertIn(first_image, command_log)

    def test_preview_environment_must_not_be_group_readable(self):
        self.runtime_env.chmod(0o640)
        image = f"ghcr.io/imas-fan-dev/imsweb-api@sha256:{'a' * 64}"

        result = self.deploy("1" * 40, image)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "must not be readable or writable by group or others",
            result.stderr,
        )

    def test_preview_deploy_root_must_stay_under_user_home(self):
        image = f"ghcr.io/imas-fan-dev/imsweb-api@sha256:{'a' * 64}"

        result = self.deploy("1" * 40, image, deploy_root=self.root / "outside")

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must stay under the deployment user's home", result.stderr)

    def test_preview_object_storage_must_target_a_bucket_with_a_test_segment(self):
        lines = self.runtime_env.read_text(encoding="utf-8").splitlines()
        lines = [
            "IMS_S3_BUCKET=imsweb-media-public-prod" if line.startswith("IMS_S3_BUCKET=") else line
            for line in lines
        ]
        self.runtime_env.write_text("\n".join(lines) + "\n", encoding="utf-8")
        image = f"ghcr.io/imas-fan-dev/imsweb-api@sha256:{'a' * 64}"

        result = self.deploy("1" * 40, image)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must include a distinct test segment", result.stderr)

    def test_preview_object_storage_must_use_an_r2_endpoint(self):
        lines = self.runtime_env.read_text(encoding="utf-8").splitlines()
        lines = [
            "IMS_S3_ENDPOINT=http://rustfs:9000" if line.startswith("IMS_S3_ENDPOINT=") else line
            for line in lines
        ]
        self.runtime_env.write_text("\n".join(lines) + "\n", encoding="utf-8")
        image = f"ghcr.io/imas-fan-dev/imsweb-api@sha256:{'a' * 64}"

        result = self.deploy("1" * 40, image)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn(
            "must be a credential-free Cloudflare R2 HTTPS S3 API endpoint",
            result.stderr,
        )

    def test_preview_object_storage_rejects_path_style_and_non_auto_region(self):
        for bad_line, message in (
            ("IMS_S3_FORCE_PATH_STYLE=true", "must be false for the R2 test bucket"),
            ("IMS_S3_REGION=us-east-1", "must be auto for the R2 test bucket"),
        ):
            with self.subTest(bad_line=bad_line):
                key = bad_line.split("=", 1)[0]
                lines = self.runtime_env.read_text(encoding="utf-8").splitlines()
                lines = [bad_line if line.startswith(f"{key}=") else line for line in lines]
                self.runtime_env.write_text("\n".join(lines) + "\n", encoding="utf-8")
                image = f"ghcr.io/imas-fan-dev/imsweb-api@sha256:{'a' * 64}"

                result = self.deploy("1" * 40, image)

                self.assertNotEqual(result.returncode, 0)
                self.assertIn(message, result.stderr)


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
