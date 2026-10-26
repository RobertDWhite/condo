# Runtime dependency security checks

Run from the repository root:

```sh
node bin/security/graphql-regression.cjs
node bin/security/shell-quote-regression.cjs
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

## Quoting, request parsing and runtime layers

The shell-quote regression exercises GHSA-pqg4-j6r4-53mv without executing a shell. It checks all four line terminators after a comment token and verifies ordinary argument round trips in every installed copy. It fails on1.9.0 and passes on1.11.0. Docker runs it after production dependency focus.

body-parser is pinned to1.20.9 for [GHSA-27r3-jxmh-p828](https://github.com/expressjs/body-parser/security/advisories/GHSA-27r3-jxmh-p828). This exact version is preapproved through Yarn's age gate because it is the maintainer's newly published security fix; the general seven-day gate remains enabled. Effect3.20.0 fixes [GHSA-38f7-945m-qr2g](https://github.com/Effect-TS/effect/security/advisories/GHSA-38f7-945m-qr2g).

Test key/token fixtures are removed in the builder before its filesystem is copied to the final runtime stage. Removing them after COPY would leave bytes in an earlier distributable layer. Final-image secret scanning remains required; do not suppress matching values or treat a clean merged filesystem as sufficient layer evidence.

TypeScript is a runtime dependency of the Condo web app: Next.js loads `next.config.ts` at server startup. The final image checks its resolution; do not remove it as a build-only dependency. A restored-image startup test exposed Next attempting an on-demand install when it was missing. Runtime tests must remain isolated from external package registries so undeclared dependencies fail visibly.

## Default Node trust store

Node24.22.1 includes the [October21 security release](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases), including eMudhra trust mitigation. The final image runs `node bin/security/trust-roots.cjs`, requiring the default-store API, a nonempty trust store, no disabled TLS verification and absence of the affected emSign ECC Root CA - G3 certificate fingerprint. This does not inspect application-created TLS contexts, Java/Go stores or every intermediate denylist. Live TLS and application-specific checks remain separate gates.
