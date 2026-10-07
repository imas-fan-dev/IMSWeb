// Merged from 2 sibling files that each keep their own describe block.
// The block around every contribution gives it its own scope, so identically
// named fixtures from different files cannot clash.

import { readContractJson as contractJson } from '../contracts/contract-json';
import { createHonoApp } from '@/app';
import type { ObjectStorage } from '@/ports/object-storage';
import type { AdminAccountRepository, AuditLogInput, AuditRepository, BackofficeAuthRepository, EventRepository, NamecardRepository, NamecardSubmissionRecord, NewsRepository, ReactionRepository, StoryRepository } from '@/ports/repositories';
import type { RuntimeServices } from '@/ports/runtime-services';
import { failureMessageResponseSchema } from '@imsweb/contracts/common';
import { // pi-lens-ignore: ts:2724
    fudabaGuestSubmissionErrorSchema, fudabaGuestSubmissionDetailSchema, fudabaGuestSubmissionWithdrawalSchema } from '@imsweb/contracts/fudaba/guest-submissions';
import { // pi-lens-ignore: ts:2305
    legacyEmojiMutationSchema, // pi-lens-ignore: ts:2305
    namecardEmptyResponseSchema, // pi-lens-ignore: ts:2305
    namecardErrorResponseSchema, adminNamecardListSchema, namecardPageSchema, reactionMutationSchema, reactionSchema } from '@imsweb/contracts/namecards';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'vitest';

