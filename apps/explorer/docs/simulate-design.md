# Simulate — design pass

**Status: implemented.** All eight priorities below shipped on
`dad/transaction-simulator`. The scalability table is the remaining forward-looking
section — none of it is built, and none of it is needed until traces get deeper than
Tempo currently produces.

Reviewed against the running implementation on `dad/transaction-simulator`
(screenshots: empty, success, revert). The build is functionally close to spec. This pass is about
what the screen communicates, in what order, and how it holds up as traces get bigger.

---

## Start from the use cases

Ranked by how often they'll actually happen:

| # | Use case | Entry point | What the user wants in the first second |
| --- | --- | --- | --- |
| 1 | **"Why did this fail?"** | tx page → Re-simulate, or paste a hash | The reason, in words, with real numbers |
| 2 | **"Will this work?"** | compose a call | Pass/fail, the return value, the effects |
| 3 | **"What if I change X?"** | edit + re-run | Fast re-run, and what changed vs last run |
| 4 | **"Look at this"** | share a link | A URL that reproduces the screen |

The current layout is built for #2 — a large permanent form occupies the left third of the screen,
and "Load transaction" is a small field buried inside it. That inverts the actual frequency. #1 is
the dominant case and it's the one the design serves worst. #4 has no affordance at all.

**The organizing principle should be: the call is an input, not the subject. The result is the
subject.** Once you've run something, the form has done its job and should get out of the way.

---

## What's working

Keep these, they're right:

- Verdict card above the fold, tone-colored, with gas on the same line.
- Dim-don't-clear on edit. The instinct is correct even though the trigger is broken (below).
- Per-panel skeletons and independent error states.
- Reusing `TxTraceTree` / `TxStateDiff` / flamegraph verbatim — a simulated trace looks identical
  to a mined one, which is exactly the consistency we wanted.
- The honesty note about block context and estimated gas exists at all. Most tools skip this.

---

## Three bugs to fix before any styling

**1. Every result loads pre-dimmed as stale.** Both the success and revert screenshots show
"Inputs changed. Results below are from the previous run." on a *fresh* page load, with the entire
result column at 45% opacity. Cause: `simulate.tsx:187-203` autofills `form.gas` from
`block.gasLimit` (500,000,000) after mount, while `runInput.gas` retains `DEFAULT_GAS`
(50,000,000). The `dirty` comparison at `:209-213` then fires immediately. The first thing a
shared link shows is a greyed-out screen telling you it's out of date.

Fix the ordering — resolve the gas default *before* constructing `runInput`, or exclude an
un-edited gas field from the dirty comparison.

**2. The gas limit shown never ran.** Same root cause: the field displays 500,000,000 while the
simulation executed with 50,000,000. A debugging tool that misreports its own inputs is worse than
one that omits them.

**3. The tabs don't switch.** `Sections` in `tabs` mode is fully controlled: `activeSection`
defaults to `0` and a click only calls `onSectionChange?.(index)` (`Sections.tsx:124-127`).
`simulate.tsx:880` renders `<Sections mode={…} sections={sections} />` with neither prop, so the
index is pinned at 0 and every click is a no-op — State and Events are unreachable. The tx page
gets this right by wiring both to a search param (`tx/$hash.tsx:283`).

Worth noting this bug disappears entirely under recommendation E — stacked sections have no active
index. Fixing it by removing the tabs is better than fixing it by wiring them up.

---

## The redesign

### A. Collapse the form into a call bar

The single biggest change. Replace the persistent 360px rail with a one-line summary of the call
that expands on click.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  0xdEaD…dEaD  →  pathUSD.transfer(0x…0002, max uint256)      @ latest    │
│                                                    [ Run ⌘↵ ]  [ Share ] │
└──────────────────────────────────────────────────────────────────────────┘
```

Click anywhere on it to expand the full form inline; collapse on run. Empty state opens expanded.

This buys four things at once: the result column goes full-width (the trace currently wraps at
~1000px and the revert message breaks across four lines because of it), the vertical dead space
disappears, the call becomes *readable as a sentence* rather than a stack of labeled inputs, and
Phase 2 overrides get somewhere obvious to live — one more segment in the bar
(`@ latest · 2 overrides`) rather than a fifth field competing for rail space.

Inside the expanded form, fix the ordering: `From → To → Function/Calldata → Value → Gas`, with
**Load transaction as a separate, visually distinct entry above** — it's a different mode, not
another field.

### B. Make the calldata / function relationship legible

The worst interaction on the page. Right now there are three controls —
`Function (optional)` (a select whose first option is the phrase "Paste calldata"), a set of
generated argument fields, and a `Calldata` textarea — all visible at once, all editable, silently
rewriting each other. Nothing communicates that they are the same value in two representations.

Specific failures:

- Choosing "Paste calldata" from the *Function* dropdown is a mode switch disguised as a value. You
  pick a mode from a list of functions.
- Editing an argument rewrites the hex, and editing the hex rewrites the arguments, with no visual
  linkage between the two blocks — they're separated by the argument fields.
- The decode is silent on failure (`simulate.tsx:447` swallows the error), so pasting hex that
  doesn't match the ABI leaves stale arguments displayed above it. The form then shows one call and
  runs another.
- The generated fields are labeled `to · address`, `amount · uint256`. The middle dot reads as
  punctuation in a sentence rather than a type annotation.

Make it **one control, two representations, one explicit toggle**, with the hex directly attached:

```
Calldata                                    ( Decoded │ Hex )
──────────────────────────────────────────────────────────────
  transfer(address,uint256)              ▾

  to        0x0000…0002
  amount    115792089237…639935              max uint256

  0xa9059cbb… · 68 bytes                              ⧉ copy
