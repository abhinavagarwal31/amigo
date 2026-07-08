# Amigo

*Amigo* means friend — the role this tool plays for a volunteer who doesn't share a
language with the fan in front of them, and can't be expected to know every rule, every
gate, or every stadium by heart.

## Vertical

Volunteers — FIFA World Cup 2026 relies on tens of thousands of local volunteers as the
human interface between organizers and fans across 16 stadiums in 3 countries. Volunteers
cannot be trained on every rule, every venue layout, or every language a fan might speak.
Wrong or slow answers erode trust and create safety risk when genuine emergencies get
treated like routine questions. Amigo uses Generative AI to give any volunteer instant,
grounded, multilingual answers to fan questions, and to recognize the moment a query needs
a human specialist instead of an AI-generated answer.

## Approach and Logic

The system is built around one deliberate safety boundary: **the LLM never invents venue
facts.** All factual data (gates, restrooms, transit, policies) lives in a small, versioned
JSON knowledge base (`backend/data/venues.json`). Gemini's only two jobs are to *understand*
a fan's question and to *phrase/translate* the retrieved facts — never to originate them.

This is Retrieval-Augmented Generation (RAG): retrieve real facts first, then let the model
phrase and translate them, grounded in a strict system prompt that instructs it to say "I
don't know, check with staff" rather than guess.

