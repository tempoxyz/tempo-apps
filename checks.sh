#!/bin/bash
set -u
commands=('pnpm gen:types' 'pnpm check' 'pnpm check:types' 'pnpm --filter explorer test --run' 'pnpm --filter explorer check:env' 'pnpm --filter explorer check:types:test' 'pnpm exec biome check .' 'pnpm lint:tempo' 'pnpm --filter explorer build' 'pnpm precommit')
i=0
for cmd in "${commands[@]}"; do
 i=$((i+1))
 bash -lc "$cmd" > ".factory/remove-recent/check-$i.log" 2>&1
 result=$?
 printf '%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$result" "$cmd" >> .factory/remove-recent/check-results.tsv
 if [ "$result" -ne 0 ]; then exit "$result"; fi
done
