# Dependency policy

Nimbus treats package-lock.json as the reproducible dependency graph. Development and CI installs use npm ci on Node.js 24 or newer.

The release audit command is:

```bash
npm run audit
```

It runs npm audit --audit-level=high. High and critical advisories fail the CI gate and must be remediated before release. Low and moderate advisories remain visible in audit output and are reviewed during dependency updates; lowering the CI threshold is not an acceptable way to make a failing audit pass.

Dependency upgrades must preserve the lockfile, run the full verification set in docs/testing.md, and include the advisory or compatibility reason in the pull request.
