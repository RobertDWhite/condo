# Runtime dependency security checks

Run from the repository root:

```sh
node bin/security/graphql-regression.cjs
NODE_ENV=production node bin/security/ui-pragma-regression.cjs
```

The Docker build runs the UI regression before compilation and the GraphQL regression after production workspace focus. Image scans and restored application/database tests are separate required gates.

## GraphQL security backports

Yarn patches preserve the existing `@graphql-tools/utils` 8.9.0, 9.2.1 and 11.2.0 APIs. They backport the upstream guards for:

- [GHSA-7mx3-vvmw-hjmv / CVE-2026-104852](https://github.com/ardatan/graphql-tools/security/advisories/GHSA-7mx3-vvmw-hjmv), upstream commit `0b9529f1988fd36186a7c106a6efe0356f1b7f2e`: reject prototype-related merge keys and only recurse into own properties.
- [GHSA-c4qx-w738-7hr3 / CVE-2026-114604](https://github.com/ardatan/graphql-tools/security/advisories/GHSA-c4qx-w738-7hr3), upstream commit `20d36a5c6eb8fd5524420988e01a48618c450d70`: validate the entire incremental path before writing, reject non-primitive path segments and unsafe items batches, and avoid inherited write targets. Only the installed 11.2.0 copy has the affected incremental helper.

Both CommonJS and ESM distributions are patched. Resolutions select each original dependency range separately; do not redirect all ranges to a single major version. The regression discovers installed copies, checks harmless prototype probes and valid merge/incremental operations, and fails if no copies are found. It reproduced unsafe-key acceptance before the patches.

Version-based scanners will still report these original package versions. Retain the full findings and link the patch, regression output and tested image digest in the vulnerability disposition. Do not relabel package versions or globally suppress the advisories. Reassess/remove the backports when the consumers can migrate to supported upstream fixed versions.

## Compiled editor pragma compatibility

Newer Tiptap distributions leave source-file `@jsxImportSource` directives in already compiled JavaScript. If bundled into the UI library, those comments are reinterpreted for the whole file by the legacy Keystone admin Babel configuration. The UI loader removes only parsed JSX pragma comments from compiled Tiptap distribution files. Strings, other comments and executable code remain intact; TypeScript/JSX source files are not processed by this rule.

The regression reproduces the Babel failure, verifies the pragma removal and ensures a matching string literal is preserved. The rebuilt full UI bundle must also pass the admin compilation path; removing the vulnerable editor update is not the compatibility fix.
