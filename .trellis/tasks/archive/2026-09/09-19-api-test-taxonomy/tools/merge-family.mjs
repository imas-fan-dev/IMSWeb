#!/usr/bin/env node
// Merge same-family test files into one file, per tools/merge-plan-c.json.
//
// Mechanism: merge the import block, then emit each former file inside its own
// lexical block. The block gives every contributor its own scope, so sibling
// files that declare the same fixture names (they were written from the same
// template) cannot clash -- and nothing inside a contributor is rewritten except
// indentation.
//
// Two things the merged import block cannot express, both handled explicitly:
//   * the same local name bound to two different modules. The repository's own
//     `postgresTest as test` convention collides with vitest's `test` as soon as
//     a wrapper file and an ordinary file share a family. The wrapper side is
//     renamed back to its real export name, inside that member's body only.
//   * same-module factories that disagree.
//
// Two self-checks gate every write, and either one refuses instead of writing:
//   * string / template / comment interiors are byte-identical across the
//     re-indentation,
//   * the multiset of case titles is exactly the sum of the members' titles.
//
// Usage:
//   node tools/merge-family.mjs --root <worktree>/apps/api/tests --plan <plan.json> --dry-run
//   node tools/merge-family.mjs --root <worktree>/apps/api/tests --plan <plan.json> --apply <target>
//   node tools/merge-family.mjs --root <worktree>/apps/api/tests --plan <plan.json> --apply-all
//
// Exit: 0 = mergeable / written; 1 = refused (reasons on stdout); 2 = usage error.

import { readFileSync, writeFileSync, existsSync, unlinkSync } from "node:fs";
import { join, basename, dirname } from "node:path";

const args = process.argv.slice(2);
const arg = (name) => {
    const i = args.indexOf(name);
    return i === -1 ? null : args[i + 1];
};
const root = arg("--root");
const planPath = arg("--plan");
const dryRun = args.includes("--dry-run");
const applyAll = args.includes("--apply-all");
const applyTarget = arg("--apply");
if (!root || !planPath || (!dryRun && !applyAll && !applyTarget)) {
    console.error("usage: merge-family.mjs --root <tests-dir> --plan <plan.json> (--dry-run | --apply <target> | --apply-all)");
    process.exit(2);
}
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const INDENT = "    ";
const WRAPPER_MODULE = "postgres-test-database";

// ---- scanning ------------------------------------------------------------

/**
 * Walk the source once and report, for every line, whether that line starts in
 * code (safe to re-indent) or inside a string / template / comment body, plus
 * the literal spans themselves so a caller can prove they were not touched.
 */
const scan = (text) => {
    const codeStart = [];
    const spans = [];
    let state = "code";
    const templates = []; // stack of { depth } for `${ ... }`
    let start = 0;
    let lineStart = true;
    for (let i = 0; i < text.length; i += 1) {
        const ch = text[i];
        const next = text[i + 1];
        if (lineStart) {
            codeStart.push(state === "code" && templates.length === 0);
            lineStart = false;
        }
        if (state === "code") {
            if (ch === "'" || ch === '"') {
                state = ch === "'" ? "sq" : "dq";
                start = i;
            } else if (ch === "`") {
                state = "tpl";
                start = i;
            } else if (ch === "/" && next === "/") {
                state = "lc";
                start = i;
            } else if (ch === "/" && next === "*") {
                state = "bc";
                start = i;
            } else if (ch === "{") {
                if (templates.length) templates[templates.length - 1].depth += 1;
            } else if (ch === "}" && templates.length && --templates[templates.length - 1].depth === 0) {
                templates.pop();
                state = "tpl";
                start = i;
            }
            if (ch === "\n") lineStart = true;
            continue;
        }
        if (state === "sq" || state === "dq") {
            if (ch === "\\") i += 1;
            else if (ch === (state === "sq" ? "'" : '"')) {
                spans.push([state, start, i + 1]);
                state = "code";
            } else if (ch === "\n") {
                spans.push([state, start, i]);
                state = "code";
            }
            if (ch === "\n") lineStart = true;
            continue;
        }
        if (state === "tpl") {
            if (ch === "\\") i += 1;
            else if (ch === "`") {
                spans.push(["tpl", start, i + 1]);
                state = "code";
            } else if (ch === "$" && next === "{") {
                spans.push(["tpl", start, i + 2]);
                templates.push({ depth: 1 });
                state = "code";
                i += 1;
            }
            if (ch === "\n") lineStart = true;
            continue;
        }
        if (state === "lc") {
            if (ch === "\n") {
                spans.push([state, start, i]);
                state = "code";
                lineStart = true;
            }
            continue;
        }
        if (state === "bc") {
            if (ch === "*" && next === "/") {
                spans.push([state, start, i + 2]);
                state = "code";
                i += 1;
            }
            if (ch === "\n") lineStart = true;
            continue;
        }
    }
    if (state !== "code") spans.push([state, start, text.length]);
    return { codeStart, spans };
};

