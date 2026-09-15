import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import {
  findNonJsonBoundary,
  loadNonJsonBoundaryManifest,
} from "./contracts/non-json-boundary-manifest.mjs";

// The contracts workspace owns the compiler dependency used by this source gate.
const ts = createRequire(new URL("../packages/contracts/package.json", import.meta.url))("typescript");

const sourceExtensions = new Set([".cjs", ".js", ".jsx", ".mjs", ".ts", ".tsx"]);
const validatorNames = new Set(["jsonSchemaValidator", "querySchemaValidator", "paramSchemaValidator"]);
const legacyValidatorNames = new Set(["jsonValidator", "queryValidator", "paramValidator"]);
const clientMethodNames = new Set(["Get", "Post", "Put", "Patch", "Delete", "Head"]);
const permissiveSchemaMembers = new Set(["transform", "default", "catch", "strip", "preprocess", "coerce"]);
const schemaExecutionMembers = new Set(["parse", "safeParse", "parseAsync", "safeParseAsync", "pipe", "transform", "default", "coerce", "preprocess", "catch"]);
const responseTypeName = /(?:Response|Result|Error|Failure|Success|Mutation|Page|List|Detail|Envelope|Output)$/;

function filesUnder(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return filesUnder(entryPath);
    return sourceExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

function relative(repositoryRoot, filePath) {
  return path.relative(repositoryRoot, filePath).split(path.sep).join("/");
}

function location(repositoryRoot, node) {
  const sourceFile = node.getSourceFile();
  const position = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
  return { file: relative(repositoryRoot, sourceFile.fileName), line: position.line + 1 };
}

function diagnostic(repositoryRoot, node, message) {
  return { ...location(repositoryRoot, node), message };
}

function sourceFiles(repositoryRoot, directory) {
  return filesUnder(path.join(repositoryRoot, directory)).filter((filePath) => /\.[jt]sx?$/.test(filePath));
}

function createProgram(repositoryRoot, roots) {
  return ts.createProgram({
    rootNames: roots,
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
      baseUrl: repositoryRoot,
      paths: { "@/*": ["apps/api/src/*"], "~/*": ["apps/web/app/*"] },
    },
  });
}

function unparenthesize(node) {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) node = node.expression;
  return node;
}

function importedModule(symbol) {
  if (!symbol) return undefined;
  for (const declaration of symbol.declarations ?? []) {
    let current = declaration;
    while (current && !ts.isImportDeclaration(current)) current = current.parent;
    if (current && ts.isStringLiteral(current.moduleSpecifier)) return current.moduleSpecifier.text;
  }
  return undefined;
}

function unaliasedSymbol(checker, node) {
  let symbol = checker.getSymbolAtLocation(node);
  if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
  return symbol;
}

function contractsModule(checker, node) {
  const symbol = unaliasedSymbol(checker, node);
  const module = importedModule(symbol) ?? importedModule(checker.getSymbolAtLocation(node));
  return module?.startsWith("@imsweb/contracts") ? module : undefined;
}

function symbolIsContractsOwned(symbol) {
  return Boolean(symbol && ((importedModule(symbol) ?? "").startsWith("@imsweb/contracts") || symbol.declarations?.some((declaration) => /[/\\]packages[/\\]contracts[/\\](?:src|dist)[/\\]/.test(declaration.getSourceFile().fileName))));
}

function typeIsContractsOwned(checker, type, visited = new Set()) {
  if (!type || visited.has(type)) return false;
  visited.add(type);
  const symbols = [type.aliasSymbol, type.symbol].filter(Boolean);
  if (symbols.some(symbolIsContractsOwned)) return true;
  if (type.isUnionOrIntersection?.()) return type.types.every((member) => typeIsContractsOwned(checker, member, visited));
  return false;
}

function typeNodeIsContractsOwned(checker, node, visited = new Set()) {
  if (visited.has(node)) return false;
  visited.add(node);
  if (ts.isTypeReferenceNode(node)) {
    if (isContractsExpression(checker, node.typeName)) return true;
    let symbol = checker.getSymbolAtLocation(node.typeName);
    if (symbol && symbol.flags & ts.SymbolFlags.Alias) symbol = checker.getAliasedSymbol(symbol);
    if (symbolIsContractsOwned(symbol)) return true;
    const alias = symbol?.declarations?.find(ts.isTypeAliasDeclaration);
    return Boolean(alias && typeNodeIsContractsOwned(checker, alias.type, visited));
  }
  if (ts.isUnionTypeNode(node) || ts.isIntersectionTypeNode(node)) return node.types.every((member) => typeNodeIsContractsOwned(checker, member, visited));
  return typeIsContractsOwned(checker, checker.getTypeFromTypeNode(node));
}