// handler-model-contract.test.ts
{
    const domainRoot = path.resolve(__dirname, '../../src/domains');
    const routeMethods = new Set(['all', 'delete', 'get', 'on', 'options', 'patch', 'post', 'put']);
    const domainSections: Record<string, string> = {
        'platform-auth': 'identity',
        'platform-profile': 'identity',
        'backoffice-auth': 'admin',
        'admin-accounts': 'admin',
        audit: 'admin',
        wiki: 'content',
        information: 'content',
        news: 'content',
        events: 'content',
        editorial: 'content',
        chronicle: 'content',
        about: 'content',
        'producer-map': 'content',
        'live-schedule': 'content',
        'homepage-links': 'content',
        'brand-assets': 'content',
        fudaba: 'community',
        namecards: 'community',
        media: 'delivery',
        site: 'delivery',
        'site-packages': 'delivery'
    };

    function domainDirectory(domain: string): string {
        const section = domainSections[domain];
        if (!section) throw new Error(`Unregistered domain section for ${domain}`);
        return path.join(domainRoot, section, domain);
    }

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
        'backoffice-auth': [
            'handleBackofficeAdminLogin',
            'handleBackofficeLogin',
            'handleBackofficeLogout',
            'handleBackofficeRefresh',
            'handleCanonicalBackofficeLogin',
            'handleCheckBackofficeAuth',
            'handleLegacyBackofficeLogout',
            'handleLegacyBackofficeRefresh'
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
            'handleListEvents',
            'handleUpdateEvent'
        ],
        'homepage-links': [
            'handleCreateHomepageLink',
            'handleDeleteHomepageLink',
            'handleListHomepageLinks',
            'handleReorderHomepageLinks',
            'handleUpdateHomepageLink'
        ],
        information: [
            'handleGetInformation',
            'handleListInformation',
            'handleRetiredAdminInformation',
            'handleServeInformationContent'
        ],
        editorial: [
            'createHandleChronicleEntryStatus',
            'createHandleCommunityPostStatus',
            'handleCreateChronicleEntry',
            'handleCreateCommunityPost',
            'handleDeleteArticleAsset',
            'handleDeleteChronicleEntry',
            'handleDeleteCommunityPost',
            'handleGetAdminChronicleEntry',
            'handleGetCommunityPost',
            'handleGetLegacyInformationPost',
            'handleGetPublicChronicleEntry',
            'handleListAdminChronicleEntries',
            'handleListAdminSpotlight',
            'handleListArticleAssets',
            'handleListCommunityPosts',
            'handleListPublicChronicleEntries',
            'handleListPublicSpotlight',
            'handlePreviewCommunityPost',
            'handleReplaceAdminSpotlight',
            'handleUpdateChronicleEntry',
            'handleUpdateCommunityPost',
            'handleUploadArticleAsset'
        ],
        'live-schedule': ['handleListLiveSchedule'],
        media: ['handleServeNamecard', 'handleServePublicUpload'],
        namecards: [
            'createHandleAddReaction',
            'createHandleDeleteReaction',
            'handleApproveNamecard',
            'handleDeleteNamecard',
            'handleGetNamecard',
            'handleListAdminNamecards',
            'handleListNamecards',
            'handleListReactions',
            'handleRejectNamecard'
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
            'handleUpdateProducerMap',
            'handleUploadProducerMapImage'
        ],
        site: ['handleServeSiteIndex'],
        'site-packages': [
            'handleCreateSitePackage',
            'handleCreateSitePackageRevision',
            'handleDeleteSitePackageRevision',
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
            const candidate = path.join(domainDirectory(domain), filename);
            if (fs.existsSync(candidate)) return candidate;
        }
        throw new Error(`Missing route module for ${domain}`);
    }

    function domainRouteFiles(domain: string): string[] {
        const directory = domainDirectory(domain);
        const files = [routeFile(domain)];
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            if (!entry.isDirectory() || entry.name === 'handlers') continue;
            const capabilityRoutes = path.join(directory, entry.name, 'routes.ts');
            if (fs.existsSync(capabilityRoutes)) files.push(capabilityRoutes);
        }
        return files;
    }

    function handlerImportsFromSource(source: string): HandlerImport[] {
        const imports: HandlerImport[] = [];
        const pattern =
            /import\s+([^;]+?)\s+from\s+['"]@\/domains\/[a-z-]+\/([a-z-]+)\/((?:[a-z-]+\/)?handlers\/[^'"]+)['"];/g;
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

    function handlerImports(domain: string): HandlerImport[] {
        return domainRouteFiles(domain).flatMap((file) =>
            handlerImportsFromSource(fs.readFileSync(file, 'utf8')));
    }

    function handlerFile(entry: HandlerImport): string {
        for (const extension of ['.ts', '.tsx']) {
            const candidate = path.join(domainDirectory(entry.domain), `${entry.module}${extension}`);
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
            `import\\s+(?:type\\s+)?([^;]+?)\\s+from\\s+['"]@/domains/[a-z-]+/${escapedDomain}/[^'"]*response['"];`,
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
        const calls = /\b(?:app|routes)\s*\.\s*(all|delete|get|on|options|patch|post|put)\s*\(/g;
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
        const pattern = /\bconst\s+([A-Za-z_$][\w$]*)\s*=\s*(json|param|query)(?:Schema)?Validator\s*\(/g;
        for (const match of code.matchAll(pattern)) aliases.set(match[1], match[2]);
        return aliases;
    }

    function identifierCount(source: string, identifier: string): number {
        const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return [...maskNonCode(source).matchAll(new RegExp(`\\b${escaped}\\b`, 'g'))].length;
    }

    function domainSourceFiles(directory: string): string[] {
        const files: string[] = [];
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const filename = path.join(directory, entry.name);
            if (entry.isDirectory()) files.push(...domainSourceFiles(filename));
            if (entry.isFile() && /\.tsx?$/.test(entry.name)) files.push(filename);
        }
        return files;
    }

    function matchingDelimiter(
        source: string,
        opening: number,
        openCharacter: string,
        closeCharacter: string
    ): number {
        let depth = 0;
        for (let index = opening; index < source.length; index += 1) {
            if (source[index] === openCharacter) depth += 1;
            if (source[index] !== closeCharacter) continue;
            depth -= 1;
            if (depth === 0) return index;
        }
        return -1;
    }

    function typeAliasEnd(source: string, start: number): number {
        let braces = 0;
        let brackets = 0;
        let parentheses = 0;
        for (let index = start; index < source.length; index += 1) {
            if (source[index] === '{') braces += 1;
            else if (source[index] === '}') braces -= 1;
            else if (source[index] === '[') brackets += 1;
            else if (source[index] === ']') brackets -= 1;
            else if (source[index] === '(') parentheses += 1;
            else if (source[index] === ')') parentheses -= 1;
            else if (source[index] === ';' && braces === 0 && brackets === 0 && parentheses === 0) {
                return index;
            }
        }
        return source.length;
    }

    function parameterNames(parameters: string): string[] {
        return [...parameters.matchAll(/(?:^|,)\s*([A-Za-z_$][\w$]*)\s*(?:\?|):/g)]
            .map((match) => match[1]);
    }

    function isUnvalidatedRecordBody(body: string, parameters: readonly string[]): boolean {
        const directInput = parameters.length
            ? `(?:${parameters.map((name) => name.replace(/[$]/g, '\\$&')).join('|')})`
            : '(?!)';
        return new RegExp(
            `^\\s*return\\s+(?:${directInput}\\s*|(?:jsonObject|record|requestRecord)\\s*\\([\\s\\S]*\\))\\s*;\\s*$`
        ).test(body);
    }

    function constValidatorOutput(declaration: string): string | null {
        const implemented = /\)\s*:\s*([^=]+?)\s*=>/.exec(declaration);
        if (implemented) return implemented[1];
        const declared = /\)\s*=>\s*([^;]+)\s*;?\s*$/.exec(declaration);
        return declared?.[1] ?? null;
    }

    test.describe('handler model contract', () => {
        test('route handler inventory remains explicit and complete for all 18 domains', () => {
            const actual: Record<string, string[]> = {};
            for (const domain of Object.keys(expectedRouteHandlers).sort()) {
                const imported = handlerImports(domain);
                assert.ok(imported.every((entry) => entry.domain === domain), `${domain} imports another domain handler`);
                const registrations = domainRouteFiles(domain).flatMap((file) =>
                    routeRegistrations(fs.readFileSync(file, 'utf8')));
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
            assert.equal(Object.values(actual).flat().length, 140);
        });

        test('capability domains compose named capabilities from their root routes', () => {
            const mountedCapabilities = {
                'platform-auth': ['oauth', 'password-reset', 'registration', 'sessions'],
                fudaba: [
                    'cards',
                    'claims',
                    'directory',
                    'guest-submissions',
                    'locations',
                    'moderation',
                    'offices'
                ],
                editorial: ['assets', 'chronicle', 'posts', 'spotlight'],
                namecards: ['moderation', 'public-cards', 'reactions']
            } as const;
            const composedCapabilities = {
                wiki: ['catalog', 'media', 'stories']
            } as const;
            for (const [domain, names] of Object.entries(composedCapabilities)) {
                const root = fs.readFileSync(routeFile(domain), 'utf8');
                assert.doesNotMatch(root, /domains\/[^'"\s]+\/handlers\//);
                for (const name of names) {
                    assert.match(
                        root,
                        new RegExp(`domains/${domainSections[domain]}/${domain}/${name}/routes`)
                    );
                    const capability = fs.readFileSync(
                        path.join(domainDirectory(domain), name, 'routes.ts'),
                        'utf8'
                    );
                    assert.match(capability, /domains\/[^'"\s]+\/handlers\//);
                }
            }
            for (const [domain, names] of Object.entries(mountedCapabilities)) {
                const root = fs.readFileSync(routeFile(domain), 'utf8');
                assert.match(root, /\.route\(/);
                for (const name of names) {
                    assert.match(
                        root,
                        new RegExp(`domains/${domainSections[domain]}/${domain}/${name}/routes`)
                    );
                    const capability = fs.readFileSync(
                        path.join(domainDirectory(domain), name, 'routes.ts'),
                        'utf8'
                    );
                    assert.match(capability, /domains\/[^'"\s]+\/handlers\//);
                }
            }
        });

        test('route handlers use validated request models and named multipart parsers', () => {
            const failures: string[] = [];
            for (const domain of Object.keys(expectedRouteHandlers)) {
                const routeSource = domainRouteFiles(domain)
                    .map((file) => fs.readFileSync(file, 'utf8'))
                    .join('\n');
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
                    const directValidator = new RegExp(`\\b${requestSource}(?:Schema)?Validator\\s*\\(`).test(routeCode);
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
                for (const filename of domainSourceFiles(domainDirectory(domain))) {
                    if (!/(?:^|[/-])response\.tsx?$/.test(filename)) continue;
                    const source = fs.readFileSync(filename, 'utf8');
                    if (/\bRecord\s*<\s*string\s*,\s*unknown\s*>/.test(maskNonCode(source))) {
                        failures.push(
                            `${path.relative(domainRoot, filename)}: Record<string, unknown> is not a field-level DTO`
                        );
                    }
                }
            }
            const uniqueFailures = [...new Set(failures)];
            assert.equal(uniqueFailures.length, 0, `Response model contract failures:\n${uniqueFailures.join('\n')}`);
        });

        test('exported request contracts define concrete validated fields across all domains', () => {
            const failures: string[] = [];
            for (const domain of Object.keys(expectedRouteHandlers)) {
                for (const filename of domainSourceFiles(domainDirectory(domain))) {
                    const source = fs.readFileSync(filename, 'utf8');
                    const code = maskNonCode(source);
                    const label = path.relative(domainRoot, filename);
                    const interfacePattern = /\bexport\s+interface\s+([A-Za-z_$][\w$]*Request)\b/g;
                    for (const match of code.matchAll(interfacePattern)) {
                        const opening = code.indexOf('{', match.index + match[0].length);
                        const closing = matchingDelimiter(code, opening, '{', '}');
                        const declaration = code.slice(match.index, closing + 1);
                        if (/\bunknown\b/.test(declaration)) {
                            failures.push(
                                `${label}/${match[1]}: request DTO cannot expose unknown fields`
                            );
                        }
                    }
                    const typePattern = /\bexport\s+type\s+([A-Za-z_$][\w$]*Request)\b/g;
                    for (const match of code.matchAll(typePattern)) {
                        const equals = code.indexOf('=', match.index + match[0].length);
                        const end = typeAliasEnd(code, equals + 1);
                        if (/\bunknown\b/.test(code.slice(equals + 1, end))) {
                            failures.push(
                                `${label}/${match[1]}: request DTO cannot expose unknown fields`
                            );
                        }
                    }
                    const validatorPattern = /\bexport\s+(?:async\s+)?function\s+((?:validate|parse)[A-Za-z0-9]+Request)\b/g;
                    for (const match of code.matchAll(validatorPattern)) {
                        const parameterOpening = code.indexOf('(', match.index + match[0].length);
                        const parameterClosing = matchingDelimiter(code, parameterOpening, '(', ')');
                        const bodyOpening = code.indexOf('{', parameterClosing + 1);
                        const bodyClosing = matchingDelimiter(code, bodyOpening, '{', '}');
                        const output = code.slice(parameterClosing + 1, bodyOpening);
                        if (!/^\s*:/.test(output)) {
                            failures.push(`${label}/${match[1]}: validator output must be explicit`);
                        } else if (/\bunknown\b/.test(output)) {
                            failures.push(
                                `${label}/${match[1]}: validator output cannot expose unknown fields`
                            );
                        }
                        const parameters = parameterNames(code.slice(parameterOpening + 1, parameterClosing));
                        if (isUnvalidatedRecordBody(code.slice(bodyOpening + 1, bodyClosing), parameters)) {
                            failures.push(`${label}/${match[1]}: validator cannot return an unvalidated input record`);
                        }
                    }
                    const constValidatorPattern = /\bexport\s+const\s+((?:validate|parse)[A-Za-z0-9]+Request)\b/g;
                    for (const match of code.matchAll(constValidatorPattern)) {
                        const end = typeAliasEnd(code, match.index + match[0].length);
                        const declaration = code.slice(match.index, end + 1);
                        const output = constValidatorOutput(declaration);
                        if (!output) {
                            failures.push(`${label}/${match[1]}: validator output must be explicit`);
                        } else if (/\bunknown\b/.test(output)) {
                            failures.push(
                                `${label}/${match[1]}: validator output cannot expose unknown fields`
                            );
                        }
                        if (/=>\s*(?:jsonObject|record|requestRecord)\s*\(/.test(declaration)) {
                            failures.push(`${label}/${match[1]}: validator cannot return an unvalidated input record`);
                        }
                    }
                }
            }
            assert.equal(failures.length, 0, `Request DTO contract failures:\n${failures.join('\n')}`);
        });
    });
}

// handler-validation-compatibility.test.ts
{
    interface CompatibilityCalls {
        adminDelete: number[];
        audit: AuditLogInput[];
        authFind: number[];
        eventDelete: number[];
        eventFind: number[];
        eventFindMedia: number[];
        namecardApprove: number[];
        namecardDelete: number[];
        namecardFindApproved: number[];
        namecardFindMedia: number[];
        namecardListAdmin: Array<[number, number]>;
        namecardListApproved: Array<[number, number]>;
        newsDelete: number[];
        newsFindMedia: number[];
        storyReads: number;
        storageGet: number;
        storageWrites: number;
    }

    function createCompatibilityFixture(
        namecardOverrides: Partial<NamecardRepository> = {},
        serviceOverrides: Partial<RuntimeServices> = {}
    ) {
        const calls: CompatibilityCalls = {
            adminDelete: [],
            audit: [],
            authFind: [],
            eventDelete: [],
            eventFind: [],
            eventFindMedia: [],
            namecardApprove: [],
            namecardDelete: [],
            namecardFindApproved: [],
            namecardFindMedia: [],
            namecardListAdmin: [],
            namecardListApproved: [],
            newsDelete: [],
            newsFindMedia: [],
            storyReads: 0,
            storageGet: 0,
            storageWrites: 0
        };
        const events: EventRepository = {
            async insertEvent() { throw new Error('unexpected event insert'); },
        async updateEvent() { return false; },
        async findEventByOperationKey() { return null; },
        async markEventReady() { return false; },
            async countEvents() { return 0; },
            async listEvents() { return []; },
            async findLatestEventId() { return null; },
            async listEventsByCursor() { return []; },
            async findEvent(id) {
                calls.eventFind.push(id);
                return null;
            },
            async findEventMedia(id) {
                calls.eventFindMedia.push(id);
                return null;
            },
            async countEventMediaReferences() { return 0; },
            async deleteEvent(id) {
                calls.eventDelete.push(id);
                return false;
            }
        };
        const namecards: NamecardRepository = {
            async findCardByOrderedHashes() { return null; },
            async insertPendingCard() { throw new Error('unexpected namecard insert'); },
            async countApprovedCards() { return 0; },
            async countAdminCards() { return 0; },
            async listApprovedCards(limit, offset) {
                calls.namecardListApproved.push([limit, offset]);
                return [];
            },
            async findApprovedCardMedia(id) {
                calls.namecardFindApproved.push(id);
                return null;
            },
            async listAdminCards(limit, offset) {
                calls.namecardListAdmin.push([limit, offset]);
                return [];
            },
            async beginCardApproval(id) {
                calls.namecardApprove.push(id);
                return { status: 'not-found' };
            },
            async completeCardApproval() { return { status: 'not-found' }; },
            async findCardMedia(id) {
                calls.namecardFindMedia.push(id);
                return null;
            },
            async deleteCard(id) {
                calls.namecardDelete.push(id);
                return { status: 'not-found' };
            },
            async findSubmissionByTokenHash() { return null; },
            async withdrawSubmission() { return { status: 'not-found' }; },
            async rejectSubmission() { return { status: 'not-found' }; },
            async purgeTerminalCards() { return []; },
            async findSubmissionWithHashesByTokenHash() { return null; },
            async replaceSubmissionImage() { return { status: 'not-found' }; },
            async resubmitSubmission() { return { status: 'not-found' }; },
            async findCardByMediaUrl() { return null; },
            ...namecardOverrides
        };
        const reactions: ReactionRepository = {
            async findApprovedCard(id) { return id === 1 ? { id } : null; },
            async listReactions() { return [{ emoji: '👍', count: 2 }]; },
            async incrementReaction() {},
            async decrementAndPruneReaction() {}
        };
        const news: NewsRepository = {
            async listPublicNews() { return []; },
            async findLatestPublicNewsId() { return null; },
            async listPublicNewsByCursor() { return []; },
            async listAdminNews() { return []; },
            async insertNews() { throw new Error('unexpected news insert'); },
            async findNewsMedia(id) {
                calls.newsFindMedia.push(id);
                return null;
            },
            async deleteNews(id) { calls.newsDelete.push(id); }
        };
        const backofficeAuth: BackofficeAuthRepository = {
            async findUserByUsername() { return null; },
            async findUserById(id) {
                calls.authFind.push(id);
                if (id === 99) {
                    return {
                        id,
                        username: 'super-operator',
                        password: 'stored-digest',
                        dept: 'op',
                        producername: 'Super Operator',
                        admin_role: 'super_admin'
                    };
                }
                if (id === 98) {
                    return {
                        id,
                        username: 'regular-operator',
                        password: 'stored-digest',
                        dept: 'op',
                        producername: 'Regular Operator',
                        admin_role: 'admin'
                    };
                }
                if (id === 1 || id === 10) {
                    return {
                        id,
                        username: `admin-${id}`,
                        password: 'stored-digest',
                        dept: 'op',
                        producername: `Admin ${id}`,
                        admin_role: 'admin'
                    };
                }
                return null;
            },
            async createRefreshSession() { throw new Error('unexpected refresh session create'); },
            async findRefreshSessionByTokenHash() { return null; },
            async rotateRefreshSession() { return false; },
            async revokeRefreshSession() { throw new Error('unexpected refresh session revoke'); },
            async deleteExpiredRefreshSessions() {}
        };
        const adminAccounts: AdminAccountRepository = {
            async ensureSuperAdmin() {},
            async listAdminAccounts() { return []; },
            async createAdminAccount() { throw new Error('unexpected admin account create'); },
            async deleteAdminAccount(id) {
                calls.adminDelete.push(id);
                return 'deleted';
            }
        };
        const audit: AuditRepository = {
            async insertAuditLog(input) { calls.audit.push(input); },
            async listRecentAuditLogs() { return []; }
        };
        const story = new Proxy({} as StoryRepository, {
            get() {
                calls.storyReads += 1;
                return async () => {
                    throw new Error('unexpected Wiki repository call');
                };
            }
        });
        const storage: ObjectStorage = {
            async get() {
                calls.storageGet += 1;
                return null;
            },
            async put() {
                calls.storageWrites += 1;
                throw new Error('unexpected storage write');
            },
            async delete() { calls.storageWrites += 1; },
            async publish() { calls.storageWrites += 1; },
            async exists() { return true; },
            async copy() { calls.storageWrites += 1; },
            async move() { calls.storageWrites += 1; },
            async list() { return []; },
            async deletePrefix() { calls.storageWrites += 1; }
        };
        const services: RuntimeServices = {
            adminAccounts,
            audit,
            backofficeAuth,
            events,
            namecards,
            news,
            reactions,
            story,
            storage,
            backofficeTokens: {
                async sign() { return 'op-token'; },
                async verify(token) {
                    if (token === 'regular-token') {
                        return {
                            id: 98,
                            username: 'regular-operator',
                            producername: 'Regular Operator',
                            dept: 'op',
                            adminRole: 'admin',
                            csrfSecret: 'csrf'
                        };
                    }
                    return {
                        id: 99,
                        username: 'super-operator',
                        producername: 'Super Operator',
                        dept: 'op',
                        adminRole: 'super_admin',
                        csrfSecret: 'csrf'
                    };
                }
            },
            ...serviceOverrides
        };
        const app = createHonoApp(() => services);
        return {
            calls,
            request(pathname: string, init?: RequestInit) {
                return app.request(`http://ims.test${pathname}`, init);
            }
        };
    }

    async function responseJson(response: Response): Promise<unknown> {
        return response.json();
    }

    test.describe('handler validation compatibility', () => {
        test('invalid event IDs preserve legacy 404 bodies without repository side effects', async () => {
            const fixture = createCompatibilityFixture();
            const get = await fixture.request('/api/events/not-an-id');
            assert.equal(get.status, 404);
            assert.deepEqual(await responseJson(get), { error: '活动不存在' });

            const deletion = await fixture.request('/api/events/not-an-id', {
                method: 'DELETE',
                headers: { Authorization: 'Bearer op-token' }
            });
            assert.equal(deletion.status, 404);
            assert.deepEqual(await responseJson(deletion), { error: '不存在' });
            assert.deepEqual(fixture.calls.eventFind, []);
            assert.deepEqual(fixture.calls.eventFindMedia, []);
            assert.deepEqual(fixture.calls.eventDelete, []);
            assert.deepEqual(fixture.calls.audit, []);
            assert.equal(fixture.calls.storageWrites, 0);
        });

        test('event creation rejects a missing idempotency key before parsing uploads', async () => {
            const fixture = createCompatibilityFixture();
            const response = await fixture.request('/api/events', {
                method: 'POST',
                headers: { Authorization: 'Bearer op-token' }
            });

            assert.equal(response.status, 400);
            assert.deepEqual(await responseJson(response), {
                error: 'Idempotency-Key is required'
            });
            assert.equal(fixture.calls.storageWrites, 0);
            assert.deepEqual(fixture.calls.audit, []);
        });

        test('legacy anonymous upload and receipt routes are not exposed', async () => {
            const fixture = createCompatibilityFixture();
            const responses = await Promise.all([
                fixture.request('/api/uploadNameCard', { method: 'POST' }),
                fixture.request('/api/namecards/submissions/19', {
                    headers: { 'X-Namecard-Withdrawal-Token': 'a'.repeat(64) }
                }),
                fixture.request('/api/namecards/submissions/19/withdraw', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Namecard-Withdrawal-Token': 'a'.repeat(64)
                    },
                    body: JSON.stringify({ expected_revision: 0 })
                })
            ]);

            for (const response of responses) assert.equal(response.status, 404);
            assert.equal(fixture.calls.storageWrites, 0);
            assert.deepEqual(fixture.calls.audit, []);
        });

        test('Fudaba owns anonymous uploads', async () => {
            const writes: string[] = [];
            const fixture = createCompatibilityFixture(
                {
                    async insertPendingCard() {
                        return 19;
                    }
                },
                {
                    uploads: {
                        async parse() {
                            return {
                                fields: {
                                    seriesCode: '765',
                                    favoriteIdolIds: '[1]'
                                },
                                files: {
                                    images: [
                                        {
                                            filename: 'front.png',
                                            contentType: 'image/png',
                                            body: new Uint8Array([1])
                                        },
                                        {
                                            filename: 'back.png',
                                            contentType: 'image/png',
                                            body: new Uint8Array([2])
                                        }
                                    ]
                                }
                            };
                        }
                    },
                    images: {
                        async validate() {
                            return {
                                format: 'png' as const,
                                contentType: 'image/png',
                                width: 1,
                                height: 1
                            };
                        },
                        async toWebp(body) { return body; },
                        async thumbnailPng(body) { return body; },
                        async resizeJpeg(body) { return body; }
                    },
                    storage: {
                        async get() { return null; },
                        async put(key, body, options) {
                            writes.push(key);
                            return {
                                body,
                                size: body.byteLength,
                                contentType: options?.contentType ?? 'application/octet-stream',
                                etag: key
                            };
                        },
                        async delete() {},
                        async exists() { return true; },
                        async copy() {},
                        async move() {},
                        async list() { return []; },
                        async deletePrefix() {}
                    }
                }
            );
            const upload = (path: string) => fixture.request(path, {
                method: 'POST',
                headers: { 'Content-Type': 'multipart/form-data; boundary=contract' },
                body: '--contract--'
            });

            const fudaba = await upload('/api/community/exchange/guest-submissions');
            assert.equal(fudaba.status, 200);
            assert.equal(fudaba.headers.get('cache-control'), 'private, no-store');
            const fudabaBody = await responseJson(fudaba) as {
                success: boolean;
                message: string;
                submission: {
                    id: number;
                    publicationStatus: string;
                    revision: number;
                };
                withdrawalToken: string;
            };
            assert.deepEqual({
                success: fudabaBody.success,
                message: fudabaBody.message,
                submission: fudabaBody.submission
            }, {
                success: true,
                message: '上传成功，等待审核',
                submission: {
                    id: 19,
                    publicationStatus: 'pending',
                    revision: 0
                }
            });
            assert.match(fudabaBody.withdrawalToken, /^[a-f0-9]{64}$/);
            assert.equal(writes.length, 4);
        });

        test('a valid Fudaba anonymous receipt can read and withdraw only the pending revision', async () => {
            const seenHashes: string[] = [];
            const seenWithdrawals: Array<[number, string, number]> = [];
            const pending = {
                id: 19,
                seriesCode: null,
                favoriteIdols: [],
                image1_url: '/uploads/namecard/original/front.webp',
                image2_url: '/uploads/namecard/original/back.webp',
                status: 'pending' as const,
                created_at: '2026-08-11T00:00:00.000Z',
                revision: 2
            };
            const fixture = createCompatibilityFixture({
                async findSubmissionByTokenHash(id, tokenHash) {
                    assert.equal(id, 19);
                    seenHashes.push(tokenHash);
                    return pending;
                },
                async withdrawSubmission(id, tokenHash, expectedRevision) {
                    seenWithdrawals.push([id, tokenHash, expectedRevision]);
                    return {
                        status: 'updated',
                        card: { ...pending, status: 'withdrawn', revision: 3 }
                    };
                }
            });
            const fudabaHeaders = {
                'X-Fudaba-Guest-Submission-Token': 'a'.repeat(64)
            };
            const fudabaDetail = await fixture.request(
                '/api/community/exchange/guest-submissions/19',
                { headers: fudabaHeaders }
            );
            assert.equal(fudabaDetail.status, 200);
            assert.equal(fudabaDetail.headers.get('cache-control'), 'private, no-store');
            assert.deepEqual(await responseJson(fudabaDetail), {
                success: true,
                submission: {
                    id: 19,
                    seriesCode: null,
                    favoriteIdols: [],
                    frontImageUrl: '/uploads/namecard/original/front.webp',
                    backImageUrl: '/uploads/namecard/original/back.webp',
                    publicationStatus: 'pending',
                    createdAt: '2026-08-11T00:00:00.000Z',
                    revision: 2
                }
            });

            const fudabaWithdrawn = await fixture.request(
                '/api/community/exchange/guest-submissions/19/withdraw',
                {
                    method: 'POST',
                    headers: { ...fudabaHeaders, 'Content-Type': 'application/json' },
                    body: JSON.stringify({ expectedRevision: 2 })
                }
            );
            assert.equal(fudabaWithdrawn.status, 200);
            assert.deepEqual(await responseJson(fudabaWithdrawn), {
                success: true,
                submission: {
                    id: 19,
                    seriesCode: null,
                    favoriteIdols: [],
                    frontImageUrl: '/uploads/namecard/original/front.webp',
                    backImageUrl: '/uploads/namecard/original/back.webp',
                    publicationStatus: 'withdrawn',
                    createdAt: '2026-08-11T00:00:00.000Z',
                    revision: 3
                }
            });

            assert.equal(seenHashes.length, 1);
            assert.match(seenHashes[0], /^[a-f0-9]{64}$/);
            assert.deepEqual(seenWithdrawals, [[19, seenHashes[0], 2]]);
            assert.equal(fixture.calls.storageWrites, 0);
            assert.deepEqual(fixture.calls.audit.map(({ action, target, username }) => ({
                action,
                target,
                username
            })), [
                {
                    action: '撤回名片投稿',
                    target: 'card_id=19;revision=3',
                    username: 'anonymous'
                }
            ]);
        });

        test('Fudaba guest submission media requires the private receipt token', async () => {
            const reads: string[] = [];
            const pending = {
                id: 19,
                seriesCode: null,
                favoriteIdols: [],
                image1_url: '/uploads/namecard/original/front.webp',
                image2_url: '/uploads/namecard/original/back.webp',
                status: 'pending' as const,
                created_at: '2026-08-11T00:00:00.000Z',
                revision: 2
            };
            const fixture = createCompatibilityFixture(
                {
                    async findSubmissionByTokenHash(id, tokenHash) {
                        assert.equal(id, 19);
                        assert.match(tokenHash, /^[a-f0-9]{64}$/);
                        return pending;
                    }
                },
                {
                    storage: {
                        async get(key) {
                            reads.push(key);
                            const body = new Uint8Array([1, 2, 3]);
                            return {
                                body,
                                size: body.byteLength,
                                contentType: 'image/webp',
                                etag: 'guest-media'
                            };
                        },
                        async put() { throw new Error('unexpected storage write'); },
                        async delete() {},
                        async exists() { return true; },
                        async copy() {},
                        async move() {},
                        async list() { return []; },
                        async deletePrefix() {}
                    }
                }
            );
            const path = '/api/community/exchange/guest-submissions/19/media/front';
            const unauthorized = await fixture.request(path);
            assert.equal(unauthorized.status, 404);
            assert.match(unauthorized.headers.get('content-type') ?? '', /^text\/plain/i);
            assert.equal(await unauthorized.text(), 'Not Found');

            const response = await fixture.request(path, {
                headers: { 'X-Fudaba-Guest-Submission-Token': 'a'.repeat(64) }
            });
            assert.equal(response.status, 200);
            assert.equal(response.headers.get('content-type'), 'image/webp');
            assert.equal(response.headers.get('cache-control'), 'private, no-store');
            assert.match(
                response.headers.get('vary') ?? '',
                /X-Fudaba-Guest-Submission-Token/
            );
            assert.deepEqual(
                [...new Uint8Array(await response.arrayBuffer())],
                [1, 2, 3]
            );
            assert.deepEqual(reads, ['community/namecards/assets/front/image.webp']);
        });

        test.describe('namecard approval', () => {
            test('publishes originals and thumbnails before the final CAS transition', async () => {
                const fixture = createCompatibilityFixture({
                    async beginCardApproval(id, expectedRevision) {
                        assert.equal(id, 19);
                        assert.equal(expectedRevision, 2);
                        return {
                            status: 'claimed',
                            card: {
                                id,
                                image1_url: '/uploads/namecard/original/front.webp',
                                image2_url: '/uploads/namecard/original/back.webp',
                                status: 'approving',
                                created_at: null,
                                revision: 3
                            }
                        };
                    },
                    async completeCardApproval(id, approvingRevision) {
                        assert.equal(id, 19);
                        assert.equal(approvingRevision, 3);
                        return {
                            status: 'updated',
                            card: {
                                id,
                                image1_url: '/uploads/namecard/original/front.webp',
                                image2_url: '/uploads/namecard/original/back.webp',
                                status: 'approved',
                                created_at: null,
                                revision: 4
                            }
                        };
                    }
                });
                const response = await fixture.request('/api/admin/cards/approve/19', {
                    method: 'POST',
                    headers: {
                        Authorization: 'Bearer op-token',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ expected_revision: 2 })
                });

                assert.equal(response.status, 200);
                assert.deepEqual(await responseJson(response), { success: true, revision: 4 });
                assert.equal(fixture.calls.storageWrites, 4);
                assert.deepEqual(fixture.calls.audit.map(({ action, target }) => ({ action, target })), [{
                    action: '审核图片通过',
                    target: 'card_id=19;revision=4'
                }]);
            });

            test('heals legacy uploads whose thumbnails were never stored', async () => {
                const writtenKeys: string[] = [];
                const publishedKeys: string[] = [];
                const originals = new Map([
                    ['community/namecards/assets/front/image.webp', new Uint8Array([9, 9])],
                    ['community/namecards/assets/back/image.webp', new Uint8Array([7])]
                ]);
                const fixture = createCompatibilityFixture({
                    async beginCardApproval(id, expectedRevision) {
                        assert.equal(id, 19);
                        assert.equal(expectedRevision, 2);
                        return {
                            status: 'claimed',
                            card: {
                                id,
                                image1_url: '/uploads/namecard/original/front.webp',
                                image2_url: '/uploads/namecard/original/back.webp',
                                status: 'approving',
                                created_at: null,
                                revision: 3
                            }
                        };
                    },
                    async completeCardApproval(id, approvingRevision) {
                        assert.equal(id, 19);
                        assert.equal(approvingRevision, 3);
                        return {
                            status: 'updated',
                            card: {
                                id,
                                image1_url: '/uploads/namecard/original/front.webp',
                                image2_url: '/uploads/namecard/original/back.webp',
                                status: 'approved',
                                created_at: null,
                                revision: 4
                            }
                        };
                    }
                }, {
                    images: {
                        async validate() { throw new Error('unexpected validate'); },
                        async toWebp() { throw new Error('unexpected toWebp'); },
                        async thumbnailPng() { throw new Error('unexpected thumbnailPng'); },
                        async resizeJpeg(body) { return new Uint8Array(body.byteLength + 4); }
                    },
                    storage: {
                        async get(key) {
                            const original = originals.get(key);
                            return original ? {
                                body: original,
                                size: original.byteLength,
                                contentType: 'image/webp',
                                etag: 'etag'
                            } : null;
                        },
                        async put(key, body) {
                            writtenKeys.push(key);
                            return { body, size: body.byteLength, contentType: 'image/jpeg', etag: 'etag' };
                        },
                        async delete() {},
                        async exists(key) { return !key.endsWith('/thumbnail.jpg'); },
                        async publish(key) { publishedKeys.push(key); },
                        async copy() {},
                        async move() {},
                        async list() { return []; },
                        async deletePrefix() {}
                    }
                });
                const response = await fixture.request('/api/admin/cards/approve/19', {
                    method: 'POST',
                    headers: {
                        Authorization: 'Bearer op-token',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ expected_revision: 2 })
                });

                assert.equal(response.status, 200);
                assert.deepEqual(await responseJson(response), { success: true, revision: 4 });
                assert.deepEqual(writtenKeys, [
                    'community/namecards/assets/front/thumbnail.jpg',
                    'community/namecards/assets/back/thumbnail.jpg'
                ]);
                assert.deepEqual(publishedKeys, [
                    'community/namecards/assets/front/image.webp',
                    'community/namecards/assets/front/thumbnail.jpg',
                    'community/namecards/assets/back/image.webp',
                    'community/namecards/assets/back/thumbnail.jpg'
                ]);
                assert.deepEqual(fixture.calls.audit.map(({ action, target }) => ({ action, target })), [{
                    action: '审核图片通过',
                    target: 'card_id=19;revision=4'
                }]);
            });
        });

        test('reject namecard soft-rejects a pending submission and audits it', async () => {
            const pending = {
                id: 19,
                image1_url: '/uploads/namecard/original/front.webp',
                image2_url: '/uploads/namecard/original/back.webp',
                status: 'pending' as const,
                created_at: '2026-08-11T00:00:00.000Z',
                revision: 2
            };
            const fixture = createCompatibilityFixture({
                async rejectSubmission(id, expectedRevision) {
                    assert.equal(id, 19);
                    assert.equal(expectedRevision, 2);
                    return {
                        status: 'updated',
                        card: { ...pending, status: 'rejected', revision: 3 }
                    };
                }
            });
            const response = await fixture.request('/api/admin/cards/reject/19', {
                method: 'POST',
                headers: {
                    Authorization: 'Bearer op-token',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ expected_revision: 2 })
            });

            assert.equal(response.status, 200);
            assert.deepEqual(await responseJson(response), { success: true });
            assert.equal(fixture.calls.storageWrites, 0);
            assert.deepEqual(fixture.calls.audit.map(({ action, target }) => ({ action, target })), [{
                action: '驳回名片投稿',
                target: 'card_id=19;revision=3'
            }]);
        });

        test('approve and reject surface 用户已撤回 (410) once the user withdraws', async () => {
            const fixture = createCompatibilityFixture({
                async beginCardApproval() {
                    return { status: 'withdrawn', revision: 3 };
                },
                async rejectSubmission() {
                    return { status: 'withdrawn', revision: 3 };
                }
            });
            for (const pathname of ['/api/admin/cards/approve/19', '/api/admin/cards/reject/19']) {
                const response = await fixture.request(pathname, {
                    method: 'POST',
                    headers: {
                        Authorization: 'Bearer op-token',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({ expected_revision: 2 })
                });
                assert.equal(response.status, 410);
                assert.deepEqual(await responseJson(response), {
                    error: '用户已撤回',
                    revision: 3
                });
            }
            assert.deepEqual(fixture.calls.audit, []);
        });

        test('guest namecard image replacement and resubmission routes are not exposed', async () => {
            const fixture = createCompatibilityFixture({
                async resubmitSubmission() { throw new Error('must not resubmit'); },
                async replaceSubmissionImage() { throw new Error('must not replace'); }
            });
            for (const pathname of [
                '/api/namecards/submissions/19/resubmit',
                '/api/namecards/submissions/19/images/front?expected_revision=3'
            ]) {
                const response = await fixture.request(pathname, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-Namecard-Withdrawal-Token': 'a'.repeat(64)
                    },
                    body: JSON.stringify({ expected_revision: 3 })
                });
                assert.equal(response.status, 404);
            }
            assert.deepEqual(fixture.calls.audit, []);
            assert.equal(fixture.calls.storageWrites, 0);
        });

        test('legacy Information reads remain available while the retired admin write API is gone', async () => {
            const fixture = createCompatibilityFixture();
            const detail = await fixture.request('/api/information/not-valid');
            assert.equal(detail.status, 404);
            assert.deepEqual(await responseJson(detail), { error: '活动内容不存在' });

            const content = await fixture.request('/information/not-valid/content');
            assert.equal(content.status, 404);
            assert.equal(await content.text(), '活动内容不存在');

            const readsBeforeUpdate = fixture.calls.storageGet;
            const update = await fixture.request('/api/admin/information/x', {
                method: 'PUT',
                headers: {
                    Authorization: 'Bearer op-token',
                    'Content-Type': 'application/json'
                },
                body: '{}'
            });
            assert.equal(update.status, 410);
            assert.deepEqual(await responseJson(update), {
                error: '活动资讯后台已整合至社区帖子，请使用 /api/admin/community-posts'
            });
            assert.equal(fixture.calls.storageGet, readsBeforeUpdate);
            assert.equal(fixture.calls.storageWrites, 0);
            assert.deepEqual(fixture.calls.audit, []);
        });

        test('About and Producer Map validate content before stale revision reads after auth and CSRF', async () => {
            const scenarios = [
                {
                    pathname: '/api/admin/about',
                    error: '关于页配置格式无效'
                },
                {
                    pathname: '/api/admin/producer-map',
                    error: '制作人地图配置格式无效'
                }
            ] as const;

            for (const scenario of scenarios) {
                const fixture = createCompatibilityFixture();
                const body = JSON.stringify({ content: null, revision: 'stale-revision' });
                const unauthenticated = await fixture.request(scenario.pathname, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body
                });
                assert.equal(unauthenticated.status, 401, scenario.pathname);
                assert.deepEqual(await responseJson(unauthenticated), {
                    success: false,
                    message: '未登录'
                });

                const missingCsrf = await fixture.request(scenario.pathname, {
                    method: 'PUT',
                    headers: {
                        Cookie: 'token=op-token; csrf_token=csrf',
                        'Content-Type': 'application/json'
                    },
                    body
                });
                assert.equal(missingCsrf.status, 403, scenario.pathname);
                assert.deepEqual(await responseJson(missingCsrf), {
                    success: false,
                    message: 'CSRF token invalid'
                });

                const invalidContent = await fixture.request(scenario.pathname, {
                    method: 'PUT',
                    headers: {
                        Cookie: 'token=op-token; csrf_token=csrf',
                        'Content-Type': 'application/json',
                        'X-CSRFToken': 'csrf'
                    },
                    body
                });
                assert.equal(invalidContent.status, 400, scenario.pathname);
                assert.deepEqual(await responseJson(invalidContent), { error: scenario.error });
                assert.equal(fixture.calls.storageGet, 0, `${scenario.pathname} revision read`);
                assert.equal(fixture.calls.storageWrites, 0, `${scenario.pathname} storage write`);
                assert.equal(fixture.calls.storyReads, 0, `${scenario.pathname} repository read`);
                assert.deepEqual(fixture.calls.audit, [], scenario.pathname);
            }
        });

        test('News DELETE preserves Number aliases after auth and CSRF at the stub repository boundary', async () => {
            const fixture = createCompatibilityFixture();
            const unauthenticated = await fixture.request('/api/admin/news/not-an-id', {
                method: 'DELETE'
            });
            assert.equal(unauthenticated.status, 401);
            assert.deepEqual(await responseJson(unauthenticated), {
                success: false,
                message: '未登录'
            });

            const missingCsrf = await fixture.request('/api/admin/news/not-an-id', {
                method: 'DELETE',
                headers: { Cookie: 'token=op-token; csrf_token=csrf' }
            });
            assert.equal(missingCsrf.status, 403);
            assert.deepEqual(await responseJson(missingCsrf), {
                success: false,
                message: 'CSRF token invalid'
            });
            assert.deepEqual(fixture.calls.newsFindMedia, []);
            assert.deepEqual(fixture.calls.newsDelete, []);
            assert.deepEqual(fixture.calls.audit, []);

            const headers = {
                Cookie: 'token=op-token; csrf_token=csrf',
                'X-CSRFToken': 'csrf'
            };
            for (const id of ['not-an-id', '01', '1e1']) {
                const response = await fixture.request(`/api/admin/news/${id}`, {
                    method: 'DELETE',
                    headers
                });
                assert.equal(response.status, 200, id);
                assert.deepEqual(await responseJson(response), { success: true });
            }
            assert.equal(Number.isNaN(fixture.calls.newsFindMedia[0]), true);
            assert.equal(Number.isNaN(fixture.calls.newsDelete[0]), true);
            assert.deepEqual(fixture.calls.newsFindMedia.slice(1), [1, 10]);
            assert.deepEqual(fixture.calls.newsDelete.slice(1), [1, 10]);
            assert.deepEqual(fixture.calls.audit.map(({ action, target }) => ({ action, target })), [
                { action: '删除新闻', target: 'ID=NaN' },
                { action: '删除新闻', target: 'ID=1' },
                { action: '删除新闻', target: 'ID=10' }
            ]);
            assert.equal(fixture.calls.storageWrites, 0);
        });

        test('Admin Accounts DELETE validates aliases after auth, super-admin, and CSRF checks', async () => {
            const fixture = createCompatibilityFixture();
            const unauthenticated = await fixture.request('/api/admin/accounts/not-an-id', {
                method: 'DELETE'
            });
            assert.equal(unauthenticated.status, 401);
            assert.deepEqual(await responseJson(unauthenticated), {
                success: false,
                message: '未登录'
            });
            assert.deepEqual(fixture.calls.authFind, []);

            const regularAdmin = await fixture.request('/api/admin/accounts/not-an-id', {
                method: 'DELETE',
                headers: { Authorization: 'Bearer regular-token' }
            });
            assert.equal(regularAdmin.status, 403);
            assert.deepEqual(await responseJson(regularAdmin), {
                success: false,
                message: '仅最高管理员可执行此操作'
            });
            assert.deepEqual(fixture.calls.authFind, [98]);
            assert.deepEqual(fixture.calls.adminDelete, []);

            fixture.calls.authFind.length = 0;
            const missingCsrf = await fixture.request('/api/admin/accounts/not-an-id', {
                method: 'DELETE',
                headers: { Cookie: 'token=op-token; csrf_token=csrf' }
            });
            assert.equal(missingCsrf.status, 403);
            assert.deepEqual(await responseJson(missingCsrf), {
                success: false,
                message: 'CSRF token invalid'
            });
            assert.deepEqual(fixture.calls.authFind, [99]);
            assert.deepEqual(fixture.calls.adminDelete, []);

            const headers = {
                Cookie: 'token=op-token; csrf_token=csrf',
                'X-CSRFToken': 'csrf'
            };
            for (const invalidId of ['not-an-id', '0']) {
                fixture.calls.authFind.length = 0;
                const response = await fixture.request(`/api/admin/accounts/${invalidId}`, {
                    method: 'DELETE',
                    headers
                });
                assert.equal(response.status, 400, invalidId);
                assert.deepEqual(await responseJson(response), {
                    success: false,
                    message: '管理员账号 ID 无效'
                });
                assert.deepEqual(fixture.calls.authFind, [99]);
                assert.deepEqual(fixture.calls.adminDelete, []);
                assert.deepEqual(fixture.calls.audit, []);
            }

            for (const [alias, id] of [['01', 1], ['1e1', 10]] as const) {
                fixture.calls.authFind.length = 0;
                fixture.calls.adminDelete.length = 0;
                fixture.calls.audit.length = 0;
                const response = await fixture.request(`/api/admin/accounts/${alias}`, {
                    method: 'DELETE',
                    headers
                });
                assert.equal(response.status, 200, alias);
                assert.deepEqual(await responseJson(response), { success: true });
                assert.deepEqual(fixture.calls.authFind, [99, id]);
                assert.deepEqual(fixture.calls.adminDelete, [id]);
                assert.deepEqual(fixture.calls.audit.map(({ action, target }) => ({ action, target })), [{
                    action: '删除管理员',
                    target: `admin-${id}`
                }]);
            }
        });

        test('namecard public and admin pagination preserve parseInt aliases and fallbacks', async () => {
            const fixture = createCompatibilityFixture();
            const publicCases = [
                ['page=abc&size=abc', [25, 0]],
                ['page=0&size=0', [25, 0]],
                ['page=1foo&size=1foo', [1, 0]],
                ['page=101&size=101', [101, 10_100]]
            ] as const;
            for (const [query, repositoryArgs] of publicCases) {
                const response = await fixture.request(`/api/cards?${query}`);
                assert.equal(response.status, 200, query);
                const cardsBody = await contractJson(response, namecardPageSchema);
                assert.deepEqual(cardsBody, { list: [], total: 0, totalPage: 0 });
                assert.deepEqual(fixture.calls.namecardListApproved.at(-1), repositoryArgs, query);
            }

            const unauthenticated = await fixture.request('/api/admin/cards?page=101');
            assert.equal(unauthenticated.status, 401);
            assert.deepEqual(fixture.calls.namecardListAdmin, []);

            const adminCases = [
                ['page=abc&size=101', [10, 0]],
                ['page=0&size=0', [10, 0]],
                ['page=1foo&size=1foo', [10, 0]],
                ['page=101&size=abc', [10, 1_000]]
            ] as const;
            for (const [query, repositoryArgs] of adminCases) {
                const response = await fixture.request(`/api/admin/cards?${query}`, {
                    headers: { Authorization: 'Bearer op-token' }
                });
                assert.equal(response.status, 200, query);
                assert.deepEqual(await contractJson(response, adminNamecardListSchema), {
                    success: true,
                    data: [],
                    pageInfo: {
                        page: repositoryArgs[1] / 10 + 1,
                        pageSize: 10,
                        total: 0,
                        totalPages: 0,
                        hasNextPage: false
                    }
                });
                assert.deepEqual(fixture.calls.namecardListAdmin.at(-1), repositoryArgs, query);
            }
        });

        test('legacy reaction aliases retain their separate mutation envelopes and strip extra keys', async () => {
            const fixture = createCompatibilityFixture();
            for (const route of ['/api/emojis', '/api/reactions'] as const) {
                const listed = await fixture.request(`${route}?id=1&legacy=true`);
                assert.equal(listed.status, 200, route);
                assert.deepEqual(await contractJson(listed, reactionSchema), { '👍': 2 });

                const mutation = await fixture.request(route, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ id: 1, emoji: '👍', legacy: true })
                });
                assert.equal(mutation.status, 200, route);
                assert.deepEqual(
                    await contractJson(
                        mutation,
                        route === '/api/emojis' ? legacyEmojiMutationSchema : reactionMutationSchema
                    ),
                    route === '/api/emojis' ? { success: true } : { ok: true }
                );
            }

            const invalid = await fixture.request('/api/reactions', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ id: 1, emoji: 'not-supported' })
            });
            assert.equal(invalid.status, 400);
            assert.deepEqual(await contractJson(invalid, namecardErrorResponseSchema), {
                error: 'Unsupported reaction'
            });
        });

        test('guest submission detail and withdrawal preserve legacy request projection and exact envelopes', async () => {
            const submission: NamecardSubmissionRecord = {
                id: 7,
                image1_url: '/uploads/namecard/original/front.webp',
                image2_url: '/uploads/namecard/original/back.webp',
                status: 'pending',
                revision: 0,
                series_code: '765',
                favorite_idols: [
                    { idol_id: 1, agency_code: '765', name_cn: '天海春香', display_order: 0 }
                ],
                created_at: '2026-08-03T01:00:00.000Z'
            };
            const fixture = createCompatibilityFixture({
                async findSubmissionByTokenHash() { return submission; },
                async withdrawSubmission() {
                    return {
                        status: 'updated',
                        card: { ...submission, status: 'withdrawn', revision: 1 }
                    };
                }
            });
            const token = 'a'.repeat(64);
            const headers = { 'X-Fudaba-Guest-Submission-Token': token };

            const detail = await fixture.request('/api/community/exchange/guest-submissions/7', {
                headers
            });
            assert.equal(detail.status, 200);
            assert.deepEqual(await contractJson(detail, fudabaGuestSubmissionDetailSchema), {
                success: true,
                submission: {
                    id: 7,
                    seriesCode: '765',
                    favoriteIdols: [{ id: 1, name: '天海春香', seriesCode: '765' }],
                    frontImageUrl: '/uploads/namecard/original/front.webp',
                    backImageUrl: '/uploads/namecard/original/back.webp',
                    publicationStatus: 'pending',
                    createdAt: '2026-08-03T01:00:00.000Z',
                    revision: 0
                }
            });

            const withdrawn = await fixture.request('/api/community/exchange/guest-submissions/7/withdraw', {
                method: 'POST',
                headers: { ...headers, 'content-type': 'application/json' },
                body: JSON.stringify({ expectedRevision: 0, ignored: true })
            });
            assert.equal(withdrawn.status, 200);
            assert.deepEqual(await contractJson(withdrawn, fudabaGuestSubmissionWithdrawalSchema), {
                success: true,
                submission: {
                    id: 7,
                    seriesCode: '765',
                    favoriteIdols: [{ id: 1, name: '天海春香', seriesCode: '765' }],
                    frontImageUrl: '/uploads/namecard/original/front.webp',
                    backImageUrl: '/uploads/namecard/original/back.webp',
                    publicationStatus: 'withdrawn',
                    createdAt: '2026-08-03T01:00:00.000Z',
                    revision: 1
                }
            });

            const unavailable = await fixture.request('/api/community/exchange/guest-submissions/7');
            assert.equal(unavailable.status, 404);
            assert.deepEqual(await contractJson(unavailable, fudabaGuestSubmissionErrorSchema), {
                error: 'Submission not found'
            });

            const conflicting = createCompatibilityFixture({
                async withdrawSubmission() { return { status: 'conflict', revision: 3 }; }
            });
            const conflict = await conflicting.request('/api/community/exchange/guest-submissions/7/withdraw', {
                method: 'POST',
                headers: { ...headers, 'content-type': 'application/json' },
                body: JSON.stringify({ expectedRevision: 0 })
            });
            assert.equal(conflict.status, 409);
            assert.deepEqual(await contractJson(conflict, fudabaGuestSubmissionErrorSchema), {
                error: 'Submission changed; refresh and retry',
                revision: 3
            });
        });

        test('invalid namecard IDs preserve public/admin responses after auth and CSRF checks', async () => {
            const fixture = createCompatibilityFixture();
            const publicCard = await fixture.request('/api/card/not-a-number');
            assert.equal(publicCard.status, 200);
            assert.deepEqual(await contractJson(publicCard, namecardEmptyResponseSchema), {});
            assert.deepEqual(fixture.calls.namecardFindApproved, []);

            fixture.calls.namecardFindMedia.length = 0;
            fixture.calls.namecardApprove.length = 0;
            fixture.calls.namecardDelete.length = 0;
            fixture.calls.audit.length = 0;
            const unauthenticated = await fixture.request('/api/admin/cards/approve/not-a-number', {
                method: 'POST'
            });
            assert.equal(unauthenticated.status, 401);
            assert.deepEqual(
                await contractJson(unauthenticated, failureMessageResponseSchema),
                { success: false, message: '未登录' }
            );

            const missingCsrf = await fixture.request('/api/admin/cards/not-a-number', {
                method: 'DELETE',
                headers: { Cookie: 'token=op-token; csrf_token=csrf' }
            });
            assert.equal(missingCsrf.status, 403);
            assert.deepEqual(await responseJson(missingCsrf), {
                success: false,
                message: 'CSRF token invalid'
            });
            assert.deepEqual(fixture.calls.namecardFindMedia, []);
            assert.deepEqual(fixture.calls.namecardApprove, []);
            assert.deepEqual(fixture.calls.namecardDelete, []);
            assert.deepEqual(fixture.calls.audit, []);

            const approved = await fixture.request('/api/admin/cards/approve/not-a-number', {
                method: 'POST',
                headers: {
                    Cookie: 'token=op-token; csrf_token=csrf',
                    'X-CSRFToken': 'csrf',
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ expected_revision: 0 })
            });
            assert.equal(approved.status, 404);
            assert.deepEqual(await contractJson(approved, namecardErrorResponseSchema), {
                error: 'Namecard not found'
            });

            const deleted = await fixture.request('/api/admin/cards/not-a-number?expected_revision=0', {
                method: 'DELETE',
                headers: { Authorization: 'Bearer op-token' }
            });
            assert.equal(deleted.status, 404);
            assert.deepEqual(await contractJson(deleted, namecardErrorResponseSchema), {
                error: 'Namecard not found'
            });
            assert.deepEqual(fixture.calls.namecardFindMedia, []);
            assert.deepEqual(fixture.calls.namecardApprove, [0]);
            assert.deepEqual(fixture.calls.namecardDelete, [0]);
            assert.deepEqual(fixture.calls.audit, []);
            assert.equal(fixture.calls.storageWrites, 0);
        });

        test('Wiki admin authentication precedes shared numeric param validation', async () => {
            const fixture = createCompatibilityFixture();
            const pathname = '/api/admin/wiki/agencies/not-an-id/story-cover-assets';
            const unauthenticated = await fixture.request(pathname);
            assert.equal(unauthenticated.status, 401);
            assert.deepEqual(await responseJson(unauthenticated), {
                status: 'error',
                msg: '未登录，请先登录'
            });
            assert.equal(fixture.calls.storyReads, 0);

            for (const id of ['not-an-id', '0']) {
                const response = await fixture.request(
                    `/api/admin/wiki/agencies/${id}/story-cover-assets`,
                    { headers: { Cookie: 'token=op-token' } }
                );
                assert.equal(response.status, 400, id);
                assert.deepEqual(await responseJson(response), {
                    status: 'error',
                    msg: '企划 ID 无效'
                });
                assert.equal(fixture.calls.storyReads, 0, id);
            }
        });

        test('Wiki JSON field validation rejects before the route handler reads its repository', async () => {
            const fixture = createCompatibilityFixture();
            const response = await fixture.request('/api/admin/wiki/agencies', {
                method: 'POST',
                headers: {
                    Cookie: 'token=op-token',
                    'Content-Type': 'application/json',
                    'X-CSRFToken': 'csrf'
                },
                body: '{}'
            });
            assert.equal(response.status, 400);
            assert.deepEqual(await responseJson(response), {
                status: 'error',
                msg: '企划名称无效'
            });
            assert.equal(fixture.calls.storyReads, 0);
            assert.equal(fixture.calls.storageWrites, 0);
            assert.deepEqual(fixture.calls.audit, []);
        });
    });
}
