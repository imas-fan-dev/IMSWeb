'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const {
    DEFAULT_ADMIN_URL,
    assertSafePostgresTestDatabaseName,
    createPostgresTestAllocator,
    createPostgresTestDatabaseName,
    postgresIntegrationEnabled,
    postgresIntegrationSkipReason,
    resolvePostgresTestConfig
} = require('./postgres-test-lifecycle.js');

const LOCAL_ADMIN_URL = 'postgresql://tester:secret@127.0.0.1:5432/postgres';

function deferred() {
    let resolve;
    let reject;
    const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

function allocatorFixture(options = {}) {
    const queries = [];
    let ended = 0;
    const migrations = [];
    let nameIndex = 0;
    const names = options.names ?? [
        'ims_test_template_head_1_aaaaaaaaaaaa',
        'ims_test_database_1_bbbbbbbbbbbb',
        'ims_test_database_1_cccccccccccc'
    ];
    const pool = {
        async query(sql) {
            queries.push(sql);
            if (options.queryFailure?.(sql)) throw new Error('injected query failure');
            return { rows: [] };
        },
        async end() {
            ended += 1;
            if (options.endFailure?.(ended)) throw new Error('injected admin close failure');
        }
    };
    const allocator = createPostgresTestAllocator({
        environment: { IMS_TEST_POSTGRES_ADMIN_URL: LOCAL_ADMIN_URL },
        createAdminPool: () => pool,
        createDatabaseName: () => names[nameIndex++],
        async migratePostgres(migrationOptions) {
            migrations.push(migrationOptions);
            if (options.migratePostgres) {
                return options.migratePostgres(migrationOptions);
            }
            if (options.migrationFailure) throw new Error('injected migration failure');
        }
    });
    return {
        allocator,
        queries,
        migrations,
        ended: () => ended
    };
}

test('PostgreSQL test configuration is enabled by default and supports strict opt-out', () => {
    assert.deepEqual(resolvePostgresTestConfig({}), {
        enabled: true,
        adminUrl: DEFAULT_ADMIN_URL,
        source: 'default'
    });
    assert.equal(postgresIntegrationEnabled({ IMS_TEST_POSTGRES_ENABLED: 'true' }), true);
    assert.equal(postgresIntegrationEnabled({ IMS_TEST_POSTGRES_ENABLED: 'false' }), false);
    assert.equal(
        postgresIntegrationSkipReason({ IMS_TEST_POSTGRES_ENABLED: 'false' }),
        'PostgreSQL tests disabled by IMS_TEST_POSTGRES_ENABLED=false'
    );
    assert.equal(postgresIntegrationSkipReason({}), false);
    for (const value of ['', 'TRUE', 'False', '1', 'yes', ' true', 'false ']) {
        assert.throws(
            () => resolvePostgresTestConfig({ IMS_TEST_POSTGRES_ENABLED: value }),
            /must be exactly "true" or "false"/
        );
    }
});

test('PostgreSQL test URL precedence prefers the dedicated admin URL over the CI URL', () => {
    const config = resolvePostgresTestConfig({
        IMS_TEST_POSTGRES_ADMIN_URL: 'postgres://admin:secret@localhost:5433/admin',
        IMS_TEST_DATABASE_URL: 'postgresql://ci:secret@127.0.0.1:5432/ci'
    });
    assert.equal(config.source, 'IMS_TEST_POSTGRES_ADMIN_URL');
    assert.equal(config.adminUrl, 'postgres://admin:secret@localhost:5433/admin');

    const ciConfig = resolvePostgresTestConfig({
        IMS_TEST_DATABASE_URL: 'postgresql://ci:secret@[::1]:5432/ci'
    });
    assert.equal(ciConfig.source, 'IMS_TEST_DATABASE_URL');
    assert.equal(ciConfig.adminUrl, 'postgresql://ci:secret@[::1]:5432/ci');
});

test('PostgreSQL test configuration rejects invalid protocols and non-loopback hosts', () => {
    assert.throws(
        () => resolvePostgresTestConfig({
            IMS_TEST_POSTGRES_ADMIN_URL: 'mysql://tester:secret@127.0.0.1/database'
        }),
        /must use the postgres or postgresql protocol/
    );
    assert.throws(
        () => resolvePostgresTestConfig({
            IMS_TEST_DATABASE_URL: 'postgresql://tester:secret@db.example.test/database'
        }),
        /must target the local loopback interface/
    );
    assert.throws(
        () => resolvePostgresTestConfig({ IMS_TEST_DATABASE_URL: 'not a URL' }),
        /must be a valid PostgreSQL URL/
    );
});

test('PostgreSQL test database names are normalized, bounded, and validated', () => {
    const name = createPostgresTestDatabaseName(
        'Node Security / A Label Far Longer Than PostgreSQL Needs',
        { pid: 1234, entropy: 'abcdef012345' }
    );
    assert.equal(name, 'ims_test_node_security_a_label_fa_1234_abcdef012345');
    assert.equal(Buffer.byteLength(name), name.length);
    assert.ok(name.length <= 63);
    assert.equal(assertSafePostgresTestDatabaseName(name), name);
    for (const unsafe of [
        'production',
        'ims_test_bad-name',
        'ims_test_bad"name',
        `ims_test_${'a'.repeat(64)}`
    ]) {
        assert.throws(
            () => assertSafePostgresTestDatabaseName(unsafe),
            /Invalid PostgreSQL test database name/
        );
    }
});

test('HEAD allocations clone one migrated template and track sibling connections', async () => {
    const fixture = allocatorFixture();
    const first = await fixture.allocator.allocate({ label: 'first' });
    const second = await fixture.allocator.allocate({ label: 'second' });
    const closed = [];
    await first.openConnection(async (options) => ({
        options,
        async close() { closed.push('primary'); }
    }));
    first.registerConnection({
        async end() { closed.push('sibling'); }
    });

    await first.close();
    await second.close();
    await fixture.allocator.close();

    assert.deepEqual(closed, ['sibling', 'primary']);
    assert.equal(fixture.migrations.length, 1);
    assert.match(fixture.queries[0], /CREATE DATABASE .*database.* TEMPLATE template0/);
    assert.match(fixture.queries[1], /CREATE DATABASE .*template_head.* TEMPLATE .*database/);
    assert.match(fixture.queries[2], /CREATE DATABASE .* TEMPLATE .*database/);
    assert.equal(fixture.queries.filter((sql) => /WITH \(FORCE\)/.test(sql)).length, 3);
    assert.equal(fixture.ended(), 1);
});

test('custom migration catalogs use an isolated template0 database', async () => {
    const fixture = allocatorFixture({
        names: ['ims_test_custom_catalog_1_aaaaaaaaaaaa']
    });
    const database = await fixture.allocator.allocate({
        label: 'custom',
        migrationsPath: '/tmp/custom-migrations'
    });
    await database.close();
    await fixture.allocator.close();

    assert.equal(fixture.migrations.length, 1);
    assert.equal(fixture.migrations[0].migrationsPath, '/tmp/custom-migrations');
    assert.match(fixture.queries[0], /TEMPLATE template0/);
    assert.doesNotMatch(fixture.queries[0], /template_head/);
});

test('migration failure force-drops the created database and closes the admin pool', async () => {
    const fixture = allocatorFixture({
        migrationFailure: true,
        names: [
            'ims_test_migration_failure_1_aaaaaaaaaaaa',
            'ims_test_template_head_1_bbbbbbbbbbbb'
        ]
    });
    await assert.rejects(
        fixture.allocator.allocate({ label: 'migration-failure' }),
        /injected migration failure/
    );
    await fixture.allocator.close();

    assert.ok(fixture.queries.some((sql) => /DROP DATABASE IF EXISTS/.test(sql)));
    assert.ok(fixture.queries.some((sql) => /WITH \(FORCE\)/.test(sql)));
    assert.equal(fixture.ended(), 1);
});

test('ambiguous failure after create force-drops the possibly created database', async () => {
    const fixture = allocatorFixture({
        names: [
            'ims_test_create_failure_1_aaaaaaaaaaaa',
            'ims_test_template_head_1_bbbbbbbbbbbb'
        ],
        queryFailure: (sql) => sql.startsWith('CREATE DATABASE')
    });
    await assert.rejects(
        fixture.allocator.allocate({ label: 'create-failure' }),
        /injected query failure/
    );
    await fixture.allocator.close();

    assert.equal(fixture.queries.filter((sql) => sql.startsWith('CREATE DATABASE')).length, 1);
    assert.equal(fixture.queries.filter((sql) => sql.startsWith('DROP DATABASE')).length, 1);
    assert.equal(fixture.ended(), 1);
});

test('failed force-drop remains registered and is retried during allocator shutdown', async () => {
    let dropAttempts = 0;
    const fixture = allocatorFixture({
        names: ['ims_test_drop_retry_1_aaaaaaaaaaaa'],
        queryFailure: (sql) => {
            if (!sql.startsWith('DROP DATABASE')) return false;
            dropAttempts += 1;
            return dropAttempts === 1;
        }
    });
    const database = await fixture.allocator.allocate({
        label: 'drop-retry',
        migrationsPath: '/tmp/custom-migrations'
    });
    await assert.rejects(database.close(), /injected query failure/);
    await fixture.allocator.close();

    assert.equal(dropAttempts, 2);
    assert.equal(fixture.ended(), 1);
});

test('connection creation and retryable close failures still force-drop the database', async () => {
    const fixture = allocatorFixture({
        names: [
            'ims_test_template_head_1_aaaaaaaaaaaa',
            'ims_test_close_failure_1_bbbbbbbbbbbb'
        ]
    });
    const database = await fixture.allocator.allocate({ label: 'close-failure' });
    await assert.rejects(
        database.openConnection(async () => {
            throw new Error('injected connection creation failure');
        }),
        /injected connection creation failure/
    );
    let closeAttempts = 0;
    database.registerConnection({
        async close() {
            closeAttempts += 1;
            if (closeAttempts === 1) throw new Error('injected connection close failure');
        }
    });
    await assert.rejects(database.close(), /injected connection close failure/);
    assert.ok(fixture.queries.some((sql) =>
        sql.includes(database.databaseName) && /WITH \(FORCE\)/.test(sql)
    ));
    await fixture.allocator.close();
    assert.equal(closeAttempts, 2);
    assert.equal(fixture.ended(), 1);
});

test('closing waits for allocation migration before dropping every owned database', async () => {
    const migration = deferred();
    const fixture = allocatorFixture({
        names: ['ims_test_custom_race_1_aaaaaaaaaaaa'],
        migratePostgres: () => migration.promise
    });
    const allocation = fixture.allocator.allocate({
        label: 'custom-race',
        migrationsPath: '/tmp/custom-migrations'
    });
    while (fixture.migrations.length === 0) await new Promise(setImmediate);
    const closing = fixture.allocator.close();
    migration.resolve();
    const database = await allocation;
    await closing;

    assert.ok(fixture.queries.some((sql) =>
        sql.includes(database.databaseName) && /WITH \(FORCE\)/.test(sql)
    ));
    await assert.rejects(
        fixture.allocator.allocate({ label: 'after-close' }),
        /allocator is closed/
    );
    assert.equal(fixture.ended(), 1);
});

test('connection resolving during close is disposed and never registered', async () => {
    const fixture = allocatorFixture({
        names: ['ims_test_open_race_1_aaaaaaaaaaaa']
    });
    const database = await fixture.allocator.allocate({
        label: 'open-race',
        migrationsPath: '/tmp/custom-migrations'
    });
    const opened = deferred();
    let connectionCloseCount = 0;
    const opening = database.openConnection(async (options) => {
        assert.equal(options.connectionString, database.databaseUrl);
        await opened.promise;
        return {
            async close() { connectionCloseCount += 1; }
        };
    }, { connectionString: 'postgresql://unsafe.example/production' });
    const closing = database.close();
    opened.resolve();

    await assert.rejects(opening, /database is closed/);
    await closing;
    await fixture.allocator.close();
    assert.equal(connectionCloseCount, 1);
});

test('allocator aggregates persistent connection and admin close failures', async () => {
    const fixture = allocatorFixture({
        names: ['ims_test_aggregate_1_aaaaaaaaaaaa'],
        endFailure: () => true
    });
    const database = await fixture.allocator.allocate({
        label: 'aggregate',
        migrationsPath: '/tmp/custom-migrations'
    });
    database.registerConnection({
        async close() { throw new Error('persistent connection close failure'); }
    });

    await assert.rejects(
        fixture.allocator.close(),
        (error) => {
            assert.ok(error instanceof AggregateError);
            const messages = error.errors.map((item) => item.message);
            assert.ok(messages.some((message) => /connection close failure/.test(message)));
            assert.ok(messages.some((message) => /admin close failure/.test(message)));
            return true;
        }
    );
    assert.ok(fixture.queries.some((sql) =>
        sql.includes(database.databaseName) && /WITH \(FORCE\)/.test(sql)
    ));
    assert.equal(fixture.ended(), 1);
});
