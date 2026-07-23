import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
SCRIPT = PROJECT_ROOT / "scripts" / "migration" / "activate-node-release.sh"
PREFLIGHT = PROJECT_ROOT / "scripts" / "migration" / "preflight-node-release.cjs"


MAIN_MODULE = """\
'use strict';
require('release-dependency');
exports.startServer = function startServer() { throw new Error('probe must not listen'); };
exports.createHonoApp = function createHonoApp(resolveServices) {
    return {
        request: async function request(url, options) {
            const services = await resolveServices({});
            const target = new URL(url);
            if (target.pathname === '/') target.pathname = '/index.html';
            return services.staticAssets.fetch(new Request(target, options));
        }
    };
};
exports.honoApp = exports.createHonoApp(() => ({}));
exports.app = function app() {};
exports.closeDatabase = async function closeDatabase() {};
"""

STATIC_MODULE = """\
'use strict';
const fs = require('node:fs');
const path = require('node:path');
exports.NodeStaticAssets = class NodeStaticAssets {
    constructor(publicDir) { this.publicDir = publicDir; }
    async fetch(request) {
        const name = new URL(request.url).pathname.replace(/^\\/+/, '');
        const body = fs.readFileSync(path.join(this.publicDir, name));
        if (request.method === 'HEAD') {
            return new Response(null, { status: 200, headers: { 'Content-Length': String(body.length) } });
        }
        const range = request.headers.get('range');
        if (range === 'bytes=1-3') {
            return new Response(body.subarray(1, 4), {
                status: 206,
                headers: {
                    'Content-Length': '3',
                    'Content-Range': `bytes 1-3/${body.length}`
                }
            });
        }
        return new Response(body, { status: 200, headers: { 'Content-Length': String(body.length) } });
    }
};
"""


def write_file(root: Path, relative: str, content: str) -> None:
    destination = root / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(content, encoding="utf-8")


def make_release(staging: Path, *, missing_dependency: bool = False) -> None:
    write_file(
        staging,
        "package.json",
        json.dumps({"private": True, "packageManager": "pnpm@11.10.0"}) + "\n",
    )
    frozen_lock = """\
lockfileVersion: '9.0'

importers:

  .: {}

  apps/api:
    dependencies:
      release-dependency:
        specifier: 1.0.0
        version: 1.0.0

packages:

  release-dependency@1.0.0: {}

snapshots:

  release-dependency@1.0.0: {}
"""
    write_file(staging, "pnpm-lock.yaml", frozen_lock)
    write_file(staging, "pnpm-workspace.yaml", "packages:\n  - apps/*\n")
    write_file(
        staging,
        "apps/api/package.json",
        json.dumps({
            "name": "@fixture/hono",
            "type": "commonjs",
            "dependencies": {"release-dependency": "1.0.0"},
        }) + "\n",
    )
    write_file(staging, "apps/api/dist/server/main.js", MAIN_MODULE)
    write_file(
        staging,
        "apps/api/dist/server/adapters/node/node-static-assets.js",
        STATIC_MODULE,
    )
    client = "<!doctype html><title>release probe</title>\n"
    write_file(staging, "apps/api/dist/client/index.html", client)
    write_file(staging, "apps/api/dist/client/assets/app.css", "body { color: black; }\n")
    write_file(staging, "apps/api/dist/client/assets/app.js", "globalThis.releaseProbe = true;\n")
    write_file(staging, "apps/api/dist/client/assets/logo.png", "fixture-png\n")
    allowlist_files = ["assets/app.css", "assets/app.js", "assets/logo.png", "index.html"]
    allowlist = json.dumps({"version": 1, "files": allowlist_files}, indent=2) + "\n"
    write_file(staging, "apps/api/scripts/build/client-allowlist.json", allowlist)
    write_file(staging, "apps/api/dist/client-allowlist.json", allowlist)
    write_file(
        staging,
        "apps/api/dist/client-r2-assets.json",
        json.dumps({
            "generatedAt": "2026-07-21T00:00:00.000Z",
            "assets": [
                {
                    "url": "/runninggame/Build/webgame.data",
                    "logicalKey": "unity/runninggame/Build/webgame.data",
                    "bytes": 10,
                },
                {
                    "url": "/runninggame/BuildMobile/webgame.data",
                    "logicalKey": "unity/runninggame/BuildMobile/webgame.data",
                    "bytes": 20,
                },
            ],
        }, indent=2) + "\n",
    )
    for relative in allowlist_files:
        source = staging / "apps/api/dist/client" / relative
        write_file(staging, f"apps/api/dist/node-client/{relative}", source.read_text(encoding="utf-8"))
    write_file(staging, "apps/api/dist/node-client/runninggame/Build/webgame.data", "0123456789")
    write_file(
        staging,
        "apps/api/dist/node-client/runninggame/BuildMobile/webgame.data",
        "01234567890123456789",
    )
    write_file(staging, "node_modules/.pnpm/lock.yaml", frozen_lock)
    write_file(
        staging,
        "node_modules/.modules.yaml",
        json.dumps(
            {
                "hoistedDependencies": {},
                "nodeLinker": "isolated",
                "packageManager": "pnpm@11.10.0",
                "virtualStoreDir": ".pnpm",
                "virtualStoreDirMaxLength": 120,
            },
            indent=2,
        ) + "\n",
    )
    (staging / "apps/api/node_modules").mkdir(parents=True, exist_ok=True)
    if not missing_dependency:
        write_file(
            staging,
            "apps/api/node_modules/release-dependency/index.js",
            "module.exports = { loaded: true };\n",
        )
        write_file(
            staging,
            "apps/api/node_modules/release-dependency/package.json",
            json.dumps({"name": "release-dependency", "version": "1.0.0"}) + "\n",
        )