const indent = (text) => {
    const { codeStart, spans } = scan(text);
    const before = spans.map(([, a, b]) => text.slice(a, b));
    const out = text
        .split("\n")
        .map((line, index) => (line.trim() === "" || codeStart[index] === false ? line : INDENT + line))
        .join("\n");
    const after = scan(out).spans.map(([, a, b]) => out.slice(a, b));
    if (before.length !== after.length || before.some((v, i) => v !== after[i])) {
        throw new Error("自检失败：字符串/模板/注释内容在重排缩进后发生变化");
    }
    return out;
};

/**
 * Rename an identifier in code only: never inside a string, template or comment,
 * never as a property access (`re.test(...)`) and never as an object key or type
 * member (`{ test: ... }`). Indentation-independent, so the title gate still holds.
 */
const renameIdentifier = (text, from, to) => {
    const { spans } = scan(text);
    const pattern = new RegExp(`(?<![.\\w$])${from}\\b(?!\\s*:)`, "g");
    let hits = 0;
    let out = "";
    let cursor = 0;
    for (const [, a, b] of spans) {
        out += text.slice(cursor, a).replace(pattern, () => ((hits += 1), to));
        out += text.slice(a, b);
        cursor = b;
    }
    out += text.slice(cursor).replace(pattern, () => ((hits += 1), to));
    return { text: out, hits };
};

// ---- imports ------------------------------------------------------------

const splitImports = (text) => {
    const lines = text.split("\n");
    const imports = [];
    const body = [];
    let i = 0;
    while (i < lines.length) {
        if (lines[i].startsWith("import ")) {
            let stmt = lines[i];
            while (!stmt.trimEnd().endsWith(";") && i + 1 < lines.length) {
                i += 1;
                stmt += "\n" + lines[i];
            }
            imports.push(stmt.trimEnd());
            i += 1;
            continue;
        }
        body.push(lines[i]);
        i += 1;
    }
    return { imports, body: body.join("\n") };
};

const parseImport = (stmt) => {
    if (/^import\s+['"]/.test(stmt)) return { kind: "sideEffect", module: stmt.match(/^import\s+['"]([^'"]+)['"]/)[1] };
    const isType = /^import\s+type\s/.test(stmt);
    const module = stmt.match(/from\s+['"]([^'"]+)['"]\s*;?\s*$/m)?.[1];
    if (!module) throw new Error(`无法解析 import：${stmt}`);
    const clause = stmt.replace(/^import\s+(type\s+)?/, "").replace(/from\s+['"][^'"]+['"]\s*;?\s*$/m, "").trim();
    const named = clause.match(/\{([\s\S]*)\}/)?.[1] ?? "";
    const outside = clause.replace(/\{[\s\S]*\}/, "").replace(/,/g, " ").trim();
    const namespace = outside.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/)?.[1] ?? null;
    const def = outside.replace(/\*\s+as\s+[A-Za-z_$][\w$]*/, "").trim() || null;
    const bindings = named
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => {
            const [imported, local] = s.split(/\s+as\s+/).map((x) => x.trim());
            return { imported, local: local ?? imported };
        });
    return { kind: "module", module, isType, default: def, namespace, bindings };
};

