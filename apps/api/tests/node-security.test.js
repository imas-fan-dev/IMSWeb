import { afterAll, beforeAll } from 'vitest';
import { postgresTest } from './postgres-test-database.ts';
import { createNodeSecurityFixture } from './node-security/fixture.js';
import {
    registerCompiledListenerStaticAdapterTests
} from './node-security/compiled-listener-static-adapter.owner.js';
import { registerAuthTests } from './node-security/auth.owner.js';
import { registerFudabaTests } from './node-security/fudaba.owner.js';
import {
    registerChronicleEventTests
} from './node-security/chronicle-event.owner.js';
import { registerNewsTests } from './node-security/news.owner.js';
import { registerInformationTests } from './node-security/information.owner.js';
import {
    registerCompiledEntryEnvironmentTests
} from './node-security/compiled-entry-environment.owner.js';

const fixture = createNodeSecurityFixture({
    test: postgresTest,
    beforeAll,
    afterAll
});

registerCompiledListenerStaticAdapterTests(fixture);
registerAuthTests(fixture);
registerFudabaTests(fixture);
registerChronicleEventTests(fixture);
registerNewsTests(fixture);
registerInformationTests(fixture);
registerCompiledEntryEnvironmentTests(fixture);
