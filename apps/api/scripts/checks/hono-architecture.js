const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "../..");
const sourceRoot = path.join(root, "src");
const domainRoot = path.join(sourceRoot, "domains");
const infraRoot = path.join(sourceRoot, "infra");
const portRoot = path.join(sourceRoot, "ports");
const routingRoot = path.join(sourceRoot, "routing");
const sharedRoot = path.join(sourceRoot, "shared");
const utilsRoot = path.join(sourceRoot, "utils");
const failures = [];

function readJsonFile(file, label) {
    try {
        return JSON.parse(fs.readFileSync(file, "utf8"));
    } catch (error) {
        failures.push(
            `${label}: invalid JSON (${error instanceof Error ? error.message : String(error)})`,
        );
        return {};
    }
}

function filesUnder(directory) {
    return fs
        .readdirSync(directory, { withFileTypes: true })
        .flatMap((entry) => {
            const absolute = path.join(directory, entry.name);
            if (entry.isDirectory()) return filesUnder(absolute);
            return /\.tsx?$/.test(entry.name) ? [absolute] : [];
        });
}

function maskNonCode(source) {
    const output = [...source];
    let index = 0;
    while (index < output.length) {
        const character = source[index];
        const next = source[index + 1];
        if (character === "/" && next === "/") {
            while (index < output.length && source[index] !== "\n")
                output[index++] = " ";
            continue;
        }
        if (character === "/" && next === "*") {
            output[index++] = " ";
            output[index++] = " ";
            while (
                index < output.length &&
                !(source[index] === "*" && source[index + 1] === "/")
            ) {
                if (source[index] !== "\n") output[index] = " ";
                index += 1;
            }
            if (index < output.length) {
                output[index++] = " ";
                output[index++] = " ";
            }
            continue;
        }
        if (character === "'" || character === '"' || character === "`") {
            const quote = character;
            output[index++] = " ";
            while (index < output.length) {
                if (source[index] === "\\") {
                    output[index++] = " ";
                    if (index < output.length) output[index++] = " ";
                    continue;
                }
                const closing = source[index] === quote;
                if (source[index] !== "\n") output[index] = " ";
                index += 1;
                if (closing) break;
            }
            continue;
        }
        index += 1;
    }
    return output.join("");
}

