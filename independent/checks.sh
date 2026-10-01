#!/bin/bash
set -u
out=/Users/daniel/tempo/tempo-apps-factory-recent/.factory/remove-recent/independent
commands=('pnpm gen:types' 'pnpm check' 'pnpm check:types' 'pnpm --filter explorer test --run' 'pnpm --filter explorer check:env' 'pnpm --filter explorer check:types:test' 'pnpm exec biome check .' 'pnpm lint:tempo' 'pnpm --filter explorer build' 'pnpm precommit')
i=0
for cmd in "${commands[@]}"; do
 i=$((i+1))
 bash -lc "$cmd" > "$out/check-$i.log" 2>&1
 result=$?
 printf '%s\t%s\t%s\n' "$(date -u +%FT%TZ)" "$result" "$cmd" >> "$out/check-results.tsv"
 if [ "$result" -ne 0 ]; then exit "$result"; fi
done
git diff --exit-code >> "$out/check-results.tsv"
git diff --check 9609e28 HEAD >> "$out/check-results.tsv"