function isContractsExpression(checker, expression) {
  const node = unparenthesize(expression);
  return (ts.isIdentifier(node) || ts.isPropertyAccessExpression(node)) && Boolean(contractsModule(checker, node));
}

function typeNodeName(checker, node) {
  if (!ts.isTypeReferenceNode(node)) return undefined;
  const symbol = checker.getSymbolAtLocation(node.typeName);
  return symbol?.getName() ?? node.typeName.getText();
}

function isContractsTerminalType(checker, node) {
  return typeNodeIsContractsOwned(checker, node);
}

function typeExactlyAssigns(checker, expression, typeNode) {
  return checker.isTypeAssignableTo(checker.getTypeAtLocation(expression), checker.getTypeFromTypeNode(typeNode));
}

function hasOpenObjectIndex(checker, type) {
  return Boolean(type.flags & ts.TypeFlags.Object)
    && !checker.isArrayType(type)
    && !checker.isTupleType(type)
    && checker.getIndexInfosOfType(type).length > 0;
}

function typeMatchesTerminalExactly(checker, type, terminals) {
  if (type.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return undefined;
  if (hasOpenObjectIndex(checker, type)) return undefined;
  return terminals.find(({ type: terminal }) =>
    !hasOpenObjectIndex(checker, terminal)
    && checker.isTypeAssignableTo(type, terminal)
    && checker.isTypeAssignableTo(terminal, type));
}

function propertyType(checker, symbol, fallbackNode) {
  const declaration = symbol.valueDeclaration ?? symbol.declarations?.[0] ?? fallbackNode;
  return checker.getTypeOfSymbolAtLocation(symbol, declaration);
}

function directPropertyValue(literal, name) {
  for (let index = literal.properties.length - 1; index >= 0; index -= 1) {
    const property = literal.properties[index];
    if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name)) && property.name.text === name) return property.initializer;
    if (ts.isShorthandPropertyAssignment(property) && property.name.text === name) return property.name;
  }
  return undefined;
}

