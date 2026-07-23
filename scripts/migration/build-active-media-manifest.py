#!/usr/bin/env python3
"""Create the formal R2 manifest only after the legacy data gate passes."""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile


ROOT = Path(__file__).resolve().parents[2]
AUDIT_SCRIPT = ROOT / "scripts" / "audit" / "legacy-data-audit.py"
R2_MANIFEST_SCRIPT = ROOT / "apps" / "api" / "scripts" / "migration" / "r2-manifest.js"
UNITY_FILES = ("Build/webgame.data", "BuildMobile/webgame.data")


def load_audit_module():
    spec = importlib.util.spec_from_file_location("ims_legacy_data_audit", AUDIT_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load audit module: {AUDIT_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def absolute_path(value: str, label: str, kind: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise ValueError(f"{label} must be an absolute path")
    if path.is_symlink():
        raise ValueError(f"{label} must not be a symbolic link")
    try:
        resolved = path.resolve(strict=True)
    except FileNotFoundError as error:
        raise ValueError(f"{label} does not exist: {path}") from error
    if kind == "file" and not resolved.is_file():
        raise ValueError(f"{label} must be a regular file")
    if kind == "directory" and not resolved.is_dir():
        raise ValueError(f"{label} must be a directory")
    return resolved


def output_path(value: str, label: str) -> Path:
    path = Path(value).expanduser()
    if not path.is_absolute():
        raise ValueError(f"{label} must be an absolute path")
    parent = path.parent.resolve(strict=True)
    if not parent.is_dir():
        raise ValueError(f"{label} parent must be a directory")
    return parent / path.name


def write_json_exclusive(path: Path, payload: dict) -> bytes:
    encoded = (json.dumps(payload, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode("utf-8")
    descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(encoded)
            stream.flush()
            os.fsync(stream.fileno())
    except Exception:
        try:
            path.unlink()
        except FileNotFoundError:
            pass
        raise
    return encoded


def stat_identity(value: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (
        value.st_dev, value.st_ino, value.st_mode, value.st_size,
        value.st_mtime_ns, value.st_ctime_ns,
    )


def stable_file_proof(path: Path) -> tuple[tuple[int, ...], str]:
    before = path.stat(follow_symlinks=False)
    if not stat.S_ISREG(before.st_mode):
        raise ValueError(f"source must be a regular file: {path}")
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    after = path.stat(follow_symlinks=False)
    if stat_identity(before) != stat_identity(after):
        raise RuntimeError(f"source changed while hashing: {path}")
    return stat_identity(after), digest.hexdigest()


def directory_proof(root: Path) -> tuple[tuple[str, tuple[int, ...]], ...]:
    proof = [(".", stat_identity(root.stat(follow_symlinks=False)))]
    for current, directories, files in os.walk(root, followlinks=False):
        current_path = Path(current)
        for name in sorted([*directories, *files]):
            candidate = current_path / name
            value = candidate.stat(follow_symlinks=False)
            if stat.S_ISLNK(value.st_mode):
                raise ValueError(f"source tree contains a symbolic link: {candidate}")
            if not (stat.S_ISDIR(value.st_mode) or stat.S_ISREG(value.st_mode)):
                raise ValueError(f"source tree contains a non-regular entry: {candidate}")
            proof.append((candidate.relative_to(root).as_posix(), stat_identity(value)))
    return tuple(proof)


def report_source_proof(source_proof: dict) -> dict:
    files = {}
    for path, (identity, digest) in source_proof["files"].items():
        files[path] = {"stat": list(identity), "sha256": digest}
    directories = {}
    for path, proof in source_proof["directories"].items():
        encoded = json.dumps(proof, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        directories[path] = {
            "entries": len(proof),
            "proof_sha256": hashlib.sha256(encoded).hexdigest(),
        }
    return {"files": files, "directories": directories}


def run_manifest_command(arguments: list[str]) -> None:
    result = subprocess.run(
        ["node", str(R2_MANIFEST_SCRIPT), *arguments],
        cwd=ROOT,
        capture_output=True,
        text=True,
        check=False,
    )
    if result.returncode != 0:
        detail = result.stderr.strip() or result.stdout.strip()
        raise RuntimeError(f"R2 manifest command failed ({result.returncode}): {detail}")


def build_formal_manifest(args: argparse.Namespace) -> dict:
    core_db = absolute_path(args.core_db, "--core-db", "file")
    story_db = absolute_path(args.story_db, "--story-db", "file")
    uploads = absolute_path(args.uploads, "--uploads", "directory")
    story_data = absolute_path(args.story_data, "--story-data", "directory")
    event_base = absolute_path(args.event_base, "--event-base", "directory")
    compensation = absolute_path(args.compensation_dir, "--compensation-dir", "directory")
    unity_root = absolute_path(args.unity_root, "--unity-root", "directory")
    output = output_path(args.output, "--output")
    audit_report = output_path(args.audit_report, "--audit-report")
    if output == audit_report:
        raise ValueError("--output and --audit-report must be different files")
    if output.exists():
        raise ValueError(f"formal manifest already exists: {output}")
    if audit_report.exists():
        raise ValueError(f"audit report already exists: {audit_report}")
    disposition = None
    if args.compensation_disposition:
        disposition = absolute_path(
            args.compensation_disposition, "--compensation-disposition", "file"
        )
    for database in (core_db, story_db):
        for suffix in ("-wal", "-journal", "-shm"):
            if Path(f"{database}{suffix}").exists():
                raise ValueError(f"database sidecar is not allowed for a frozen source: {database}{suffix}")

    file_sources = (core_db, story_db, *((disposition,) if disposition else ()))
    directory_sources = (uploads, story_data, event_base, compensation, unity_root)
    for target in (output, audit_report):
        if any(target.is_relative_to(source) for source in directory_sources):
            raise ValueError(f"output must be outside every source tree: {target}")
    source_proof = {
        "files": {str(path): stable_file_proof(path) for path in file_sources},
        "directories": {str(path): directory_proof(path) for path in directory_sources},
    }

    audit = load_audit_module()
    audit.PATHS.update(
        {
            "core_db": core_db,
            "story_db": story_db,
            "uploads": uploads,
            "story_data": story_data,
            "event_base": event_base,
            "compensation": compensation,
        }
    )
    report = audit.build_report(details=True, compensation_disposition=disposition)
    report["run_id"] = args.run_id
    report["source_proof"] = report_source_proof(source_proof)
    audit_bytes = write_json_exclusive(audit_report, report)
    if not report["migration_ready"]:
        raise MigrationGateError(
            f"strict data gate failed; formal manifest was not created (report: {audit_report})"
        )

    with tempfile.TemporaryDirectory(prefix="ims-r2-manifest-", dir=output.parent) as temporary:
        temporary_path = Path(temporary)
        components = []

        def audit_tree(
            name: str, source: Path, prefix: str, state: str = "ready",
            includes: tuple[str, ...] = (),
        ) -> None:
            component = temporary_path / f"{name}.json"
            command = "audit-files" if includes else "audit"
            command_args = [
                command, str(source), str(component), args.run_id,
                "--logical-prefix", prefix, "--state", state,
            ]
            for include in includes:
                command_args.extend(["--include", include])
            run_manifest_command(command_args)
            components.append(component)

        audit_tree("uploads", uploads, "uploads")
        audit_tree("story", story_data, "Data")
        audit_tree(
            "chronicle-used", event_base / "used",
            "assets/images/eventchronicle/events/used",
        )
        audit_tree(
            "chronicle-upload", event_base / "upload",
            "assets/images/eventchronicle/events/upload", state="pending",
        )
        audit_tree(
            "unity-data", unity_root, "unity/runninggame", includes=UNITY_FILES,
        )

        merged = temporary_path / "merged.json"
        run_manifest_command([
            "merge", str(merged), *(str(component) for component in components)
        ])
        final_source_proof = {
            "files": {str(path): stable_file_proof(path) for path in file_sources},
            "directories": {str(path): directory_proof(path) for path in directory_sources},
        }
        if final_source_proof != source_proof:
            raise RuntimeError("a frozen source changed during formal manifest generation")
        document = json.loads(merged.read_text(encoding="utf-8"))
        document["auditGate"] = {
            "version": 1,
            "runId": args.run_id,
            "migrationReady": True,
            "report": str(audit_report),
            "sha256": hashlib.sha256(audit_bytes).hexdigest(),
            "sourceProof": report["source_proof"],
            "compensationDisposition": report["compensation"].get("disposition"),
        }
        write_json_exclusive(output, document)

    return {
        "runId": args.run_id,
        "manifest": str(output),
        "auditReport": str(audit_report),
        "entries": len(document["manifest"]["entries"]),
        "scopes": document["manifest"]["scopes"],
        "unityLogicalKeys": [
            entry["logicalKey"]
            for entry in document["manifest"]["entries"]
            if entry["logicalKey"].startswith("unity/runninggame/")
        ],
    }


class MigrationGateError(RuntimeError):
    pass


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build an audit-gated R2 manifest from one legacy recovery point"
    )
    parser.add_argument("--core-db", required=True)
    parser.add_argument("--story-db", required=True)
    parser.add_argument("--uploads", required=True)
    parser.add_argument("--story-data", required=True)
    parser.add_argument("--event-base", required=True)
    parser.add_argument("--compensation-dir", required=True)
    parser.add_argument("--compensation-disposition")
    parser.add_argument("--unity-root", required=True)
    parser.add_argument("--run-id", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--audit-report", required=True)
    args = parser.parse_args(argv)
    if re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,79}", args.run_id) is None:
        parser.error("--run-id must match [A-Za-z0-9][A-Za-z0-9._-]{0,79}")
    return args


def main(argv: list[str] | None = None) -> int:
    try:
        result = build_formal_manifest(parse_args(argv))
    except MigrationGateError as error:
        print(str(error), file=sys.stderr)
        return 2
    except (OSError, ValueError, RuntimeError, json.JSONDecodeError) as error:
        print(str(error), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
