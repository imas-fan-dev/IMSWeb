'use strict';

const { createNodeSecurityFixture } = require('./node-security/fixture.js');
const {
    registerCompiledListenerStaticAdapterTests
} = require('./node-security/compiled-listener-static-adapter.owner.js');
const { registerAuthTests } = require('./node-security/auth.owner.js');
const { registerFudabaTests } = require('./node-security/fudaba.owner.js');
const {
    registerChronicleEventTests
} = require('./node-security/chronicle-event.owner.js');
const { registerNewsTests } = require('./node-security/news.owner.js');
const { registerInformationTests } = require('./node-security/information.owner.js');
const {
    registerCompiledEntryEnvironmentTests
} = require('./node-security/compiled-entry-environment.owner.js');

const fixture = createNodeSecurityFixture();

registerCompiledListenerStaticAdapterTests(fixture);
registerAuthTests(fixture);
registerFudabaTests(fixture);
registerChronicleEventTests(fixture);
registerNewsTests(fixture);
registerInformationTests(fixture);
registerCompiledEntryEnvironmentTests(fixture);
