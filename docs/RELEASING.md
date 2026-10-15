# Release and deployment

## Verification

Use Node 24 and the exact pnpm version declared in the root manifest.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec playwright install chromium firefox webkit
pnpm test:e2e
pnpm test:package
pnpm audit --prod --audit-level high
```

`check` runs Oxfmt, Oxlint, TypeScript, unit/Node SSR tests and production builds. The package consumer script installs the generated tarball into isolated React 18, React 19 and Next.js projects. It verifies ESM/CJS declarations and runtime, Node SSR, production builds and Chromium hydration/interactions. Generated fixtures are retained in operating-system temporary directories outside the repository, preventing accidental fallback to workspace dependencies.

`verify.yml` is the reusable gate for both normal CI and tagged releases. Browser jobs cover Chromium, Firefox, WebKit and an iPhone-sized WebKit context. This context tests touch-layout behavior; it does not replace testing a physical iOS device or a real operating-system IME.

## npm bootstrap

The package must first exist in the `@futelab` npm organization and the publishing account must have permission to create it. Do not commit registry tokens.

For the first publication, sign in locally using `npm login`, complete the checks above, then run:

```sh
cd packages/folio
npm publish --access public --tag latest
```

Choose `latest` for a stable version, or `alpha`, `beta`, `rc` for the corresponding prerelease. The tag must agree with the version in the manifest. The first publish may require interactive npm 2FA.

In the package settings on npm, configure a trusted publisher:

- Organization/user: `futelab`
- Repository: `folio`
- Workflow filename: `release.yml`
- Environment: leave empty; the release workflow does not declare an npm environment.
- Allow direct `npm publish` for this workflow.

With npm 11.15 or newer, the same configuration can be created from an authenticated terminal:

```sh
npm trust github @futelab/folio --file release.yml --repository futelab/folio --allow-publish --yes
npm trust list @futelab/folio
```

The account must have 2FA enabled; complete any npm browser challenge locally. To exercise the first stable publication entirely through CI, bootstrap a tested prerelease with its prerelease dist-tag, configure this trust relationship, then restore the stable version, build and verify it before pushing its release tag.

This is an external npm account setting; adding a workflow file alone does not grant publishing access. GitHub-hosted release jobs use Node 24/npm with OIDC (`id-token: write`), without a persistent npm token. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

## Subsequent releases

Create a Changeset for public changes, then apply the version and changelog update:

```sh
pnpm changeset
pnpm run version
```

Review and commit the generated version/changelog changes to `main`. Create a matching release tag and push it:

```sh
git tag vVERSION
git push origin main
git push origin vVERSION
```

Replace `VERSION` with `packages/folio/package.json`'s exact version. `release.yml` reruns every verification gate, checks that the tag matches the package and belongs to `main`, builds the package, publishes through npm OIDC and creates a GitHub release. Prerelease identifiers select `alpha`, `beta`, `rc` or `next`; stable versions select `latest`.

A failed pre-publish check cannot reach the publishing job. Publication packs the artifact and compares its integrity against any existing version. An identical artifact is safe to rerun; a different artifact with the same version fails and requires a version bump. GitHub releases are created idempotently, with prerelease flags matching npm's channel. Published npm versions are immutable.

## GitHub Pages

The repository uses Actions as its Pages source. In Settings → Pages, select **GitHub Actions**. Public demo URL:

<https://futelab.github.io/folio/>

`ci.yml` deploys only from `main`, after every verification job succeeds. It sets `GITHUB_PAGES=true` and builds Vite with `/folio/` as its base, uploads only `apps/demo/dist`, then deploys through the `github-pages` environment. Pull requests and version tags never deploy the demo. Builds exclude source maps.

The `github-pages` environment needs to permit the `main` branch. A private repository also needs a GitHub plan supporting Pages; this repository is intended to be public for its demo. See [GitHub Pages custom workflows](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages).

## Compatibility and updates

Runtime dependencies in the Tiptap family are upgraded together. Development currently uses TypeScript 6 for its JavaScript compiler API, which the declaration bundler consumes; the newer native TypeScript CLI is not substituted for that API. Happy DOM stays within the major range required by `@tiptap/html`.

The lockfile is committed and CI uses frozen installs. Explicit `allowBuilds` entries permit the necessary native build helpers; recent-version exceptions are package/version-specific. Production dependency advisories fail CI at high severity. Dependabot opens grouped update pull requests, which receive the same verification gates.

Snapshots use format version `1`, independently of npm versions. Preserve failed or future-version documents and their original storage before attempting migrations. Changes to supported nodes, attributes or snapshot semantics require migration tests and release notes.