const infraCategories = new Set([
    "cache",
    "db",
    "email",
    "http",
    "media",
    "oss",
    "security",
    "oauth",
]);
const infraMiddleware = new Map([
    ["cache", new Set(["filesystem", "memory", "postgresql", "valkey"])],
    ["db", new Set(["postgresql", "repositories", "sql"])],
    ["email", new Set(["cloudflare"])],
    ["http", new Set(["busboy", "filesystem"])],
    ["media", new Set(["sharp"])],
    ["oss", new Set(["filesystem", "s3"])],
    ["security", new Set(["bcrypt", "hmac"])],
]);
const directInfraFiles = new Map([
    [
        "oauth",
        new Set(["platform-oauth-client.ts", "platform-oauth-secrets.ts"]),
    ],
]);
for (const entry of fs.readdirSync(infraRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !infraCategories.has(entry.name)) {
        failures.push(
            `src/infra/${entry.name}: infrastructure must use a capability directory`,
        );
        continue;
    }
    const categoryRoot = path.join(infraRoot, entry.name);
    const directFiles = directInfraFiles.get(entry.name);
    if (directFiles) {
        for (const implementation of fs.readdirSync(categoryRoot, {
            withFileTypes: true,
        })) {
            if (
                !implementation.isFile() ||
                !directFiles.has(implementation.name) ||
                !/^[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/.test(implementation.name)
            ) {
                failures.push(
                    `src/infra/${entry.name}/${implementation.name}: ` +
                        "implementation files must be named by responsibility",
                );
            }
        }
        continue;
    }
    for (const middleware of fs.readdirSync(categoryRoot, {
        withFileTypes: true,
    })) {
        if (
            !middleware.isDirectory() ||
            !infraMiddleware.get(entry.name).has(middleware.name)
        ) {
            failures.push(
                `src/infra/${entry.name}/${middleware.name}: infrastructure must use a concrete middleware directory`,
            );
            continue;
        }
        for (const implementation of fs.readdirSync(
            path.join(categoryRoot, middleware.name),
            {
                withFileTypes: true,
            },
        )) {
            if (
                !implementation.isFile() ||
                !/^[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/.test(implementation.name) ||
                /^(?:adapter|implementation|index|service)\.ts$/.test(
                    implementation.name,
                )
            ) {
                failures.push(
                    `src/infra/${entry.name}/${middleware.name}/${implementation.name}: ` +
                        "middleware files must be split and named by business responsibility",
                );
            }
        }
    }
}

const databaseLayout = new Map([
    ["postgresql", ["connection.ts", "schema-strategy.ts"]],
    [
        "repositories",
        [
            "admin-account-repository.ts",
            "audit-repository.ts",
            "backoffice-auth-repository.ts",
            "core-repository.ts",
            "editorial-repository.ts",
            "event-repository.ts",
            "fudaba-repository.ts",
            "homepage-link-repository.ts",
            "news-repository.ts",
            "platform-account-repository.ts",
            "reaction-repository.ts",
            "site-package-repository.ts",
            "story-repository.ts",
            "story-catalog-repository.ts",
            "story-conflicts.ts",
            "story-rows.ts",
            "wiki-entity-repository.ts",
        ],
    ],
    ["sql", ["database.ts", "query.ts"]],
]);
for (const [directory, requiredFiles] of databaseLayout) {
    for (const requiredFile of requiredFiles) {
        const file = path.join(infraRoot, "db", directory, requiredFile);
        if (!fs.existsSync(file)) {
            failures.push(
                `src/infra/db/${directory}/${requiredFile}: missing database adapter responsibility`,
            );
        }
    }
}

const singleCapabilityRepositories = new Map([
    [
        "admin-account-repository.ts",
        ["SqlAdminAccountRepository", "AdminAccountRepository", "admin"],
    ],
    ["audit-repository.ts", ["SqlAuditRepository", "AuditRepository", "admin"]],
    [
        "backoffice-auth-repository.ts",
        ["SqlBackofficeAuthRepository", "BackofficeAuthRepository", "admin"],
    ],
    [
        "editorial-repository.ts",
        ["SqlEditorialRepository", "EditorialRepository", "content"],
    ],
    ["event-repository.ts", ["SqlEventRepository", "EventRepository", "content"]],
    [
        "homepage-link-repository.ts",
        ["SqlHomepageLinkRepository", "HomepageLinkRepository", "content"],
    ],
    ["news-repository.ts", ["SqlNewsRepository", "NewsRepository", "content"]],
    [
        "reaction-repository.ts",
        ["SqlReactionRepository", "ReactionRepository", "namecards"],
    ],
    [
        "site-package-repository.ts",
        ["SqlSitePackageRepository", "SitePackageRepository", "site-packages"],
    ],
]);
for (const [filename, [className, contractName, portModule]] of
    singleCapabilityRepositories) {
    const file = path.join(infraRoot, "db", "repositories", filename);
    if (!fs.existsSync(file)) continue;
    const source = fs.readFileSync(file, "utf8");
    if (
        !source.includes(
            `from '@/ports/repositories/${portModule}'`,
        ) &&
        !source.includes(
            `from "@/ports/repositories/${portModule}"`,
        )
    ) {
        failures.push(
            `src/infra/db/repositories/${filename}: repository must import its direct capability port`,
        );
    }
    if (/from ['"]@\/ports\/repositories['"]/.test(source)) {
        failures.push(
            `src/infra/db/repositories/${filename}: repository must not import the aggregate repository barrel`,
        );
    }
    if (
        !source.includes(
            `export class ${className} implements ${contractName} {`,
        )
    ) {
        failures.push(
            `src/infra/db/repositories/${filename}: repository must implement only ${contractName}`,
        );
    }
}

const portContracts = new Map([
    [
        "cache.ts",
        ["CacheStore", "IdempotencyStore", "RateLimiter", "CacheServices"],
    ],
    ["email.ts", ["PlatformEmailSender", "EmailServices"]],
    ["oauth.ts", ["PlatformOAuthClient", "OAuthServices"]],
    ["http.ts", ["StaticAssets", "UploadParser", "HttpServices"]],
    ["media.ts", ["ImageProcessor", "MediaServices"]],
    [
        "object-storage.ts",
        [
            "ObjectStorage",
            "CompensationService",
            "ObjectDeletionWorker",
            "ObjectStorageServices",
        ],
    ],
    [
        "repositories/admin.ts",
        [
            "BackofficeAuthRepository",
            "AdminAccountRepository",
            "AuditRepository",
        ],
    ],
    ["repositories/platform.ts", ["PlatformAccountRepository"]],
    ["repositories/fudaba.ts", ["FudabaRepository"]],
    ["repositories/namecards.ts", ["NamecardRepository", "ReactionRepository"]],
    [
        "repositories/content.ts",
        ["NewsRepository", "EventRepository", "HomepageLinkRepository"],
    ],
    ["repositories/site-packages.ts", ["SitePackageRepository"]],
    ["repositories/wiki.ts", ["StoryRepository"]],
    ["repositories/index.ts", ["RepositoryServices"]],
    ["runtime-services.ts", ["RuntimeServices", "NodeRuntimeServices"]],
    [
        "security.ts",
        [
            "BackofficeTokenService",
            "PlatformTokenService",
            "PasswordVerifier",
            "SecurityServices",
        ],
    ],
]);
for (const [name, contracts] of portContracts) {
    const file = path.join(portRoot, name);
    if (!fs.existsSync(file)) {
        failures.push(`src/ports/${name}: missing application port`);
        continue;
    }
    const source = fs.readFileSync(file, "utf8");
    for (const contract of contracts) {
        if (!source.includes(`interface ${contract}`)) {
            failures.push(`src/ports/${name}: missing ${contract} contract`);
        }
    }
}
for (const entry of fs.readdirSync(portRoot, { withFileTypes: true })) {
    if (entry.isDirectory()) {
        for (const nested of fs.readdirSync(path.join(portRoot, entry.name))) {
            if (!portContracts.has(`${entry.name}/${nested}`)) {
                failures.push(
                    `src/ports/${entry.name}/${nested}: ports must be explicit named capability contracts`,
                );
            }
        }
        continue;
    }
    if (!entry.isFile() || !portContracts.has(entry.name)) {
        failures.push(
            `src/ports/${entry.name}: ports must be explicit flat capability contracts`,
        );
    }
}
if (fs.existsSync(path.join(sourceRoot, "contracts"))) {
    failures.push(
        "src/contracts: wire contracts live in packages/contracts (@imsweb/contracts), not in the API source tree",
    );
}

const legacyAdapterRoot = path.join(sourceRoot, "adapters");
if (fs.existsSync(legacyAdapterRoot) && filesUnder(legacyAdapterRoot).length) {
    failures.push(
        "src/adapters: implementations must be classified under src/infra",
    );
}

if (fs.existsSync(sharedRoot)) {
    failures.push(
        "src/shared: shared is forbidden; move code to its responsibility module",
    );
}

const utilsCategories = new Set([
    "crypto",
    "http",
    "media",
    "storage",
    "validation",
]);
for (const entry of fs.readdirSync(utilsRoot, { withFileTypes: true })) {
    if (!entry.isDirectory() || !utilsCategories.has(entry.name)) {
        failures.push(
            `src/utils/${entry.name}: utilities must use a responsibility directory`,
        );
        continue;
    }
    for (const implementation of fs.readdirSync(
        path.join(utilsRoot, entry.name),
        {
            withFileTypes: true,
        },
    )) {
        if (
            !implementation.isFile() ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/.test(implementation.name) ||
            /^(?:helpers?|index|utils?)\.ts$/.test(implementation.name)
        ) {
            failures.push(
                `src/utils/${entry.name}/${implementation.name}: ` +
                    "utility files must be flat and named by responsibility",
            );
        }
    }
}
for (const entry of fs.readdirSync(routingRoot, { withFileTypes: true })) {
    if (
        !entry.isFile() ||
        !/^[a-z0-9]+(?:-[a-z0-9]+)*\.ts$/.test(entry.name) ||
        /^(?:helpers?|index|utils?)\.ts$/.test(entry.name)
    ) {
        failures.push(
            `src/routing/${entry.name}: routing files must be named by responsibility`,
        );
    }
}

const relativeInternalImport =
    /\b(?:from\s*|import\s*(?:\(\s*)?)(['"])\.{1,2}\//;
const concreteMiddlewareImport =
    /\b(?:from\s*|import\s*(?:\(\s*)?)(['"])(?:@aws-sdk\/|@prisma\/client|@\/generated\/prisma|bcrypt(?:js)?|busboy|pg|redis|sharp)/;
const concretePlatformType =
    /\b(?:D1Database|D1PreparedStatement|ImagesBinding|PrismaClient|R2Bucket)\b/;
for (const file of filesUnder(sourceRoot)) {
    const source = fs.readFileSync(file, "utf8");
    if (relativeInternalImport.test(source)) {
        failures.push(
            `${path.relative(root, file)}: internal imports must use the @ root alias`,
        );
    }
    const relative = path.relative(sourceRoot, file).replace(/\\/g, "/");
    if (relative.startsWith("infra/")) {
        const [, category, middleware] = relative.split("/");
        for (const match of source.matchAll(
            /['"]@\/infra\/([a-z-]+)\/([a-z0-9-]+)\/([a-z0-9-]+)/g,
        )) {
            const internalSqlDependency =
                match[1] === "db" &&
                match[2] === "sql" &&
                match[3] === "database";
            const repositorySqlQuery =
                category === "db" &&
                middleware === "repositories" &&
                match[1] === "db" &&
                match[2] === "sql" &&
                match[3] === "query";
            if (
                (match[1] !== category || match[2] !== middleware) &&
                !internalSqlDependency &&
                !repositorySqlQuery
            ) {
                failures.push(
                    `${path.relative(root, file)}: infrastructure adapter must not depend on another adapter: ` +
                        `${match[1]}/${match[2]}`,
                );
            }
        }
        if (/['"]@\/(?:domains|runtime)\//.test(source)) {
            failures.push(
                `${path.relative(root, file)}: infrastructure must not depend on domains or runtime`,
            );
        }
    }
    if (!relative.startsWith("infra/") && !relative.startsWith("runtime/")) {
        for (const match of source.matchAll(/['"](@\/infra\/[^'"]+)['"]/g)) {
            failures.push(
                `${path.relative(root, file)}: application code must depend on ports, not infrastructure: ${match[1]}`,
            );
        }
        if (
            concreteMiddlewareImport.test(source) ||
            concretePlatformType.test(source)
        ) {
            failures.push(
                `${path.relative(root, file)}: application code must depend on ports instead of middleware types`,
            );
        }
    }
    if (
        relative.startsWith("ports/") &&
        /['"]@\/(?:config|domains|infra|runtime)\//.test(source)
    ) {
        failures.push(
            `${path.relative(root, file)}: ports must not depend on outer layers`,
        );
    }
    if (
        relative !== "infra/db/postgresql/connection.ts" &&
        /\bPoolClient\b/.test(source)
    ) {
        failures.push(
            `${path.relative(root, file)}: concrete database type bypasses SqlDatabase`,
        );
    }
}

const sqlPortSource = fs.readFileSync(
    path.join(sourceRoot, "infra/db/sql/database.ts"),
    "utf8",
);
for (const contract of [
    "interface SqlDatabase",
    "interface SqlStatement",
    "transaction<",
    "batch<",
]) {
    if (!sqlPortSource.includes(contract)) {
        failures.push(
            `src/infra/db/sql/database.ts: missing ${contract} contract`,
        );
    }
}

const serverConfig = readJsonFile(
    path.join(root, "tsconfig.server.json"),
    "tsconfig.server.json",
);
if (
    JSON.stringify(serverConfig.compilerOptions?.paths?.["@/*"]) !==
    JSON.stringify(["./src/*"])
) {
    failures.push("tsconfig.server.json: @/* must map to ./src/*");
}
const bundleTsconfig = readJsonFile(
    path.join(root, "tsconfig.json"),
    "tsconfig.json",
);
if (bundleTsconfig.extends !== "./tsconfig.server.json") {
    failures.push(
        "tsconfig.json: default API configuration must inherit tsconfig.server.json",
    );
}

const forbiddenDomainPatterns = [
    [
        /\bfrom\s+['"](?:express|sharp|multer|node:fs|fs)['"]/,
        "forbidden runtime import",
    ],
    [
        /\brequire\(\s*['"](?:express|sharp|multer|node:fs|fs)['"]\s*\)/,
        "forbidden runtime require",
    ],
    [
        /\b(?:from\s*|import\s*(?:\(\s*)?)['"]@\/runtime\//,
        "direct runtime import",
    ],
    [/\bprocess\.env\b/, "direct environment access"],
    [/\b(?:Flask|Pillow)\b/, "Python web/image runtime reference"],
];

for (const file of filesUnder(domainRoot)) {
    const source = fs.readFileSync(file, "utf8");
    for (const [pattern, label] of forbiddenDomainPatterns) {
        if (pattern.test(source))
            failures.push(`${path.relative(root, file)}: ${label}`);
    }
}

const domainSections = new Map([
    [
        "identity",
        ["platform-auth", "platform-profile", "platform-account-security"],
    ],
    ["admin", ["backoffice-auth", "admin-accounts", "audit"]],
    [
        "content",
        [
            "wiki",
            "information",
            "news",
            "events",
            "chronicle",
            "editorial",
            "about",
            "producer-map",
            "live-schedule",
            "homepage-links",
            "brand-assets",
        ],
    ],
    ["community", ["fudaba", "namecards"]],
    ["delivery", ["media", "site", "site-packages"]],
]);
const sectionOfDomain = new Map();
for (const [section, domains] of domainSections) {
    for (const domain of domains) sectionOfDomain.set(domain, section);
}
for (const entry of fs.readdirSync(domainRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) {
        if (entry.name !== "README.md") {
            failures.push(
                `src/domains/${entry.name}: domains must live under a product-section directory`,
            );
        }
        continue;
    }
    if (!domainSections.has(entry.name)) {
        failures.push(
            `src/domains/${entry.name}: unknown product section; use identity/admin/content/community/delivery`,
        );
        continue;
    }
    const expected = new Set(domainSections.get(entry.name));
    for (const domain of fs.readdirSync(path.join(domainRoot, entry.name), {
        withFileTypes: true,
    })) {
        if (!domain.isDirectory() || !expected.has(domain.name)) {
            failures.push(
                `src/domains/${entry.name}/${domain.name}: domain is not registered in the section taxonomy`,
            );
        }
    }
}
function domainDirectory(domain) {
    return path.join(domainRoot, sectionOfDomain.get(domain), domain);
}

const validatedRequestDomains = new Set([
    "about",
    "admin-accounts",
    "audit",
    "backoffice-auth",
    "brand-assets",
    "chronicle",
    "events",
    "homepage-links",
    "information",
    "live-schedule",
    "media",
    "namecards",
    "news",
    "producer-map",
    "site",
    "site-packages",
    "wiki",
]);
for (const domain of validatedRequestDomains) {
    const handlerFiles = filesUnder(domainDirectory(domain)).filter((file) =>
        path
            .relative(domainRoot, file)
            .replace(/\\/g, "/")
            .includes("/handlers/"),
    );
    for (const file of handlerFiles) {
        const source = fs.readFileSync(file, "utf8");
        const code = maskNonCode(source);
        if (
            /\.\s*req\s*\.\s*(?:json|param|query)\s*(?:<[^;()]*>)?\s*\(/.test(
                code,
            )
        ) {
            failures.push(
                `${path.relative(root, file)}: validated handlers must consume a parsed request model`,
            );
        }
        if (/\.\s*uploads\s*\.\s*parse\s*\(/.test(code)) {
            failures.push(
                `${path.relative(root, file)}: handlers must use a named domain request parser`,
            );
        }
        for (const match of code.matchAll(
            /\b(parse[A-Z][A-Za-z0-9]*)\s*\([^;]{0,500}?\.\s*req\s*\.\s*raw/g,
        )) {
            if (!/Request$/.test(match[1])) {
                failures.push(
                    `${path.relative(root, file)}: ${match[1]} must be exposed as an explicit *Request parser`,
                );
            }
        }
    }
}

for (const domain of sectionOfDomain.keys()) {
    const directory = domainDirectory(domain);
    if (!fs.existsSync(directory)) {
        failures.push(`src/domains: missing registered domain ${domain}`);
        continue;
    }
    const routeFiles = fs
        .readdirSync(directory, { withFileTypes: true })
        .filter(
            (entry) =>
                entry.isFile() && /(?:^|-)routes\.tsx?$/.test(entry.name),
        );
    if (!routeFiles.length) continue;

    const handlerRoots = [];
    const directHandlersRoot = path.join(directory, "handlers");
    if (fs.existsSync(directHandlersRoot))
        handlerRoots.push(directHandlersRoot);
    for (const capability of fs.readdirSync(directory, {
        withFileTypes: true,
    })) {
        if (!capability.isDirectory() || capability.name === "handlers")
            continue;
        const capabilityHandlersRoot = path.join(
            directory,
            capability.name,
            "handlers",
        );
        if (fs.existsSync(capabilityHandlersRoot))
            handlerRoots.push(capabilityHandlersRoot);
    }
    if (!handlerRoots.length) {
        failures.push(
            `src/domains/${sectionOfDomain.get(domain)}/${domain}: route handlers must be split by capability and action`,
        );
        continue;
    }
    for (const handlersRoot of handlerRoots) {
        const handlerFiles = fs.readdirSync(handlersRoot, {
            withFileTypes: true,
        });
        for (const handler of handlerFiles) {
            const relativeHandlersRoot = path.relative(root, handlersRoot);
            if (
                !handler.isFile() ||
                !/^[a-z0-9]+(?:-[a-z0-9]+)*\.tsx?$/.test(handler.name) ||
                handler.name === "index.ts" ||
                handler.name === "index.tsx"
            ) {
                failures.push(
                    `${relativeHandlersRoot}/${handler.name}: handler modules must be flat kebab-case files`,
                );
                continue;
            }
            const source = fs.readFileSync(
                path.join(handlersRoot, handler.name),
                "utf8",
            );
            if (
                !/export (?:async )?function (?:handle|createHandle)[A-Z]/.test(
                    source,
                )
            ) {
                failures.push(
                    `${relativeHandlersRoot}/${handler.name}: ` +
                        "handler module must explicitly export a handle* or createHandle* function",
                );
            }
        }
    }
    const capabilityRoutePaths = fs
        .readdirSync(directory, { withFileTypes: true })
        .filter((entry) => entry.isDirectory() && entry.name !== "handlers")
        .map((entry) => path.join(directory, entry.name, "routes.ts"))
        .filter((file) => fs.existsSync(file));
    for (const routePath of [
        ...routeFiles.map((route) => path.join(directory, route.name)),
        ...capabilityRoutePaths,
    ]) {
        const source = fs.readFileSync(routePath, "utf8");
        const isCapabilityRoute = path.dirname(routePath) !== directory;
        const importsHandlers = source.includes("/handlers/");
        const importsRoute = source.includes("/routes");
        if (
            !source.includes(
                `/domains/${sectionOfDomain.get(domain)}/${domain}/`,
            ) ||
            (isCapabilityRoute
                ? !importsHandlers
                : !importsHandlers && !importsRoute)
        ) {
            failures.push(
                `${path.relative(root, routePath)}: route module must import split handlers or capability routes`,
            );
        }
        if (source.includes("=>")) {
            failures.push(
                `${path.relative(root, routePath)}: route module must not contain inline handlers`,
            );
        }
    }
}

const packageJson = readJsonFile(
    path.join(root, "package.json"),
    "package.json",
);
for (const dependency of [
    "express",
    "flask",
    "cookie-parser",
    "cors",
    "helmet",
    "multer",
    "jsonwebtoken",
    "jose",
]) {
    if (
        packageJson.dependencies?.[dependency] ||
        packageJson.devDependencies?.[dependency]
    ) {
        failures.push(`package.json: legacy dependency remains: ${dependency}`);
    }
}

for (const legacyRuntime of [
    "public/app.py",
    "public/gunicorn_conf.py",
    "public/requirements.txt",
    "public/templates",
    "public/uwsgi.ini",
    "public/uwsgi.pid",
    "tests/test_flask_security.py",
]) {
    if (fs.existsSync(path.join(root, legacyRuntime))) {
        failures.push(
            `${legacyRuntime}: removed Flask runtime surface has returned`,
        );
    }
}

const appSource = fs.readFileSync(path.join(sourceRoot, "app.ts"), "utf8");
if (
    !appSource.includes("export function createHonoApp") ||
    !/\bc\.set\((['"])services\1\s*,/.test(appSource)
) {
    failures.push(
        "src/app.ts: request-scoped service resolution contract is missing",
    );
}
const mainSource = fs.readFileSync(path.join(sourceRoot, "main.ts"), "utf8");
for (const exportName of ["honoApp", "app", "startServer", "closeDatabase"]) {
    if (
        !new RegExp(
            `export (?:const|function|async function) ${exportName}\\b`,
        ).test(mainSource)
    ) {
        failures.push(`src/main.ts: missing ${exportName} export`);
    }
}

const nodeServicesSource = fs.readFileSync(
    path.join(sourceRoot, "runtime/node-services.ts"),
    "utf8",
);
for (const implementation of [
    "PostgresqlIdempotencyStore",
    "ValkeyRateLimiter",
    "PostgresqlObjectDeletionWorker",
    "PostgresConnection",
    "SqlFudabaRepository",
    "SqlSitePackageRepository",
    "FilesystemObjectStorage",
    "S3ObjectStorage",
    "StreamingUploadParser",
    "NodeStaticAssets",
    "SharpImageProcessor",
    "BcryptPasswordVerifier",
]) {
    if (!nodeServicesSource.includes(implementation)) {
        failures.push(
            `src/runtime/node-services.ts: missing ${implementation} composition`,
        );
    }
}
if (failures.length)
    throw new Error(`Hono architecture check failed:\n${failures.join("\n")}`);
process.stdout.write(
    `Hono architecture check passed: ${filesUnder(domainRoot).length} domain modules\n`,
);
