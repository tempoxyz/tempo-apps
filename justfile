set dotenv-load := true
set positional-arguments := true

# generate random # between 1024 and 49151
@random-port:
  echo $((RANDOM % 49151 + 1024))

# utilities
[group('Utilities')]
@lowercase value:
  @echo {{ lowercase(value) }}

# kill process on port
[group('utilities')]
@kill-port port:
  lsof -ti :{{ port }} | xargs kill -9 2>/dev/null || true

# run workspace in dev mode
@dev workspace:
  just kill-port 42069
  cd apps/{{ lowercase(workspace) }} && pnpm node --run dev -- --port $(just random-port)