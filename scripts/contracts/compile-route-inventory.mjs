import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// The contracts workspace pins a compiler API version. The API workspace's TypeScript 7 package only exposes version metadata.
const ts = createRequire(new URL("../../packages/contracts/package.json", import.meta.url))("typescript");
const semanticPrinter = ts.createPrinter({ removeComments: true });
const METHODS = new Set(["get", "post", "put", "patch", "delete", "head", "options", "all"]);
const EXTENSIONS = new Set([".ts", ".tsx", ".js", ".mjs", ".cjs"]);
const BASELINE = { mountedMethodPaths: 223, carriers: 283, reject: 41, acceptAndProject: 161, passthrough: 17, nonObjectApplicable: 64 };
const EXPLICIT_QUERY_ADDITIONS = [
  { module: "@imsweb/contracts/platform", symbol: "platformProfileAvatarQuerySchema", carriers: 2, policy: "accept-and-project" },
  { module: "@imsweb/contracts/site-packages", symbol: "siteContentCacheBusterQuerySchema", carriers: 8, policy: "accept-and-project" },
  { module: "@imsweb/contracts/fudaba/map-delivery", symbol: "fudabaMapDeliveryQuerySchema", carriers: 1, policy: "passthrough" },
  { module: "@imsweb/contracts/fudaba", symbol: "fudabaIgnoredQuerySchema", carriers: 6, policy: "accept-and-project" },
  { module: "@imsweb/contracts/fudaba", symbol: "fudabaMediaQuerySchema", carriers: 6, policy: "accept-and-project" },
];
const PATH_PREFIXES = {
  apiPath: "/api", adminApiPath: "/api/admin", platformApiPath: "/api/platform", platformAuthPath: "/api/platform/auth",
  platformAuthOAuthPath: "/api/platform/auth/oauth", adminPlatformAuthOAuthPath: "/api/admin/platform/auth/oauth",
  communityApiPath: "/api/community", exchangePath: "/api/community/exchange", adminExchangePath: "/api/admin/community/exchange",
  wikiPath: "/api/wiki", adminWikiPath: "/api/admin/wiki", eventChroniclePath: "/eventchronicle", publicUploadsPath: "/uploads",
  publicAssetsPath: "/assets", mapsPath: "/maps", siteContentPath: "/site-content", sitesPath: "/sites", imagePath: "/image", iconPath: "/icon", cssPath: "/css",
};