def deployment_environment(root: Path, releases: Path, current: Path) -> dict[str, str]:
    shared = root / "shared"
    for directory in ("compensation", "uploads", "Data", "events"):
        (shared / directory).mkdir(parents=True, exist_ok=True)
    for database in ("core.db", "story.db"):
        (shared / database).write_bytes(b"database fixture")
    environment = os.environ.copy()
    environment.update(
        {
            "NODE_ENV": "test",
            "IMS_RELEASES_DIR": str(releases),
            "IMS_CURRENT_LINK": str(current),
            "IMS_PROJECT_ROOT": str(current),
            "IMS_PUBLIC_DIR": str(current / "apps/api/dist/node-client"),
            "IMS_DB_PATH": str(shared / "core.db"),
            "IMS_COMPENSATION_DIR": str(shared / "compensation"),
            "IMS_UPLOADS_DIR": str(shared / "uploads"),
            "IMS_STORY_DB_PATH": str(shared / "story.db"),
            "IMS_STORY_DATA_DIR": str(shared / "Data"),
            "IMS_EVENT_BASE_DIR": str(shared / "events"),
        }
    )
    return environment


def run_activation(
    staging: Path,
    release_id: str,
    environment: dict[str, str],
) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        ["sh", str(SCRIPT), str(staging), release_id],
        cwd=PROJECT_ROOT,
        env=environment,
        capture_output=True,
        text=True,
        timeout=15,
        check=False,
    )


class ReleaseActivationTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary_directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary_directory.cleanup)
        self.root = Path(self.temporary_directory.name).resolve()
        self.releases = self.root / "releases"
        self.releases.mkdir()
        self.current = self.root / "current"
        self.environment = deployment_environment(self.root, self.releases, self.current)

    def stage(self, release_id: str, **options: bool) -> Path:
        staging = self.releases / f".staging-{release_id}"
        make_release(staging, **options)
        return staging

    def activate(self, release_id: str, **options: bool) -> subprocess.CompletedProcess[str]:
        return run_activation(self.stage(release_id, **options), release_id, self.environment)

    def test_runnable_release_atomically_replaces_current_symlink(self):
        old_release = self.releases / "old"
        old_release.mkdir()
        self.current.symlink_to(old_release)
        staging = self.stage("release-1")

        result = run_activation(staging, "release-1", self.environment)

        self.assertEqual(result.returncode, 0, result.stderr)
        final = self.releases / "release-1"
        self.assertFalse(staging.exists())
        self.assertEqual((final / "apps/api/dist/node-client/index.html").read_text(), "<!doctype html><title>release probe</title>\n")
        self.assertTrue((final / "apps/api/node_modules/release-dependency/index.js").is_file())
        self.assertTrue(self.current.is_symlink())
        self.assertEqual(self.current.resolve(), final.resolve())
        self.assertIn("action=activate", result.stdout)
        self.assertFalse((self.releases / ".activate.lock").exists())

    def test_missing_dependency_is_rejected_before_release_rename(self):
        staging = self.stage("missing-dependency", missing_dependency=True)

        result = run_activation(staging, "missing-dependency", self.environment)

        self.assertEqual(result.returncode, 1)
        self.assertIn("production dependency release-dependency", result.stderr)
        self.assertTrue(staging.is_dir())
        self.assertFalse((self.releases / "missing-dependency").exists())
        self.assertFalse(self.current.exists())

    def test_placeholder_entry_and_missing_static_build_are_rejected(self):
        placeholder = self.stage("placeholder")
        (placeholder / "apps/api/dist/server/main.js").write_text("module.exports = {};\n")
        placeholder_result = run_activation(placeholder, "placeholder", self.environment)
        self.assertEqual(placeholder_result.returncode, 1)
        self.assertIn("expected Node runtime contract", placeholder_result.stderr)
        self.assertTrue(placeholder.is_dir())

        no_public = self.stage("no-public")
        (no_public / "apps/api/dist/node-client/index.html").unlink()
        public_result = run_activation(no_public, "no-public", self.environment)
        self.assertEqual(public_result.returncode, 1)
        self.assertIn("dist/node-client/index.html", public_result.stderr)
        self.assertTrue(no_public.is_dir())

    def test_missing_css_javascript_or_image_is_rejected(self):
        for index, relative in enumerate(("assets/app.css", "assets/app.js", "assets/logo.png")):
            with self.subTest(relative=relative):
                release_id = f"missing-static-{index}"
                staging = self.stage(release_id)
                (staging / "apps/api/dist/client" / relative).unlink()

                result = run_activation(staging, release_id, self.environment)

                self.assertEqual(result.returncode, 1)
                self.assertIn("dist/client tree is not the exact reviewed client allowlist", result.stderr)
                self.assertTrue(staging.is_dir())

    def test_frozen_lock_and_installed_metadata_must_match(self):
        mismatched = self.stage("lock-mismatch")
        (mismatched / "node_modules/.pnpm/lock.yaml").write_text(
            "lockfileVersion: '9.0'\n",
            encoding="utf-8",
        )
        mismatch_result = run_activation(mismatched, "lock-mismatch", self.environment)
        self.assertEqual(mismatch_result.returncode, 1)
        self.assertIn("installed pnpm lock does not match", mismatch_result.stderr)
        self.assertTrue(mismatched.is_dir())

        synthetic = self.stage("synthetic-lock")
        for relative in ("pnpm-lock.yaml", "node_modules/.pnpm/lock.yaml"):
            (synthetic / relative).write_text("lockfileVersion: '9.0'\n", encoding="utf-8")
        synthetic_result = run_activation(synthetic, "synthetic-lock", self.environment)
        self.assertEqual(synthetic_result.returncode, 1)
        self.assertIn("apps/api importer", synthetic_result.stderr)
        self.assertTrue(synthetic.is_dir())

        wrong_metadata = self.stage("wrong-install-metadata")
        (wrong_metadata / "node_modules/.modules.yaml").write_text(
            json.dumps({
                "packageManager": "pnpm@11.9.0",
                "virtualStoreDir": ".other-store",
            }) + "\n",
            encoding="utf-8",
        )
        metadata_result = run_activation(
            wrong_metadata, "wrong-install-metadata", self.environment
        )
        self.assertEqual(metadata_result.returncode, 1)
        self.assertIn("packageManager or virtual store", metadata_result.stderr)
        self.assertTrue(wrong_metadata.is_dir())

    def test_relative_or_release_local_mutable_path_is_rejected(self):
        relative = self.stage("relative")
        relative_environment = self.environment.copy()
        relative_environment["IMS_UPLOADS_DIR"] = "relative/uploads"
        relative_result = run_activation(relative, "relative", relative_environment)
        self.assertEqual(relative_result.returncode, 1)
        self.assertIn("IMS_UPLOADS_DIR must be an absolute path", relative_result.stderr)
        self.assertTrue(relative.is_dir())

        inside = self.stage("inside")
        unsafe_uploads = self.releases / "mutable-uploads"
        unsafe_uploads.mkdir()
        inside_environment = self.environment.copy()
        inside_environment["IMS_UPLOADS_DIR"] = str(unsafe_uploads)
        inside_result = run_activation(inside, "inside", inside_environment)
        self.assertEqual(inside_result.returncode, 1)
        self.assertIn("outside IMS_RELEASES_DIR", inside_result.stderr)
        self.assertTrue(inside.is_dir())

    def test_s3_release_does_not_require_local_media_directories(self):
        staging = self.stage("s3-storage")
        environment = self.environment.copy()
        environment.update(
            {
                "IMS_OBJECT_STORAGE": "s3",
                "IMS_S3_BUCKET": "ims-media-prod",
                "IMS_S3_REGION": "ap-northeast-1",
            }
        )
        for name in ("IMS_UPLOADS_DIR", "IMS_STORY_DATA_DIR", "IMS_EVENT_BASE_DIR"):
            environment.pop(name)

        result = run_activation(staging, "s3-storage", environment)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertTrue(self.current.is_symlink())

    def test_project_and_public_must_follow_stable_current_link(self):
        wrong_public = self.stage("wrong-public")
        public_environment = self.environment.copy()
        public_environment["IMS_PUBLIC_DIR"] = str(
            self.current / "apps/api/dist/client"
        )
        public_result = run_activation(wrong_public, "wrong-public", public_environment)
        self.assertEqual(public_result.returncode, 1)
        self.assertIn("dist/node-client", public_result.stderr)
        self.assertTrue(wrong_public.is_dir())

        wrong_project = self.stage("wrong-project")
        project_environment = self.environment.copy()
        project_environment["IMS_PROJECT_ROOT"] = str(self.root / "old-project")
        project_result = run_activation(wrong_project, "wrong-project", project_environment)
        self.assertEqual(project_result.returncode, 1)
        self.assertIn("IMS_PROJECT_ROOT must be the stable current", project_result.stderr)
        self.assertTrue(wrong_project.is_dir())

    def test_mutable_paths_must_be_pairwise_disjoint(self):
        staging = self.stage("overlap")
        uploads = Path(self.environment["IMS_UPLOADS_DIR"])
        nested_compensation = uploads / "compensation"
        nested_compensation.mkdir()
        environment = self.environment.copy()
        environment["IMS_COMPENSATION_DIR"] = str(nested_compensation)

        result = run_activation(staging, "overlap", environment)

        self.assertEqual(result.returncode, 1)
        self.assertIn("IMS_COMPENSATION_DIR and IMS_UPLOADS_DIR must be disjoint", result.stderr)
        self.assertTrue(staging.is_dir())

    def test_mutable_database_paths_cannot_share_an_inode(self):
        staging = self.stage("hard-linked-databases")
        core_database = Path(self.environment["IMS_DB_PATH"])
        story_database = Path(self.environment["IMS_STORY_DB_PATH"])
        story_database.unlink()
        os.link(core_database, story_database)

        result = run_activation(staging, "hard-linked-databases", self.environment)

        self.assertEqual(result.returncode, 1)
        self.assertIn(
            "IMS_DB_PATH and IMS_STORY_DB_PATH must be disjoint and cannot identify the same filesystem object",
            result.stderr,
        )
        self.assertTrue(staging.is_dir())

    def test_mutable_path_under_current_or_through_symlink_is_rejected(self):
        old_release = self.releases / "old"
        (old_release / "mutable-uploads").mkdir(parents=True)
        self.current.symlink_to(old_release)
        lexical = self.stage("lexical")
        lexical_environment = self.environment.copy()
        lexical_environment["IMS_UPLOADS_DIR"] = str(self.current / "mutable-uploads")
        lexical_result = run_activation(lexical, "lexical", lexical_environment)
        self.assertEqual(lexical_result.returncode, 1)
        self.assertIn("lexical IMS_CURRENT_LINK tree", lexical_result.stderr)
        self.assertTrue(lexical.is_dir())

        self.current.unlink()
        alias = self.root / "shared-alias"
        alias.symlink_to(self.root / "shared", target_is_directory=True)
        symlinked = self.stage("symlinked")
        symlink_environment = self.environment.copy()
        symlink_environment["IMS_UPLOADS_DIR"] = str(alias / "uploads")
        symlink_result = run_activation(symlinked, "symlinked", symlink_environment)
        self.assertEqual(symlink_result.returncode, 1)
        self.assertIn("symbolic link", symlink_result.stderr)
        self.assertTrue(symlinked.is_dir())

    def test_required_file_or_dependency_cannot_escape_staging(self):
        outside_main = self.root / "outside-main.js"
        outside_main.write_text(MAIN_MODULE)
        linked_file = self.stage("linked-file")
        (linked_file / "apps/api/dist/server/main.js").unlink()
        (linked_file / "apps/api/dist/server/main.js").symlink_to(outside_main)
        file_result = run_activation(linked_file, "linked-file", self.environment)
        self.assertEqual(file_result.returncode, 1)
        self.assertIn("symbolic link", file_result.stderr)
        self.assertTrue(linked_file.is_dir())

        outside_dependency = self.root / "outside-dependency"
        outside_dependency.mkdir()
        write_file(outside_dependency, "index.js", "module.exports = {};\n")
        write_file(outside_dependency, "package.json", '{"name":"release-dependency","version":"1.0.0"}\n')
        linked_dependency = self.stage("linked-dependency", missing_dependency=True)
        (linked_dependency / "apps/api/node_modules/release-dependency").symlink_to(
            outside_dependency,
            target_is_directory=True,
        )
        dependency_result = run_activation(linked_dependency, "linked-dependency", self.environment)
        self.assertEqual(dependency_result.returncode, 1)
        self.assertIn("escapes the release root", dependency_result.stderr)
        self.assertTrue(linked_dependency.is_dir())

    def test_real_directory_or_lock_path_cannot_be_current(self):
        self.current.mkdir()
        directory_staging = self.stage("directory-current")
        directory_result = run_activation(directory_staging, "directory-current", self.environment)
        self.assertEqual(directory_result.returncode, 1)
        self.assertIn("absent or a symbolic link", directory_result.stderr)
        self.assertTrue(directory_staging.is_dir())
        self.current.rmdir()

        lock_current = self.releases / ".activate.lock"
        lock_environment = self.environment.copy()
        lock_environment["IMS_CURRENT_LINK"] = str(lock_current)
        lock_environment["IMS_PROJECT_ROOT"] = str(lock_current)
        lock_environment["IMS_PUBLIC_DIR"] = str(lock_current / "apps/api/dist/node-client")
        lock_staging = self.stage("lock-current")
        lock_result = run_activation(lock_staging, "lock-current", lock_environment)
        self.assertEqual(lock_result.returncode, 1)
        self.assertIn("activation lock", lock_result.stderr)
        self.assertTrue(lock_staging.is_dir())
        self.assertFalse((self.releases / "lock-current").exists())

    def test_atomic_rollback_repoints_current_to_existing_release(self):
        first = self.activate("release-1")
        self.assertEqual(first.returncode, 0, first.stderr)
        second = self.activate("release-2")
        self.assertEqual(second.returncode, 0, second.stderr)
        self.assertEqual(self.current.resolve(), (self.releases / "release-2").resolve())

        rollback = subprocess.run(
            ["sh", str(SCRIPT), "--rollback", "release-1"],
            cwd=PROJECT_ROOT,
            env=self.environment,
            capture_output=True,
            text=True,
            timeout=15,
            check=False,
        )

        self.assertEqual(rollback.returncode, 0, rollback.stderr)
        self.assertIn("action=rollback", rollback.stdout)
        self.assertEqual(self.current.resolve(), (self.releases / "release-1").resolve())
        self.assertTrue((self.releases / "release-2").is_dir())

    def test_script_has_no_live_code_copy_path(self):
        source = SCRIPT.read_text(encoding="utf-8")
        self.assertIn('mv "$staging" "$final"', source)
        self.assertIn("renameSync", source)
        self.assertIn("--rollback", source)
        self.assertNotRegex(source, r"\b(?:cp|rsync)\b")
        subprocess.run(["node", "--check", str(PREFLIGHT)], check=True, cwd=PROJECT_ROOT)


if __name__ == "__main__":
    unittest.main()