function exactObjectLiteralVariant(checker, literal, terminal) {
  if (terminal.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
  if (hasOpenObjectIndex(checker, terminal)) return false;
  const emitted = checker.getTypeAtLocation(literal);
  if (emitted.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
  if (hasOpenObjectIndex(checker, emitted)) return false;
  const emittedProperties = checker.getPropertiesOfType(emitted);
  const terminalProperties = checker.getPropertiesOfType(terminal);
  const emittedNames = emittedProperties.map((property) => property.getName()).sort();
  const terminalNames = terminalProperties.map((property) => property.getName()).sort();
  if (emittedNames.length !== terminalNames.length || emittedNames.some((name, index) => name !== terminalNames[index])) return false;
  return terminalProperties.every((target) => {
    const source = emittedProperties.find((property) => property.getName() === target.getName());
    if (!source) return false;
    const initializer = directPropertyValue(literal, target.getName());
    const sourceType = initializer ? checker.getTypeAtLocation(initializer) : propertyType(checker, source, literal);
    const targetType = propertyType(checker, target, literal);
    if (sourceType.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)) return false;
    if (hasOpenObjectIndex(checker, sourceType)) return false;
    return checker.isTypeAssignableTo(sourceType, targetType);
  });
}

function exactObjectLiteralTerminal(checker, literal, terminals) {
  for (const terminal of terminals) {
    const variants = terminal.type.isUnion?.() ? terminal.type.types : [terminal.type];
    if (variants.some((variant) => exactObjectLiteralVariant(checker, literal, variant))) return terminal;
  }
  return undefined;
}

function typeNodeContainsContractsTerminal(checker, typeNode) {
  if (ts.isUnionTypeNode(typeNode) || ts.isIntersectionTypeNode(typeNode)) return typeNode.types.some((member) => typeNodeContainsContractsTerminal(checker, member));
  return isContractsTerminalType(checker, typeNode);
}

function isContextTerminalType(checker, typeNode, terminals) {
  if (ts.isTypeReferenceNode(typeNode) && typeNode.typeName.getText() === "Promise" && typeNode.typeArguments?.[0]) return isContextTerminalType(checker, typeNode.typeArguments[0], terminals);
  return isContractsTerminalType(checker, typeNode);
}

function declarationForCall(checker, call) {
  const expression = unparenthesize(call.expression);
  const symbol = ts.isIdentifier(expression) ? unaliasedSymbol(checker, expression) : undefined;
  const declaration = symbol?.valueDeclaration;
  return declaration && ts.isFunctionLike(declaration) ? declaration : undefined;
}

function expressionProof(checker, expression, terminals = [], chain = [], visited = new Set()) {
  if (visited.has(expression)) return { ok: false, chain: [...chain, "cycle"] };
  visited.add(expression);

  if (ts.isSatisfiesExpression(expression) || ts.isAsExpression(expression) || ts.isTypeAssertionExpression(expression)) {
    if (isContextTerminalType(checker, expression.type, terminals) && typeExactlyAssigns(checker, expression.expression, expression.type)) {
      return { ok: true, chain: [...chain, `typed as ${typeNodeName(checker, expression.type)}`] };
    }
    return { ok: false, chain: [...chain, `typed as ${expression.type.getText()} (not a contracts terminal output type)`] };
  }

  const value = unparenthesize(expression);
  if (ts.isAwaitExpression(value)) return expressionProof(checker, value.expression, terminals, [...chain, "await"], visited);
  if (ts.isIdentifier(value)) {
    const declaration = unaliasedSymbol(checker, value)?.valueDeclaration;
    if (!declaration) return { ok: false, chain: [...chain, value.text] };
    if ((ts.isVariableDeclaration(declaration) || ts.isParameter(declaration)) && declaration.type) {
      if (isContextTerminalType(checker, declaration.type, terminals)) return { ok: true, chain: [...chain, `${value.text}: ${typeNodeName(checker, declaration.type)}`] };
      const narrowedTerminal = typeMatchesTerminalExactly(checker, checker.getTypeAtLocation(value), terminals);
      if (narrowedTerminal && typeNodeContainsContractsTerminal(checker, declaration.type)) return { ok: true, chain: [...chain, `${value.text}: narrowed ${narrowedTerminal.name}`] };
      return { ok: false, chain: [...chain, `${value.text}: ${declaration.type.getText()} (not a contracts terminal output type)`] };
    }
    if (ts.isVariableDeclaration(declaration) && declaration.initializer) return expressionProof(checker, declaration.initializer, terminals, [...chain, value.text], visited);
    return { ok: false, chain: [...chain, value.text] };
  }

  if (ts.isCallExpression(value)) {
    const declaration = declarationForCall(checker, value);
    const callee = unparenthesize(value.expression);
    const name = ts.isIdentifier(callee) ? callee.text : callee.getText();
    if (declaration?.type && isContextTerminalType(checker, declaration.type, terminals)) return { ok: true, chain: [...chain, `${name}(): ${typeNodeName(checker, declaration.type)}`] };
    return { ok: false, chain: [...chain, `${name}()${declaration?.type ? `: ${declaration.type.getText()}` : " (local mapper needs an explicit contracts return type)"}`] };
  }

  if (ts.isObjectLiteralExpression(value)) {
    const candidate = exactObjectLiteralTerminal(checker, value, terminals);
    if (candidate) return { ok: true, chain: [...chain, `exact literal matches ${candidate.name}`] };
  }
  return { ok: false, chain: [...chain, value.kind === ts.SyntaxKind.ObjectLiteralExpression ? "inline literal" : value.getText()] };
}

function calledName(checker, expression) {
  const node = unparenthesize(expression);
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (!ts.isIdentifier(node)) return undefined;
  const symbol = checker.getSymbolAtLocation(node);
  const declaration = symbol?.declarations?.find(ts.isImportSpecifier);
  if (declaration) return declaration.propertyName?.text ?? declaration.name.text;
  const resolved = unaliasedSymbol(checker, node);
  return resolved && resolved.getName() !== "unknown" ? resolved.getName() : node.text;
}

function isValidatorCall(checker, call) {
  const name = calledName(checker, call.expression);
  return validatorNames.has(name) || name?.endsWith("SchemaValidator");
}

function isLegacyValidatorCall(checker, call) {
  return legacyValidatorNames.has(calledName(checker, call.expression));
}

function isHonoJsonCall(checker, call) {
  if (!ts.isPropertyAccessExpression(call.expression) || call.expression.name.text !== "json") return false;
  const receiver = unparenthesize(call.expression.expression);
  if (ts.isIdentifier(receiver) && (receiver.text === "c" || receiver.text === "context")) return true;
  return (checker.getTypeAtLocation(receiver).symbol?.getName() ?? "").includes("Context");
}

function isApiClientCall(checker, call) {
  if (!ts.isPropertyAccessExpression(call.expression) || !clientMethodNames.has(call.expression.name.text)) return false;
  const receiver = unparenthesize(call.expression.expression);
  if (ts.isPropertyAccessExpression(receiver) && receiver.name.text === "context") return true;
  if (!ts.isIdentifier(receiver)) return false;
  if (new Set(["apiClient", "adminApiClient", "platformApiClient", "bundleAssetClient"]).has(receiver.text)) return true;
  return /(?:Api|Client|Method)/.test(checker.getTypeAtLocation(receiver).symbol?.getName() ?? receiver.text);
}

function enclosingFunctionName(node) {
  let current = node.parent;
  while (current) {
    if (ts.isFunctionDeclaration(current) && current.name) return current.name.text;
    if (ts.isVariableDeclaration(current) && ts.isIdentifier(current.name) && current.initializer && (ts.isArrowFunction(current.initializer) || ts.isFunctionExpression(current.initializer))) return current.name.text;
    current = current.parent;
  }
  return undefined;
}

function variableInitializer(checker, expression) {
  const node = unparenthesize(expression);
  if (!ts.isIdentifier(node)) return undefined;
  const declaration = unaliasedSymbol(checker, node)?.valueDeclaration;
  return declaration && ts.isVariableDeclaration(declaration) && declaration.initializer ? declaration.initializer : undefined;
}

function functionReturns(checker, expression) {
  const node = unparenthesize(expression);
  if (!ts.isCallExpression(node) || !ts.isIdentifier(unparenthesize(node.expression))) return [];
  let declaration = unaliasedSymbol(checker, unparenthesize(node.expression))?.valueDeclaration;
  if (!declaration) {
    const name = unparenthesize(node.expression).text;
    declaration = node.getSourceFile().statements.find((statement) =>
      ts.isFunctionDeclaration(statement) && statement.name?.text === name,
    );
  }
  if (!declaration) return [];
  const body = ts.isFunctionDeclaration(declaration) || ts.isFunctionExpression(declaration) || ts.isArrowFunction(declaration) ? declaration.body : undefined;
  if (!body) return [];
  if (!ts.isBlock(body)) return [body];
  const returns = [];
  const visit = (child) => {
    if (ts.isFunctionLike(child) && child !== declaration) return;
    if (ts.isReturnStatement(child) && child.expression) returns.push(child.expression);
    ts.forEachChild(child, visit);
  };
  ts.forEachChild(body, visit);
  return returns;
}

function resolveConfig(checker, expression, visited = new Set()) {
  const node = unparenthesize(expression);
  if (visited.has(node)) return { resolved: false, properties: new Map() };
  visited.add(node);
  if (ts.isCallExpression(node) && calledName(checker, node.expression) === "parsed") {
    const options = node.arguments[1] ? resolveConfig(checker, node.arguments[1], visited) : { resolved: true, properties: new Map() };
    return { ...options, parsedSchema: node.arguments[0], resolved: options.resolved };
  }
  if (ts.isObjectLiteralExpression(node)) {
    const properties = new Map();
    let parsedSchema;
    for (const property of node.properties) {
      if (ts.isSpreadAssignment(property)) {
        const spread = resolveConfig(checker, property.expression, visited);
        if (!spread.resolved) return { resolved: false, properties };
        if (spread.parsedSchema) parsedSchema = spread.parsedSchema;
        for (const [name, value] of spread.properties) properties.set(name, value);
      } else if (ts.isPropertyAssignment(property) && (ts.isIdentifier(property.name) || ts.isStringLiteral(property.name))) {
        properties.set(property.name.text, property.initializer);
      } else if (ts.isShorthandPropertyAssignment(property)) {
        properties.set(property.name.text, property.name);
      }
    }
    return { resolved: true, properties, parsedSchema };
  }
  const initializer = variableInitializer(checker, node);
  if (initializer) return resolveConfig(checker, initializer, visited);
  const returns = functionReturns(checker, node);
  if (returns.length === 1) return resolveConfig(checker, returns[0], visited);
  return { resolved: false, properties: new Map() };
}

function configProperty(checker, config, name) {
  const direct = config.properties.get(name);
  if (direct) return direct;
  const meta = config.properties.get("meta");
  return meta ? resolveConfig(checker, meta).properties.get(name) : undefined;
}

function configIsNonJson(checker, config) {
  const responseType = configProperty(checker, config, "responseType");
  const node = responseType && unparenthesize(responseType);
  return Boolean(node && ts.isStringLiteral(node) && ["blob", "text", "arrayBuffer", "raw"].includes(node.text));
}

function schemaIsPermissive(expression) {
  let permissive = false;
  const visit = (node) => {
    if (ts.isPropertyAccessExpression(node) && permissiveSchemaMembers.has(node.name.text)) permissive = true;
    ts.forEachChild(node, visit);
  };
  visit(expression);
  return permissive;
}

function contractSourceFile(program, repositoryRoot, module) {
  if (!module?.startsWith("@imsweb/contracts/")) return undefined;
  const suffix = module.slice("@imsweb/contracts/".length);
  return [
    path.join(repositoryRoot, "packages/contracts/src", `${suffix}.ts`),
    path.join(repositoryRoot, "packages/contracts/src", suffix, "index.ts"),
  ].map((candidate) => program.getSourceFile(candidate)).find(Boolean);
}

function contractSchemaInitializer(program, repositoryRoot, expression) {
  const checker = program.getTypeChecker();
  const origin = schemaOrigin(checker, expression);
  const sourceFile = origin && contractSourceFile(program, repositoryRoot, origin.module);
  if (!sourceFile) return undefined;
  const moduleSymbol = checker.getSymbolAtLocation(sourceFile);
  let exported = moduleSymbol && checker.getExportsOfModule(moduleSymbol)
    .find((candidate) => candidate.getName() === origin.name);
  if (exported?.flags & ts.SymbolFlags.Alias) exported = checker.getAliasedSymbol(exported);
  const exportedDeclaration = exported?.valueDeclaration
    ?? exported?.declarations?.find((candidate) => ts.isVariableDeclaration(candidate));
  if (exportedDeclaration && ts.isVariableDeclaration(exportedDeclaration) && exportedDeclaration.initializer) {
    return { initializer: exportedDeclaration.initializer, origin };
  }
  for (const statement of sourceFile.statements) {
    if (!ts.isVariableStatement(statement)) continue;
    const declaration = statement.declarationList.declarations.find((candidate) =>
      ts.isIdentifier(candidate.name) && candidate.name.text === origin.name);
    if (declaration?.initializer) return { initializer: declaration.initializer, origin };
  }
  return undefined;
}

function responseSchemaDefinition(checker, expression, visited = new Set()) {
  const node = unparenthesize(expression);
  const key = `${node.getSourceFile().fileName}:${node.pos}:${node.end}`;
  if (visited.has(key)) return { exact: true };
  visited.add(key);
  if (schemaIsPermissive(node)) return { exact: false, reason: "uses transform, default, catch, strip, coerce, or preprocess" };
  if (ts.isIdentifier(node)) {
    const declaration = unaliasedSymbol(checker, node)?.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) {
      return responseSchemaDefinition(checker, declaration.initializer, visited);
    }
    return { exact: false, reason: `cannot resolve ${node.text}` };
  }
  if (!ts.isCallExpression(node)) return { exact: false, reason: "is not a statically resolvable schema expression" };
  const name = calledName(checker, node.expression);
  if (["exactJsonResponse", "exactJsonError", "successEnvelope"].includes(name)) return { exact: true };
  if (["union", "discriminatedUnion"].includes(name)) {
    const alternatives = node.arguments.flatMap((argument) => {
      const value = unparenthesize(argument);
      return ts.isArrayLiteralExpression(value) ? [...value.elements] : [value];
    });
    const results = alternatives.map((alternative) => responseSchemaDefinition(checker, alternative, new Set(visited)));
    return results.every((result) => result.exact)
      ? { exact: true }
      : { exact: false, reason: results.find((result) => !result.exact)?.reason ?? "contains an inexact union member" };
  }
  if (ts.isPropertyAccessExpression(node.expression)) {
    const method = node.expression.name.text;
    if (method === "strict") return { exact: true };
    if (["readonly", "refine", "superRefine", "brand", "describe", "extend", "merge", "pick", "omit", "partial", "required"].includes(method)) {
      return responseSchemaDefinition(checker, node.expression.expression, visited);
    }
  }
  if (["array", "tuple", "record", "literal", "string", "number", "boolean", "null", "undefined"].includes(name)) return { exact: true };
  if (name === "object") return { exact: false, reason: "uses a stripping object without .strict()" };
  return { exact: false, reason: `uses unresolved schema builder ${name ?? node.expression.getText()}` };
}