/** Fold every member's imports into one block; `localRenames` maps member rela -> { local: newLocal }. */
const mergeImports = (entries) => {
    const sideEffects = new Set();
    const modules = new Map();
    for (const { imports, renames, drops } of entries) {
        for (const stmt of imports) {
            const imp = parseImport(stmt);
            if (imp.kind === "sideEffect") {
                sideEffects.add(imp.module);
                continue;
            }
            const key = `${imp.isType ? "type:" : "value:"}${imp.module}`;
            const entry = modules.get(key) ?? { module: imp.module, isType: imp.isType, default: null, namespace: null, bindings: new Map() };
            if (imp.default && !drops?.has(imp.default)) {
                if (entry.default && entry.default !== imp.default) throw new Error(`import 冲突：默认导入 ${entry.default} / ${imp.default} 同来自 '${imp.module}'`);
                entry.default = imp.default;
            }
            if (imp.namespace && !drops?.has(imp.namespace)) {
                if (entry.namespace && entry.namespace !== imp.namespace) throw new Error(`import 冲突：命名空间 ${entry.namespace} / ${imp.namespace} 同来自 '${imp.module}'`);
                entry.namespace = imp.namespace;
            }
            for (const b of imp.bindings) {
                if (drops?.has(b.local)) continue;
                const local = renames?.[b.local] ?? b.local;
                const seen = entry.bindings.get(local);
                if (seen && seen !== b.imported) throw new Error(`import 冲突：'${imp.module}' 的 ${local} 同时指向 ${seen} 与 ${b.imported}`);
                entry.bindings.set(local, b.imported);
            }
            modules.set(key, entry);
        }
    }
    const lines = [];
    for (const module of [...sideEffects].sort((a, b) => (a === "tsx/cjs" ? -1 : b === "tsx/cjs" ? 1 : a.localeCompare(b)))) {
        lines.push(`import '${module}';`);
    }
    for (const entry of [...modules.values()].sort((a, b) => a.module.localeCompare(b.module))) {
        const parts = [];
        if (entry.default) parts.push(entry.default);
        if (entry.namespace) parts.push(`* as ${entry.namespace}`);
        if (entry.bindings.size) {
            const named = [...entry.bindings.entries()]
                .map(([local, imported]) => (local === imported ? local : `${imported} as ${local}`))
                .sort((a, b) => a.localeCompare(b));
            parts.push(`{ ${named.join(", ")} }`);
        }
        if (!parts.length) continue; // every binding of this module was dropped as a re-export
        lines.push(`import ${entry.isType ? "type " : ""}${parts.join(", ")} from '${entry.module}';`);
    }
    return lines;
};

