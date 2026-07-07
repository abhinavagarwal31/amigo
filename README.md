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
  retriever.js        keyword/substring match against venues.json, scoped to the
                       selected venue, returns top-scored facts
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
- Tested against English, Spanish, Portuguese, and French (`en-US`, `es-ES`, `pt-BR`,
  `fr-FR`). These four are the only languages with a translated escalation-trigger list and
  translated retrieval keywords — this is the honest scope, not a hidden limitation. Any
  other language still gets a safety net (the English trigger baseline always applies, and
  the LLM-assist layer adds semantic judgment for ambiguous cases), but not the same
  deterministic, dedicated-language keyword coverage. The classifier surfaces this directly:
  every `/api/query` response includes a `triggerCoverage` field (`"full"` for en/es/pt/fr,
  `"partial"` for anything else), derived at runtime from the actual languages present in
  `venues.json`'s `escalationTriggers` rather than a separately hardcoded list, so it can't
  drift out of sync as languages are added.
- Voice input/output uses the browser's native Web Speech API; support varies by browser
  (strongest in Chrome-based browsers, limited/unavailable in some others). Both the
  volunteer view and the kiosk view always provide a fully functional text-input fallback —
  voice is a convenience layer on top of typing, never a requirement.
- Retrieval is a Phase 1 keyword/substring matcher, intentionally chosen over an
  embedding-similarity layer — a simple, fully-tested keyword search is more defensible
  under time pressure than a half-finished embedding search.
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
npm test              # backend (Node) + frontend (jsdom) Jest projects
npm run lint           # ESLint, including eslint-plugin-jsx-a11y
npm run build:frontend # production Vite build
```

Expected `npm test` output: 9 test suites, 48 tests, all passing — covering retrieval
accuracy, escalation classification (medical/factual/policy/ambiguous cases), the full
`/api/query` and `/api/briefing` pipelines (with Gemini mocked), the staff-alert endpoint,
and frontend component behavior (`AnswerCard`, `VoiceInputButton`, `EscalationBanner`,
`KioskView`'s full state machine).

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
