import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const domainRoot = path.resolve(__dirname, '../../src/domains');
const routeMethods = new Set(['all', 'delete', 'get', 'on', 'options', 'patch', 'post', 'put']);

const expectedRouteHandlers: Record<string, readonly string[]> = {
    about: [
        'handleGetAboutPage',
        'handleGetAdminAboutPage',
        'handleUpdateAboutPage',
        'handleUploadAboutHeroImage',
        'handleUploadAboutMemberAvatar'
    ],
    'admin-accounts': [
        'handleCreateAdminAccount',
        'handleDeleteAdminAccount',
        'handleListAdminAccounts'
    ],
    audit: ['handleListAuditLogs'],
    auth: [
        'handleAdminLogin',
        'handleCheckAuth',
        'handleLogin',
        'handleLogout',
        'handleRefresh'
    ],
    'brand-assets': ['handleServeBrandAsset'],
    chronicle: [
        'handleApproveChronicleMedia',
        'handleDeleteUsedChronicleMedia',
        'handleGetChronicleActivity',
        'handleListChronicleActivities',
        'handleListPendingChronicleMedia',
        'handleListUsedChronicleMedia',
        'handleRejectChronicleMedia',
        'handleServeApprovedChronicleMedia',
        'handleServeChronicleAdmin',
        'handleServePendingChronicleMedia',
        'handleUploadChronicleMedia'
    ],
    events: [
        'handleCreateEvent',
        'handleDeleteEvent',
        'handleGetEvent',
        'handleListEvents'
    ],
    'homepage-links': [
        'handleCreateHomepageLink',
        'handleDeleteHomepageLink',
        'handleListHomepageLinks',
        'handleReorderHomepageLinks',
        'handleUpdateHomepageLink'
    ],
    information: [
        'handleCreateInformation',
        'handleDeleteInformation',
        'handleDeleteInformationAsset',
        'handleGetInformation',
        'handleListAdminInformation',
        'handleListInformation',
        'handleReorderInformation',
        'handleServeInformationContent',
        'handleUpdateInformation',
        'handleUploadInformationAsset'
    ],
    'live-schedule': ['handleListLiveSchedule'],
    media: ['handleCreateThumbnail', 'handleServeNamecard', 'handleServePublicUpload'],
    namecards: [
        'handleApproveNamecard',
        'handleDeleteNamecard',
        'handleGetNamecard',
        'handleListAdminNamecards',
        'handleListNamecards',
        'handleUploadNamecard'
    ],
    news: [
        'handleCreateNews',
        'handleDeleteNews',
        'handleListAdminNews',
        'handleListPublicNews'
    ],
    'producer-map': [
        'handleGetAdminProducerMap',
        'handleGetProducerMap',
        'handleUpdateProducerMap'
    ],
    reactions: ['createHandleAddReaction', 'createHandleDeleteReaction', 'handleListReactions'],
    site: ['handleLegacyChronicleRedirect', 'handleLegacySiteRedirect', 'handleServeSiteIndex'],
    'site-packages': [
        'handleCreateSitePackage',
        'handleCreateSitePackageRevision',
        'handleGetPublicSitePackage',
        'handleListSitePackages',
        'handlePublishSitePackageRevision',
        'handleRotateSitePackagePreviewToken',
        'handleServePreviewSitePackage',
        'handleServePublishedSitePackage',
        'handleServePublishedSitePackageShell'
    ],
    wiki: [
        'createHandleAddWikiStory',
        'createHandleAddWikiStorySources',
        'createHandleCreateWikiAgency',
        'createHandleCreateWikiCategory',
        'createHandleCreateWikiGroup',
        'createHandleCreateWikiIdol',
        'createHandleCreateWikiStoryCatalogOption',
        'createHandleCreateWikiStoryCoverAsset',
        'createHandleDeleteWikiAgencyIcon',
        'createHandleDeleteWikiCategory',
        'createHandleDeleteWikiGroup',
        'createHandleDeleteWikiIdol',
        'createHandleDeleteWikiIdolMedia',
        'createHandleDeleteWikiStory',
        'createHandleDeleteWikiStoryCatalogOption',
        'createHandleDeleteWikiStoryCoverAsset',
        'createHandleDeleteWikiStoryLink',
        'createHandleEditWikiStory',
        'createHandleListAdminWikiCatalog',
        'createHandleListAdminWikiStories',
        'createHandleListPublicWikiCatalog',
        'createHandleListPublicWikiStories',
        'createHandleListWikiIdolMedia',
        'createHandleListWikiStoryCoverAssets',
        'createHandleListWikiStorySourceCatalog',
        'createHandleParseBilibili',
        'createHandleRandomWikiBackground',
        'createHandleRandomWikiIdol',
        'createHandleSaveWikiEntityImage',
        'createHandleSaveWikiLayout',
        'createHandleServeWikiEntityIcon',
        'createHandleServeWikiIdolImage',
        'createHandleServeWikiStoryCoverAsset',
        'createHandleUpdateWikiAgency',
        'createHandleUpdateWikiCategory',
        'createHandleUpdateWikiGroup',
        'createHandleUpdateWikiIdol',
        'createHandleUpdateWikiStoryCard',
        'createHandleUpdateWikiStoryCatalogOption',
        'createHandleUpdateWikiStoryCoverAsset',
        'createHandleUploadWikiAgencyIcon',
        'createHandleUploadWikiIdolMedia',
        'handleRejectRetiredWikiStaticAsset',
        'handleWikiTest'
    ]
};