```

The hex line stays visible in Decoded mode as a single truncated row with a byte count — enough to
confirm it's there and copy it, without four wrapped lines of `ffff`. Switching to Hex swaps that
row for the full textarea and collapses the fields.

Rules that make it feel solid:

- The function selector is inside the control, not a sibling field above it.
- Decode failure is visible: "Doesn't match the selected function — showing hex" and the argument
  fields disappear rather than lying.
- When the ABI is unknown, the control opens in Hex with no toggle. No empty dropdown.
- The label is always "Calldata". Never "Function (optional)" — the function is not optional, the
  *form* is.

### C. Rebuild the error as a structured block

This is where the most value is, and where the current build loses the most. Today the decoded
error is inlined into the trace line as a paren-blob that wraps across four red lines, while the
verdict above it shows only "insufficient pathUSD balance" — the *numbers, which are the entire
point*, appear only in the unreadable version.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ✗  Reverted                                            284,734 gas est. │
│                                                                          │
│     pathUSD.transfer() reverted with                                     │
│                                                                          │
│     InsufficientBalance                                                  │
│       available    0.217479 pathUSD                                      │
│       required     115792089237…639935   max uint256                     │
│                                                                          │
│     mainnet · after block 33,555,746                                     │
└──────────────────────────────────────────────────────────────────────────┘
```

Named arguments on their own lines. Token-aware formatting: when the reverting contract is a
TIP-20 and the argument is a `uint256`, format with its decimals and symbol, raw value on hover.
Recognize `2^256-1` and render `max uint256` — an unbroken 78-digit number is visual noise that
actively hides the other argument next to it.

Then **shorten the trace line to just the error name** (`[InsufficientBalance]`), since the full
decode now lives in the verdict. The trace should stay scannable.

### D. Give success a real answer

The success screenshot's verdict reads:

> Succeeded
> Call call 0x20C0…0000.