function contractResponseSchemaDefinition(program, repositoryRoot, expression) {
  const resolved = contractSchemaInitializer(program, repositoryRoot, expression);
  return resolved
    ? { ...responseSchemaDefinition(program.getTypeChecker(), resolved.initializer), origin: resolved.origin }
    : { exact: false, reason: "cannot resolve the contracts schema source definition" };
}

function isZodFreeContractModule(module) {
  return module === "@imsweb/contracts/paths" || module.endsWith("/runtime");
}

function contractValueImport(checker, identifier) {
  const symbol = checker.getSymbolAtLocation(identifier);
  const declaration = symbol?.declarations?.find(ts.isImportSpecifier);
  if (!declaration || declaration.isTypeOnly || declaration.parent.parent.isTypeOnly) return undefined;
  const importDeclaration = declaration.parent.parent.parent;
  if (!ts.isImportDeclaration(importDeclaration) || !ts.isStringLiteral(importDeclaration.moduleSpecifier)) return undefined;
  const module = importDeclaration.moduleSpecifier.text;
  if (!module.startsWith("@imsweb/contracts") || isZodFreeContractModule(module)) return undefined;
  return { declaration, module, name: declaration.propertyName?.text ?? declaration.name.text };
}

function schemaOrigin(checker, expression, visited = new Set()) {
  const node = unparenthesize(expression);
  if (visited.has(node)) return undefined;
  visited.add(node);
  if (ts.isIdentifier(node)) {
    const imported = contractValueImport(checker, node);
    if (imported?.name.endsWith("Schema")) return imported;
    const declaration = unaliasedSymbol(checker, node)?.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer) return schemaOrigin(checker, declaration.initializer, visited);
  }
  if (ts.isPropertyAccessExpression(node)) return schemaOrigin(checker, node.expression, visited);
  return undefined;
}

