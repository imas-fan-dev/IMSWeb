import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import {
  collectRegisteredNonJsonHandlers,
  createBoundaryProgram,
  findNamedSymbol,
  relative,
  responseSourceFiles,
  testEvidence,
  ts,
} from "./non-json-boundary-analysis.mjs";
import {
  hasNonJsonBoundary,
  loadNonJsonBoundaryManifest,
  nonJsonBoundaryManifestPath,
} from "./non-json-boundary-manifest.mjs";

const validKinds = new Set(["binary", "html", "redirect", "static", "no-content", "compatibility-text-error"]);
const textContentType = "text/plain; charset=UTF-8";

function exists(file) {
  return fs.existsSync(file) && fs.statSync(file).isFile();
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (error) {
    throw new Error(`${file}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function isExact(value) {
  return typeof value === "string" && value.length > 0 && !value.includes("*") && !value.includes("?");
}

function sourceFile(program, root, file) {
  return program.getSourceFile(path.join(root, file));
}

function textContentTypeIn(node) {
  const value = ts.isParenthesizedExpression(node) ? node.expression : node;
  if (!ts.isObjectLiteralExpression(value)) return undefined;
  for (const property of value.properties) {
    if (!ts.isPropertyAssignment(property)) continue;
    const name = ts.isIdentifier(property.name) || ts.isStringLiteral(property.name) ? property.name.text.toLowerCase() : undefined;
    if (name === "content-type" && ts.isStringLiteral(property.initializer)) return property.initializer.text;
    if (name === "headers") {
      const nested = textContentTypeIn(property.initializer);
      if (nested) return nested;
    }
  }
  return undefined;
}

function hasIncompatibleExplicitTextContentType(text, sourceFiles) {
  for (const file of sourceFiles) {
    const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true);
    let incompatible = false;
    const visit = (node) => {
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression) && node.expression.name.text === "text") {
        const body = node.arguments[0];
        const status = node.arguments[1];
        const contentType = node.arguments[2] && textContentTypeIn(node.arguments[2]);
        if (body && status && ts.isStringLiteral(body) && body.text === text.body && ts.isNumericLiteral(status) && Number(status.text) === text.status && contentType && contentType !== text.contentType) incompatible = true;
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
    if (incompatible) return true;
  }
  return false;
}

function sourceHasTextResponse(text, checker, source, symbol) {
  const declaration = symbol?.valueDeclaration;
  const traced = declaration && ts.isFunctionLike(declaration)
    ? responseSourceFiles(checker, declaration)
    : new Set();
  traced.add(source.fileName);
  const sourceFiles = [...traced];
  const sourceText = sourceFiles
    .map((file) => fs.readFileSync(file, "utf8"))
    .join("\n");
  return sourceText.includes(text.body)
    && sourceText.includes(String(text.status))
    && !hasIncompatibleExplicitTextContentType(text, sourceFiles);
}

function compatibilityTextErrors(entry) {
  if (entry.compatibilityTextError && entry.compatibilityTextErrors) return undefined;
  if (entry.compatibilityTextErrors !== undefined) return Array.isArray(entry.compatibilityTextErrors)
    ? entry.compatibilityTextErrors
    : undefined;
  return entry.compatibilityTextError ? [entry.compatibilityTextError] : [];
}

function validateTextEvidence(entry, text, checker, source, symbol, errors) {
  const label = entry.id || "<missing id>";
  if (!isExact(text.body) || !Number.isInteger(text.status) || text.status < 400 || text.status > 599 || text.contentType !== textContentType || !String(text.justification ?? "").includes("C5")) {
    errors.push(`${label}: compatibility text error requires exact C5 body, status, and ${textContentType} content type`);
    return;
  }
  if (!sourceHasTextResponse(text, checker, source, symbol)) {
    errors.push(`${label}: compatibility text error body/status are not proven by ${entry.sourceFile}:${entry.symbol}`);
  }
}

function validateSchemaProvenance(root, contractsProgram, contractsChecker, entry, errors) {
  if (!entry.jsonErrorSchema) return;
  const label = entry.id || "<missing id>";
  const schema = entry.jsonErrorSchema;
  if (!isExact(schema.sourceFile) || !isExact(schema.symbol) || !schema.sourceFile.startsWith("packages/contracts/src/")) {
    errors.push(`${label}: jsonErrorSchema requires an exact contracts sourceFile and symbol`);
    return;
  }
  const symbol = findNamedSymbol(contractsProgram, contractsChecker, path.join(root, schema.sourceFile), schema.symbol);
  if (!symbol || !symbol.declarations?.some((declaration) => relative(root, declaration.getSourceFile().fileName) === schema.sourceFile)) {
    errors.push(`${label}: contracts-owned JSON error schema is not live: ${schema.sourceFile}:${schema.symbol}`);
  }
}

function testCaseIsLive(root, entry) {
  const file = path.join(root, entry.test.file);
  if (!exists(file)) return false;
  const source = ts.createSourceFile(file, fs.readFileSync(file, "utf8"), ts.ScriptTarget.ES2022, true);
  return testEvidence(source).get(entry.test.symbol)?.hasAssertion === true;
}

function validateManifest(root, manifest) {
  const errors = [];
  const { handlers } = collectRegisteredNonJsonHandlers(root);
  const applicationProgram = createBoundaryProgram(root, ["apps/api/src", "apps/web/app/lib/api"]);
  const applicationChecker = applicationProgram.getTypeChecker();
  const contractsProgram = createBoundaryProgram(root, ["packages/contracts/src"]);
  const contractsChecker = contractsProgram.getTypeChecker();
  const ids = new Set();
  const locations = new Map();

  for (const entry of manifest.boundaries) {
    const label = entry.id || "<missing id>";
    if (!entry.id || !/^[A-Z0-9]+(?:-[A-Z0-9]+)+$/.test(entry.id)) errors.push(`${label}: stable id is required`);
    if (ids.has(entry.id)) errors.push(`${label}: duplicate stable id`);
    ids.add(entry.id);
    if (!isExact(entry.sourceFile)) errors.push(`${label}: sourceFile must be exact, without wildcards`);
    if (!isExact(entry.symbol)) errors.push(`${label}: symbol must be exact, without wildcards`);
    if (!validKinds.has(entry.responseKind)) errors.push(`${label}: invalid responseKind ${String(entry.responseKind)}`);
    if (!entry.reason || typeof entry.reason !== "string") errors.push(`${label}: reason is required`);

    const duplicateKey = `${entry.sourceFile}:${entry.symbol}`;
    const knownKinds = locations.get(duplicateKey) ?? new Set();
    if (knownKinds.has(entry.responseKind)) errors.push(`${label}: duplicate file+symbol entry must represent a distinct responseKind`);
    knownKinds.add(entry.responseKind);
    locations.set(duplicateKey, knownKinds);

    const source = sourceFile(applicationProgram, root, entry.sourceFile);
    const symbol = source && findNamedSymbol(applicationProgram, applicationChecker, source.fileName, entry.symbol);
    if (!source) errors.push(`${label}: source file is not live: ${entry.sourceFile}`);
    else if (!symbol) errors.push(`${label}: symbol is not live: ${entry.symbol}`);

    if (!entry.test || !isExact(entry.test.file) || !isExact(entry.test.symbol)) {
      errors.push(`${label}: exact focused test file and test case symbol are required`);
    } else if (!testCaseIsLive(root, entry)) {
      errors.push(`${label}: focused test case must be live and contain an assertion: ${entry.test.file}:${entry.test.symbol}`);
    }

    const textErrors = compatibilityTextErrors(entry);
    if (textErrors === undefined || textErrors.length === 0 && entry.compatibilityTextErrors !== undefined) {
      errors.push(`${label}: compatibilityTextErrors must be a non-empty array and cannot be combined with compatibilityTextError`);
    } else if (source && symbol) {
      for (const text of textErrors) validateTextEvidence(entry, text, applicationChecker, source, symbol, errors);
    }
    if (entry.jsonErrorSchema) validateSchemaProvenance(root, contractsProgram, contractsChecker, entry, errors);
    if (!entry.jsonErrorSchema && !(textErrors?.length) && !entry.nonApiStaticAsset) {
      errors.push(`${label}: contracts-owned JSON error schema or C5 compatibility text error is required`);
    }

    if (entry.nonApiStaticAsset) {
      if (entry.responseKind !== "static" || !isExact(entry.nonApiStaticAsset.path)) {
        errors.push(`${label}: non-API static assets require static responseKind and exact path`);
      }
      continue;
    }

    const detected = handlers.find((handler) => handler.file === entry.sourceFile && handler.symbol === entry.symbol);
    if (!detected) errors.push(`${label}: manifest handler is not actually mounted/reachable`);
    else if (!detected.responseKinds.includes(entry.responseKind)) {
      errors.push(`${label}: responseKind ${entry.responseKind} is not produced by mounted handler (${detected.responseKinds.join(", ")})`);
    }
  }

  for (const handler of handlers) {
    if (!hasNonJsonBoundary(manifest.boundaries, { sourceFile: handler.file, symbol: handler.symbol })) {
      errors.push(`unregistered non-JSON handler: ${handler.file}:${handler.symbol}`);
    }
    if (handler.inline) errors.push(`unmanifested local inline non-JSON handler: ${handler.file}:${handler.symbol}`);
  }

  return { errors, handlers };
}

function parseArgs(args) {
  const parsed = {};
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === "--root") parsed.root = args[++index];
    if (args[index] === "--manifest") parsed.manifest = args[++index];
  }
  return parsed;
}

function main(argv) {
  const root = path.resolve(argv.root || path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../.."));
  const manifestFile = path.resolve(root, argv.manifest || nonJsonBoundaryManifestPath);
  const manifest = argv.manifest
    ? readJson(manifestFile)
    : loadNonJsonBoundaryManifest(root);
  if (!Array.isArray(manifest.boundaries)) throw new Error("manifest.boundaries must be an array");
  const { errors, handlers } = validateManifest(root, manifest);
  if (errors.length) throw new Error(errors.join("\n"));
  process.stdout.write(`non-JSON boundary manifest: ${manifest.boundaries.length} entries\nregistered non-JSON handlers: ${handlers.length}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main(parseArgs(process.argv.slice(2)));
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

export { validateManifest };