The second deliberate design choice is **escalation is rules-first, LLM-assisted second.**
A hard, deterministic keyword floor (`backend/data/venues.json`'s `escalationTriggers`)
always wins if it matches — no probabilistic model is the sole line of defense for a
safety-critical decision. Only in the ambiguous middle ground (no keyword match, no
confident retrieval match) does the system ask Gemini to help classify, and even then, the
code — not the model — decides whether that recommendation is honored. When a query is
classified `ESCALATE`, the pipeline short-circuits and returns a structured alert without
ever calling Gemini for a generated "answer."

## How It Works

```
Fan question (typed or spoken)
        │
        ▼
  sanitize.js        strip control chars, cap length, reject empty input
        │
        ▼
  retriever.js        embeds the query with Gemini, scores it by cosine similarity
                       against precomputed doc embeddings for venues.json, scoped
                       to the selected venue, returns top-scored facts
        │
        ▼
  classifier.js        1. hard keyword floor → ESCALATE if matched
                        2. confident retrieval match → GROUNDED_FACT / POLICY
                        3. otherwise, ask Gemini to assist on the ambiguous case
        │
        ├── ESCALATE ──────────────► return { escalation: true, reason, action, answer: null }
        │                             (Gemini is never called for this path)
        │
        └── GROUNDED_FACT / POLICY ─► llm.js calls Gemini with the retrieved facts
                                       injected into the prompt, translated into the
                                       requested output language
                                              │
                                              ▼
                              { answer, sourceDocs, category, confidence, escalation: false }
```

Two front doors call this identical pipeline:
- **Volunteer view** (`/`) — a personal-device assistant for a volunteer standing with a fan
- **Kiosk view** (`/kiosk`) — an unattended, walk-up self-service screen

Both hit the same `/api/query` contract. The only place they intentionally diverge is
escalation content: the volunteer view shows/speaks the raw `reason`/`action` fields (written
for a volunteer to act on), while the kiosk shows fan-facing instructions in the fan's own
language plus an "Alert Nearby Staff" button, because a kiosk has no volunteer standing there
by default to act on the alert.

A stretch capability, `/api/briefing`, generates a short shift-start summary for a venue
(closures, non-accessible facilities, early transit departures) — grounded the same way,
strictly from `venues.json` facts.

## Assumptions Made

- Venue data is mocked/synthetic (3 venues: MetLife Stadium, AT&T Stadium, Estadio Azteca) —
  no live FIFA data access.
- Tested against eight languages with full deterministic trigger/keyword coverage: English,
  Spanish, Portuguese, French, German, Italian, Arabic, and Japanese (`en-US`, `es-ES`,
  `pt-BR`, `fr-FR`, `de-DE`, `it-IT`, `ar-SA`, `ja-JP`). These are the only languages with a
  translated escalation-trigger list and translated retrieval keywords — this is the honest
  scope, not a hidden limitation. Any other language still gets a safety net (the English
  trigger baseline always applies, and the LLM-assist layer adds semantic judgment for
  ambiguous cases), but not the same deterministic, dedicated-language keyword coverage. The
  classifier surfaces this directly: every `/api/query` response includes a `triggerCoverage`
  field (`"full"` for the eight listed above, `"partial"` for anything else), derived at
  runtime from the actual languages present in `venues.json`'s `escalationTriggers` — via
  `getSupportedTriggerLanguages()`, `Object.keys(escalationTriggers)` — rather than a
  separately hardcoded list, so it can't drift out of sync as languages are added.
  Two of the eight have documented, narrower caveats (see "Expanding Language Coverage"
  below for the full methodology and reasoning): Japanese has no whitespace word
  segmentation, so escalation-trigger matching falls back to substring comparison instead
  of the word-token matching the other seven languages use — lower precision, not
  equivalent quality, and said so plainly rather than silently. (Retrieval itself is
  unaffected by this, since embedding-based similarity doesn't depend on word
  segmentation in any language.) Arabic's
  definite article attaches as a prefix to the noun itself (unlike a separate word such as
  Spanish "el"), which is handled for the common case, but Arabic's fuller set of attached
  prefixes (e.g. the "with"/"by" preposition) isn't — an honest, partial fix, not a full
  morphological analyzer.
- Voice input/output uses the browser's native Web Speech API; support varies by browser
  (strongest in Chrome-based browsers, limited/unavailable in some others). Both the
  volunteer view and the kiosk view always provide a fully functional text-input fallback —
  voice is a convenience layer on top of typing, never a requirement.
- Retrieval is embedding-based: each fact doc's plain-language text is embedded once via
  Gemini (`gemini-embedding-001`) at knowledge-base load time and cached in memory; each
  incoming query is embedded once per request and matched by cosine similarity against
  those cached doc vectors. This means a query needs no vocabulary in common with the
  stored fact to retrieve it correctly — a paraphrase like "is there somewhere my kid can
  go pee" retrieves the same restroom doc as "where is the nearest accessible restroom,"
  which the earlier keyword/token-overlap matcher could not do. The tradeoff: **each
  `/api/query` request now costs 2 Gemini API calls instead of 1** — one to embed the
  query, one to generate the answer (doc embeddings themselves are computed once at
  startup, not per request, so they don't add to this per-request cost).
- Kiosk mode is a fully implemented self-service walk-up interface, reached via the `/kiosk`
  route and reusing the exact same backend and voice hooks as the volunteer view. It is
  fixed to a single pre-configured venue (representing how a real kiosk would be provisioned
  at deployment), whereas the volunteer view lets the volunteer pick a venue. The deployed
  venue is configurable per kiosk via the `VITE_KIOSK_VENUE_ID` build-time environment
  variable (falls back to the first known venue if unset or invalid) — set this per physical
  kiosk deployment. Physical kiosk hardware, enclosure design, and OS-level browser lockdown
  are out of scope — this is a software demonstration of the full interaction flow.
- The kiosk's "Alert Nearby Staff" button calls `POST /api/alert`, which logs a timestamped,
  venue-tagged alert to an in-memory array and the server console. A production deployment
  would page a real staff-alerting system; this prototype demonstrates the escalation path
  is a real, testable action rather than only display text.
- `/kiosk` routing is resolved client-side (`main.jsx` reads `window.location.pathname`)
  rather than via a router library, since the kiosk is a fixed URL loaded once on a mounted
  device. This relies on the dev/preview server (or a production static host) falling back
  to `index.html` for unmatched paths, which Vite's default SPA behavior already provides.
- A real Gemini API key is required for the `GROUNDED_FACT`/`POLICY` answer path and the
  briefing generator; the `ESCALATE` short-circuit path works without one, since it never
  calls Gemini.
- Verified against the real Gemini API: grounded answers typically took 2.5-6s round-trip
  in testing (occasionally longer for the ambiguous-classification LLM-assist path); the
  free tier also caps requests per model per **day** (not per minute) at a level easy to
  exhaust during active manual testing, distinct from and much lower than this app's own
  20-req/minute rate limiter. Budget for this before a live demo — either test conservatively
  or use a paid-tier key.

## Expanding Language Coverage

Amigo's four newest fully-supported languages (German, Italian, Arabic, Japanese) were added
using the same safety principle that governs the rest of the system: **GenAI drafts, a human
verifies, only then does it touch production data.** This is worth stating plainly — using
generative AI to help build the safety infrastructure itself, under mandatory human
verification, is a deliberate design choice, not a shortcut.

The process, runnable again for any future language via `node scripts/generate-language-drafts.js`:

1. **Draft.** A standalone, offline script (not part of the running app, not wired into any
   route) asks Gemini to translate the existing English escalation-trigger phrases and
   retrieval-keyword categories into each target language's natural, commonly-used
   equivalents — not stiff word-for-word translations. Output goes to a draft file
   (`scripts/output/language-drafts.json`), never consumed at runtime.
2. **Human review — mandatory, not automated away.** Every trigger phrase was checked by
   hand before merging, and this pass caught real, concrete problems a purely automated
   pipeline would have shipped silently:
   - **German:** the raw draft's multi-word keyword strings had no spaces between words
     (e.g. `"ToiletteWCBadezimmer"`), which would have made them unmatchable against any
     real query — a formatting bug, not a translation error.
   - **German again:** the drafted "assault" trigger was `"Angriff"`, which is also the
     standard German football term for an attacking play — a fan commentating on the match
     would have falsely triggered an escalation. Replaced with `"Übergriff"`, the more
     precise term for interpersonal assault.
   - **Italian:** the lost/missing-child triggers only had the masculine `"bambino"` form;
     added the feminine `"bambina"` variant to match the gender coverage Spanish/Portuguese
     already had.
   - **Japanese:** one literal mistranslation — the draft's phrase for "lost child" actually
     means "I don't have children," an entirely ordinary thing to say when asking about
     family ticket policies, not an emergency. Fixed to the correct term, distinct from the
     adjacent (correctly-translated) entry using the standard word for a lost child.
   - **Arabic:** one open question flagged rather than force-corrected — a feminine adjective
     form that may not catch masculine-form phrasings of the same concept, noted honestly as
     an item worth a native speaker's review rather than guessed at.

   The reviewed corrections and reasoning are recorded in
   `scripts/output/language-drafts.reviewed.json` alongside the raw draft, so the diff
   between "what GenAI produced" and "what shipped" stays visible and auditable.
3. **Merge.** Only the reviewed, corrected content was added to `venues.json`'s
   `escalationTriggers` and `retriever.js`'s keyword constants — the same structure the
   original four languages already used. No classifier code changes were needed:
   `triggerCoverage` already derived itself from whatever language keys exist in the data.
4. **Harden the tokenizer itself.** Merging real Arabic and Japanese text surfaced two
   deeper bugs in the retrieval/matching layer, not just the translated word lists:
   - The tokenizer's regex only preserved Latin-script characters, so Arabic text was
     **silently erased entirely** before this fix — not lower-quality matching, zero
     matching. Fixed by extending the preserved character range.
   - Arabic's definite article attaches directly as a prefix to the noun (unlike Spanish
     "el" or French "le", which are separate words), so a query using the article
     naturally wouldn't match a keyword list written without it. Fixed with a standard,
     well-established Arabic text-processing technique (definite-article stripping) — not
     a project-specific hack.
   - Japanese has no whitespace word segmentation at all, so word-token matching cannot
     work for it regardless of translation quality. Rather than pretending otherwise, both
     retrieval and trigger matching fall back to character-bigram overlap / substring
     containment for Japanese specifically — documented above as a real, lower-precision
     limitation.

This is the intended shape of the process for adding the *next* language too: draft with
GenAI, review by hand (flagging genuine uncertainty rather than guessing), merge only what
survived review, and treat "does the tokenizer even handle this script" as its own
verification step — translation quality and matching-infrastructure correctness are two
different risks, and both showed up here.

## Running Locally

```bash
npm install
cp .env.example .env   # then fill in GEMINI_API_KEY

# terminal 1 — backend API (port 3001)
npm run dev

# terminal 2 — frontend dev server (port 5173, proxies /api to the backend)
npm run dev:frontend
```

- Volunteer view: http://localhost:5173/
- Kiosk view: http://localhost:5173/kiosk

```bash
npm test              # backend (Node) + frontend (jsdom) Jest projects — fully mocked, no network
npm run lint           # ESLint, including eslint-plugin-jsx-a11y
npm run build:frontend # production Vite build
```

Expected `npm test` output: 13 test suites, 98 tests, all passing — covering retrieval
accuracy (including multilingual, word-boundary, and script-specific edge cases across all
eight fully-supported languages), escalation classification (medical/factual/policy/ambiguous
cases across en/es/pt/fr/de/it/ar/ja, plus fail-closed behavior on a parse/network failure),
the full `/api/query` and `/api/briefing` pipelines (with Gemini mocked), CORS restriction,
rate limiting, the staff-alert endpoint, and frontend component behavior (`AnswerCard`,
`VoiceInputButton`, `EscalationBanner`, `KioskView`'s full state machine, fetch-timeout
handling, and right-to-left rendering for Arabic).

### Optional: live API verification

`npm test` never makes a real network call. To manually verify the app against the real
Gemini API (useful before a demo, or after touching prompt wording):

```bash
npm run test:live   # requires GEMINI_API_KEY in the environment; makes real, billed calls
```

This runs everything under `backend/tests/live/` against the real API: `gemini.live.test.js`'s
3 cases (grounded-fact, out-of-scope grounding, and the ambiguous-classification LLM-assist
path), plus `retrieval.live.test.js`'s 10 cases proving genuinely paraphrased queries (no
shared vocabulary with the stored fact) are retrieved correctly by real Gemini embeddings, and
re-confirming multilingual edge cases found during earlier manual testing. Both files are
excluded from `npm test` via `--testPathIgnorePatterns`, and additionally guarded internally
(`describe.skip` unless `RUN_LIVE_TESTS=true` is also set) as a second safety net. Note: the
Gemini free tier caps requests per model per day (not per minute) — heavy manual testing plus
this suite can exhaust that quota, after which calls return 429 until the daily quota resets.

