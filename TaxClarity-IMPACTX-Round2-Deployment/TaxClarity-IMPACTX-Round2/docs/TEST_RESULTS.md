# Test-results record

**Packaging-session status: NOT RUN.** Dependency installation did not complete in the packaging environment, so no automated test or production-build pass is claimed.

Run from the directory containing `package.json` in an environment with npm registry access:

```bash
npm install
npm run typecheck
npm test
npm run build
```

Record the date, Node version, command, exit code, passed/failed test counts, and any failure summary here after execution. The browser `/test-centre` is a separate deterministic demo check and should not be described as the Node test suite.
