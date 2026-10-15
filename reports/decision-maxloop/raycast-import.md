# decision-maxloop: raycast-import

**Project:** /Users/daniel/.ds/vicinae/extensions/raycast-import
**Decision:** raycast-import (PR #389) is genuinely ready for the maintainer: every reviewer finding closed against the CURRENT head with evidence, the canonical repo identical to the PR branch, and a durable verification harness that bites.
**Created:** 2026-10-15T15:04:56Z
**Status:** open
**Converged:** no
**Passes:** 7

## Pass 1 — 2026-10-15T15:04:56Z

- **NEW:** v0.2 had no snippet-store safety: any .json accepted, replace mode could zero the store
- **CLOSED:** —
- **ARTIFACT:** initial snippets import + atomic write with .bak-<ts>
- **Confidence:** —

## Pass 2 — 2026-10-15T15:04:56Z

- **NEW:** Raycast extensions were not importable at all (v0.3 gap)
- **CLOSED:** —
- **ARTIFACT:** store.raycast.<name> bundle install + live-rescan, e2e against 233 real extensions
- **Confidence:** —

## Pass 3 — 2026-10-15T15:04:56Z

- **NEW:** picker dead-end (Install only in the empty-search action panel) + FilePicker controlled-value breakage
- **CLOSED:** —
- **ARTIFACT:** primary action on every List.Item; onChange-only FilePicker; picker returns picks to the form
- **Confidence:** —

## Pass 4 — 2026-10-15T15:04:56Z

- **NEW:** reviewer round: 18 findings (SECURITY-001/003, CORRECTNESS-001 x5, UX-002 x4) + a human icon request
- **CLOSED:** 17 of 18 verified fixed in the head; icon replaced in d43924f
- **ARTIFACT:** structural schema guard, hasSnippetContainer, secure-tmp, zip containment, isLoading
- **Confidence:** —

## Pass 5 — 2026-10-15T15:04:56Z

- **NEW:** G1: the CANONICAL repo (danielfstefan/vicinae-raycast-import main) diverged from its own PR branch — still carries the 59247-byte boilerplate icon and lacks the 9-line package.json change, so the tree the store would mirror is NOT the reviewed one
- **CLOSED:** G2 (whitespace trim) verified NOT a gap: data.text stores rawText; trim() feeds only the emptiness check
- **ARTIFACT:** full 18-finding classification against the current head (not the anchored SHAs)
- **Confidence:** 0.72 → 0.84

## Pass 6 — 2026-10-15T15:23:55Z

- **NEW:** G5: the extraction changes SHIPPED source, so the canonical repo now differs from the reviewed PR tree in src/ — held INTENTIONALLY while a human review is in flight (do not move a reviewed target for a non-functional change). Sync at the next version push: copy src/lib/raycast-schema.ts + src/import-data.tsx into extensions/raycast-import on the fork branch, mark the PR draft first (skill rule 9), then ready.
- **CLOSED:** G1: canonical repo byte-identical to the reviewed tree (manifest + icon sha256 verified); only dev artifacts (reports/) differ
- **ARTIFACT:** src/lib/raycast-schema.ts + probes/{schema-guard,hostile-zip,secure-tmp}.ts (36 checks green); build + lint green; v0.4.1 tagged and pushed
- **Confidence:** 0.84 → 0.90

## Pass 7 — 2026-10-15T15:31:17Z

- **NEW:** G6 (found by attacking my OWN pass-7 artifact): the real-export probe asserted on the login keychain and on ~/Documents, so it would FAIL on any machine without them — a harness that cries wolf is a harness nobody runs
- **CLOSED:** G6: the probe now skips cleanly (exit 0) and both paths are proven — real data present (all pass) and RAYCONFIG_DIR pointed at nothing (SKIP)
- **ARTIFACT:** probes/real-export.ts (4-probe harness, 4/4 exit 0) committed and pushed
- **Confidence:** 0.90 → 0.95

## Next pass scope (recorded so pass 8 RESUMES, never restarts)

Open dimensions, in value order:
1. **The install-idempotence probe** (the skill's probe #4): install 2 real extensions
   into a sandbox dir and re-run to prove the skip-existing guard. Needs the Raycast
   store API + `installExtensionsCore`; not yet written.
2. **Cross-platform pacing**: the manifest claims `platforms: [macOS, Windows]` and
   `dataDir()` genuinely handles win32/darwin/XDG, but `clipboard-import.ts` has ZERO
   platform branches — the ~600ms pacing is tuned to the macOS 500ms pasteboard poll.
   Decide: is the claim accurate for Windows, or should the pacing be platform-derived?
3. **G5 sync**: the schema-guard extraction changes shipped source, so the canonical
   repo differs from the reviewed PR tree in `src/`. Held deliberately while a human
   review is in flight; sync it with the next version push (draft → push → verify →
   ready, skill rule 9) — copy `src/lib/raycast-schema.ts` + `src/import-data.tsx`.
