import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest


PROJECT_ROOT = Path(__file__).resolve().parents[1]
RULE_CHECK = PROJECT_ROOT / "scripts/check-source-rules.mjs"
WIRE_AUDIT = PROJECT_ROOT / "scripts/audit-json-wire-contracts.mjs"
NON_JSON_MANIFEST = PROJECT_ROOT / "scripts/contracts/non-json-boundary-manifest.mjs"
ENTRYPOINT_CHECK = PROJECT_ROOT / "packages/contracts/scripts/check-entrypoints.mjs"
FRONTEND_ROUTE_CHECK = (
    PROJECT_ROOT / "scripts/contracts/compile-frontend-route-metadata.mjs"
)


class SourceRulesTests(unittest.TestCase):
    def make_fixture(self, root: Path) -> None:
        script = root / "scripts/check-source-rules.mjs"
        script.parent.mkdir(parents=True)
        shutil.copyfile(RULE_CHECK, script)
        shutil.copyfile(WIRE_AUDIT, root / "scripts/audit-json-wire-contracts.mjs")
        manifest_module = root / "scripts/contracts/non-json-boundary-manifest.mjs"
        manifest_module.parent.mkdir(parents=True)
        shutil.copyfile(NON_JSON_MANIFEST, manifest_module)
        (manifest_module.parent / "non-json-boundaries.manifest.json").write_text(
            json.dumps({"format": "imsweb-non-json-boundaries/v1", "boundaries": []}),
            encoding="utf-8",
        )

        (root / "apps/api/src/domains/orders").mkdir(parents=True)
        (root / "apps/web/app/pages/orders").mkdir(parents=True)
        contracts = root / "packages/contracts"
        (contracts / "src").mkdir(parents=True)
        (contracts / "package.json").write_text("{}", encoding="utf-8")
        os.symlink(
            PROJECT_ROOT / "packages/contracts/node_modules",
            contracts / "node_modules",
            target_is_directory=True,
        )
        (root / "apps/web/app/lib/api/endpoints").mkdir(parents=True)
        frontend_route_check = (
            root / "scripts/contracts/compile-frontend-route-metadata.mjs"
        )
        shutil.copyfile(FRONTEND_ROUTE_CHECK, frontend_route_check)
        (root / "apps/web/app/route-metadata.ts").write_text(
            "export const routeDescriptors = [\n"
            "  { index: true, file: 'pages/index.tsx', layout: 'public', "
            "targets: ['web', 'app'], delivery: 'prerender', prerender: ['/'] },\n"
            "]\n"
            "export function prerenderRoutesForTarget(target) {\n"
            "  return routeDescriptors.filter((route) => route.targets.includes(target))"
            ".flatMap((route) => route.prerender ?? [])\n"
            "}\n"
            "export function spaFallbackPatternsForTarget() { return [] }\n",
            encoding="utf-8",
        )
        subprocess.run(
            [
                "node",
                "--experimental-strip-types",
                str(frontend_route_check),
                "--write",
            ],
            cwd=root,
            check=True,
            capture_output=True,
            text=True,
        )
        (root / "apps/api/src/domains/orders/routes.ts").write_text(
            "export const route = apiPath('/orders')\n", encoding="utf-8"
        )
        (root / "apps/web/app/pages/orders/page.tsx").write_text(
            'export const page = apiPath("/orders")\n', encoding="utf-8"
        )
        (root / "packages/contracts/src/paths.ts").write_text(
            'export const API_PATH_PREFIX = "/api"\n', encoding="utf-8"
        )
        (root / "packages/contracts/src/orders.ts").write_text(
            "function exactJsonResponse(value: unknown) { return value }\n"
            "function exactJsonError(value: unknown) { return value }\n"
            "function strictRequestObject(value: unknown) { return value }\n"
            "export const orderRequestSchema = strictRequestObject({})\n"
            "export const orderResponseSchema = exactJsonResponse({})\n"
            "export const orderErrorSchema = exactJsonError({})\n"
            "export const responseSchema = exactJsonResponse({})\n"
            "export const errorSchema = exactJsonError({})\n"
            "export type OrderResponse = { id: string }\n",
            encoding="utf-8",
        )

    def run_fixture(self, root: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            ["node", "scripts/check-source-rules.mjs"],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_repository_source_rules_pass(self):
        result = subprocess.run(
            ["node", "scripts/check-source-rules.mjs"],
            cwd=PROJECT_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        self.assertEqual(result.returncode, 0, result.stderr)

    def test_frontend_route_metadata_files_are_required_and_valid(self):
        cases = {
            "missing source": (
                "apps/web/app/route-metadata.ts",
                None,
                "frontend route metadata file is missing",
            ),
            "missing output": (
                "apps/api/src/routing/frontend-route-delivery.ts",
                None,
                "frontend route metadata file is missing",
            ),
            "missing checker": (
                "scripts/contracts/compile-frontend-route-metadata.mjs",
                None,
                "frontend route metadata file is missing",
            ),
            "malformed source": (
                "apps/web/app/route-metadata.ts",
                "export const broken = ;\n",
                "frontend route metadata check failed",
            ),
            "malformed output": (
                "apps/api/src/routing/frontend-route-delivery.ts",
                "export const broken = true;\n",
                "frontend route metadata check failed",
            ),
            "malformed checker": (
                "scripts/contracts/compile-frontend-route-metadata.mjs",
                "export const broken = ;\n",
                "frontend route metadata check failed",
            ),
        }
        for label, (relative_path, replacement, expected) in cases.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory(
                prefix="ims-source-rules-"
            ) as temporary:
                root = Path(temporary)
                self.make_fixture(root)
                target = root / relative_path
                if replacement is None:
                    target.unlink()
                else:
                    target.write_text(replacement, encoding="utf-8")
                result = self.run_fixture(root)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn(expected, result.stderr)

    def test_raw_shared_path_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            page = root / "apps/web/app/pages/orders/page.tsx"
            page.write_text('export const page = "/api/orders"\n', encoding="utf-8")
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("shared path", result.stderr)

    def test_direct_zod_import_is_rejected_outside_contracts(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            page = root / "apps/web/app/pages/orders/page.tsx"
            page.write_text('import { z } from "zod"\n', encoding="utf-8")
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("import z through @imsweb/contracts/z", result.stderr)

    def test_runtime_contract_star_reexport_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            page = root / "apps/web/app/pages/orders/page.tsx"
            page.write_text(
                'export * from "@imsweb/contracts/orders"\n', encoding="utf-8"
            )
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("use named runtime exports", result.stderr)

    def test_dynamic_api_contract_load_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            handler = root / "apps/api/src/domains/orders/routes.ts"
            handler.write_text(
                'const contracts = require("@imsweb/contracts/orders")\n',
                encoding="utf-8",
            )
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("dynamic and require-based contract loading", result.stderr)

    def test_dynamic_import_of_api_contract_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            handler = root / "apps/api/src/domains/orders/routes.ts"
            handler.write_text(
                'const contracts = import("@imsweb/contracts/orders")\n',
                encoding="utf-8",
            )
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("dynamic and require-based contract loading", result.stderr)

    def test_production_skip_contract_check_is_rejected(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            page = root / "apps/web/app/pages/orders/page.tsx"
            page.write_text(
                "export const request = { meta: { skipContractCheck: true } }\n",
                encoding="utf-8",
            )
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("must use parsed", result.stderr)

    def test_wire_audit_rejects_local_api_response_dto(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            handler = root / "apps/api/src/domains/orders/routes.ts"
            handler.write_text(
                "interface LocalOrderResponse { id: string }\n"
                "const body: LocalOrderResponse = { id: 'order-1' }\n"
                "export const route = (c) => c.json(body)\n",
                encoding="utf-8",
            )
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("c.json(...) body is unproven", result.stderr)

    def test_wire_audit_accepts_contract_aliases_spreads_and_view_mapper(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            handler = root / "apps/api/src/domains/orders/routes.ts"
            handler.write_text(
                'import { jsonSchemaValidator as validate } from "@/middleware/request-validation"\n'
                'import { orderRequestSchema } from "@imsweb/contracts/orders"\n'
                'import type { OrderResponse } from "@imsweb/contracts/orders"\n'
                'const routeSchema = orderRequestSchema\n'
                'const routeValidator = validate(routeSchema)\n'
                'function orderView(): OrderResponse { return { id: "order-1" } as OrderResponse }\n'
                'export const route = (c) => { routeValidator; return c.json(orderView()) }\n',
                encoding="utf-8",
            )
            endpoint = root / "apps/web/app/lib/api/endpoints/orders.ts"
            endpoint.write_text(
                'import { parsed } from "../parsed.js"\n'
                'import { orderResponseSchema, orderErrorSchema } from "@imsweb/contracts/orders"\n'
                'const wikiConfig = { errorSchema: orderErrorSchema }\n'
                'export const getOrder = () => apiClient.Get("/orders/1", parsed(orderResponseSchema, { ...wikiConfig }))\n',
                encoding="utf-8",
            )
            result = self.run_fixture(root)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("JSON wire contract audit (compiler-backed)", result.stdout)

    def test_wire_audit_rejects_web_schema_and_config_violations(self):
        fixtures = {
            "local success": 'const localSchema = {}\nexport const getOrder = () => apiClient.Get("/orders", parsed(localSchema, { errorSchema }))\n',
            "local error": 'const localErrorSchema = {}\nexport const getOrder = () => apiClient.Get("/orders", parsed(responseSchema, { errorSchema: localErrorSchema }))\n',
            "missing error": 'export const getOrder = () => apiClient.Get("/orders", parsed(responseSchema))\n',
            "context missing error": 'export const refresh = (method) => method.context.Post("/refresh", undefined, parsed(responseSchema))\n',
            "skip": 'export const getOrder = () => apiClient.Get("/orders", { meta: { skipContractCheck: true } })\n',
            "permissive": 'export const getOrder = () => apiClient.Get("/orders", parsed(responseSchema.strip(), { errorSchema }))\n',
        }
        for label, source in fixtures.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
                root = Path(temporary)
                self.make_fixture(root)
                endpoint = root / "apps/web/app/lib/api/endpoints/orders.ts"
                endpoint.write_text(
                    'import { parsed } from "../parsed.js"\n'
                    'import { responseSchema, errorSchema } from "@imsweb/contracts/orders"\n' + source,
                    encoding="utf-8",
                )
                result = self.run_fixture(root)
                self.assertNotEqual(result.returncode, 0)

    def test_wire_audit_checks_untyped_literal_exactness(self):
        fixtures = {
            "partial optional literal": (
                "export const route = (c) => c.json({ id: 'order-1' })\n",
                False,
            ),
            "exact literal": (
                "export const route = (c) => c.json({ id: 'order-1', note: 'ready' })\n",
                True,
            ),
        }
        for label, (source, accepted) in fixtures.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
                root = Path(temporary)
                self.make_fixture(root)
                (root / "packages/contracts/src/orders.ts").write_text(
                    "export type OrderOptionalResponse = { id: string; note?: string }\n",
                    encoding="utf-8",
                )
                handler = root / "apps/api/src/domains/orders/routes.ts"
                handler.write_text(
                    'import type { OrderOptionalResponse } from "@imsweb/contracts/orders"\n'
                    + source,
                    encoding="utf-8",
                )
                result = self.run_fixture(root)
                self.assertEqual(result.returncode == 0, accepted, result.stderr)

    def test_wire_audit_rejects_permissive_contract_response_definitions(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            (root / "packages/contracts/src/orders.ts").write_text(
                "export const responseSchema = z.object({ value: z.string() }).strip()\n"
                "export const errorSchema = z.object({ error: z.string() }).default({ error: 'bad' })\n"
                "export const businessSchema = z.object({ value: z.coerce.string() }).strict().transform((value) => value)\n",
                encoding="utf-8",
            )
            endpoint = root / "apps/web/app/lib/api/endpoints/orders.ts"
            endpoint.write_text(
                'import { parsed } from "../parsed.js"\n'
                'import { responseSchema, errorSchema, businessSchema } from "@imsweb/contracts/orders"\n'
                'export const getOrder = () => apiClient.Get("/orders", parsed(responseSchema, { errorSchema, businessErrorSchema: businessSchema }))\n',
                encoding="utf-8",
            )
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("contracts definition must be exact and non-transforming", result.stderr)

    def test_wire_audit_rejects_local_validator_and_runtime_schema_execution(self):
        fixtures = {
            "route local zod": 'const localSchema = {}\nexport const route = () => jsonSchemaValidator(localSchema)\n',
            "runtime parse": 'import { orderRequestSchema } from "@imsweb/contracts/orders"\nexport const route = () => orderRequestSchema.parse({})\n',
            "runtime safe parse": 'import { orderRequestSchema } from "@imsweb/contracts/orders"\nexport const route = () => orderRequestSchema.safeParse({})\n',
            "response parse": 'import { orderResponseSchema } from "@imsweb/contracts/orders"\nexport const route = (c) => c.json(orderResponseSchema.parse({}))\n',
            "indirect safe parse": 'import { orderRequestSchema } from "@imsweb/contracts/orders"\nconst parseOrder = orderRequestSchema.safeParse\nexport const route = () => parseOrder({})\n',
        }
        for label, source in fixtures.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
                root = Path(temporary)
                self.make_fixture(root)
                handler = root / "apps/api/src/domains/orders/routes.ts"
                handler.write_text(
                    'import { jsonSchemaValidator } from "@/middleware/request-validation"\n' + source,
                    encoding="utf-8",
                )
                result = self.run_fixture(root)
                self.assertNotEqual(result.returncode, 0)

    def test_wire_audit_accepts_exact_route_concealment_adapters(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            oauth_routes = root / "apps/api/src/domains/identity/platform-account-security/oauth-links/routes.ts"
            oauth_routes.parent.mkdir(parents=True)
            oauth_routes.write_text(
                'import { platformOAuthLinkParamsSchema } from "@imsweb/contracts/platform/account-security"\n'
                'function concealedOAuthLinkParams(value: unknown) {\n'
                '  const parsed = platformOAuthLinkParamsSchema.safeParse(value)\n'
                '  return parsed.success ? parsed.data : { provider: undefined }\n'
                '}\n'
                'export const route = concealedOAuthLinkParams\n',
                encoding="utf-8",
            )
            session_routes = root / "apps/api/src/domains/identity/platform-account-security/sessions/routes.ts"
            session_routes.parent.mkdir(parents=True)
            session_routes.write_text(
                'import { platformSessionParamsSchema } from "@imsweb/contracts/platform/account-security"\n'
                'function concealedSessionParams(value: unknown) {\n'
                '  const parsed = platformSessionParamsSchema.safeParse(value)\n'
                '  return parsed.success ? parsed.data : { id: undefined }\n'
                '}\n'
                'export const route = concealedSessionParams\n',
                encoding="utf-8",
            )
            result = self.run_fixture(root)

        self.assertEqual(result.returncode, 0, result.stderr)

    def test_wire_audit_does_not_exempt_local_json_dto(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            handler = root / "apps/api/src/domains/orders/routes.ts"
            handler.write_text(
                "interface LocalOrderResponse { id: string }\n"
                "function orderView(): LocalOrderResponse { return { id: 'order-1' } }\n"
                "export const route = (c) => c.json(orderView())\n",
                encoding="utf-8",
            )
            manifest = root / "scripts/json-wire-contract-exceptions.json"
            manifest.write_text(json.dumps({"exceptions": [{
                "kind": "api-json-mapper",
                "file": "apps/api/src/domains/orders/routes.ts",
                "symbol": "route",
                "reason": "fixture only",
            }]}), encoding="utf-8")
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("c.json(...) body is unproven", result.stderr)

    def test_wire_audit_rejects_structurally_equivalent_local_response_dto(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            handler = root / "apps/api/src/domains/orders/routes.ts"
            handler.write_text(
                'import type { OrderResponse } from "@imsweb/contracts/orders"\n'
                "type LocalOrderResponse = { id: string }\n"
                "const body: LocalOrderResponse = { id: 'order-1' }\n"
                "export const route = (c) => c.json(body)\n",
                encoding="utf-8",
            )
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("c.json(...) body is unproven", result.stderr)

    def test_wire_audit_rejects_destructured_runtime_schema_parse(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            handler = root / "apps/api/src/domains/orders/routes.ts"
            handler.write_text(
                'import { jsonSchemaValidator } from "@/middleware/request-validation"\n'
                'import { orderRequestSchema } from "@imsweb/contracts/orders"\n'
                "jsonSchemaValidator(orderRequestSchema)\n"
                "const { safeParse } = orderRequestSchema\n"
                "export const route = () => safeParse({})\n",
                encoding="utf-8",
            )
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("may execute only at an approved request-validation boundary", result.stderr)

    def test_wire_audit_excludes_validator_helper_declarations(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            helper = root / "apps/api/src/middleware/request-validation.ts"
            helper.parent.mkdir(parents=True)
            helper.write_text(
                "export function jsonSchemaValidator() {}\n"
                "export function queryValidator() {}\n",
                encoding="utf-8",
            )
            result = self.run_fixture(root)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("JSON wire contract audit (compiler-backed)", result.stdout)
        self.assertIn("violations: 0", result.stdout)

    def test_domain_infra_import_and_forbidden_paths_are_rejected(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            handler = root / "apps/api/src/domains/orders/routes.ts"
            handler.write_text(
                'import { db } from "@/infra/db"\n', encoding="utf-8"
            )
            (root / "apps/api/src/shared").mkdir(parents=True)
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("domain code must use injected ports", result.stderr)
        self.assertIn("apps/api/src/shared", result.stderr)

    def test_web_tests_must_stay_outside_app(self):
        with tempfile.TemporaryDirectory(prefix="ims-source-rules-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            test_file = root / "apps/web/app/pages/orders/page.test.tsx"
            test_file.write_text("export const testValue = true\n", encoding="utf-8")
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("Web tests belong under apps/web/tests", result.stderr)


class ContractEntrypointTests(unittest.TestCase):
    def make_fixture(self, root: Path) -> Path:
        contracts = root / "packages/contracts"
        script = contracts / "scripts/check-entrypoints.mjs"
        script.parent.mkdir(parents=True)
        shutil.copyfile(ENTRYPOINT_CHECK, script)
        (contracts / "src").mkdir()
        (contracts / "src/index.ts").write_text(
            'export * as runtime from "./runtime.js"\n', encoding="utf-8"
        )
        (contracts / "src/runtime.ts").write_text(
            "export const runtime = true\n", encoding="utf-8"
        )
        exports = {
            ".": {
                "types": "./dist/index.d.ts",
                "require": "./dist/index.js",
                "default": "./dist/index.js",
            },
            "./runtime": {
                "types": "./dist/runtime.d.ts",
                "require": "./dist/runtime.js",
                "default": "./dist/runtime.js",
            },
        }
        (contracts / "package.json").write_text(
            json.dumps({"name": "@imsweb/contracts", "exports": exports}),
            encoding="utf-8",
        )
        (contracts / "entrypoints.json").write_text(
            json.dumps(
                {
                    "entrypoints": [
                        {
                            "subpath": ".",
                            "source": "src/index.ts",
                            "namespace": None,
                            "runtime": "schema",
                        },
                        {
                            "subpath": "./runtime",
                            "source": "src/runtime.ts",
                            "namespace": "runtime",
                            "runtime": "zod-free",
                        },
                    ]
                }
            ),
            encoding="utf-8",
        )
        (contracts / "README.md").write_text(
            "@imsweb/contracts\n@imsweb/contracts/runtime\n", encoding="utf-8"
        )
        return contracts

    def run_fixture(self, root: Path) -> subprocess.CompletedProcess[str]:
        return subprocess.run(
            [
                "node",
                "packages/contracts/scripts/check-entrypoints.mjs",
                "--source",
            ],
            cwd=root,
            check=False,
            capture_output=True,
            text=True,
        )

    def test_entrypoint_inventory_passes_when_surface_is_synchronized(self):
        with tempfile.TemporaryDirectory(prefix="ims-entrypoints-") as temporary:
            root = Path(temporary)
            self.make_fixture(root)
            result = self.run_fixture(root)

        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertIn("2 public entrypoints (source only)", result.stdout)

    def test_entrypoint_inventory_rejects_package_export_mismatch(self):
        with tempfile.TemporaryDirectory(prefix="ims-entrypoints-") as temporary:
            root = Path(temporary)
            contracts = self.make_fixture(root)
            package = json.loads((contracts / "package.json").read_text(encoding="utf-8"))
            del package["exports"]["./runtime"]
            (contracts / "package.json").write_text(json.dumps(package), encoding="utf-8")
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("inventory subpath is missing from package.json exports", result.stderr)

    def test_entrypoint_inventory_rejects_root_namespace_mismatch(self):
        with tempfile.TemporaryDirectory(prefix="ims-entrypoints-") as temporary:
            root = Path(temporary)
            contracts = self.make_fixture(root)
            (contracts / "src/index.ts").write_text(
                'export * as wrongName from "./runtime.js"\n', encoding="utf-8"
            )
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("root namespace runtime", result.stderr)

    def test_entrypoint_inventory_rejects_readme_mismatch(self):
        with tempfile.TemporaryDirectory(prefix="ims-entrypoints-") as temporary:
            root = Path(temporary)
            contracts = self.make_fixture(root)
            (contracts / "README.md").write_text("@imsweb/contracts\n", encoding="utf-8")
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("README must list @imsweb/contracts/runtime", result.stderr)

    def test_entrypoint_inventory_rejects_transitive_zod_contamination(self):
        with tempfile.TemporaryDirectory(prefix="ims-entrypoints-") as temporary:
            root = Path(temporary)
            contracts = self.make_fixture(root)
            (contracts / "src/runtime.ts").write_text(
                'import { schema } from "./schema.js"\nexport const runtime = schema\n',
                encoding="utf-8",
            )
            (contracts / "src/schema.ts").write_text(
                'import { z } from "zod"\nexport const schema = z.string()\n',
                encoding="utf-8",
            )
            result = self.run_fixture(root)

        self.assertNotEqual(result.returncode, 0)
        self.assertIn("zod-free source graph reaches zod", result.stderr)


if __name__ == "__main__":
    unittest.main()
