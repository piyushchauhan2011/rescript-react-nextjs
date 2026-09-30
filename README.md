# Elsewhere — ReScript registry pattern

Full local hotel demo: Next.js request rendering, a SQLite catalog, a ReScript decision engine, exhaustive card registries, and a development-only decision inspector.

## Run

Requires Node >=22.12 and pnpm 12.4.2. Native SQLite and image transforms use `better-sqlite3` and `sharp`.

```sh
pnpm install
pnpm exec playwright install chromium
export DB_FILE_NAME=/absolute/path/to/catalog.db
pnpm db:setup
pnpm dev
```

Open http://127.0.0.1:3000. Export environment variables in the shell; optional Next environment files belong in `apps/web/.env.local`. Without `DB_FILE_NAME`, every adapter and database script uses repository-root `local.db`. Relative configured paths also resolve against repository root. Reads never create or seed a database. Setup errors point to `pnpm db:setup`; reseeding upserts known IDs without deleting unrelated rows.

`pnpm dev` performs an initial ReScript compile, then runs one root compiler watcher alongside Next. Stop an editor-started ReScript watcher before using it; competing compiler owners are rejected. Compiler output is generated alongside sources as `.res.mjs` and `.gen.tsx`, never edited by hand.

## Workspaces and boundaries

- `packages/core`: typed decisions, registry/predicate/assignment validation, FNV-1a allocation, resolution, search normalization, and catalog record types. No React, Next, or database dependency.
- `packages/ui`: ReScript React shell, pages, selector context, image/compact card registry, Next hook bindings, and separately imported inspector.
- `apps/web`: thin Next routes/client boundary, cookie identity, rollout validation, readonly SQL adapters, and bounded local image transforms.

A page resolves one complete serializable snapshot before rendering. React Flight adapters convert safe null-prototype engine dictionaries to plain own-key objects. Snapshot props contain only values, provenance, assignments, and ignored preview diagnostics; identity, signatures, rollout secrets, and registries stay server-side.

ReScript 12.3.1 genType emits unresolved aggregate references for custom namespaces. `CoreNamespace.shim.ts` is a type-only namespace binding that reexports compiler-generated types, not a parallel domain model. Both packages remain namespaced `RegistryCore`/`RegistryUi`; their public consumers import explicit generated module subpaths.

The decision registry owns allocation and validated writes. The UI registry owns exhaustive rendering for `image`/`compact`; rendering never checks experiment IDs. Planning visibility and detail remain independent.

## Preview

Development allowlists `destination`, `country`, `offers`, `guide`, and registered `exp.*` fields. Native GET search and links retain recognized previews. Unknown keys/array values are dropped; malformed recognized values remain visible in inspector diagnostics.

```text
/?exp.arrival-flow=treatment&exp.destination-density=treatment&country=IN&offers=on&guide=on&exp.planning-guide-detail=treatment
/destinations?destination=kyoto&exp.arrival-flow=control
```

Inspector navigation recalculates server snapshots. Same-path navigation retains open/filter state; home/index changes reset it. Auto removes the corresponding preview field. Filters affect experiment controls, not resolved values.

## Production

```sh
export DECISION_COOKIE_SECRET=0123456789abcdef0123456789abcdef
export DECISION_PLANNING_GUIDE=on
pnpm build
pnpm --filter @repo/web start --hostname 127.0.0.1 --port 3200
```

Use a real private random secret for deployment, not the demonstration secret above. Production requires at least 32 UTF-8 bytes and validates configuration eagerly at startup. Production cookies are signed UUIDs, HttpOnly, Secure, SameSite lax, path `/`, with a one-year lifetime. Secret rotation invalidates old cookies. Proxy forwards a newly issued cookie into the initial render; pages verify it again.

Trusted flags `DECISION_SEASONAL_OFFERS` and `DECISION_PLANNING_GUIDE` accept absent/empty/`on` only (`off` is invalid). `DECISION_DISABLED_EXPERIMENTS` is a comma-separated list of registered IDs; unknown IDs reject startup. Production ignores public preview fields, removes them from navigation/forms, and has no inspector UI.

Production personalized documents require `private` with `no-cache` or stricter `no-store`; no shared page/snapshot cache is used. Proxy sets `private, no-cache`. Next 16.3.7 deliberately replaces this with `no-cache, must-revalidate` in its loopback-only development server, so document privacy verification targets production. Static images and `/image/(480|800|1280)/<local-name>.webp` remain publicly cacheable. Transforms use local storage only, WebP q72, seven-day caching, and return 404 for unsupported widths, traversal, and missing files.

