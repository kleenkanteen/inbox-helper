## Decouple Bucket Mutations from Reclassification + Centered Updating Badge

### Summary
Implement a two-step flow for **all bucket mutations** (`POST`, `PUT`, `DELETE` on `/api/buckets`):

1. Save bucket changes in Convex immediately and return updated inbox state **without reclassifying**.
2. Frontend then triggers `/api/classify` and shows the updating spinner badge in the **center top area**, above categories and below header buttons.

This preserves immediate bucket persistence and makes reclassification an explicit follow-up request from the UI.

### Public API / Interface Changes
1. `POST /api/buckets` behavior changes:
   - Before: save bucket + run full classification + save classifications + return inbox.
   - After: save bucket only + return fresh inbox (`getInbox`) with existing classifications.
2. `PUT /api/buckets` behavior changes:
   - Same decoupling as above.
3. `DELETE /api/buckets` behavior changes:
   - Same decoupling as above.
4. Response shape remains `InboxResponse` to avoid frontend contract breaks.
5. `POST /api/classify` remains the only endpoint that performs full recategorization.

### Backend Plan
1. Update [`convex/http.ts`](/Volumes/ssd/coding/inbox-helper/convex/http.ts):
   - In `/api/buckets` `POST` branch, remove:
     - `getThreadsAndBuckets`
     - `classifyThreads`
     - `upsertCachedClassifications`
     - `saveClassifications`
   - Keep:
     - input validation
     - `addBucket` mutation
     - `getInbox` query response
2. Apply the same removal pattern in `PUT /api/buckets` and `DELETE /api/buckets`.
3. Keep error and rate-limit behavior unchanged.

### Frontend Plan
1. Update [`src/pages/index.tsx`](/Volumes/ssd/coding/inbox-helper/src/pages/index.tsx):
   - Keep bucket mutation calls (`createCategory`, `updateCategory`, `deleteCategory`) to `/api/buckets`.
   - After each successful mutation response:
     - immediately update UI from returned inbox payload.
     - then trigger recategorization request (`/api/classify`) as a second request.
2. Refactor `recategorize` to support spinner control:
   - Add updating-badge increment/decrement around classify call (or use a shared wrapper).
   - Ensure decrement happens in `finally`.
3. Spinner badge placement change:
   - Move rendering from current title area to a centered row under header actions and above the categories section.
   - Keep visibility tied to updating state so it appears during the recategorization follow-up.
4. Preserve existing UX behavior:
   - `create`: keep selecting newly created bucket and exiting configure mode before recategorization completes.
   - `update/delete`: keep current selection fallback logic, then refresh after classify response.

### Data Flow After Change
1. User clicks create/update/delete category.
2. Frontend calls `/api/buckets` mutation endpoint.
3. Backend saves change in Convex and returns updated inbox immediately.
4. Frontend renders updated categories immediately.
5. Frontend calls `/api/classify`.
6. Spinner badge shows in centered top area while classify is in progress.
7. On success, frontend replaces data with recategorized inbox.
8. On classify error, keep saved bucket state visible and show error toast/message.

### Test Cases and Scenarios
1. Create category success:
   - New category appears immediately before recategorization finishes.
   - A second `/api/classify` request is sent.
   - Centered spinner shows while classify is pending.
2. Update category success:
   - Edited category name/description appears immediately.
   - Recategorization runs afterward with spinner.
3. Delete category success:
   - Category disappears immediately; selection fallback remains valid.
   - Recategorization runs afterward with spinner.
4. Classify failure after successful bucket mutation:
   - Bucket mutation persists.
   - UI shows classification failure error.
   - Spinner stops correctly.
5. Bucket mutation failure:
   - No classify request is sent.
   - Spinner does not appear for classify.
6. Concurrency sanity:
   - Repeated rapid bucket actions do not leave spinner stuck (counter never below zero, returns to hidden).

### Assumptions and Defaults
1. Scope is confirmed as **all bucket mutations** (`POST/PUT/DELETE`).
2. `POST/PUT/DELETE /api/buckets` should continue returning full inbox payload (without reclassification) for immediate UI refresh.
3. Spinner badge indicates recategorization activity in the new centered position; existing background-refresh indicator usage can remain tied to the same updating state unless explicitly separated later.
