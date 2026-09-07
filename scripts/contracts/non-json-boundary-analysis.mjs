import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(new URL("../../packages/contracts/package.json", import.meta.url));
const ts = require("typescript");
const sourceExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const routeMethods = new Set(["get", "post", "put", "patch", "delete", "options", "all", "on", "use", "notFound"]);
function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const item = path.join(directory, entry.name);
    return entry.isDirectory()
      ? filesUnder(item)
      : sourceExtensions.has(path.extname(item)) ? [item] : [];
  });
}

export function relative(root, file) {
  return path.relative(root, file).split(path.sep).join("/");
}

export function createBoundaryProgram(root, directories = ["apps/api/src"]) {
  const rootNames = directories.flatMap((directory) => filesUnder(path.join(root, directory)));
  return ts.createProgram({
    rootNames,
    options: {
      allowJs: true,
      checkJs: false,
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.NodeNext,
      moduleResolution: ts.ModuleResolutionKind.NodeNext,
      skipLibCheck: true,
      strict: true,
      target: ts.ScriptTarget.ES2022,
      baseUrl: root,
      paths: { "@/*": ["apps/api/src/*"], "~/*": ["apps/web/app/*"] },
    },
  });
}

export function unparenthesize(node) {
  while (
    ts.isParenthesizedExpression(node)
    || ts.isAsExpression(node)
    || ts.isTypeAssertionExpression(node)
    || ts.isSatisfiesExpression(node)
  ) node = node.expression;
  while (ts.isAwaitExpression(node)) node = node.expression;
  return node;
}

export function unaliasedSymbol(checker, node) {
  let symbol = checker.getSymbolAtLocation(node);
  if (symbol?.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  return symbol;
}

function functionLikeFromDeclaration(checker, declaration, visited) {
  if (!declaration || visited.has(declaration)) return [];
  visited.add(declaration);
  if (ts.isFunctionLike(declaration)) return [{ node: declaration, identity: declaration }];
  if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
    return functionLikesForExpression(checker, declaration.initializer, visited, declaration);
  }
  return [];
}

function returnedFunctions(checker, functionLike, visited, identity) {
  const body = functionLike.body;
  if (!body) return [];
  if (!ts.isBlock(body)) return functionLikesForExpression(checker, body, visited, identity);
  const results = [];
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node !== functionLike) return;
    if (ts.isReturnStatement(node) && node.expression) {
      results.push(...functionLikesForExpression(checker, node.expression, visited, identity));
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(body, visit);
  return results;
}

export function functionLikesForExpression(checker, expression, visited = new Set(), identity) {
  const node = unparenthesize(expression);
  if (ts.isArrowFunction(node) || ts.isFunctionExpression(node) || ts.isFunctionDeclaration(node)) {
    return [{ node, identity: identity ?? node }];
  }
  if (ts.isIdentifier(node)) {
    const symbol = unaliasedSymbol(checker, node);
    return functionLikeFromDeclaration(checker, symbol?.valueDeclaration, visited);
  }
  if (ts.isCallExpression(node)) {
    const target = functionLikesForExpression(checker, node.expression, visited);
    return target.flatMap(({ node: functionLike, identity: targetIdentity }) =>
      returnedFunctions(checker, functionLike, visited, targetIdentity));
  }
  return [];
}

function declarationName(node) {
  if (ts.isFunctionDeclaration(node) || ts.isClassDeclaration(node)) return node.name?.text;
  if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name)) return node.name.text;
  return undefined;
}

export function functionIdentity(root, checker, functionLike, identity = functionLike) {
  const sourceFile = functionLike.getSourceFile();
  const line = sourceFile.getLineAndCharacterOfPosition(functionLike.getStart(sourceFile)).line + 1;
  if (identity === functionLike && (ts.isArrowFunction(identity) || ts.isFunctionExpression(identity))) {
    return {
      file: relative(root, sourceFile.fileName),
      symbol: `<inline@${line}>`,
      inline: true,
      node: functionLike,
    };
  }
  let current = identity;
  while (current && !declarationName(current)) current = current.parent;
  const symbol = declarationName(current);
  return {
    file: relative(root, sourceFile.fileName),
    symbol: symbol ?? `<inline@${line}>`,
    inline: !symbol,
    node: functionLike,
  };
}

function calledName(checker, expression) {
  const node = unparenthesize(expression);
  if (!ts.isIdentifier(node)) return undefined;
  return unaliasedSymbol(checker, node)?.getName() ?? node.text;
}