function schemaInvocation(checker, call) {
  const expression = unparenthesize(call.expression);
  if (ts.isPropertyAccessExpression(expression)) {
    const origin = schemaOrigin(checker, expression.expression);
    return origin && { origin, method: expression.name.text };
  }
  if (ts.isIdentifier(expression)) {
    const declaration = unaliasedSymbol(checker, expression)?.valueDeclaration;
    if (declaration && ts.isVariableDeclaration(declaration) && declaration.initializer && ts.isPropertyAccessExpression(unparenthesize(declaration.initializer))) {
      const initializer = unparenthesize(declaration.initializer);
      const origin = schemaOrigin(checker, initializer.expression);
      return origin && { origin, method: initializer.name.text };
    }
    if (declaration && ts.isBindingElement(declaration) && ts.isObjectBindingPattern(declaration.parent)) {
      const variable = declaration.parent.parent;
      const method = declaration.propertyName?.getText() ?? declaration.name.getText();
      if (ts.isVariableDeclaration(variable) && variable.initializer) {
        const origin = schemaOrigin(checker, variable.initializer);
        return origin && { origin, method };
      }
    }
  }
  return undefined;
}

function schemaKey(origin) {
  const sourceFile = origin.declaration.getSourceFile();
  return `${sourceFile.fileName}:${origin.declaration.getStart(sourceFile)}`;
}

