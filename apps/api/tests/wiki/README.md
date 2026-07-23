# Shared Hono Wiki contracts

These tests exercise the adapter-neutral Wiki surface through
`createHonoApp().request()` and injected `RuntimeServices`. They never bind a
socket, access the real filesystem/database, or call the Bilibili network.

Run the standalone gate with:

```sh
pnpm exec tsc -p tests/wiki/tsconfig.json --noEmit
TSX_TSCONFIG_PATH=tsconfig.server.json node --import tsx --test tests/wiki/*.test.ts
```

## Acceptance coverage

- `dom.contract.test.ts`: `WIKI-01` root/Wiki split, public health/read routes,
  nine rendered TSX templates, parse5 DOM inventory, hostile `storyData`,
  static/image paths, GET/HEAD object responses, and random backgrounds.
- `security-crud.contract.test.ts`: Cookie-only HS256 JWT, editor/op roles,
  Wiki Header-to-claim CSRF, all six write guards, upload limits and validation,
  add/edit/delete/category CRUD, and database/object compensation order.
- `bilibili.contract.test.ts`: `WIKI-02` fake fetch success/upstream failure,
  invalid input, AbortSignal, and the five-second timeout using a fake clock.

## Legacy Flask test mapping

| `tests/test_flask_security.py` | Shared Hono replacement |
| --- | --- |
| `test_write_endpoints_reject_missing_token`, `test_read_health_endpoint_stays_public`, `test_write_endpoints_reject_missing_or_wrong_csrf`, `test_write_endpoints_reject_unapproved_role`, `test_editor_and_op_can_write_to_isolated_storage` | Cookie JWT/CSRF suite plus health and successful add contracts |
| `test_invalid_image_is_rejected_before_database_write`, `test_spoofed_image_header_is_rejected_before_database_write` | Table-driven upload validation contract |
| `test_file_removal_rejects_path_traversal`, `test_directory_removal_does_not_follow_internal_symlink` | Encoded path guard and object-key contracts; symlink behavior is intentionally replaced by the `ObjectStorage` boundary |
| `test_partial_new_file_is_cleaned_when_add_fails`, `test_add_commit_failure_removes_new_file_and_database_row` | Partial put and insert-commit compensation contract |
| `test_edit_commit_failure_preserves_old_file_and_database_row`, `test_delete_commit_failure_preserves_old_file_and_database_row`, `test_delete_category_commit_failure_preserves_old_file_and_database_row` | Edit/delete/category commit-failure contracts |
| `test_successful_edit_then_delete_replaces_and_removes_image`, `test_successful_category_move_then_delete_cleans_copied_image` | Successful replacement/delete and copy/commit/delete category contracts |
| `test_default_upload_limit_remains_fifty_mib`, `test_environment_paths_and_upload_limit_are_honored`, production secret/environment tests, unique image name test | Covered by shared server configuration/security tests and deterministic route-level limit/unique-key behavior; they are not Flask runtime contracts |

The old symlink-specific tests cannot be migrated literally because both Node
and Worker Wiki routes now depend on `ObjectStorage`, not a directly traversable
host filesystem. The replacement verifies that hostile request paths are denied
before storage and that cleanup only receives canonical logical keys.
