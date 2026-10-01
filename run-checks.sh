#!/bin/bash
set -u
commands=('pnpm gen:types' 'pnpm check' 'pnpm check:types' 'pnpm --filter explorer test --run' 'pnpm --filter explorer check:env' 'pnpm --filter explorer check:types:test' 'pnpm exec biome check .' 'pnpm lint:tempo' 'pnpm --filter explorer build' 'pnpm precommit')
i=0
for command in "${commands[@]}"; do
 i=$((i+1))
 bash -c "$command" > ".factory/url-search/check-$i.log" 2>&1
 status=$?
 printf '%s\t%s\t%s\n' "$i" "$status" "$command" >> .factory/url-search/check-results.tsv
 if [ "$status" != 0 ]; then exit "$status"; fi
done
