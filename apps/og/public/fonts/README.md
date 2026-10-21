# OG fonts

Fonts are served through the Worker's ASSETS binding so image rendering does not depend on a third-party CDN at runtime.

The cards use the Tempo Design System (`@tempoxyz/ds` 0.2.2) faces, copied unchanged from its `dist/fonts`:

- `Inter-Variable.woff2`: Inter 4.1 variable font, for all text (see `Inter-LICENSE.txt`, SIL OFL 1.1).
- `GeistMono-Variable.woff2`: Geist Mono variable font (`geist` 1.8.1), for addresses and hashes (see `Geist-LICENSE.txt`, SIL OFL 1.1).

Takumi maps each requested weight onto the `wght` axis, so one file per family covers the TDS weights 450, 500, 550 and 600.