export class InventoryFailure extends Error {
  constructor(diagnostics) {
    super(diagnostics.map((issue) => `${issue.file}:${issue.line}: ${issue.message}`).join("\n"));
    this.diagnostics = diagnostics;
  }
}

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? filesUnder(file) : EXTENSIONS.has(path.extname(file)) ? [file] : [];
  });
}
function relative(root, file) { return path.relative(root, file).split(path.sep).join("/"); }
function loc(root, node) {
  const source = node.getSourceFile();
  const point = source.getLineAndCharacterOfPosition(node.getStart(source));
  return { file: relative(root, source.fileName), line: point.line + 1 };
}
function unbox(node) {
  while (ts.isParenthesizedExpression(node) || ts.isAsExpression(node) || ts.isTypeAssertionExpression(node) || ts.isSatisfiesExpression(node)) node = node.expression;
  return node;
}
function semanticNodeText(node) {
  const transformed = ts.transform(node, [(context) => {
    const visit = (current) => {
      if (ts.isParenthesizedExpression(current)) return ts.visitNode(current.expression, visit);
      if (ts.isIdentifier(current)) return ts.factory.createIdentifier(current.text);
      if (ts.isStringLiteral(current)) return ts.factory.createStringLiteral(current.text);
      if (ts.isNumericLiteral(current)) return ts.factory.createNumericLiteral(Number(current.text).toString());
      return ts.visitEachChild(current, visit, context);
    };
    return (root) => ts.visitNode(root, visit);
  }]);
  try {
    const printed = semanticPrinter.printNode(
      ts.EmitHint.Unspecified,
      transformed.transformed[0],
      node.getSourceFile(),
    );
    const scanner = ts.createScanner(ts.ScriptTarget.ES2022, true, ts.LanguageVariant.Standard, printed);
    const tokens = [];
    while (scanner.scan() !== ts.SyntaxKind.EndOfFileToken) tokens.push(scanner.getTokenText());
    return tokens.join(" ");
  } finally {
    transformed.dispose();
  }
}
function text(node) {
  return semanticPrinter
    .printNode(ts.EmitHint.Unspecified, node, node.getSourceFile())
    .replace(/\s+/g, " ")
    .slice(0, 240);
}
function symbol(checker, node) {
  let value = checker.getSymbolAtLocation(node);
  if (value?.flags & ts.SymbolFlags.Alias) value = checker.getAliasedSymbol(value);
  return value;
}
function declaration(checker, node) { const value = symbol(checker, node); return value?.valueDeclaration ?? value?.declarations?.[0]; }
function functionDeclaration(value) {
  return value && (ts.isFunctionDeclaration(value) || ts.isFunctionExpression(value) || ts.isArrowFunction(value) || ts.isMethodDeclaration(value)) ? value : undefined;
}
function nameOf(value) { return value?.name && ts.isIdentifier(value.name) ? value.name.text : undefined; }
function calledName(call) { const value = unbox(call.expression); return ts.isIdentifier(value) ? value.text : ts.isPropertyAccessExpression(value) ? value.name.text : undefined; }
function semanticNodeDigest(node) {
  return crypto.createHash("sha256").update(semanticNodeText(node)).digest("hex").slice(0, 16);
}
function anonymousHandlerSymbol(root, node) {
  const source = node.getSourceFile();
  return `${relative(root, source.fileName)}#anonymous:${semanticNodeDigest(node)}`;
}
function withoutSourceLines(value) {
  if (Array.isArray(value)) return value.map(withoutSourceLines);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "line")
    .map(([key, item]) => [key, withoutSourceLines(item)]));
}
function semanticDigest(inventory) {
  const projection = withoutSourceLines(inventory);
  delete projection.generation.semanticDigest;
  return crypto.createHash("sha256").update(JSON.stringify(projection)).digest("hex");
}
export function routeInventoryArtifact(inventory) {
  const artifact = withoutSourceLines(inventory);
  artifact.generation.semanticDigest = semanticDigest(artifact);
  return artifact;
}
function join(prefix, suffix) {
  if (!prefix) return suffix.startsWith("/") ? suffix : `/${suffix}`;
  if (!suffix || suffix === "/") return prefix;
  return `${prefix.replace(/\/+$/, "")}/${suffix.replace(/^\/+/, "")}`.replace(/\/+/g, "/");
}
function isRouterFactory(call, checker) {
  const name = calledName(call) ?? "";
  return name === "Hono" || /^(?:create)?(?:Capability)?Router$/.test(name) || (name.endsWith("Router") && !declaration(checker, unbox(call.expression)));
}
function validator(checker, node, seen = new Set()) {
  node = unbox(node);
  if (seen.has(node)) return undefined;
  seen.add(node);
  if (ts.isCallExpression(node)) {
    const name = calledName(node) ?? "";
    const kind = ["jsonSchemaValidator", "jsonValidator"].includes(name) || /JsonSchemaValidator$/.test(name) ? "json"
      : ["querySchemaValidator", "queryValidator"].includes(name) || /QuerySchemaValidator$/.test(name) ? "query"
        : ["paramSchemaValidator", "paramValidator"].includes(name) || /ParamSchemaValidator$/.test(name) ? "param"
          : undefined;
    if (kind) return { kind, schema: node.arguments[0], source: node };
  }
  if (ts.isIdentifier(node)) {
    const value = declaration(checker, node);
    if (value && ts.isVariableDeclaration(value) && value.initializer) return validator(checker, value.initializer, seen);
  }
  return undefined;
}
function importedSchema(root, node) {
  const source = node.getSourceFile();
  const localName = ts.isPropertyAccessExpression(node) ? node.name.text : ts.isIdentifier(node) ? node.text : undefined;
  for (const statement of source.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const bindings = statement.importClause?.namedBindings;
    if (bindings && ts.isNamedImports(bindings)) {
      for (const item of bindings.elements) {
        if (item.name.text === localName) return {
          module: statement.moduleSpecifier.text,
          name: item.propertyName?.text ?? item.name.text,
          location: loc(root, item),
        };
      }
    }
  }
  return undefined;
}
function contractSchemaInitializer(root, imported) {
  if (!imported?.module.startsWith("@imsweb/contracts")) return undefined;
  const suffix = imported.module === "@imsweb/contracts" ? "index" : imported.module.slice("@imsweb/contracts/".length);
  const sourcePath = [`${suffix}.ts`, path.join(suffix, "index.ts")]
    .map((candidate) => path.join(root, "packages/contracts/src", candidate))
    .find((candidate) => fs.existsSync(candidate));
  if (!sourcePath) return undefined;
  const source = ts.createSourceFile(sourcePath, fs.readFileSync(sourcePath, "utf8"), ts.ScriptTarget.ES2022, true);
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declarationNode of statement.declarationList.declarations) {
      if (ts.isIdentifier(declarationNode.name) && declarationNode.name.text === imported.name) return declarationNode.initializer;
    }
  }
  return undefined;
}
function localSchemaInitializer(node) {
  if (!ts.isIdentifier(node)) return undefined;
  for (const statement of node.getSourceFile().statements) {
    if (!ts.isVariableStatement(statement)) continue;
    for (const declarationNode of statement.declarationList.declarations) {
      if (ts.isIdentifier(declarationNode.name) && declarationNode.name.text === node.text) return declarationNode.initializer;
    }
  }
  return undefined;
}
function schemaDeclaration(checker, node) {
  const candidates = ts.isPropertyAccessExpression(node) ? [node.name, node] : [node];
  for (const candidate of candidates) {
    const value = symbol(checker, candidate);
    const declarationNode = value?.valueDeclaration ?? value?.declarations?.find((item) => ts.isVariableDeclaration(item));
    if (declarationNode) return { value, declarationNode };
  }
  return undefined;
}
function schemaPolicy(root, checker, node, seen = new Set()) {
  node = unbox(node);
  const key = `${node.getSourceFile().fileName}:${node.pos}:${node.end}`;
  if (seen.has(key)) return undefined;
  seen.add(key);
  const imported = importedSchema(root, node);
  const importedInitializer = contractSchemaInitializer(root, imported);
  if (importedInitializer) return schemaPolicy(root, checker, importedInitializer, seen);
  if (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) {
    const localInitializer = localSchemaInitializer(node);
    if (localInitializer) return schemaPolicy(root, checker, localInitializer, seen);
    const resolved = schemaDeclaration(checker, node);
    if (resolved?.declarationNode && ts.isVariableDeclaration(resolved.declarationNode) && resolved.declarationNode.initializer) return schemaPolicy(root, checker, resolved.declarationNode.initializer, seen);
  }
  if (!ts.isCallExpression(node)) return undefined;
  const name = calledName(node);
  if (name === "strictRequestObject") return "reject";
  if (name === "legacyStripRequestObject") return "accept-and-project";
  if (name === "legacyPassthroughRequestObject") return "passthrough";
  if (["exactJsonResponse", "exactJsonError"].includes(name)) return "reject";
  if (name === "object") return "accept-and-project";
  if (["array", "tuple", "string", "number", "boolean", "date", "bigint", "symbol", "undefined", "null", "unknown", "any", "never", "literal", "enum", "nativeEnum", "nan", "void"].includes(name)) return "non-object-applicable";
  if (ts.isPropertyAccessExpression(node.expression)) {
    const method = node.expression.name.text;
    if (method === "strict") return "reject";
    if (method === "strip") return "accept-and-project";
    if (method === "passthrough") return "passthrough";
    if (["optional", "nullable", "nullish", "default", "catch", "brand", "describe", "refine", "superRefine", "transform", "pipe", "readonly", "extend", "merge", "pick", "omit", "partial", "required"].includes(method)) return schemaPolicy(root, checker, node.expression.expression, seen);
  }
  if (["preprocess", "coerce"].includes(name)) {
    const inner = name === "preprocess" ? node.arguments.at(-1) : undefined;
    return inner ? schemaPolicy(root, checker, inner, seen) : "non-object-applicable";
  }
  if (["union", "discriminatedUnion", "intersection"].includes(name)) {
    const alternatives = node.arguments.flatMap((argument) => ts.isArrayLiteralExpression(unbox(argument)) ? [...unbox(argument).elements] : [argument]);
    const policies = [...new Set(alternatives.map((alternative) => schemaPolicy(root, checker, alternative, new Set(seen))).filter(Boolean))];
    return policies.length === 1 ? policies[0] : undefined;
  }
  return undefined;
}
function semanticPolicy(kind, schemaModule, schemaSymbol, syntaxPolicy) {
  if (kind === "param") {
    if (syntaxPolicy === "accept-and-project") return syntaxPolicy;
    if (syntaxPolicy === "reject" && (schemaModule.startsWith("@imsweb/contracts/fudaba") || schemaModule.startsWith("@imsweb/contracts/platform"))) return "non-object-applicable";
    return syntaxPolicy === "non-object-applicable" ? syntaxPolicy : "accept-and-project";
  }
  if (kind === "query" && schemaSymbol === "platformOAuthCallbackQuerySchema") return "accept-and-project";
  return syntaxPolicy;
}