function isDocumentedRequestBoundaryParse(repositoryRoot, call, origin) {
  const file = relative(repositoryRoot, call.getSourceFile().fileName);
  const symbol = enclosingFunctionName(call);
  if (file === "apps/api/src/domains/content/wiki/request.ts" && origin.name === "wikiStoryLinkDeleteBodySchema") return true;
  if (file === "apps/api/src/domains/content/wiki/stories/handlers/add-story.ts" && origin.name === "wikiStorySourcesJsonSchema") return true;
  if (file === "apps/api/src/domains/identity/platform-account-security/oauth-links/routes.ts" && symbol === "concealedOAuthLinkParams" && origin.name === "platformOAuthLinkParamsSchema") return true;
  if (file === "apps/api/src/domains/identity/platform-account-security/sessions/routes.ts" && symbol === "concealedSessionParams" && origin.name === "platformSessionParamsSchema") return true;
  if (!file.endsWith("/routes.ts")) return false;
  return call.arguments.some((argument) => /(?:parseBody|formData|URLSearchParams|urlencoded)/.test(argument.getText()));
}

function schemaValueImports(sourceFile) {
  const values = [];
  for (const statement of sourceFile.statements) {
    if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
    const module = statement.moduleSpecifier.text;
    if (!module.startsWith("@imsweb/contracts") || isZodFreeContractModule(module) || !statement.importClause?.namedBindings || !ts.isNamedImports(statement.importClause.namedBindings)) continue;
    for (const element of statement.importClause.namedBindings.elements) {
      if (!element.isTypeOnly && !statement.importClause.isTypeOnly) values.push({ declaration: element, module, name: element.propertyName?.text ?? element.name.text });
    }
  }
  return values;
}

function terminalContractTypes(checker, program, repositoryRoot, sourceFile) {
  const reachableModules = new Set();
  const visited = new Set();
  const visit = (file) => {
    if (!file || visited.has(file.fileName)) return;
    visited.add(file.fileName);
    for (const statement of file.statements) {
      if (!ts.isImportDeclaration(statement) || !ts.isStringLiteral(statement.moduleSpecifier)) continue;
      const module = statement.moduleSpecifier.text;
      if (module.startsWith("@imsweb/contracts/") && !isZodFreeContractModule(module)) reachableModules.add(module.slice("@imsweb/contracts/".length));
      const resolved = ts.resolveModuleName(module, file.fileName, program.getCompilerOptions(), ts.sys).resolvedModule?.resolvedFileName;
      if (resolved && !resolved.includes("/node_modules/")) visit(program.getSourceFile(resolved));
    }
  };
  visit(sourceFile);
  const terminals = [];
  for (const module of reachableModules) {
    const candidates = [
      path.join(repositoryRoot, "packages/contracts/src", `${module}.ts`),
      path.join(repositoryRoot, "packages/contracts/src", module, "index.ts"),
    ];
    const contractFile = candidates.map((candidate) => program.getSourceFile(candidate)).find(Boolean);
    if (!contractFile) continue;
    for (const statement of contractFile.statements) {
      if (!ts.isTypeAliasDeclaration(statement) || !statement.name || !responseTypeName.test(statement.name.text)) continue;
      terminals.push({ name: statement.name.text, type: checker.getTypeAtLocation(statement.name) });
    }
  }
  return terminals;
}