function responseKinds(checker, functionLike, visited = new Set()) {
  if (visited.has(functionLike)) return new Set();
  visited.add(functionLike);
  const kinds = new Set();
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node !== functionLike) return;
    if (ts.isCallExpression(node)) {
      const expression = unparenthesize(node.expression);
      if (ts.isPropertyAccessExpression(expression)) {
        const receiver = unparenthesize(expression.expression);
        if (ts.isIdentifier(receiver) && ["c", "context"].includes(receiver.text)) {
          if (expression.name.text === "body") {
            const first = unparenthesize(node.arguments[0] ?? node);
            kinds.add(first.kind === ts.SyntaxKind.NullKeyword ? "no-content" : "binary");
          }
          if (expression.name.text === "html") kinds.add("html");
          if (expression.name.text === "redirect") kinds.add("redirect");
          if (expression.name.text === "text") {
            const status = unparenthesize(node.arguments[1] ?? node);
            kinds.add(ts.isNumericLiteral(status) && Number(status.text) < 400
              ? "static"
              : "compatibility-text-error");
          }
        }
      }
      const name = calledName(checker, expression);
      if (name) {
        for (const target of functionLikesForExpression(checker, expression)) {
          for (const kind of responseKinds(checker, target.node, visited)) kinds.add(kind);
        }
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Response") {
      const body = unparenthesize(node.arguments?.[0] ?? node);
      const init = node.arguments?.[1];
      const statusProperty = init && ts.isObjectLiteralExpression(unparenthesize(init))
        ? unparenthesize(init.properties.find((property) =>
          ts.isPropertyAssignment(property)
          && ((ts.isIdentifier(property.name) && property.name.text === "status")
            || (ts.isStringLiteral(property.name) && property.name.text === "status")))?.initializer ?? node)
        : undefined;
      const status = statusProperty && ts.isNumericLiteral(statusProperty) ? Number(statusProperty.text) : undefined;
      if (body.kind === ts.SyntaxKind.NullKeyword) {
        kinds.add(status && status >= 300 && status < 400 ? "redirect" : "no-content");
      } else if (ts.isCallExpression(body) && ts.isPropertyAccessExpression(unparenthesize(body.expression))
        && unparenthesize(body.expression).name.text === "stringify") {
        // JSON helpers are deliberately outside the non-JSON exception inventory.
      } else if (ts.isStringLiteral(body) || ts.isNoSubstitutionTemplateLiteral(body) || !status || status >= 400) {
        kinds.add(status !== undefined && status < 400 ? "static" : "compatibility-text-error");
      } else {
        kinds.add("binary");
      }
    }
    ts.forEachChild(node, visit);
  };
  if (functionLike.body) visit(functionLike.body);
  return kinds;
}

export function responseSourceFiles(checker, functionLike, visited = new Set()) {
  if (visited.has(functionLike)) return new Set();
  visited.add(functionLike);
  const sources = new Set();
  for (const returned of returnedFunctions(checker, functionLike, new Set(), functionLike)) {
    for (const source of responseSourceFiles(checker, returned.node, visited)) sources.add(source);
  }
  const visit = (node) => {
    if (ts.isFunctionLike(node) && node !== functionLike) return;
    if (ts.isCallExpression(node)) {
      const expression = unparenthesize(node.expression);
      if (ts.isPropertyAccessExpression(expression)) {
        const receiver = unparenthesize(expression.expression);
        if (ts.isIdentifier(receiver) && ["c", "context"].includes(receiver.text)
          && ["body", "html", "redirect", "text"].includes(expression.name.text)) {
          sources.add(node.getSourceFile().fileName);
        }
      }
      const name = calledName(checker, expression);
      if (name) {
        for (const target of functionLikesForExpression(checker, expression)) {
          for (const source of responseSourceFiles(checker, target.node, visited)) sources.add(source);
        }
      }
    }
    if (ts.isNewExpression(node) && ts.isIdentifier(node.expression) && node.expression.text === "Response") {
      sources.add(node.getSourceFile().fileName);
    }
    ts.forEachChild(node, visit);
  };
  if (functionLike.body) visit(functionLike.body);
  return sources;
}

function isRouteRegistration(call) {
  const expression = unparenthesize(call.expression);
  return ts.isPropertyAccessExpression(expression) && routeMethods.has(expression.name.text);
}

function isRouterFactoryCall(checker, call) {
  const name = calledName(checker, call.expression);
  return Boolean(name && /(?:Routes|Router)$/.test(name));
}