Two problems. "Call call 0x20C0…0000." is a broken sentence out of `buildTxSummary`'s known-event
fallback and should never render. And the call was `name()` — **the return value `"pathUSD"` is the
entire answer**, and it appears nowhere in the verdict, only as a bare arrow in the trace.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  ✓  Succeeded                                           273,270 gas est. │
│                                                                          │
│     pathUSD.name()  returned  "pathUSD"                                  │
│                                                                          │
│     no events · no balance changes · mainnet · after block 33,555,746    │
└──────────────────────────────────────────────────────────────────────────┘
```

For a read call the return value is the result. For a state-changing call, lead with the
interpreted event line (`Transferred 100.00 pathUSD from … to …`) and summarize effects as counts.
Never render a summary sentence that starts "Call call".

### E. Stack the evidence; drop the tabs

Trace / State / Events & balances are currently tabs, so two-thirds of the evidence is hidden at
the moment of failure. On a revert you want the trace *and* the state diff *and* the events — that
combination is the diagnosis.

Stack them full-width as sections with counts in the headers
(`Trace · 4 frames`, `State · 2 accounts`, `Events · 1`), collapsed by default when empty. This is
what `Sections` stacked mode already does on the tx page, so it also makes the two pages
consistent. It scales better too: Phase 3's source view becomes another section rather than a
fifth tab.

### F. Be intentional about red

Red is currently the most-used color on a *successful* simulation, which is why the page reads
wrong even when nothing is broken.

The explorer has semantic tokens for exactly this — `--color-negative` (#dc2626),
`--color-positive`, `--color-accent` (#3b82f6), `--color-warning` (#e2a336), all
`light-dark()`-aware (`styles.css:32-109`). The flamegraph is the one component on the page that
ignores them: `TxTraceFlamegraph.tsx:11-23` hardcodes a six-stop RGB ramp
(`rgb(180,38,28)` → `rgb(197,142,23)`) plus its own `ERROR_COLOR`, with no light/dark handling.
That's the source of the "colors don't look right" feeling — it's the only off-system palette on
the screen.

And the specific reason a successful one-frame call renders bright red: `getFlameColor(depth)`
indexes that ramp **by depth**, and index 0 is the hottest red. Shallow traces — which is nearly
everything on Tempo, where a TIP-20 call is one frame — are therefore rendered entirely in the
"hottest" color. On the tx page you rarely notice because real traces go deep enough to show the
ramp. Here you only ever see the red end.

Fix the semantics, not just the swatch:

- **Depth should not be temperature.** Either color by *share of gas* (which is what a flamegraph's
  heat is supposed to mean) or drop the ramp entirely and use a single neutral fill with the
  accent for the hovered frame.
- **Reserve red for failure**, in both the tree and the flamegraph. A successful trace should
  contain no red at all. A failing trace should have exactly one red thing: the failing frame.
- **Pull from the tokens** so the flamegraph inherits light/dark like everything else.

The intended palette across the whole page:

| Color | Means | Used for |
| --- | --- | --- |
| `negative` | this failed | verdict icon + border on revert, failing frame, failure-path rule |
| `positive` | this succeeded | verdict icon on success, incoming balance deltas |
| `accent` | interactive / selected | links, Run, hovered frame, active section |
| `warning` | fidelity caveat | block-context and estimated-gas notes, if they need emphasis at all |
| neutral | everything else | trace body, gas numbers, flamegraph fill |

Under that table, a successful simulation is a green check and a lot of grey. That's the goal —
red should be rare enough that it means something when it appears.

### G. One failure, one box

The three panels share one endpoint and one node, so anything wrong with the *request* — bad
params, rate limit, timeout, node unreachable — fails all three identically. Rendering an error
per panel turned a single fact into four boxes saying the same sentence, with the section
chrome ("Trace", "State changes", "Events") implying there was something to see in each.

Divergent failures are real but rare: a tracer that isn't enabled, `prestateTracer` timing out on
a trace `callTracer` survives, or `eth_simulateV1` disagreeing with `debug_traceCall` about
validation. So per-panel errors are the tail case, not the default.

The rule: **all three failed → one box, sections suppressed. Some failed → the surviving sections
render normally and only the failed ones show an inline error.** Distinct messages are deduped, so
the two `debug_traceCall` panels collapse into one line.

Title by what the user can do, keyed off status: 429 rate limited, 504 timed out, 400 rejected
before reaching the node, otherwise the node rejected it. The raw message stays, in mono, below.

Two bugs this surfaced:

- **Rate-limit responses crashed the client.** `checkRateLimit` returns `new Response('Rate limit
  exceeded')` — plain text — and `postSimulation` called `response.json()` unconditionally, so a
  429 became `SyntaxError: Unexpected token 'R'`. The 429 branch was unreachable.
- **`error.data` was discarded.** Nodes put the actionable part there; forwarding only
  `error.message` produced a bare "Invalid params" with no method and no reason. Errors now read
  `debug_traceCall: block not found: hash 0x1111…`.

### H. Suppress panels that have nothing to say

- **Flamegraph with one frame** is a single 100%-width bar. Hide the flamegraph below ~3 frames.
- **"Hover a call to see details"** reserves ~150px of empty box. Render the detail panel only on
  hover, or inline it into the hovered bar.
- **"Jump to frame 0"** when there's exactly one frame points at the only thing on screen. Suppress
  it for single-frame traces, and label by name rather than index elsewhere —
  "Jump to `pathUSD.transfer()`" beats "Jump to frame 3".

### H. Add Share

URL-as-state is the whole architecture and there is no button for it. Put `Share` in the call bar,
copying the current URL. When calldata exceeds the URL budget, that button becomes the existing
copy-as-JSON fallback — same place, same affordance, so the user never has to discover two
different mechanisms.

### I. Fill the empty state

The centered card in a large bordered box wastes the screen. Since the form is expanded at this
point anyway, use the right column for a short worked example — a two-line "what this does" plus
the two example buttons, or the last few simulations from this session. Something that teaches the
tool.

---

## Does it scale?

The current layout is tuned for the 1–2 frame case, which is what a TIP-20 call produces. It will
not survive a real contract interaction. Design against these now:

| Pressure | What breaks today | Fix |
| --- | --- | --- |
| 40+ frame trace | Full-width wall of mono; failure-path rule helps but there's no overview | Sticky verdict on scroll; collapse-all/expand-failure-path control in the trace header; frame count in section header |
| Deep nesting (8+) | 24px-per-depth indent pushes content off-screen | Cap indent, switch to a depth badge past ~6 |
| Error with 6+ args | Verdict card grows unbounded | Show first 3 named args, "show all" for the rest |
| 30+ state changes | State section becomes the whole page | Default-collapse, group by account, count in header |
| Long token names / unverified contracts | Address strings blow out the call bar | Middle-truncate with `Midcut`, which already exists |

None of these need building now, but the call bar + stacked sections structure absorbs them,
whereas the two-column + tabs structure fights them.

---

## Priority

1. Fix the three bugs — stale-on-load dimming, gas mismatch, dead tabs. *(they undermine trust)*
2. Red discipline: retire the hardcoded flame ramp, no red on a successful run. *(A)*
3. Structured error block with token-aware formatting; shorten the trace line. *(the core value)*
4. Return value / interpreted-event line in the success verdict; kill "Call call".
5. Rebuild the calldata control as one toggle with visible decode failure.
6. Stack sections instead of tabs — this also retires bug 3 rather than patching it.
7. Collapse the form into a call bar; go full-width single column.
8. Suppress empty panels, fix "frame 0". Share button. Empty state.

1–5 are small and change how the tool *feels* far more than 6–8 do. If time is short, ship those
and leave the layout alone.
