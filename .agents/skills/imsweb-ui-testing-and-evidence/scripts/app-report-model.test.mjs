import assert from "node:assert/strict";
import test from "node:test";
import { createAppInventory } from "./create-app-inventory.mjs";
import { buildAppCoverage, validateApp, sameSource } from "./app-report-model.mjs";

const source = { commit: "current", dirty: false };
const scope = { deviceClass: "standard-phone", orientation: "portrait" };
function sample() {
  const app = { inventory: { version: 1, source, deviceScope: scope, pages: [{ id: "home", title: "首页", route: "/", group: "home", scenarios: [{ id: "initial", title: "首屏" }, { id: "back", title: "返回" }] }, { id: "other", title: "其他", route: "/other", group: "home", scenarios: [{ id: "initial", title: "首屏" }] }] }, runs: [{ id: "ios", renderer: "ios-native", platform: "ios", device: "Phone simulator", os: "iOS", source, bindingCopy: "bindings/ios.log", ...scope }] };
  const cases = [{ id: "initial", title: "首屏", pageId: "home", scenarioId: "initial", runId: "ios", renderer: "ios-native", verdict: "PASS", exitCode: 0, command: "native owner", receiptCopy: "receipts/initial.log" }];
  const images = [{ id: "screen", pageId: "home", scenarioId: "initial", runId: "ios", caseId: "initial", renderer: "ios-native", kind: "runtime", review: "PASS" }];
  return { app, cases, images };
}
test("normalizes App routes, canonical aliases and personal sections into normal-phone plans", () => {
  const routes = [
    { index: true, targets: ["app"], appNavigation: { tab: "home" } },
    { path: "wiki", targets: ["app"], appNavigation: { tab: "resources" } },
    { path: "wiki/modern", targets: ["app"], appNavigation: { tab: "resources", canonical: "/wiki" } },
    { path: "account/me/:section", targets: ["app"], appNavigation: { tab: "account", sections: ["profile", "favorites"], private: true } },
    { path: "admin", targets: ["web"] },
    { path: "*", targets: ["app"], appNavigation: { tab: "home" } },
  ];
  const inventory = createAppInventory(routes, source);
  assert.equal(inventory.pages.length, 5);
  assert.deepEqual(inventory.pages.find(page => page.route === "/wiki").aliases, ["/wiki/modern"]);
  assert(inventory.pages.some(page => page.route === "/account/me/profile"));
  assert.deepEqual(inventory.deviceScope.browserProjects, ["app-iphone", "app-android"]);
  assert.equal(inventory.deviceScope.orientation, "portrait");
  validateApp({ inventory, runs: [] }, [], []);
});
test("a missing page/scenario remains UNRUN and the platforms never share native PASS", () => {
  const { app, cases, images } = sample();
  const coverage = buildAppCoverage(app, cases, images);
  assert.equal(coverage.ios.pages[0].verdict, "PARTIAL");
  assert.equal(coverage.ios.pages[0].scenarios[0].verdict, "PASS");
  assert.equal(coverage.ios.pages[1].verdict, "UNRUN");
  assert.equal(coverage.android.verdict, "UNRUN");
});
test("only complete current native evidence produces a page PASS", () => {
  const { app, cases, images } = sample();
  cases.push({ ...cases[0], id: "back", scenarioId: "back" });
  images.push({ ...images[0], id: "back", caseId: "back", scenarioId: "back" });
  assert.equal(buildAppCoverage(app, cases, images).ios.pages[0].verdict, "PASS");
  for (const change of [
    value => { value.app.runs[0].source = { commit: "historic", dirty: false }; },
    value => { delete value.app.runs[0].bindingCopy; },
    value => { value.images[0].kind = "reference"; },
    value => { value.images[0].review = "NOT_REVIEWED"; },
    value => { value.cases[0].exitCode = null; },
    value => { delete value.cases[0].receiptCopy; },
    value => { value.app.runs[0].renderer = "app-dom"; value.cases[0].renderer = "app-dom"; value.images[0].renderer = "app-dom"; },
    value => { delete value.app.runs[0].deviceClass; },
  ]) {
    const value = sample(); change(value);
    assert.equal(buildAppCoverage(value.app, value.cases, value.images).ios.pages[0].scenarios[0].verdict, "UNRUN");
  }
});
test("failures and screenshot REWORK survive passing retries; dirty source needs a fingerprint", () => {
  const value = sample();
  value.cases.push({ ...value.cases[0], id: "failed", verdict: "REWORK" });
  assert.equal(buildAppCoverage(value.app, value.cases, value.images).ios.pages[0].verdict, "REWORK");
  value.cases.pop(); value.images[0].review = "REWORK";
  assert.equal(buildAppCoverage(value.app, value.cases, value.images).ios.pages[0].verdict, "REWORK");
  assert.equal(sameSource({ commit: "x", dirty: true }, { commit: "x", dirty: true }), false);
  assert.equal(sameSource({ commit: "x", dirty: true, fingerprint: "same" }, { commit: "x", dirty: true, fingerprint: "same" }), true);
});
test("rejects dangling and cross-page/scenario/platform/run associations", () => {
  for (const [change, pattern] of [
    [value => { value.cases[0].pageId = "missing"; }, /association/],
    [value => { value.cases[0].scenarioId = "missing"; }, /association/],
    [value => { value.cases[0].renderer = "android-native"; }, /renderer/],
    [value => { value.images[0].pageId = "other"; }, /mismatch/],
    [value => { value.images[0].scenarioId = "back"; }, /mismatch/],
    [value => { value.app.runs[0].platform = "android"; }, /platform/],
    [value => { value.app.inventory.pages[1].route = "/"; }, /duplicate/],
  ]) {
    const value = sample(); change(value);
    assert.throws(() => validateApp(value.app, value.cases, value.images), pattern);
  }
});
