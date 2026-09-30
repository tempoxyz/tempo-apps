# OG fonts

Fonts are served through the Worker's ASSETS binding so image rendering does not depend on a third-party CDN at runtime.

Current cards use the bundled Regen typography assets:

- `Pilat-Regular.woff2`: Pilat Regular, weight 400, from the Tempo Regen reference.
- `Pilat-Demi.woff2`: Pilat Demi, used for weights 500 and 600.
- `JetBrainsMono-Light.woff2`: JetBrains Mono Light, weight 300, for hashes and code.

The following assets remain from the previous design and are not loaded by current card templates:

- `GeistMono-Regular.woff2`: `geist@1.4.2`, `dist/fonts/geist-mono/GeistMono-Regular.woff2` (see `Geist-LICENSE.txt`).
- `inter-latin-500-normal.woff2`: `@fontsource/inter@5.2.8`, `files/inter-latin-500-normal.woff2` (see `Inter-LICENSE.txt`).
- `Pilat-Book.otf`: existing Tempo brand font.