const viMocks = (text) => {
    const found = new Map();
    const re = /vi\.mock\(\s*(['"])([^'"]+)\1\s*(?:,\s*([\s\S]*?)\n?\s*\)\s*;?)?/g;
    let m;
    while ((m = re.exec(text))) {
        const factory = (m[3] ?? "").replace(/\s+/g, " ").trim();
        found.set(m[2], found.has(m[2]) && found.get(m[2]) !== factory ? "||CONFLICT||" : factory);
    }
    return found;
};

/** Resolve a module specifier to a file on disk, from the importing file's directory. */
const resolveSpecifier = (fromDir, specifier) => {
    const base = specifier.startsWith("@/")
        ? join(root, "..", "src", specifier.slice(2))
        : specifier.startsWith(".")
          ? join(fromDir, specifier)
          : null;
    if (!base) return null;
    for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}.js`, join(base, "index.ts"), join(base, "index.tsx"), join(base, "index.js")]) {
        if (existsSync(candidate)) return candidate;
    }
    return null;
};

/** True when `fromFile` re-exports `name` from `targetFile` (directly or wholesale). */
const reExportsName = (fromFile, targetFile, name) => {
    const fromDir = dirname(fromFile);
    const text = readFileSync(fromFile, "utf8");
    for (const match of text.matchAll(/export\s+(\*|\{[^}]*\})\s+from\s+['"]([^'"]+)['"]/g)) {
        if (resolveSpecifier(fromDir, match[2]) !== targetFile) continue;
        if (match[1] === "*" || new RegExp(`\\b${name}\\b`).test(match[1])) return true;
    }
    return false;
};

const pascalLeaf = (specifier) =>
    basename(specifier)
        .split(/[-_.]/)
        .filter(Boolean)
        .map((word) => word[0].toUpperCase() + word.slice(1))
        .join("");

// ---- analyse -------------------------------------------------------------

const analyse = (entry) => {
    const reasons = [];
    const members = entry.members.map((rel) => {
        const path = join(root, rel);
        const text = existsSync(path) ? readFileSync(path, "utf8") : null;
        if (text === null) return { rel, path, text: null, renames: {} };
        const { imports, body } = splitImports(text);
        return { rel, path, text, imports, body, renames: {}, drops: new Set() };
    });
    const missing = members.filter((m) => m.text === null).map((m) => m.rel);
    if (missing.length) reasons.push(`缺少成员文件：${missing.join(", ")}`);
    const present = members.filter((m) => m.text !== null);
    for (const m of present) {
        if (!/^(test\.)?describe\(/m.test(m.text)) reasons.push(`${m.rel} 尚未完成 describe 归类（合并的前提）`);
    }
    // Cross-module local-name collisions: a merged file can only bind a local name once.
    const binders = new Map();
    const bindingModule = (member, local) => {
        for (const stmt of member.imports ?? []) {
            const imp = parseImport(stmt);
            if (imp.kind !== "module") continue;
            const locals = [imp.default, imp.namespace, ...imp.bindings.map((b) => b.local)].filter(Boolean);
            if (locals.includes(local)) return imp.module;
        }
        return null;
    };
    for (const m of present) {
        for (const stmt of m.imports) {
            const imp = parseImport(stmt);
            if (imp.kind !== "module") continue;
            for (const local of [imp.default, imp.namespace, ...imp.bindings.map((b) => b.local)].filter(Boolean)) {
                const owners = binders.get(local) ?? new Map();
                owners.set(imp.module, [...(owners.get(imp.module) ?? []), m.rel]);
                binders.set(local, owners);
            }
        }
    }
    for (const local of [...binders.keys()].sort()) {
        const ownerModules = [...binders.get(local).keys()].sort();
        if (ownerModules.length < 2) continue;
        const bound = present.filter((m) => bindingModule(m, local) !== null);
        const moduleOf = (member, module) => resolveSpecifier(dirname(join(root, member.rel)), module);
        // 1. A module that provably re-exports the name from another keeps it: both
        //    specifiers denote the same symbol, so the barrel import is enough and
        //    every direct binding of it is dropped instead of renamed.
        const barrel = ownerModules.find((candidate) =>
            ownerModules.some((other) => {
                if (other === candidate) return false;
                const from = moduleOf(bound.find((m) => bindingModule(m, local) === candidate), candidate);
                const target = moduleOf(bound.find((m) => bindingModule(m, local) === other), other);
                return from && target && reExportsName(from, target, local);
            }),
        );
        if (barrel) {
            for (const m of bound) if (bindingModule(m, local) !== barrel) m.drops.add(local);
            continue;
        }
        // 2. The repository's own `postgresTest as test` convention: rename the
        //    wrapper side back to its real export name, inside that member's body.
        if (local === "test" && ownerModules.some((module) => module.includes(WRAPPER_MODULE))) {
            for (const m of bound) {
                if (bindingModule(m, local)?.includes(WRAPPER_MODULE)) m.renames[local] = "postgresTest";
            }
            continue;
        }
        // 3. Otherwise the bindings are different symbols under one name: keep the
        //    first module's name and rename the rest per member, in code only.
        const keep = ownerModules[0];
        for (const m of bound) {
            const module = bindingModule(m, local);
            if (module === keep) continue;
            m.renames[local] = `${local}From${pascalLeaf(module)}`;
        }
    }
    const mocks = new Map();
    for (const m of present) {
        for (const [module, factory] of viMocks(m.text)) {
            const prev = mocks.get(module);
            if (prev && prev.factory !== factory) reasons.push(`vi.mock('${module}') 在 ${basename(prev.owner)} 与 ${basename(m.rel)} 的 factory 不同（提升到文件顶层后必然冲突）`);
            else if (!prev) mocks.set(module, { owner: m.rel, factory });
        }
    }
    for (const m of present) {
        if (!Object.keys(m.renames).length) continue;
        for (const [from, to] of Object.entries(m.renames)) {
            const renamed = renameIdentifier(m.body, from, to);
            if (renamed.hits === 0) reasons.push(`${basename(m.rel)}：需要把 ${from} 改名为 ${to}，但成员体内没有找到该标识符`);
            else {
                m.body = renamed.text;
                m.text = `${m.imports.join("\n")}\n${m.body}`;
            }
        }
    }
    return { members, reasons, renames: Object.fromEntries(members.map((m) => [m.rel, m.renames ?? {}])) };};

// ---- build --------------------------------------------------------------

const titles = (source) =>
    [...source.matchAll(/(?:^|\s)(?:test|it)\(\s*(['"`])((?:[^'"`\\]|\\.)*?)\1\s*,/g)].map((m) => m[2]).sort();

const build = (imports, members) => {
    const header = [
        `// Merged from ${members.length} sibling files that each keep their own describe block.`,
        "// The block around every contribution gives it its own scope, so identically",
        "// named fixtures from different files cannot clash.",
    ];
    const blocks = members.map((m) => [`// ${basename(m.rel)}`, "{", indent(m.body.replace(/^\n+/, "").replace(/\s+$/, "")), "}"].join("\n"));
    const text = [...header, "", ...imports, "", ...blocks.flatMap((b) => [b, ""])].join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n";
    // Independent gate: a merge only moves cases between lines, so the multiset of
    // case titles must equal the sum of the members' titles. Only the captured
    // title is compared: in a multi-line `test(` + title form the newline and
    // indentation between them legitimately move.
    const before = members.flatMap((m) => titles(m.text)).sort();
    const after = titles(text);
    if (before.length !== after.length || before.some((v, i) => v !== after[i])) {
        const missing = before.filter((v) => !after.includes(v)).slice(0, 3);
        const extra = after.filter((v) => !before.includes(v)).slice(0, 3);
        throw new Error(
            `自检失败：用例标题多重集变化 ${before.length} → ${after.length}` +
                (missing.length ? `；丢失 ${missing.map((s) => JSON.stringify(s)).join(", ")}` : "") +
                (extra.length ? `；多出 ${extra.map((s) => JSON.stringify(s)).join(", ")}` : ""),
        );
    }
    return text;
};

let refused = 0;
let merged = 0;
for (const entry of plan.merges) {
    if (!dryRun && !applyAll && entry.target !== applyTarget) continue;
    const { reasons, members } = analyse(entry);
    if (reasons.length) {
        refused += 1;
        console.log(`拒  ${entry.target}  (${entry.files} 文件，${entry.cases} 用例)\n    ${reasons.join("\n    ")}`);
        continue;
    }
    let text;
    let importLines = [];
    try {
        const present = members.filter((m) => m.text !== null);
        importLines = mergeImports(present.map((m) => ({ imports: m.imports, renames: m.renames, drops: m.drops })));
        text = build(importLines, present);
    } catch (error) {
        refused += 1;
        console.log(`拒  ${entry.target}\n    ${error.message}`);
        continue;
    }
    if (dryRun) {
        merged += 1;
        const renamed = members.filter((m) => Object.keys(m.renames ?? {}).length);
        console.log(
            `可合并 ${entry.target}  (${entry.files} 文件 → 1，${entry.cases} 用例，${entry.seconds}s，${text.split("\n").length} 行` +
                (renamed.length ? `，${renamed.length} 个成员做了标识符改名` : "") + ")",
        );
        continue;
    }
    writeFileSync(join(root, entry.target), text);
    for (const m of members) if (m.rel !== entry.target) unlinkSync(m.path);
    merged += 1;
    console.log(`已写出 ${entry.target}：${members.length} 文件 → 1（${text.split("\n").length} 行，import ${importLines.length} 条）`);
}
if (dryRun) {
    console.log(`\n可合并 ${merged} / ${plan.merges.length}；被拒 ${refused}`);
    process.exit(0);
}
if (applyAll) console.log(`\n已写出 ${merged}；被拒 ${refused}`);
process.exit(refused && !applyAll ? 1 : 0);