interface HandlerImport {
    domain: string;
    module: string;
    symbol: string;
}

function routeFile(domain: string): string {
    for (const filename of ['routes.ts', 'routes.tsx']) {
        const candidate = path.join(domainRoot, domain, filename);
        if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error(`Missing route module for ${domain}`);
}

function handlerImports(domain: string): HandlerImport[] {
    const source = fs.readFileSync(routeFile(domain), 'utf8');
    const imports: HandlerImport[] = [];
    const pattern = /import\s+([^;]+?)\s+from\s+['"]@\/domains\/([^/]+)\/handlers\/([^'"]+)['"];/g;
    for (const match of source.matchAll(pattern)) {
        const clause = match[1].trim();
        const body = clause.startsWith('{') ? clause.slice(1, -1) : clause;
        for (const entry of body.split(',')) {
            const names = entry.trim().replace(/^type\s+/, '').split(/\s+as\s+/);
            const symbol = (names[1] ?? names[0]).trim();
            if (/^(?:handle|createHandle)[A-Z]/.test(symbol)) {
                imports.push({ domain: match[2], module: match[3], symbol });
            }
        }
    }
    return imports;
}

function handlerFile(entry: HandlerImport): string {
    for (const extension of ['.ts', '.tsx']) {
        const candidate = path.join(domainRoot, entry.domain, 'handlers', `${entry.module}${extension}`);
        if (fs.existsSync(candidate)) return candidate;
    }
    throw new Error(`Missing handler module for ${entry.domain}/${entry.module}`);
}

function maskNonCode(source: string): string {
    const output = [...source];
    let index = 0;
    while (index < output.length) {
        const character = source[index];
        const next = source[index + 1];
        if (character === '/' && next === '/') {
            while (index < output.length && source[index] !== '\n') output[index++] = ' ';
            continue;
        }
        if (character === '/' && next === '*') {
            output[index++] = ' ';
            output[index++] = ' ';
            while (index < output.length && !(source[index] === '*' && source[index + 1] === '/')) {
                if (source[index] !== '\n') output[index] = ' ';
                index += 1;
            }
            if (index < output.length) {
                output[index++] = ' ';
                output[index++] = ' ';
            }
            continue;
        }
        if (character === '\'' || character === '"' || character === '`') {
            const quote = character;
            output[index++] = ' ';
            while (index < output.length) {
                if (source[index] === '\\') {
                    output[index++] = ' ';
                    if (index < output.length) output[index++] = ' ';
                    continue;
                }
                const closing = source[index] === quote;
                if (source[index] !== '\n') output[index] = ' ';
                index += 1;
                if (closing) break;
            }
            continue;
        }
        index += 1;
    }
    return output.join('');
}

function responseImports(source: string, domain: string): string[] {
    const escapedDomain = domain.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
        `import\\s+(?:type\\s+)?([^;]+?)\\s+from\\s+['"]@/domains/${escapedDomain}/[^'"]*response['"];`,
        'g'
    );
    const names: string[] = [];
    for (const match of source.matchAll(pattern)) {
        const clause = match[1].trim();
        const body = clause.startsWith('{') ? clause.slice(1, -1) : clause;
        for (const entry of body.split(',')) {
            const imported = entry.trim().replace(/^type\s+/, '').split(/\s+as\s+/);
            const localName = (imported[1] ?? imported[0]).trim();
            if (localName) names.push(localName);
        }
    }
    return names;
}