function provenance(root, checker, schema, kind) {
  const node = unbox(schema);
  const imported = importedSchema(root, node);
  const resolved = schemaDeclaration(checker, node);
  const declarationNode = resolved?.declarationNode;
  const schemaModule = imported?.module ?? "local-or-unresolved";
  const schemaSymbol = imported?.name ?? resolved?.value?.getName() ?? semanticNodeText(node);
  const syntaxPolicy = schemaPolicy(root, checker, node);
  return {
    schemaSymbol,
    schemaModule,
    schemaLocation: imported?.location ?? (declarationNode ? loc(root, declarationNode) : loc(root, node)),
    policy: semanticPolicy(kind, schemaModule, schemaSymbol, syntaxPolicy),
    syntaxPolicy,
  };
}
function handlerReads(checker, fn) {
  const found = new Map();
  const visited = new Set();
  const initialContexts = new Set(fn.parameters
    .filter((parameter) => ts.isIdentifier(parameter.name) && (/[Cc]ontext/.test(parameter.type?.getText() ?? "") || ["c", "context"].includes(parameter.name.text)))
    .map((parameter) => parameter.name.text));
  const scan = (current, contextNames = new Set(), requestNames = new Set()) => {
    if (!current) return;
    const visitKey = `${current.getSourceFile().fileName}:${current.pos}:${[...contextNames].sort()}:${[...requestNames].sort()}`;
    if (visited.has(visitKey)) return;
    visited.add(visitKey);
    const currentText = current.body?.getText() ?? "";
    const visit = (node) => {
      if (ts.isFunctionLike(node) && node !== current) return;
      if (ts.isPropertyAccessExpression(node) && node.name.text === "url") {
        const receiver = text(node.expression);
        const contextUrl = [...contextNames].some((name) => receiver === `${name}.req` || receiver === `${name}.req.raw`);
        if (contextUrl) {
          const parentCall = ts.isCallExpression(node.parent) || ts.isNewExpression(node.parent) ? node.parent : undefined;
          const parentName = parentCall && ts.isCallExpression(parentCall) ? calledName(parentCall) ?? "" : "";
          found.set(/Query/.test(parentName) ? "raw-query" : "raw-param", node);
        }
      }
      if (ts.isCallExpression(node)) {
        const member = ts.isPropertyAccessExpression(node.expression) ? node.expression.name.text : calledName(node) ?? "";
        const receiver = ts.isPropertyAccessExpression(node.expression) ? text(node.expression.expression) : "";
        const contextRequest = [...contextNames].some((name) => receiver === `${name}.req` || receiver === `${name}.req.raw`);
        const requestAlias = requestNames.has(receiver);
        if (contextRequest && ["json", "jsonBody"].includes(member)) found.set("raw-json", node);
        if (contextRequest && ["query", "queries"].includes(member)) found.set("raw-query", node);
        if (contextRequest && member === "param") found.set("raw-param", node);
        if (contextRequest && ["formData", "parseBody"].includes(member)) found.set(member === "formData" ? "form-data" : "multipart-or-url-encoded", node);
        if (requestAlias && (member === "json" || member === "text" && currentText.includes("application/json"))) found.set("raw-json", node);
        if (requestAlias && member === "formData") found.set("form-data", node);

        const child = functionDeclaration(declaration(checker, unbox(node.expression)));
        if (child) {
          const childContexts = new Set();
          const childRequests = new Set();
          child.parameters.forEach((parameter, index) => {
            if (!ts.isIdentifier(parameter.name) || !node.arguments[index]) return;
            const argument = unbox(node.arguments[index]);
            const argumentText = text(argument);
            if (ts.isIdentifier(argument) && contextNames.has(argument.text)) childContexts.add(parameter.name.text);
            if (ts.isIdentifier(argument) && requestNames.has(argument.text)
              || [...contextNames].some((name) => argumentText === `${name}.req.raw`)) childRequests.add(parameter.name.text);
          });
          scan(child, childContexts, childRequests);
        }
      }
      ts.forEachChild(node, visit);
    };
    if (current.body) visit(current.body);
  };
  scan(fn, initialContexts);
  return found;
}
function responses(root, checker, fn) {
  const result = []; const visited = new Set();
  const scan = (current) => {
    if (!current || visited.has(current)) return; visited.add(current);
    const visit = (node) => {
      if (ts.isFunctionLike(node) && node !== current) return;
      if (ts.isCallExpression(node) && ts.isPropertyAccessExpression(node.expression)) {
        const kind = node.expression.name.text;
        if (["json", "text", "html", "body", "redirect"].includes(kind)) result.push({ ...loc(root, node), kind: kind === "json" ? "json" : "non-json", expression: node.arguments[0] ? semanticNodeText(node.arguments[0]) : "<no body>" });
      }
      if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Response") result.push({ ...loc(root, node), kind: "response-constructor", expression: node.arguments?.[0] ? semanticNodeText(node.arguments[0]) : "<no body>" });
      if (ts.isCallExpression(node)) { const child = functionDeclaration(declaration(checker, unbox(node.expression))); if (child && child.getSourceFile() === fn.getSourceFile()) scan(child); }
      ts.forEachChild(node, visit);
    };
    if (current.body) visit(current.body);
  };
  scan(fn); return result;
}

