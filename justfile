build:
    sh -c "mkdir -p .build && bun build index.ts > .build/index.js"

run:
    bun .build/index.js

dev:
    just build && just run