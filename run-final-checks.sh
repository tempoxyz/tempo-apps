#!/usr/bin/env bash
set -u
root=/Users/daniel/tempo/tempo-apps-factory
cd "$root" || exit 1
commands=('pnpm gen:types' 'pnpm check' 'pnpm check:types' 'pnpm --filter explorer test --run' 'pnpm --filter explorer check:env' 'pnpm --filter explorer check:types:test' 'pnpm exec biome check .' 'pnpm lint:tempo' 'pnpm --filter explorer build' 'pnpm precommit')
index=0
for command in "${commands[@]}"; do
 index=$((index+1))
 log=".factory/time-format/candidate2-final-check-${index}.log"
 printf '%s\n' "$command"
 bash -c "$command" > "$log" 2>&1
 result=$?
 printf '%s\t%s\t%s\n' "$command" "$result" "$log" >> .factory/time-format/candidate2-final-check-results.tsv
 printf 'exit=%s log=%s\n' "$result" "$log"
done