class Evaluator {
  constructor(root, checker) {
    this.root = root;
    this.checker = checker;
    this.routes = [];
    this.diagnostics = [];
    this.visited = new Set();
    this.anonymousHandlerSymbols = new WeakMap();
    this.anonymousHandlerOccurrences = new Map();
  }
  fail(node, message) { this.diagnostics.push({ ...loc(this.root, node), expression: semanticNodeText(node), message }); }
  strings(node, environment = new Map(), seen = new Set()) {
    node = unbox(node); if (seen.has(node)) throw new Error("cyclic expression"); seen.add(node);
    if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [node.text];
    if (node.kind === ts.SyntaxKind.TrueKeyword) return ["true"];
    if (node.kind === ts.SyntaxKind.FalseKeyword) return ["false"];
    if (ts.isPropertyAccessExpression(node) && ts.isIdentifier(node.expression) && environment.has(`${node.expression.text}.${node.name.text}`)) return environment.get(`${node.expression.text}.${node.name.text}`);
    if (ts.isArrayLiteralExpression(node)) return node.elements.flatMap((item) => this.strings(item, environment, seen));
    if (ts.isTemplateExpression(node)) {
      let values = [node.head.text];
      for (const span of node.templateSpans) values = values.flatMap((prefix) => this.strings(span.expression, environment, seen).map((value) => `${prefix}${value}${span.literal.text}`));
      return values;
    }
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) return this.strings(node.left, environment, seen).flatMap((left) => this.strings(node.right, environment, seen).map((right) => `${left}${right}`));
    if (ts.isIdentifier(node)) {
      if (environment.has(node.text)) return environment.get(node.text);
      const value = declaration(this.checker, node);
      if (value && ts.isVariableDeclaration(value) && value.initializer) return this.strings(value.initializer, environment, seen);
    }
    if (ts.isCallExpression(node)) {
      const pathBuilder = calledName(node);
      if (pathBuilder && PATH_PREFIXES[pathBuilder]) {
        const suffix = node.arguments[0] ? this.strings(node.arguments[0], environment, seen) : [""];
        return suffix.map((item) => join(PATH_PREFIXES[pathBuilder], item));
      }
      const fn = functionDeclaration(declaration(this.checker, unbox(node.expression)));
      if (fn) {
        const scope = new Map(environment);
        fn.parameters.forEach((parameter, index) => { if (ts.isIdentifier(parameter.name)) scope.set(parameter.name.text, node.arguments[index] ? this.strings(node.arguments[index], environment) : [""]); });
        const returned = ts.isBlock(fn.body) ? fn.body.statements.find(ts.isReturnStatement)?.expression : fn.body;
        if (returned) return this.strings(returned, scope, seen);
      }
    }
    throw new Error("unresolved expression");
  }
  resolveHandler(node, seen = new Set()) {
    node = unbox(node);
    const key = `${node.getSourceFile().fileName}:${node.pos}:${node.end}`;
    if (seen.has(key)) return undefined;
    seen.add(key);
    if (ts.isArrowFunction(node) || ts.isFunctionExpression(node)) return { fn: node, identityNode: node };
    const fn = functionDeclaration(declaration(this.checker, ts.isCallExpression(node) ? unbox(node.expression) : node));
    if (!fn) return undefined;
    if (ts.isCallExpression(node)) {
      const returned = ts.isBlock(fn.body) ? fn.body.statements.find(ts.isReturnStatement)?.expression : fn.body;
      const resolved = returned ? this.resolveHandler(returned, seen) : undefined;
      if (resolved) return { ...resolved, identityNode: node };
      return { symbol: nameOf(fn) ?? "<factory>", fn };
    }
    return { symbol: nameOf(fn), fn, identityNode: fn };
  }
  handlerSymbol(handler, method, paths, mount) {
    if (!handler) return "<unresolved-handler>";
    if (handler.symbol) return handler.symbol;
    const identityNode = handler.identityNode ?? handler.fn;
    const existing = this.anonymousHandlerSymbols.get(identityNode);
    if (existing) return existing;
    const base = anonymousHandlerSymbol(this.root, handler.fn);
    const mountedPaths = paths.map((routePath) => join(mount, routePath)).sort();
    const scope = crypto.createHash("sha256").update(`${method}\0${mountedPaths.join("\0")}`).digest("hex").slice(0, 8);
    const occurrenceKey = `${base}\0${scope}`;
    const occurrence = this.anonymousHandlerOccurrences.get(occurrenceKey) ?? 0;
    this.anonymousHandlerOccurrences.set(occurrenceKey, occurrence + 1);
    const result = `${base}:${scope}:${occurrence}`;
    this.anonymousHandlerSymbols.set(identityNode, result);
    return result;
  }
  register(call, method, paths, arguments_, mount) {
    const handler = this.resolveHandler(arguments_.at(-1));
    const handlerSymbol = this.handlerSymbol(handler, method, paths, mount);
    const carriers = [];
    for (const argument of arguments_) {
      const found = validator(this.checker, argument);
      if (found) {
        const carrier = { kind: found.kind, source: "validated", location: loc(this.root, found.source), ...provenance(this.root, this.checker, found.schema, found.kind) };
        if (!carrier.policy) this.fail(found.schema, "unable to prove request schema object policy");
        carriers.push({ ...carrier, policy: carrier.policy ?? "unresolved" });
      }
    }
    for (const [source, node] of handler?.fn ? handlerReads(this.checker, handler.fn) : []) {
      const kind = source === "raw-json" ? "json" : source === "raw-query" ? "query" : source === "raw-param" ? "param" : source;
      if (kind === "param" && !paths.some((routePath) => /[:*]/.test(routePath))) continue;
      if (carriers.some((carrier) => carrier.kind === kind)) continue;
      const rawQueryCall = ts.isCallExpression(node.parent) ? calledName(node.parent) : undefined;
      const policy = kind === "param" ? "non-object-applicable"
        : kind === "query" && rawQueryCall === "assertNoFudabaQuery" ? "reject"
          : "accept-and-project";
      carriers.push({ kind, source, location: loc(this.root, node), schemaSymbol: null, schemaModule: null, schemaLocation: null, policy, syntaxPolicy: null });
    }
    if (!carriers.length) carriers.push({ kind: "no-input", source: "handler-analysis", location: loc(this.root, call), schemaSymbol: null, schemaModule: null, schemaLocation: null, policy: "non-object-applicable" });
    for (const routePath of paths) this.routes.push({ method, path: join(mount, routePath), registration: loc(this.root, call), handlerSymbol, carriers, responses: handler?.fn ? responses(this.root, this.checker, handler.fn) : [] });
  }
  call(call, mount, environment, routers) {
    const expression = unbox(call.expression);
    if (ts.isPropertyAccessExpression(expression) && ts.isIdentifier(unbox(expression.expression)) && routers.has(unbox(expression.expression).text)) {
      const operation = expression.name.text;
      if (METHODS.has(operation)) {
        try { this.register(call, operation.toUpperCase(), this.strings(call.arguments[0], environment), [...call.arguments.slice(1)], mount); } catch { this.fail(call.arguments[0] ?? call, "unresolved dynamic route path"); }
        return;
      }
      if (operation === "on") {
        try { for (const method of this.strings(call.arguments[0], environment)) this.register(call, method.toUpperCase(), this.strings(call.arguments[1], environment), [...call.arguments.slice(2)], mount); } catch { this.fail(call, "unresolved dynamic .on method or path"); }
        return;
      }
      if (operation === "route") {
        try { for (const prefix of this.strings(call.arguments[0], environment)) this.factory(call.arguments[1], join(mount, prefix), environment); } catch { this.fail(call.arguments[0] ?? call, "unresolved dynamic router mount prefix"); }
        return;
      }
    }
    const fn = functionDeclaration(declaration(this.checker, unbox(call.expression)));
    if (fn && ts.isIdentifier(unbox(call.arguments[0])) && routers.has(unbox(call.arguments[0]).text)) this.function(fn, mount, environment, call.arguments);
  }
  factory(expression, mount, environment) {
    const call = unbox(expression);
    if (!ts.isCallExpression(call)) return this.fail(call, "router mount target is not a statically invokable factory");
    const fn = functionDeclaration(declaration(this.checker, unbox(call.expression)));
    if (!fn) return this.fail(call, "unresolved router factory");
    this.function(fn, mount, environment, call.arguments);
  }
  statement(statement, mount, environment, routers) {
    if (ts.isBlock(statement)) { for (const item of statement.statements) this.statement(item, mount, new Map(environment), new Set(routers)); return; }
    if (ts.isVariableStatement(statement)) {
      for (const value of statement.declarationList.declarations) {
        if (!ts.isIdentifier(value.name) || !value.initializer) continue;
        const initializer = unbox(value.initializer);
        const isHonoInstance = ts.isNewExpression(initializer) && ts.isIdentifier(initializer.expression) && initializer.expression.text === "Hono";
        if (isHonoInstance || (ts.isCallExpression(initializer) && isRouterFactory(initializer, this.checker))) routers.add(value.name.text);
      }
      return;
    }
    if (ts.isExpressionStatement(statement) && ts.isCallExpression(unbox(statement.expression))) return this.call(unbox(statement.expression), mount, environment, routers);
    if (ts.isForOfStatement(statement)) {
      if (!ts.isVariableDeclarationList(statement.initializer)) return this.fail(statement, "unresolved dynamic route loop binding");
      const binding = statement.initializer.declarations[0]?.name;
      const source = unbox(statement.expression);
      try {
        const array = ts.isIdentifier(source) && declaration(this.checker, source) instanceof Object && ts.isVariableDeclaration(declaration(this.checker, source)) ? unbox(declaration(this.checker, source).initializer) : source;
        if (!ts.isArrayLiteralExpression(array)) throw new Error("not a literal array");
        for (const item of array.elements) {
          const next = new Map(environment);
          if (ts.isIdentifier(binding)) {
            if (ts.isObjectLiteralExpression(unbox(item))) {
              for (const property of unbox(item).properties) {
                if (ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)) next.set(`${binding.text}.${property.name.text}`, this.strings(property.initializer, environment));
              }
            } else {
              next.set(binding.text, this.strings(item, environment));
            }
          } else if (ts.isArrayBindingPattern(binding) && ts.isArrayLiteralExpression(unbox(item))) binding.elements.forEach((element, index) => { if (ts.isBindingElement(element) && ts.isIdentifier(element.name) && unbox(item).elements[index]) next.set(element.name.text, this.strings(unbox(item).elements[index], environment)); });
          else throw new Error("unsupported binding");
          this.statement(statement.statement, mount, next, new Set(routers));
        }
      } catch { this.fail(statement.expression, "unresolved dynamic route loop source"); }
      return;
    }
    if (ts.isIfStatement(statement)) {
      let condition; try { condition = this.strings(statement.expression, environment); } catch {}
      if (condition?.every((value) => value === "true")) this.statement(statement.thenStatement, mount, environment, routers);
      else if (condition?.every((value) => value === "false")) { if (statement.elseStatement) this.statement(statement.elseStatement, mount, environment, routers); }
      else { this.statement(statement.thenStatement, mount, environment, routers); if (statement.elseStatement) this.statement(statement.elseStatement, mount, environment, routers); }
    }
  }
  function(fn, mount = "", outer = new Map(), arguments_ = []) {
    const key = `${fn.getSourceFile().fileName}:${fn.pos}:${mount}:${arguments_.map(text).join(",")}`; if (this.visited.has(key)) return; this.visited.add(key);
    const environment = new Map(outer);
    fn.parameters.forEach((parameter, index) => { if (ts.isIdentifier(parameter.name) && arguments_[index]) { try { environment.set(parameter.name.text, this.strings(arguments_[index], outer)); } catch {} } });
    const routers = new Set(); if (fn.parameters[0] && ts.isIdentifier(fn.parameters[0].name)) routers.add(fn.parameters[0].name.text);
    if (fn.body && ts.isBlock(fn.body)) for (const statement of fn.body.statements) this.statement(statement, mount, environment, routers);
  }
}
function entryFunction(program, file, symbolName) {
  const source = program.getSourceFile(file); if (!source) throw new Error(`entry source is not part of the program: ${file}`);
  for (const statement of source.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name?.text === symbolName) return statement;
    if (ts.isVariableStatement(statement)) { const value = statement.declarationList.declarations.find((item) => ts.isIdentifier(item.name) && item.name.text === symbolName); if (value) return functionDeclaration(value.initializer); }
  }
  throw new Error(`entry symbol is not a function: ${symbolName}`);
}
function policyCounts(carriers) {
  return Object.fromEntries(["reject", "accept-and-project", "passthrough", "non-object-applicable"]
    .map((policy) => [policy, carriers.filter((carrier) => carrier.policy === policy).length]));
}