## Code quality

```sh
pnpm quality          # Formatting, Oxlint, ReScript analysis, and TypeScript checks
pnpm format           # Format authored JS/TS/config/docs and ReScript sources
pnpm format:check     # Nonmutating formatter checks
pnpm lint             # Oxlint plus strict ReScript compilation and dead-code analysis
pnpm lint:fix         # Apply available Oxlint fixes
pnpm res:format       # Native ReScript formatter
pnpm res:format:check
pnpm res:lint
```

`.oxlintrc.json` enables correctness, suspicious-code, and performance checks, with TypeScript, React/hooks, accessibility, import, Unicorn, Next.js, and test rules. JS/TS functions are limited to **90 nonblank, noncomment lines**, including tests; complexity is limited to 12, nesting depth to 3, parameters to 4, and nested callbacks to 3. Strict equality, braces, type-only imports, cycle detection, and no explicit `any` are enforced. Scripts may log results; application code permits only warning/error logs. Sequential browser/audit readiness loops are exempt from `no-await-in-loop`.

Oxfmt handles authored JS/TS, JSON, YAML, and Markdown; ReScript uses its native formatter. Generated compiler/genType outputs, build artifacts, lockfiles, and generated migration metadata are excluded. CSS is intentionally unchanged.

ReScript package configs treat selected compiler warnings as errors, including deprecated APIs, incomplete matches, unused bindings/imports, redundant patterns, and missing/unused arguments. `scripts/rescript-lint.mjs` runs configured native dead-code analysis, includes unused externals, and exits nonzero on diagnostics (the analyzer itself otherwise exits zero). Narrow `@live` field annotations identify real string-keyed codec, generated TypeScript, and Next prop consumers outside the static ReScript call graph; source trees are not broadly suppressed.

Husky installs via `pnpm prepare` (also the dependency-install lifecycle). The pre-commit hook runs lint-staged sequentially: staged JS/TS is formatted then linted; staged config/docs are formatted; staged ReScript is formatted then the complete dependency graph is compiled/analyzed. lint-staged stages formatter fixes automatically and restores the original staged state on failure. The pre-push hook runs `pnpm quality`. Run builds/watchers from the workspace root, with only one ReScript compiler owner.

## Verification

```sh
pnpm res:build
pnpm typecheck
pnpm test
pnpm test:e2e
pnpm build
pnpm build
pnpm test:production
pnpm perf:audit
```

TypeScript tests consume generated ReScript APIs. Unit suites cover registry ownership/intervals, disabled/ineligible holdouts, competing previews, rejected assignments/patches, full predicate validation, UTF-16 hashing, guide gating/detail, request trust, identity, and isolated SQLite catalogs. Playwright starts a fresh Next development server on 127.0.0.1:3100 with its own migrated/seeded temporary database and no server reuse; it covers SSR without JavaScript, navigation, inspector behavior, identity independence, images, and mobile layout, attaching visual evidence.

`pnpm test:production` requires that production build, the exported seeded `DB_FILE_NAME`, and an unused port 3200. It supplies temporary child-only secrets, verifies real document privacy, ignored previews/trusted guide rendering, cookie signatures/replacement/rotation, startup rejection, and emergency-disable defaults, then stops its child servers. A thrown Next instrumentation error alone can leave a listening process with hanging requests; startup explicitly exits on invalid trusted configuration.

The performance audit requires an existing production build and seeded database. It starts/stops its own loopback Next server, pins defaults using trusted experiment disables and absent flags, and runs real Lighthouse audits of home/index. It prints score/FCP/LCP/TBT/CLS and saves timestamped HTML/JSON reports under `test-results/lighthouse/`; there is no flaky score threshold.

Production builds enable Next's experimental `inlineCss` option: the existing `globals.css` import is emitted as inline styles rather than a render-blocking stylesheet request. Development keeps Next's normal stylesheet/HMR behavior. This removes the first-load CSS round trip but increases document size, duplicates styles in the React Server Component payload, and forfeits independent stylesheet caching. Keep the option under review when upgrading Next; compare Lighthouse reports rather than assuming a score improvement.

`pnpm db:generate` generates Drizzle migrations; `pnpm db:migrate` applies the checked-in migration; `pnpm db:seed` upserts the reference catalog. The source reference repository is unchanged.
