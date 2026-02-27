## Feature Plan: “Chat” Over Last 200 Stored Emails + Full Message Viewer

### Summary
Add a `Chat` action in the header immediately to the left of `Refresh`. Clicking it opens a small popup with the info text: **“Find relevant emails using natural language”**.  
The popup supports:
1. Natural-language search (e.g. “show me emails from sabih”) against the last 200 emails already stored in Convex.
2. Result list of relevant emails.
3. Click-through into full Gmail message content rendered as HTML inside the popup.

The backend will add two new Convex HTTP endpoints:
- `POST /api/chat/search` for relevance search with Grok.
- `POST /api/messages/detail` for full message HTML retrieval by message id.

Fallback behavior (chosen): if Grok fails, fallback to OpenAI; if both fail, return a deterministic keyword-filter fallback list.

---

### Scope
1. Add `Chat` button in header at [`/Volumes/ssd/coding/inbox-helper/src/pages/index.tsx`](/Volumes/ssd/coding/inbox-helper/src/pages/index.tsx) directly before existing `Refresh` button.
2. Add chat popup UI/state in the same page.
3. Add chat-search API route and message-detail API route in [`/Volumes/ssd/coding/inbox-helper/convex/http.ts`](/Volumes/ssd/coding/inbox-helper/convex/http.ts).
4. Add Gmail helper to fetch full message HTML in [`/Volumes/ssd/coding/inbox-helper/src/server/inbox/gmail.ts`](/Volumes/ssd/coding/inbox-helper/src/server/inbox/gmail.ts).
5. Ensure sender is available in stored snapshots to support “from <name>” queries reliably.

Out of scope:
1. Multi-turn conversational memory beyond current query + current result/detail context.
2. Persisting chat history between reloads.
3. Rich compose/reply actions.

---

### API / Interface Changes

1. `POST /api/chat/search`
- Request body:
  - `query: string` (required, trimmed, min 2 chars, max 500)
  - `limit?: number` (optional, default 15, max 50)
- Behavior:
  - Resolve `userId` from session.
  - Rate limit per user (new route key `chat_search_post`, e.g. 30/min).
  - Pull stored threads via existing Convex query (`inbox:getThreadsAndBuckets`) and cap to 200 most recent.
  - Build compact search corpus per email: `{id, subject, snippet, sender, receivedAt}`.
  - Send corpus + user query to Grok (`grok-4-1-fast-non-reasoning`) using `generateObject`.
  - Validate returned IDs exist in corpus.
  - Return matched emails in ranked order.
  - On Grok failure: fallback to OpenAI model (`gpt-4o-mini`).
  - On both model failures: fallback deterministic keyword match over sender/subject/snippet.
- Response shape:
  - `{ query, totalCandidates, results: Array<{id, subject, snippet, sender?, receivedAt?}> }`
  - Error responses consistent with existing API style (`{ error, needsGoogleAuth? }`).

2. `POST /api/messages/detail`
- Request body:
  - `id: string` (Gmail message ID)
- Behavior:
  - Resolve `userId`, enforce rate limit (`message_detail_post`, e.g. 60/min).
  - Load Google token from Convex.
  - If missing token: return `400` with `needsGoogleAuth: true`.
  - Fetch full message from Gmail `users/me/messages/{id}?format=full`.
  - Extract and return sanitized HTML body; fallback to HTML-wrapped escaped plain text if no HTML part exists.
- Response shape:
  - `{ id, subject, from?, to?, date?, html }`

3. Type additions in [`/Volumes/ssd/coding/inbox-helper/src/pages/index.tsx`](/Volumes/ssd/coding/inbox-helper/src/pages/index.tsx) (local page types)
- `ChatSearchResponse`
- `ChatResultItem`
- `MessageDetailResponse`
- UI state for popup open/close, query input, loading/error, results, selected detail.

---

### Backend Design Details

1. Chat relevance service logic (new helper in `src/server/inbox/classifier.ts` or new `chat-search.ts`)
- Input: query + array of up to 200 stored threads.
- Output: ordered list of matching thread IDs.
- Strict schema validation with zod to avoid malformed model output.
- Prompt constraints:
  - “Only select from provided IDs.”
  - “Prioritize sender, subject, snippet relevance.”
  - “Return empty list if no relevant matches.”