## Security Notes

- `GEMINI_API_KEY` is read from `.env` (git-ignored); `.env.example` holds a placeholder
  only, and no key is ever committed.
- The frontend never talks to Gemini directly — it only calls this project's own backend,
  so no API key is ever exposed to the browser.
- Every query is passed through `sanitize.js` before use: control characters stripped,
  length capped, empty/whitespace-only input rejected.
- The backend validates request shape (`venueId`/`outputLanguage` types) before processing
  and returns generic error messages — no stack traces or internal paths leak to the client.
- The LLM is never treated as a source of truth for facts, which shrinks the blast radius of
  a prompt-injection attempt: even if a malicious query manipulated the model's phrasing, it
  cannot fabricate a gate number, policy, or time that isn't in `venues.json`.
- The kiosk is a shared public device: all session state clears on reset (explicit button or
  inactivity timeout), no conversation history persists across users, and no full query text
  is logged with identifying metadata client-side.
- CORS is restricted to a single configured origin (`FRONTEND_ORIGIN`, default
  `http://localhost:5173`) rather than left open to any origin — set this to your deployed
  frontend's URL in production.
- `/api/query` and `/api/briefing` (the two routes that trigger paid Gemini calls) are
  rate-limited to 20 requests/minute per IP. This is a per-IP, in-memory limiter that resets
  on server restart — a reasonable floor for this prototype, not a production-grade rate
  limiter.
