# Factory setup

This is the repository-side recipe for onboarding `tempoxyz/tempo-apps` to
[Faktorio](https://github.com/tempoxyz/faktorio). The first profile supports
changes to **existing Explorer source and test files**. It does not grant
access to other apps, dependencies, CI configuration, or deployment.

## Prepare a clean image

Use a disposable Linux image-build environment with Bash, Git, Python 3,
CA certificates, Node, and the pnpm version in the root `package.json`.
Check out a full commit at `/home/user/workspace`, with origin
`https://github.com/tempoxyz/tempo-apps.git`, then run:

```sh
bash .factory/setup.sh
pnpm check:types
pnpm exec biome check apps/explorer
pnpm --filter explorer check:env
pnpm lint:tempo
git status --porcelain --untracked-files=normal
```

All checks must pass and Git status must be empty before saving a Boat named
image. Setup uses the locked dependencies and pnpm's pinned Node runtime,
skips install hooks, explicitly generates Worker types, and rebuilds the
trusted lint binary. It does not install Git hooks, start a service, deploy,
or call a model. Never put tokens, private environment files, or alert inputs
in the image. A tools-only image is not sufficient: Factory verifies the
cached repository's origin, full commit, and clean worktree before execution.

The setup script is an **image-build recipe**, not an automatically discovered
Factory lifecycle hook. Image creation, snapshot IDs, credentials, and runtime
policy belong to the Faktorio host. No Boat image builder ships in this repo.

## Configure the host

Copy `catalog.example.yaml` to a host-private location. Replace its image name,
snapshot artifact UUID, and full Git commit with the verified build's values.
The checked-in template deliberately fails catalog validation until these
values are replaced. Do not commit account-specific image IDs or credentials.

The host may change the model or approve a different file scope. The Explorer
profile starts with Plan, selects at most eight existing files under
`apps/explorer/src` and `apps/explorer/test`, runs read-only lint/type/test
commands with bounded repairs, and requires independent Review. New files
need explicit host-selected exports; the root-scoped planner currently selects
existing files only. Other apps need their own checks and approved scope.

Add a launch to the host's observer configuration, using absolute paths:

```json
{
  "name": "tempo-apps",
  "catalog": "/host/private/tempo-apps-catalog.yaml",
  "profile": "explorer",
  "files": "/host/checkouts/tempo-apps",
  "workflow": "/host/checkouts/tempo-apps/.factory/workflow.yaml"
}
```

Keep the host checkout at the image's commit. The workflow's exact `{{task}}`
slot is filled from the user's request, for example: "add exportable transaction
csv button to the tempo-apps explorer". Requests cannot change checks or grants.
The launch is not ready until the host has validated its image and can satisfy
the runtime's sandbox/network requirements. Boat's private-ingress limitation
is not waived by this recipe; do not enable trial networking in repository YAML.

## Review and shipping

`autofix_ci` runs the catalog's local commands; it is not GitHub Actions.
This initial recipe does not claim browser proof, a retained preview, automatic
PR publication, GitHub CI monitoring, or merging. Configure those host features
separately rather than treating a local green check as permission to ship.

Before publishing, follow `AGENTS.md`, including root checks, affected tests,
and `pnpm precommit`. For UI changes, include before/after screenshots in the
PR. Keep the existing GitHub PR audit requirements for `cyclops` and
`agentic-audit`; an agent's Review report does not replace either audit.
