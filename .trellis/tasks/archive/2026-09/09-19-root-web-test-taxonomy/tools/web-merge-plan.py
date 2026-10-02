#!/usr/bin/env python3
"""Build a same-family merge plan for apps/web/tests/unit.

Rule: group by (directory, first kebab segment of the basename); the target file
is named after the longest kebab prefix the members share, so `use-namecard-*`
merges into `use-namecard.test.tsx` rather than `use.test.tsx`. Single-member
families are kept as they are.
"""
import collections
import json
import pathlib
import re
import sys

root = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else "apps/web/tests/unit")
out = pathlib.Path(sys.argv[2] if len(sys.argv) > 2 else "web-merge-plan.json")

files = sorted(p for p in root.rglob("*.test.ts*") if p.is_file())
USAGE = re.compile(r"(?<![\w.])(?:it|test)(?:\.each)?\s*[\(`]")

def segments(name: str) -> list[str]:
    return name.split(".")

def stem(p: pathlib.Path) -> str:
    return p.name.split(".test.")[0]

def common_prefix(names: list[str]) -> list[str]:
    split = [n.split("-") for n in names]
    prefix: list[str] = []
    for parts in zip(*split, strict=False):
        if len(set(parts)) != 1:
            break
        prefix.append(parts[0])
    return prefix

by_family: dict[tuple[str, str], list[pathlib.Path]] = collections.defaultdict(list)
for p in files:
    by_family[(str(p.relative_to(root).parent), stem(p).split("-")[0])].append(p)

merges = []
kept = []
for (directory, group), members in sorted(by_family.items()):
    if len(members) == 1:
        kept.append(str(members[0].relative_to(root)))
        continue
    names = sorted(stem(m) for m in members)
    prefix = common_prefix(names) or [group]
    ext = ".tsx" if any(m.name.endswith(".tsx") for m in members) else ".ts"
    target = f"{'-'.join(prefix)}{'.test'}{ext}"
    cases = 0
    for m in members:
        cases += len(USAGE.findall(m.read_text(encoding="utf-8", errors="replace")))
    merges.append({
        "target": f"{directory}/{target}" if directory != "." else target,
        "dir": directory,
        "ext": ext.lstrip("."),
        "family": "-".join(prefix),
        "members": [str(m.relative_to(root)) for m in sorted(members)],
        "files": len(members),
        "cases": cases,
        "seconds": None,
        "risk": ["新文件名"] if target.split(".test.")[0] not in names else [],
    })

plan = {
    "generatedAt": None,
    "rule": "同目录 + basename 首个 kebab 段成族；目标名取族内成员的最长 kebab 公共前缀",
    "caps": {"cases": 120, "seconds": 20},
    "before": {"files": len(files), "cases": sum(len(USAGE.findall(p.read_text(encoding='utf-8', errors='replace'))) for p in files)},
    "after": {"files": len(files) - sum(m["files"] - 1 for m in merges)},
    "merges": merges,
    "kept": kept,
}
out.write_text(json.dumps(plan, ensure_ascii=False, indent=2), encoding="utf-8")
print(f'族 {len(by_family)}；多成员 {len(merges)}；单成员 {len(kept)}')
print(f'文件 {plan["before"]["files"]} → {plan["after"]["files"]}（减少 {plan["before"]["files"] - plan["after"]["files"]}），用例 {plan["before"]["cases"]}')
print(f'计划写入 {out}')
