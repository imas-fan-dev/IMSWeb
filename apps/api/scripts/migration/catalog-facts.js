'use strict';

// Import repository-owned public facts. No user/card payload is read. Run against
// an isolated local replay first; dry-run only reads and never advances sequences.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { Client } = require('pg');

const root = path.resolve(__dirname, '../../../..');
const normalize = (value) => value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/gu, '');
const identityNames = (record) => [record.name_cn,record.name_ja,record.name_en,
    ...(record.aliases || '').split(/[\r\n,，、;；]+/u)].filter(Boolean).map(normalize);
// Reviewed spelling/translation differences in the repository birthday source.
// Scope each alias to its project and match the catalog's official name.
const birthdayAliases = {
    '876:秋月凉': '秋月涼',
    'cg:兵藤蕾娜': '兵藤レナ',
    'ml:白石䌷': '白石紬',
    'sidem:水岛咲': '水嶋咲',
    'sidem:阿斯兰·别西卜II世': 'アスラン=ベルゼビュートII世',
};

async function importCatalogFacts({ connectionString, apply = false }) {
    let url;
    try { url = new URL(connectionString); }
    catch (error) { throw new Error('A valid local DATABASE_URL is required', { cause: error }); }
    if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)) {
        throw new Error('Catalog fact replay requires a local isolated PostgreSQL database');
    }
    const birthdayBytes = fs.readFileSync(path.join(root, 'apps/web/app/pages/home/idol-birthdays.json'), 'utf8');
    const voiceBytes = fs.readFileSync(path.join(root, 'apps/web/app/pages/wiki/cg-voiced-idols.ts'), 'utf8');
    let birthdays;
    try { birthdays = JSON.parse(birthdayBytes); }
    catch (error) { throw new Error('Repository birthday source is invalid', { cause: error }); }
    const voiceArray = voiceBytes.slice(voiceBytes.indexOf('new Set(['), voiceBytes.indexOf(']);'));
    const voiced = new Set([...voiceArray.matchAll(/^\s*"([a-z0-9_-]+)",?\s*$/gm)].map((m) => m[1]));
    const codes = { '765PRO': '765', '876PRO': '876', '灰姑娘女孩': 'cg', '百万现场': 'ml',
        'SideM': 'sidem', '闪耀色彩': 'sc', '学园偶像大师': 'gk' };
    const client = new Client({ connectionString });
    const report = { applied: apply, birthdaySourceHash: createHash('sha256').update(birthdayBytes).digest('hex'),
        voiceSourceHash: createHash('sha256').update(voiceBytes).digest('hex'),
        birthdays: 0, voiced: 0, profilesCreated: 0, charactersCreated: 0, entriesBound: 0, unresolved: [], conflicts: [] };
    await client.connect();
    try {
        await client.query(apply ? 'BEGIN ISOLATION LEVEL SERIALIZABLE' : 'BEGIN READ ONLY');
        const projects = (await client.query('SELECT id,code FROM projects')).rows;
        const projectMap = new Map(projects.map((p) => [p.code, p.id]));
        const characters = (await client.query(
            `SELECT c.id,c.agency_id AS default_project_id,c.name_cn,c.name_ja,c.name_en,c.aliases,c.category,p.code AS default_code
             FROM namecard_characters c JOIN projects p ON p.id=c.agency_id
             WHERE c.deleted_at IS NULL AND NOT c.is_fallback`
        )).rows;
        const profiles = (await client.query('SELECT * FROM catalog_character_project_profiles')).rows;
        const entries = (await client.query('SELECT * FROM wiki_entries WHERE deleted_at IS NULL')).rows;
        let plannedId = -1;
        const createdProfiles = new Set();

        for (const record of birthdays) {
            const projectId = projectMap.get(codes[record.agency]);
            const key = normalize(birthdayAliases[`${codes[record.agency]}:${record.name}`] || record.name);
            const date = /^(\d{2})-(\d{2})$/.exec(record.birthday);
            const month = date ? Number(date[1]) : 0;
            const day = date ? Number(date[2]) : 0;
            const max = month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
            if (!projectId || month < 1 || month > 12 || day < 1 || day > max) {
                report.unresolved.push({ source: 'birthday', name: record.name, project: record.agency, reason: 'invalid-source' });
                continue;
            }
            let candidates = characters.filter((c) => (identityNames(c).includes(key) || profiles.some((p) =>
                p.character_id===c.id && p.project_id===projectId && identityNames(p).includes(key))) &&
                (c.default_project_id === projectId || profiles.some((p) => p.character_id === c.id && p.project_id === projectId)));
            // This franchise explicitly reuses the original 765 cast in ML.
            // Never apply this identity rule to DS/SideM, XENO or other worlds.
            if (!candidates.length && codes[record.agency] === 'ml') {
                candidates = characters.filter((c) => c.default_code === '765' && identityNames(c).includes(key));
            }
            const wiki = entries.filter((e) => e.project_id === projectId &&
                [key,normalize(record.name)].includes(normalize(e.local_name_cn)));
            let character = candidates.length === 1 ? candidates[0] : null;
            if (!character && !candidates.length && wiki.length === 1 && wiki[0].character_profile_id) {
                const bound = profiles.find((p) => p.id === wiki[0].character_profile_id);
                character = bound ? characters.find((c) => c.id === bound.character_id) : null;
            }
            if (!character && candidates.length === 0 && wiki.length === 1 && wiki[0].entry_kind === 'idol'
                && !wiki[0].character_profile_id && !wiki[0].group_profile_id) {
                if (apply) {
                    character = (await client.query(
                        `INSERT INTO namecard_characters(agency_id,name_cn,category)
                         VALUES ($1,$2,'idol') RETURNING id,agency_id AS default_project_id,name_cn`, [projectId,record.name]
                    )).rows[0];
                } else character = { id: plannedId--,default_project_id: projectId,name_cn: record.name,name_ja: null,name_en: null,aliases: null,category: 'idol' };
                character.default_code = codes[record.agency];
                character.category = 'idol';
                characters.push(character);
                report.charactersCreated += 1;
            }
            if (!character) {
                report.unresolved.push({ source: 'birthday', name: record.name, project: record.agency,
                    reason: candidates.length > 1 ? 'ambiguous-identity' : 'no-confirmed-identity' });
                continue;
            }
            let profile = profiles.find((p) => p.character_id === character.id && p.project_id === projectId);
            if (!profile) {
                if (apply) profile = (await client.query('SELECT * FROM catalog_character_project_profiles WHERE character_id=$1 AND project_id=$2',[character.id,projectId])).rows[0];
                if (apply && !profile) profile = (await client.query(
                    `INSERT INTO catalog_character_project_profiles(character_id,project_id,name_cn,name_ja,name_en,aliases,category)
                     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING *`,
                    [character.id,projectId,character.name_cn,character.name_ja??null,character.name_en??null,character.aliases??null,character.category??'idol']
                )).rows[0];
                if (!apply) profile = { id: plannedId--,character_id: character.id,project_id: projectId,name_cn: character.name_cn,
                    birth_month: null,birth_day: null,representative_color: null,avatar_object_key: null,avatar_fit: 'cover',avatar_focal_x: 0.5,
                    avatar_focal_y: 0.5,avatar_zoom: 1,avatar_rotation: 0,avatar_media_revision: 0,revision: 0 };
                profiles.push(profile);
                createdProfiles.add(profile.id);
                report.profilesCreated += 1;
            }
            if (profile?.birth_month !== null && profile?.birth_month !== undefined &&
                (profile.birth_month !== month || profile.birth_day !== day)) {
                report.conflicts.push({ source: 'birthday', profileId: profile.id, reason: 'existing-value-differs' });
                continue;
            }
            const binding = wiki.length === 1 && !wiki[0].character_profile_id && !wiki[0].group_profile_id ? wiki[0] : null;
            const sourceColor = binding || entries.some((e) => e.character_profile_id === profile.id)
                    || !createdProfiles.has(profile.id) && (profile.revision !== 0 || profile.avatar_media_revision !== 0 || profile.avatar_object_key !== null)
                    ? null : /^#[0-9a-f]{6}$/i.test(record.color) ? record.color : null;
            if (apply) {
                await client.query(
                    `UPDATE catalog_character_project_profiles SET birth_month=$1,birth_day=$2,
                        representative_color=COALESCE(representative_color,$3),revision=revision+1,updated_at=CURRENT_TIMESTAMP
                     WHERE id=$4 AND (birth_month IS NULL OR birth_month=$1 AND birth_day=$2)
                       AND (birth_month IS DISTINCT FROM $1 OR birth_day IS DISTINCT FROM $2
                            OR representative_color IS NULL AND $3::text IS NOT NULL)`,
                    [month,day,sourceColor,profile.id]
                );
            }
            profile.birth_month = month;
            profile.birth_day = day;
            if (binding) {
                const e = binding;
                const duplicate = entries.some((entry) => entry.id !== e.id && entry.character_profile_id === profile.id);
                const presentation = {
                    name_cn: createdProfiles.has(profile.id) ? e.local_name_cn : profile.name_cn,
                    representative_color: e.local_accent_color,avatar_object_key: e.local_image_object_key,
                    avatar_fit: e.local_image_fit,avatar_focal_x: e.local_image_focal_x,avatar_focal_y: e.local_image_focal_y,
                    avatar_zoom: e.local_image_zoom,avatar_rotation: e.local_image_rotation,avatar_media_revision: e.local_image_media_revision
                };
                const pristine = createdProfiles.has(profile.id) || profile.revision === 0 && profile.avatar_media_revision === 0 && profile.representative_color === null && profile.avatar_object_key === null;
                const differences = Object.keys(presentation).filter((field) => profile[field] !== presentation[field]);
                if (duplicate || presentation.name_cn !== e.local_name_cn || !pristine && differences.length) {
                    report.conflicts.push({ source: 'wiki-binding',entryId: e.id,profileId: profile.id,
                        reason: duplicate ? 'profile-already-bound' : 'maintained-presentation-differs',fields: differences });
                } else {
                    if (apply) {
                        if (pristine && differences.length) await client.query(
                            `UPDATE catalog_character_project_profiles SET name_cn=$1,representative_color=$2,
                                avatar_object_key=$3,avatar_fit=$4,avatar_focal_x=$5,avatar_focal_y=$6,
                                avatar_zoom=$7,avatar_rotation=$8,avatar_media_revision=$9,revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE id=$10`,
                            [...Object.values(presentation),profile.id]
                        );
                        await client.query('UPDATE wiki_entries SET character_profile_id=$1,binding_revision=binding_revision+1 WHERE id=$2', [profile.id,e.id]);
                        await client.query('UPDATE wiki_project_settings SET layout_revision=layout_revision+1 WHERE project_id=$1',[projectId]);
                    }
                    Object.assign(profile,presentation);
                    e.character_profile_id = profile.id;
                    report.entriesBound += 1;
                }
            }
            report.birthdays += 1;
        }
        const cg = projectMap.get('cg');
        const activeOwners = new Set(characters.map((character) => character.id));
        for (const entry of entries.filter((e) => e.project_id === cg && voiced.has(e.storage_slug))) {
            if (!entry.character_profile_id) {
                report.unresolved.push({ source: 'voice', entryId: entry.id, reason: 'unbound-entry' });
                continue;
            }
            const profile = profiles.find((candidate) => candidate.id === entry.character_profile_id);
            if (!profile || profile.is_fallback || !activeOwners.has(profile.character_id)) continue;
            if (apply) await client.query(
                `UPDATE catalog_character_project_profiles SET voice_status='voiced',revision=revision+1,updated_at=CURRENT_TIMESTAMP
                 WHERE id=$1 AND voice_status='unknown'`, [entry.character_profile_id]);
            report.voiced += 1;
        }
        await client.query(apply ? 'COMMIT' : 'ROLLBACK');
        return report;
    } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
    } finally { await client.end(); }
}

if (require.main === module) {
    importCatalogFacts({ connectionString: process.env.DATABASE_URL, apply: process.argv.includes('--apply') })
        .then((report) => {
            process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
            if (report.unresolved.length || report.conflicts.length) process.exitCode = 2;
        })
        .catch((error) => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { importCatalogFacts };
