This independent browser harness imports the supplied worktree's real timestamp store, hook, header, and timestamp component. It is not an explorer route.

Prerequisites: candidate dependencies installed from frozen lockfile, pnpm (repo pins Node), Python 3, system Google Chrome, Playwright package. No production-source edits or generated tracked files are needed.

Run from any directory:

```sh
/path/to/verify/harness-candidate1/run.sh /absolute/candidate/worktree /absolute/evidence/output
```

The runner creates a disposable /tmp harness, links the candidate explorer node_modules, runs a real SSR/StrictMode React integration suite, production-bundles the same candidate components, then tests native Chrome BFCache. Exit 1 on candidate 6816fa2a is expected due to the Back restoration assertion; all preceding React cases pass. Logs and exact candidate/worktree/harness paths are written to the supplied output directory. Temporary servers are stopped on exit.

Optional environment parameters: `PLAYWRIGHT_DIR` (default `/tmp/factory-browser/node_modules/playwright`), `HARNESS_PORT` (3022), `STATIC_PORT` (3023). Choose unused ports. The source files can also be run individually with CANDIDATE_DIR and HARNESS_DIR set. The runner never installs packages or changes candidate files.
