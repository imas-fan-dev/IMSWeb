#!/usr/bin/env python3
"""Independent shape check for a taxonomy batch: HEAD vs worktree.

Proves, per file, that a batch only added describe structure:
  1. the multiset of assertion lines is unchanged,
  2. the number of cases is unchanged,
  3. every old case title is a literal suffix of exactly one new title (lossless).

Usage: python3 tools/check-batch-shape.py <worktree> <path> [<path> ...]
"""
import collections
import re
import subprocess
import sys

TITLE = re.compile(r"""(?:^|\s)(?:test|it)\(\s*(['"`])((?:[^'"`\\]|\\.)*?)\1\s*,""", re.M)
ASSERT = re.compile(r"expect\(|node:assert|assert\.|\.toThrow|strictEqual|deepStrictEqual")


def titles(text):
    return [m.group(2) for m in TITLE.finditer(text)]


def asserts(text):
    return collections.Counter(line.strip() for line in text.split("\n") if ASSERT.search(line))


def max_matching(old_titles, new_titles):
    """Kuhn's augmenting-path matching: old i may pair with new j when old[i] ends
    with new[j]. Greedy pairing is wrong here -- an old title such as
    'Platform profile writes ignore the Fudaba rollout switch' is also a suffix
    match for the unrelated 'ignore the Fudaba rollout switch', and taking that
    pair first would hide the real bijection."""
    adj = [[j for j, new in enumerate(new_titles) if old.endswith(new)] for old in old_titles]
    paired = {}

    def assign(i, seen):
        for j in adj[i]:
            if j in seen:
                continue
            seen.add(j)
            if j not in paired or assign(paired[j], seen):
                paired[j] = i
                return True
        return False

    for i in range(len(old_titles)):
        if not assign(i, set()):
            return None
    return paired


def main():
    worktree, paths = sys.argv[1], sys.argv[2:]
    bad_assert, bad_loss = [], []
    total_old = total_new = exact = 0
    for rel in paths:
        old = subprocess.run(["git", "show", f"HEAD:{rel}"], cwd=worktree, capture_output=True, text=True).stdout
        with open(f"{worktree}/{rel}") as handle:
            new = handle.read()
        if asserts(old) != asserts(new):
            bad_assert.append(rel)
        old_titles, new_titles = titles(old), titles(new)
        total_old += len(old_titles)
        total_new += len(new_titles)
        if len(old_titles) != len(new_titles):
            bad_loss.append((rel, f"条数 {len(old_titles)} → {len(new_titles)}"))
            continue
        paired = max_matching(old_titles, new_titles)
        if paired is None:
            bad_loss.append((rel, "不存在旧→新的字面尾段双射"))
            continue
        for j, i in paired.items():
            exact += old_titles[i] == new_titles[j]
    print(f"文件 {len(paths)}；断言行多重集变化 {len(bad_assert)}；用例 {total_old} → {total_new}")
    print(f"标题层整名逐字不变 {exact}/{total_old}；无损映射失败 {len(bad_loss)}")
    for rel, reason in bad_loss[:10]:
        print(f"  {rel}: {reason}")
    for rel in bad_assert[:10]:
        print(f"  断言变化：{rel}")
    return 1 if (bad_assert or bad_loss) else 0


if __name__ == "__main__":
    raise SystemExit(main())
