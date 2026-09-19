# Name-set comparison

- before: `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/b-report-before-wiki.json` (7 files / 60 cases)
- after:  `/Users/texas/Workspace/IMSWeb/.trellis/tasks/09-19-api-test-taxonomy/evidence/b-report-after-wiki.json` (7 files / 60 cases)

## Counts

- files unchanged: true
- cases unchanged: true
- full-name byte-exact: 60 / 60
- full-name changed only by an added describe path: 0 / 60
- case-title lossless (post title is a literal tail of the pre name): true


## Per file

| file | cases | byte-exact | path added |
| --- | --- | --- | --- |
| tests/wiki/admin-data.contract.test.ts | 11 | 11 | 0 |
| tests/wiki/bilibili.contract.test.ts | 3 | 3 | 0 |
| tests/wiki/dom.contract.test.ts | 3 | 3 | 0 |
| tests/wiki/node-cleanup-compensation.contract.test.ts | 1 | 1 | 0 |
| tests/wiki/public-data.contract.test.ts | 6 | 6 | 0 |
| tests/wiki/security-crud.contract.test.ts | 33 | 33 | 0 |
| tests/wiki/wire-contract-conformance.test.ts | 3 | 3 | 0 |

## Cases whose name did not literally begin with the new describe path

For each, the describe path that was added in front of the verbatim case title.

## Lossless failures

none