function reportApi(repositoryRoot, checker, program, sourceFiles) {
  const diagnostics = [];
  let jsonEmitters = 0;
  for (const sourceFile of sourceFiles) {
    const file = relative(repositoryRoot, sourceFile.fileName);
    if (file === "apps/api/src/middleware/request-validation.ts") continue;
    const allowedSchemaOrigins = new Set();
    const valueImports = schemaValueImports(sourceFile);
    const terminals = terminalContractTypes(checker, program, repositoryRoot, sourceFile);
    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        if (isLegacyValidatorCall(checker, node)) diagnostics.push(diagnostic(repositoryRoot, node, "legacy request validator is not allowed; use a contracts schema with jsonSchemaValidator, querySchemaValidator, or paramSchemaValidator"));
        if (isValidatorCall(checker, node)) {
          const origin = node.arguments[0] && schemaOrigin(checker, node.arguments[0]);
          if (!origin) diagnostics.push(diagnostic(repositoryRoot, node, "request validator schema must resolve to @imsweb/contracts"));
          else allowedSchemaOrigins.add(schemaKey(origin));
        }
        if (isHonoJsonCall(checker, node) && node.arguments[0]) {
          jsonEmitters += 1;
          const proof = expressionProof(checker, node.arguments[0], terminals);
          if (!proof.ok) diagnostics.push(diagnostic(repositoryRoot, node.arguments[0], `c.json(...) body is unproven; unresolved chain: ${proof.chain.join(" -> ")}`));
        }
        const invocation = schemaInvocation(checker, node);
        if (invocation && schemaExecutionMembers.has(invocation.method)) {
          if (invocation.method === "safeParse" && isDocumentedRequestBoundaryParse(repositoryRoot, node, invocation.origin)) {
            allowedSchemaOrigins.add(schemaKey(invocation.origin));
          } else {
            diagnostics.push(diagnostic(repositoryRoot, node, `contracts schema ${invocation.origin.name}.${invocation.method}(...) may execute only at an approved request-validation boundary (found in ${file}#${enclosingFunctionName(node) ?? "<module>"})`));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
    for (const imported of valueImports) {
      if (!imported.name.endsWith("Schema")) {
        diagnostics.push(diagnostic(repositoryRoot, imported.declaration, `contracts value ${imported.name} must come from a Zod-free /paths or /runtime entrypoint`));
      } else if (!allowedSchemaOrigins.has(schemaKey(imported))) {
        diagnostics.push(diagnostic(repositoryRoot, imported.declaration, `contracts schema ${imported.name} has no approved request-boundary use`));
      }
    }
  }
  return { diagnostics, jsonEmitters };
}

function registeredNonApiStaticAsset(repositoryRoot, call, boundaries) {
  const entry = findNonJsonBoundary(boundaries, {
    sourceFile: relative(repositoryRoot, call.getSourceFile().fileName),
    symbol: enclosingFunctionName(call),
    responseKind: "static",
  });
  return Boolean(entry?.nonApiStaticAsset);
}

function reportWeb(repositoryRoot, checker, program, sourceFiles, boundaries) {
  const diagnostics = [];
  let clientCalls = 0;
  let registeredStaticAssets = 0;
  const verifyDefinition = (expression, label) => {
    const definition = contractResponseSchemaDefinition(program, repositoryRoot, expression);
    if (!definition.exact) diagnostics.push(diagnostic(
      repositoryRoot,
      expression,
      `${label} contracts definition must be exact and non-transforming: ${definition.reason}`,
    ));
  };
  for (const sourceFile of sourceFiles) {
    const file = relative(repositoryRoot, sourceFile.fileName);
    if (file.endsWith("/parsed.ts") || file.endsWith("/response.ts")) continue;
    const visit = (node) => {
      if (ts.isPropertyAssignment(node) && (ts.isIdentifier(node.name) || ts.isStringLiteral(node.name)) && node.name.text === "skipContractCheck") diagnostics.push(diagnostic(repositoryRoot, node, "skipContractCheck is not allowed in production Web API code"));
      if (ts.isCallExpression(node) && isApiClientCall(checker, node)) {
        clientCalls += 1;
        const configExpression = node.arguments.at(-1);
        if (!configExpression) {
          diagnostics.push(diagnostic(repositoryRoot, node, "API client call has no statically resolvable response config"));
        } else {
          const config = resolveConfig(checker, configExpression);
          const external = registeredNonApiStaticAsset(repositoryRoot, node, boundaries);
          if (external) registeredStaticAssets += 1;
          if (!config.resolved) {
            diagnostics.push(diagnostic(repositoryRoot, configExpression, "API client response config is unresolved; use parsed(...) or an exact reviewed exception"));
          } else if (!configIsNonJson(checker, config)) {
            if (!config.parsedSchema) {
              diagnostics.push(diagnostic(repositoryRoot, configExpression, "JSON API client call must use parsed(...) with contracts-owned success and error schemas"));
            } else {
              if (!isContractsExpression(checker, config.parsedSchema)) diagnostics.push(diagnostic(repositoryRoot, config.parsedSchema, "parsed(...) success schema must resolve to @imsweb/contracts"));
              else if (!external) verifyDefinition(config.parsedSchema, "success schema");
              if (schemaIsPermissive(config.parsedSchema)) diagnostics.push(diagnostic(repositoryRoot, config.parsedSchema, "response schemas cannot use transform, default, catch, strip, coerce, or preprocess"));
              const errorSchema = configProperty(checker, config, "errorSchema");
              if (!external && !errorSchema) diagnostics.push(diagnostic(repositoryRoot, configExpression, "JSON API client call must declare an @imsweb/contracts errorSchema"));
              if (errorSchema && !isContractsExpression(checker, errorSchema)) diagnostics.push(diagnostic(repositoryRoot, errorSchema, "errorSchema must resolve to @imsweb/contracts"));
              else if (errorSchema) verifyDefinition(errorSchema, "errorSchema");
              if (errorSchema && schemaIsPermissive(errorSchema)) diagnostics.push(diagnostic(repositoryRoot, errorSchema, "response schemas cannot use transform, default, catch, strip, coerce, or preprocess"));
              const business = configProperty(checker, config, "businessErrorSchema");
              if (business && !isContractsExpression(checker, business)) diagnostics.push(diagnostic(repositoryRoot, business, "businessErrorSchema must resolve to @imsweb/contracts"));
              else if (business) verifyDefinition(business, "businessErrorSchema");
              if (business && schemaIsPermissive(business)) diagnostics.push(diagnostic(repositoryRoot, business, "response schemas cannot use transform, default, catch, strip, coerce, or preprocess"));
            }
          } else {
            const errorSchema = configProperty(checker, config, "errorSchema");
            if (!errorSchema) diagnostics.push(diagnostic(repositoryRoot, configExpression, "non-JSON API success still requires an @imsweb/contracts errorSchema"));
            else if (!isContractsExpression(checker, errorSchema)) diagnostics.push(diagnostic(repositoryRoot, errorSchema, "errorSchema must resolve to @imsweb/contracts"));
            else verifyDefinition(errorSchema, "errorSchema");
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    ts.forEachChild(sourceFile, visit);
  }
  return { diagnostics, clientCalls, registeredStaticAssets };
}

export function collectWireContractAudit(repositoryRoot) {
  const apiRoots = sourceFiles(repositoryRoot, "apps/api/src");
  const webRoots = sourceFiles(repositoryRoot, "apps/web/app/lib/api");
  const contractRoots = sourceFiles(repositoryRoot, "packages/contracts/src");
  const program = createProgram(repositoryRoot, [...apiRoots, ...webRoots, ...contractRoots]);
  const checker = program.getTypeChecker();
  const boundaries = loadNonJsonBoundaryManifest(repositoryRoot).boundaries;
  const apiFiles = apiRoots.map((filePath) => program.getSourceFile(filePath)).filter(Boolean);
  const webFiles = webRoots.map((filePath) => program.getSourceFile(filePath)).filter(Boolean);
  const { diagnostics: apiDiagnostics, jsonEmitters } = reportApi(repositoryRoot, checker, program, apiFiles);
  const { diagnostics: webDiagnostics, clientCalls, registeredStaticAssets } = reportWeb(repositoryRoot, checker, program, webFiles, boundaries);
  return { diagnostics: [...apiDiagnostics, ...webDiagnostics], jsonEmitters, clientCalls, registeredStaticAssets };
}

export function formatWireContractAudit(repositoryRoot, { details = false } = {}) {
  const audit = collectWireContractAudit(repositoryRoot);
  const lines = [
    "JSON wire contract audit (compiler-backed):",
    `  violations: ${audit.diagnostics.length}`,
    `  API c.json(...) emitters: ${audit.jsonEmitters}`,
    `  Web API client calls: ${audit.clientCalls}`,
    `  registered non-API static assets: ${audit.registeredStaticAssets}`,
  ];
  if (details || audit.diagnostics.length) for (const issue of audit.diagnostics) lines.push(`  ${issue.file}:${issue.line}: ${issue.message}`);
  return lines.join("\n");
}

export function assertWireContractAudit(repositoryRoot) {
  const audit = collectWireContractAudit(repositoryRoot);
  if (!audit.diagnostics.length) return audit;
  throw new Error(`JSON wire contract audit failed:\n${audit.diagnostics.map((issue) => `${issue.file}:${issue.line}: ${issue.message}`).join("\n")}`);
}

function main() {
  const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
  const details = process.argv.includes("--details");
  try {
    assertWireContractAudit(repositoryRoot);
    process.stdout.write(`${formatWireContractAudit(repositoryRoot, { details })}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