function reconciliationIssue(message, expression) {
  return { file: "scripts/contracts/compile-route-inventory.mjs", line: 1, expression, message };
}

export function collectRouteInventory(root, { entry = "apps/api/src/app.ts", entrySymbol = "createHonoApp" } = {}) {
  const roots = entry.startsWith("apps/") ? filesUnder(path.join(root, "apps/api/src")) : filesUnder(root);
  const program = ts.createProgram({ rootNames: roots, options: { allowJs: true, checkJs: false, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, baseUrl: root, paths: { "@/*": ["apps/api/src/*"] }, skipLibCheck: true } });
  const evaluator = new Evaluator(root, program.getTypeChecker());
  evaluator.function(entryFunction(program, path.join(root, entry), entrySymbol));
  const unique = new Map();
  for (const route of evaluator.routes) {
    const key = `${route.method}\0${route.path}\0${route.handlerSymbol}`;
    if (!unique.has(key)) unique.set(key, route);
  }
  const routes = [...unique.values()].sort((a, b) => `${a.method} ${a.path} ${a.handlerSymbol}`.localeCompare(`${b.method} ${b.path} ${b.handlerSymbol}`));
  const businessRoutes = routes.filter((route) => route.carriers.some((carrier) => carrier.kind !== "no-input"));
  const noInputRoutes = routes.filter((route) => route.carriers.some((carrier) => carrier.kind === "no-input")).length;
  const carriers = businessRoutes.flatMap((route) => route.carriers
    .filter((carrier) => carrier.kind !== "no-input")
    .map((carrier) => ({ method: route.method, path: route.path, handlerSymbol: route.handlerSymbol, ...carrier })));
  const diagnostics = [...evaluator.diagnostics];
  const carrierKeys = new Set();
  for (const carrier of carriers) {
    const key = `${carrier.method}\0${carrier.path}\0${carrier.kind}\0${carrier.schemaModule}\0${carrier.schemaSymbol}`;
    if (carrierKeys.has(key)) diagnostics.push(reconciliationIssue("duplicate request carrier record", key));
    carrierKeys.add(key);
  }

  const enforceBaseline = entry === "apps/api/src/app.ts" && entrySymbol === "createHonoApp";
  const additionKeys = new Set(EXPLICIT_QUERY_ADDITIONS.map((addition) => `${addition.module}\0${addition.symbol}`));
  const explicitQueryCarriers = carriers.filter((carrier) =>
    carrier.kind === "query" && additionKeys.has(`${carrier.schemaModule}\0${carrier.schemaSymbol}`));
  const explicitQueryAdditions = (enforceBaseline ? EXPLICIT_QUERY_ADDITIONS : []).map((addition) => {
    const matching = explicitQueryCarriers.filter((carrier) => carrier.schemaModule === addition.module && carrier.schemaSymbol === addition.symbol);
    if (matching.length !== addition.carriers || matching.some((carrier) => carrier.policy !== addition.policy)) {
      diagnostics.push(reconciliationIssue(
        `explicit query addition ${addition.module}:${addition.symbol} expected ${addition.carriers} ${addition.policy} carriers, found ${matching.length}`,
        addition.symbol,
      ));
    }
    return { ...addition, actualCarriers: matching.length, routes: matching.map((carrier) => `${carrier.method} ${carrier.path}`).sort() };
  });
  const baselineCarriers = carriers.filter((carrier) =>
    !(carrier.kind === "query" && additionKeys.has(`${carrier.schemaModule}\0${carrier.schemaSymbol}`)));
  const baselineRouteCount = new Set(baselineCarriers.map((carrier) => `${carrier.method}\0${carrier.path}`)).size;
  const baselinePolicies = policyCounts(baselineCarriers);
  const baselineChecks = [
    ["mounted method/path", baselineRouteCount, BASELINE.mountedMethodPaths],
    ["request carriers", baselineCarriers.length, BASELINE.carriers],
    ["reject", baselinePolicies.reject, BASELINE.reject],
    ["accept-and-project", baselinePolicies["accept-and-project"], BASELINE.acceptAndProject],
    ["passthrough", baselinePolicies.passthrough, BASELINE.passthrough],
    ["non-object-applicable", baselinePolicies["non-object-applicable"], BASELINE.nonObjectApplicable],
  ];
  if (enforceBaseline) {
    for (const [label, actual, expected] of baselineChecks) {
      if (actual !== expected) diagnostics.push(reconciliationIssue(`baseline-compatible ${label} expected ${expected}, found ${actual}`, label));
    }
  }

  const policies = policyCounts(carriers);
  const responseItems = routes.flatMap((route) => route.responses
    .map((response) => ({ method: route.method, path: route.path, handlerSymbol: route.handlerSymbol, ...response })));
  const routeGroup = (route) => `/${route.path.split("/").filter(Boolean).slice(0, 2).join("/") || "root"}`;
  const routeGroups = Object.fromEntries([...new Set(routes.map(routeGroup))].sort()
    .map((group) => [group, routes.filter((route) => routeGroup(route) === group).length]));
  const inventory = {
    format: "imsweb-compiler-route-inventory/v1",
    generation: {
      command: "node scripts/contracts/compile-route-inventory.mjs --write",
      reportCommand: "node scripts/contracts/compile-route-inventory.mjs --report",
      semanticDigest: null,
      entry,
      entrySymbol,
    },
    baseline: BASELINE,
    counts: {
      mountedRegistrations: routes.length,
      mountedMethodPaths: new Set(businessRoutes.map((route) => `${route.method}\0${route.path}`)).size,
      noInputRoutes,
      requestCarriers: carriers.length,
      policies,
      responses: { total: responseItems.length, json: responseItems.filter((item) => item.kind === "json").length, nonJson: responseItems.filter((item) => item.kind !== "json").length },
      unresolved: diagnostics.length,
    },
    reconciliation: {
      baselineCompatible: { mountedMethodPaths: baselineRouteCount, requestCarriers: baselineCarriers.length, policies: baselinePolicies },
      explicitQueryAdditions,
      routeGroups,
    },
    diagnostics: diagnostics.sort((a, b) => `${a.file}:${a.line}:${a.message}`.localeCompare(`${b.file}:${b.line}:${b.message}`)),
    routes,
    carriers,
    responses: responseItems,
  };
  inventory.generation.semanticDigest = semanticDigest(inventory);
  return inventory;
}
export function reconciliation(inventory) {
  const compatible = inventory.reconciliation.baselineCompatible;
  const additions = inventory.reconciliation.explicitQueryAdditions.map((addition) =>
    `- \`${addition.module}:${addition.symbol}\`: ${addition.actualCarriers} ${addition.policy} carriers on ${addition.routes.map((route) => `\`${route}\``).join(", ")}.`);
  return [
    "# Current API wire inventory",
    "",
    `Semantic digest: \`${inventory.generation.semanticDigest}\``,
    "",
    "## Counts",
    "",
    "| Metric | Current source | Baseline-compatible subset | Approved baseline |",
    "| --- | ---: | ---: | ---: |",
    `| Request-consuming method/path instances | ${inventory.counts.mountedMethodPaths} | ${compatible.mountedMethodPaths} | ${BASELINE.mountedMethodPaths} |`,
    `| Request carriers | ${inventory.counts.requestCarriers} | ${compatible.requestCarriers} | ${BASELINE.carriers} |`,
    `| Reject | ${inventory.counts.policies.reject} | ${compatible.policies.reject} | ${BASELINE.reject} |`,
    `| Accept and project | ${inventory.counts.policies["accept-and-project"]} | ${compatible.policies["accept-and-project"]} | ${BASELINE.acceptAndProject} |`,
    `| Passthrough | ${inventory.counts.policies.passthrough} | ${compatible.policies.passthrough} | ${BASELINE.passthrough} |`,
    `| Non-object applicable | ${inventory.counts.policies["non-object-applicable"]} | ${compatible.policies["non-object-applicable"]} | ${BASELINE.nonObjectApplicable} |`,
    `| All mounted registrations | ${inventory.counts.mountedRegistrations} | n/a | n/a |`,
    `| No-input registrations | ${inventory.counts.noInputRoutes} | n/a | n/a |`,
    `| Linked response expressions | ${inventory.counts.responses.total} | n/a | n/a |`,
    "",
    "## Reconciliation",
    "",
    `The compiler inventory resolves all ${inventory.counts.mountedRegistrations} registrations. It finds ${inventory.counts.requestCarriers} current carriers on ${inventory.counts.mountedMethodPaths} method/path instances. Compatibility aliases remain distinct, while exact duplicate registrations collapse only when method, path, and handler identity match.`,
    "",
    `Removing the ${inventory.counts.requestCarriers - compatible.requestCarriers} explicit query validators listed below produces ${compatible.mountedMethodPaths} method/path instances and ${compatible.requestCarriers} carriers. Those totals and all four policies match the approved ${BASELINE.mountedMethodPaths}/${BASELINE.carriers} baseline exactly. The added validators make previously accepted and ignored query surfaces visible to static enforcement; they do not remove a historical carrier.`,
    "",
    "## Explicit Query Validators",
    "",
    ...additions,
    "",
    "## Enforcement",
    "",
    "Policy provenance follows TypeScript symbols through aliases and contracts source initializers. Param policies reflect the final HTTP adapter semantics, not only the outer Zod object mode. Request-tainted helpers are followed across files; unrelated JSON parsing is not counted as a request carrier. An unresolved path, mount, schema policy, duplicate carrier, or baseline mismatch fails the command.",
    "",
    "## Fatal Diagnostics",
    "",
    ...(inventory.diagnostics.length ? inventory.diagnostics.map((issue) => `- ${issue.file}:${issue.line}: ${issue.message} (${issue.expression})`) : ["- None."]),
    "",
    "## Static Limits",
    "",
    "The evaluator cannot establish runtime-only registration or generated routes outside TypeScript source. Response expressions use complete canonical token text so semantic suffix changes remain freshness inputs.",
    "",
  ].join("\n");
}
function outputs(root) {
  return {
    json: path.join(root, "scripts/contracts/current-wire-contract-inventory.json"),
  };
}
export function runInventoryCli(arguments_, options = {}) {
  const supported = new Set(["--write", "--report"]);
  const unknown = arguments_.filter((argument) => !supported.has(argument));
  if (unknown.length) throw new Error(`unknown route inventory option: ${unknown[0]}`);
  if (new Set(arguments_).size !== arguments_.length) throw new Error("route inventory options may only be specified once");
  if (arguments_.includes("--write") && arguments_.includes("--report")) {
    throw new Error("--write and --report are separate route inventory modes");
  }

  const root = options.root ?? path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const output = options.output ?? outputs(root);
  const inventory = collectRouteInventory(root, options.collectOptions);
  const artifact = routeInventoryArtifact(inventory);
  const json = `${JSON.stringify(artifact, null, 2)}\n`;
  const writeStdout = options.writeStdout ?? ((value) => process.stdout.write(value));

  if (arguments_.includes("--report")) {
    writeStdout(`${reconciliation(artifact)}\n`);
    if (inventory.diagnostics.length) throw new InventoryFailure(inventory.diagnostics);
    return artifact;
  }
  if (inventory.diagnostics.length) throw new InventoryFailure(inventory.diagnostics);
  if (arguments_.includes("--write")) {
    fs.mkdirSync(path.dirname(output.json), { recursive: true });
    fs.writeFileSync(output.json, json);
  } else if (!fs.existsSync(output.json) || fs.readFileSync(output.json, "utf8") !== json) {
    throw new Error("compiler route inventory is stale; run node scripts/contracts/compile-route-inventory.mjs --write");
  }
  writeStdout(`compiler route inventory: ${artifact.counts.mountedMethodPaths} mounted method/path instances, ${artifact.counts.requestCarriers} carriers, ${artifact.counts.responses.total} response expressions\n`);
  return artifact;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) { try { runInventoryCli(process.argv.slice(2)); } catch (error) { process.stderr.write(`${error.message}\n`); process.exitCode = 1; } }