export function collectRegisteredNonJsonHandlers(root) {
  const program = createBoundaryProgram(root);
  const checker = program.getTypeChecker();
  const app = program.getSourceFile(path.join(root, "apps/api/src/app.ts"));
  if (!app) throw new Error("apps/api/src/app.ts is not in the TypeScript program");
  let entry;
  const findEntry = (node) => {
    if (ts.isFunctionDeclaration(node) && node.name?.text === "createHonoApp") entry = node;
    ts.forEachChild(node, findEntry);
  };
  findEntry(app);
  if (!entry) throw new Error("createHonoApp is not live");

  const seenFunctions = new Set();
  const handlers = new Map();
  const visitFunction = (functionLike, identity = functionLike) => {
    const key = `${functionLike.getSourceFile().fileName}:${functionLike.pos}:${identity.pos}`;
    if (seenFunctions.has(key)) return;
    seenFunctions.add(key);
    const visit = (node) => {
      if (ts.isFunctionLike(node) && node !== functionLike) return;
      if (ts.isCallExpression(node)) {
        if (isRouteRegistration(node)) {
          // Every function argument can be a mounted middleware. Scanning only
          // the terminal handler leaves compatibility responses unreachable to
          // the manifest checker.
          for (const candidate of node.arguments) {
            const resolved = functionLikesForExpression(checker, candidate);
            for (const target of resolved) {
              const resolvedIdentity = functionIdentity(root, checker, target.node, target.identity);
              const kinds = responseKinds(checker, target.node);
              if (kinds.size) {
                const keyForHandler = `${resolvedIdentity.file}:${resolvedIdentity.symbol}`;
                const current = handlers.get(keyForHandler) ?? { ...resolvedIdentity, responseKinds: new Set() };
                for (const kind of kinds) current.responseKinds.add(kind);
                handlers.set(keyForHandler, current);
              }
            }
          }
        }
        if (isRouterFactoryCall(checker, node)) {
          for (const target of functionLikesForExpression(checker, node.expression)) visitFunction(target.node, target.identity);
        }
        for (const argument of node.arguments) {
          const nested = unparenthesize(argument);
          if (ts.isCallExpression(nested) && isRouterFactoryCall(checker, nested)) {
            for (const target of functionLikesForExpression(checker, nested.expression)) visitFunction(target.node, target.identity);
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(functionLike.body, visit);
  };
  visitFunction(entry);
  return { program, checker, handlers: [...handlers.values()].map((handler) => ({ ...handler, responseKinds: [...handler.responseKinds].sort() })) };
}

export function findNamedSymbol(program, checker, sourceFileName, name) {
  const sourceFile = program.getSourceFile(sourceFileName);
  if (!sourceFile) return undefined;
  let result;
  const visit = (node) => {
    if (result) return;
    if (declarationName(node) === name) result = unaliasedSymbol(checker, node.name);
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return result;
}

export function testEvidence(sourceFile) {
  const cases = new Map();
  const helpers = new Map();
  for (const statement of sourceFile.statements) {
    if (ts.isFunctionDeclaration(statement) && statement.name) helpers.set(statement.name.text, statement);
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name) && declaration.initializer
          && (ts.isArrowFunction(declaration.initializer) || ts.isFunctionExpression(declaration.initializer))) {
          helpers.set(declaration.name.text, declaration.initializer);
        }
      }
    }
  }
  const containsAssertion = (root, visitedHelpers = new Set()) => {
    let found = false;
    const inspect = (current) => {
      if (found) return;
      if (ts.isCallExpression(current)) {
        const called = unparenthesize(current.expression);
        if (ts.isIdentifier(called) && ["assert", "expect"].includes(called.text)) found = true;
        if (ts.isPropertyAccessExpression(called) && ts.isIdentifier(unparenthesize(called.expression))
          && ["assert", "expect"].includes(unparenthesize(called.expression).text)) found = true;
        if (ts.isIdentifier(called) && helpers.has(called.text) && !visitedHelpers.has(called.text)) {
          const nextVisited = new Set(visitedHelpers).add(called.text);
          if (containsAssertion(helpers.get(called.text).body, nextVisited)) found = true;
        }
      }
      ts.forEachChild(current, inspect);
    };
    inspect(root);
    return found;
  };
  const visit = (node) => {
    if (ts.isCallExpression(node) && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      const expression = unparenthesize(node.expression);
      const name = ts.isIdentifier(expression)
        ? expression.text
        : ts.isPropertyAccessExpression(expression) ? expression.name.text : undefined;
      const callback = node.arguments.find((argument) => ts.isArrowFunction(argument) || ts.isFunctionExpression(argument));
      if (["test", "it"].includes(name) && callback) {
        cases.set(node.arguments[0].text, { hasAssertion: containsAssertion(callback.body) });
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return cases;
}

export { ts };
