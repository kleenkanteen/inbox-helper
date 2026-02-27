## Convex HTTP Endpoint Modularization Plan

### Summary
Refactor `convex/http.ts` into modular endpoint files grouped by route domain (auth, threads, buckets, messages, chat), while preserving existing behavior, paths, methods, response payloads, status codes, and rate-limit keys. Keep `convex/http.ts` as a thin router composition entrypoint.

### Public API / Interface Changes
- No external API changes.
- All existing endpoint paths and methods remain identical:
  - `GET /api/threads`
  - `GET /api/auth/google/callback`
  - `POST /api/classify`
  - `POST /api/chat/search`
  - `POST /api/messages/detail`
  - `POST /api/messages/check-new`
  - `POST /api/buckets`
  - `PUT /api/buckets`
  - `DELETE /api/buckets`
  - `POST /api/logout`
  - `POST /api/auth/google/start`
  - `OPTIONS` for each current route
- Internal code structure changes only.

### Target File Structure
- `convex/http.ts` (router-only composition)
- `convex/http/shared.ts`
  - shared constants/utilities currently in `http.ts`:
  - schemas (`bucketSchema`, `updateBucketSchema`, `deleteBucketSchema`, `checkNewSchema`, `chatSearchSchema`, `messageDetailSchema`)
  - `jsonHeaders`
  - auth/state helpers (`getUserFromRequest`, OAuth state encode/decode, redirect helpers)
  - `enforceRateLimit`
  - shared sort helper (`compareThreadRecency`)
- `convex/http/threads.ts`
  - `GET /api/threads` logic
  - `classifyUnseenThreads` helper scoped here
- `convex/http/auth.ts`
  - `GET /api/auth/google/callback`
  - `POST /api/auth/google/start`
- `convex/http/chat.ts`
  - `POST /api/chat/search`
- `convex/http/messages.ts`
  - `POST /api/messages/detail`
  - `POST /api/messages/check-new`
- `convex/http/buckets.ts`
  - `POST /api/buckets`
  - `PUT /api/buckets`
  - `DELETE /api/buckets`
- `convex/http/classify.ts`
  - `POST /api/classify`
- `convex/http/session.ts`
  - `POST /api/logout`
- `convex/http/options.ts`
  - shared `OPTIONS` handler

### Implementation Details
1. Create domain modules exporting `httpAction` handlers directly (one exported handler per route/method).
2. Move only route-specific logic into each module; move reusable logic to `shared.ts`.
3. Keep all current imports from `src/server/inbox/*`, `api`, and Convex generated types in the relevant modules.
4. Replace branch-based handlers (`getHandler`, `postHandler`, etc.) with dedicated handlers per route to eliminate internal path switching.
5. Rebuild `convex/http.ts` to:
   - import `httpRouter`
   - import each route handler
   - register the exact same route matrix as today
   - register shared `OPTIONS` handler for the same paths
6. Preserve exact rate-limit keys/limits/windows and existing error messages to avoid behavioral regressions.
7. Keep response headers unchanged (`jsonHeaders` and CORS behavior).

### Validation and Checks
1. Run static checks:
   - `npm run typecheck`
   - `npm run check`
2. Because Convex endpoint code is modified, run:
   - `npx convex deploy --yes`
3. Verify behavior with Playwright MCP against running app/Convex endpoints:
   - Threads fetch flow (connected and disconnected Google account cases)
   - OAuth start/callback round-trip
   - Bucket CRUD endpoints
   - Message detail + check-new endpoints
   - Chat search endpoint
   - Classify + logout endpoints
   - OPTIONS preflight responses and CORS headers

### Test Scenarios (Acceptance)
1. Route parity: every pre-refactor route still responds on same method/path.
2. Response parity: status codes and key response fields match previous behavior.
3. Error parity: rate-limit, auth, and Gmail-expired-token branches still return expected payloads.
4. No cross-module circular imports.
5. Type safety passes with no new TypeScript errors.

### Assumptions and Defaults
- Assumption: You want a pure modularity refactor with no functional changes.
- Default applied: grouping by route domain (as selected), not by method or per-path micro-files.
- Default applied: keep all existing endpoint contracts and rate-limit semantics untouched.