2. Sender support for “emails from X”
- Update Gmail parsing in [`/Volumes/ssd/coding/inbox-helper/src/server/inbox/gmail.ts`](/Volumes/ssd/coding/inbox-helper/src/server/inbox/gmail.ts) to extract `From` header during detail hydration.
- Ensure `ThreadSummary.sender` is populated and saved by existing `saveThreadsAndClassifications`.
- Chat search corpus includes sender field.

3. Full HTML extraction
- Add recursive body-part parsing for `text/html` preferred, fallback `text/plain`.
- Sanitize server-side minimally (strip scripts/styles/object/embed/iframe) and render in isolated iframe on client (`sandbox` attribute, `srcDoc`).
- Keep link behavior safe (`rel="noopener noreferrer"` in transformed anchors if transformed; otherwise sandbox restriction handles script execution).

4. Convex route wiring in [`/Volumes/ssd/coding/inbox-helper/convex/http.ts`](/Volumes/ssd/coding/inbox-helper/convex/http.ts)
- Add zod schemas for chat search + message detail payloads.
- Add route branches under `postHandler`.
- Register `OPTIONS` handlers for both new paths.
- Keep JSON/CORS headers aligned with existing implementation.

---

### Frontend UX Plan

1. Header button placement
- In action group: `Sign in` (if shown), `Chat`, `Refresh`, `Recategorize`, `Logout`.
- `Chat` button style reuses existing `buttonClass`.

2. Popup behavior
- Small anchored modal/panel (fixed position top-right on desktop, full-width bottom sheet style on small screens).
- Contains:
  - Static info line exactly: `Find relevant emails using natural language`
  - Query input + submit.
  - Search results list.
  - Detail pane mode when a result is clicked.
- Include close button and escape-to-close.
- Maintain independent loading/error states for search and detail fetch.

3. Result list
- Each result row shows subject, sender (if present), date, snippet preview.
- Click row -> fetch `/api/messages/detail` -> show full HTML content.
- Back control returns from detail view to results list.

4. HTML rendering
- Use iframe `srcDoc` + `sandbox` (no `allow-scripts`) to contain message HTML.
- Provide loading and failure states for detail fetch.

---

### Testing & Verification

1. Static checks
- `bun run typecheck`
- `bun run check`

2. API-level manual tests
- `POST /api/chat/search`:
  - Valid query returns ordered subset from stored 200.
  - Empty/too-short query returns 400.
  - Grok failure path triggers OpenAI fallback.
  - Both model failures trigger deterministic fallback with non-500 response.
- `POST /api/messages/detail`:
  - Valid message ID returns HTML payload.
  - Missing token returns `needsGoogleAuth: true`.
  - Invalid ID returns graceful error.

3. UI manual scenarios
- `Chat` button is immediately left of `Refresh`.
- Popup opens/closes correctly.
- Info text appears exactly as required.
- Query “show me emails from sabih” returns relevant list.
- Clicking result shows full email HTML in popup.
- Mobile viewport usability check for popup layout.
- Existing flows (`Refresh`, `Recategorize`, `Logout`, category management) remain unaffected.

---

### Acceptance Criteria

1. Header has `Chat` button immediately left of `Refresh`.
2. Clicking `Chat` opens popup showing: `Find relevant emails using natural language`.
3. User can submit natural-language query and get relevant email list from stored Convex emails (max 200 corpus).
4. Clicking a returned email fetches full Gmail message and renders HTML in popup.
5. Fallback chain works: Grok -> OpenAI -> deterministic local filter.
6. No regressions in current inbox/categorization/auth flows.

---

### Assumptions & Defaults Chosen

1. Search corpus is strictly the currently stored Convex snapshot emails (not fresh Gmail fetch at query time).
2. Default result count is 15 (max 50).
3. Model fallback behavior is enabled (Grok first, OpenAI second, then deterministic local fallback).
4. Sender extraction is added to improve “from <person>” query quality.
5. HTML is rendered in sandboxed iframe for safety instead of raw `dangerouslySetInnerHTML`.