function firstJsonArguments(source: string): string[] {
    const code = maskNonCode(source);
    const argumentsList: string[] = [];
    const calls = /\.\s*json\s*\(/g;
    for (const match of code.matchAll(calls)) {
        const opening = code.indexOf('(', match.index);
        let parentheses = 0;
        let braces = 0;
        let brackets = 0;
        let end = opening + 1;
        for (; end < code.length; end += 1) {
            const character = code[end];
            if (character === '(') parentheses += 1;
            else if (character === ')') {
                if (parentheses === 0 && braces === 0 && brackets === 0) break;
                parentheses -= 1;
            } else if (character === '{') braces += 1;
            else if (character === '}') braces -= 1;
            else if (character === '[') brackets += 1;
            else if (character === ']') brackets -= 1;
            else if (character === ',' && parentheses === 0 && braces === 0 && brackets === 0) break;
        }
        argumentsList.push(code.slice(opening + 1, end));
    }
    return argumentsList;
}

function routeRegistrations(source: string): string[] {
    const code = maskNonCode(source);
    const registrations: string[] = [];
    const calls = /\bapp\s*\.\s*(all|delete|get|on|options|patch|post|put)\s*\(/g;
    for (const match of code.matchAll(calls)) {
        if (!routeMethods.has(match[1])) continue;
        const opening = code.indexOf('(', match.index);
        let depth = 0;
        let end = opening + 1;
        for (; end < code.length; end += 1) {
            if (code[end] === '(') depth += 1;
            if (code[end] === ')') {
                if (depth === 0) break;
                depth -= 1;
            }
        }
        registrations.push(code.slice(opening + 1, end));
    }
    return registrations;
}

function validatorAliases(source: string): Map<string, string> {
    const aliases = new Map<string, string>();
    const code = maskNonCode(source);
    const pattern = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(json|param|query)Validator\s*\(/g;
    for (const match of code.matchAll(pattern)) aliases.set(match[1], match[2]);
    return aliases;
}

function identifierCount(source: string, identifier: string): number {
    const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [...maskNonCode(source).matchAll(new RegExp(`\\b${escaped}\\b`, 'g'))].length;
}

test('route handler inventory remains explicit and complete for all 18 domains', () => {
    const actual: Record<string, string[]> = {};
    for (const domain of Object.keys(expectedRouteHandlers).sort()) {
        const imported = handlerImports(domain);
        assert.ok(imported.every((entry) => entry.domain === domain), `${domain} imports another domain handler`);
        const registrations = routeRegistrations(fs.readFileSync(routeFile(domain), 'utf8'));
        for (const entry of imported) {
            assert.ok(
                registrations.some((registration) => new RegExp(`\\b${entry.symbol}\\b`).test(registration)),
                `${domain}/${entry.symbol} is imported but not registered`
            );
        }
        actual[domain] = [...new Set(imported.map((entry) => entry.symbol))].sort();
    }

    const expected = Object.fromEntries(Object.entries(expectedRouteHandlers)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([domain, handlers]) => [domain, [...handlers].sort()]));
    assert.deepEqual(actual, expected);
    assert.equal(Object.values(actual).flat().length, 121);
});

test('route handlers use validated request models and named multipart parsers', () => {
    const failures: string[] = [];
    for (const domain of Object.keys(expectedRouteHandlers)) {
        const routeSource = fs.readFileSync(routeFile(domain), 'utf8');
        const aliases = validatorAliases(routeSource);
        const routeCode = maskNonCode(routeSource);
        const entries = handlerImports(domain);
        const visited = new Set<string>();
        const consumedSources = new Set<string>();
        for (const entry of entries) {
            const filename = handlerFile(entry);
            if (visited.has(filename)) continue;
            visited.add(filename);
            const source = fs.readFileSync(filename, 'utf8');
            const code = maskNonCode(source);
            const label = path.relative(domainRoot, filename);
            if (/\.\s*req\s*\.\s*(?:json|param|query)\s*(?:<[^;()]*>)?\s*\(/.test(code)) {
                failures.push(`${label}: directly parses json/param/query`);
            }
            if (/\.\s*uploads\s*\.\s*parse\s*\(/.test(code)) {
                failures.push(`${label}: must use a named domain request parser`);
            }
            for (const match of code.matchAll(/\b(parse[A-Z][A-Za-z0-9]*)\s*\([^;]{0,500}?\.\s*req\s*\.\s*raw/g)) {
                if (!/Request$/.test(match[1])) {
                    failures.push(`${label}: ${match[1]} must be exposed as an explicit *Request parser`);
                }
            }

            for (const match of source.matchAll(
                /\.\s*req\s*\.\s*valid\s*\(\s*['"](json|param|query)['"]\s*\)/g
            )) consumedSources.add(match[1]);
        }
        for (const requestSource of consumedSources) {
            const directValidator = new RegExp(`\\b${requestSource}Validator\\s*\\(`).test(routeCode);
            const aliasedValidator = [...aliases].some(([, kind]) => kind === requestSource);
            if (!directValidator && !aliasedValidator) {
                failures.push(`${domain}/routes: missing ${requestSource} validation middleware`);
            }
        }
    }
    const uniqueFailures = [...new Set(failures)];
    assert.equal(uniqueFailures.length, 0, `Request model contract failures:\n${uniqueFailures.join('\n')}`);
});

test('route handlers adopt field-level JSON DTOs or explicit non-JSON response boundaries', () => {
    const failures: string[] = [];
    const visited = new Set<string>();
    for (const domain of Object.keys(expectedRouteHandlers)) {
        for (const entry of handlerImports(domain)) {
            const filename = handlerFile(entry);
            if (visited.has(filename)) continue;
            visited.add(filename);
            const source = fs.readFileSync(filename, 'utf8');
            const label = path.relative(domainRoot, filename);
            const importedModels = responseImports(source, domain);
            const usedModels = importedModels.filter((name) => identifierCount(source, name) > 1);
            if (!usedModels.length) {
                failures.push(`${label}: missing a used same-domain response contract import`);
            }
            for (const argument of firstJsonArguments(source)) {
                if (!/\bsatisfies\s+[A-Z][A-Za-z0-9]*(?:Response|DTO|Dto)\b/.test(argument)) {
                    failures.push(`${label}: JSON branch lacks an explicit field-level response DTO`);
                }
            }
        }
    }

    for (const domain of Object.keys(expectedRouteHandlers)) {
        const directory = path.join(domainRoot, domain);
        for (const filename of fs.readdirSync(directory)) {
            if (!/response\.tsx?$/.test(filename)) continue;
            const source = fs.readFileSync(path.join(directory, filename), 'utf8');
            if (/\bRecord\s*<\s*string\s*,\s*unknown\s*>/.test(maskNonCode(source))) {
                failures.push(`${domain}/${filename}: Record<string, unknown> is not a field-level DTO`);
            }
        }
    }
    const uniqueFailures = [...new Set(failures)];
    assert.equal(uniqueFailures.length, 0, `Response model contract failures:\n${uniqueFailures.join('\n')}`);
});
