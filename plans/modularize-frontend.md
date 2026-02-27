## Modularize `index.tsx` Into Inbox Feature Components

### Summary
Refactor [`/Volumes/ssd/coding/inbox-helper/src/pages/index.tsx`](/Volumes/ssd/coding/inbox-helper/src/pages/index.tsx) into a feature module under `src/components/inbox` (per your preference), with hooks handling orchestration and presentational components handling UI.  
Goal: keep behavior unchanged while making the page easy to reason about and extend.

### Folder Structure (kebab-case for multi-word files)
```text
/Volumes/ssd/coding/inbox-helper/src/components/inbox/
  inbox-dashboard.tsx
  inbox-header.tsx
  category-pane.tsx
  email-result-pane.tsx
  category-config-pane.tsx
  thread-list-pane.tsx
  chat-pane.tsx
  category-message-pane.tsx
  email-viewer.tsx
  email-modal.tsx
  hooks/
    use-inbox-data.ts
    use-chat-pane.ts
    use-category-message.ts
    use-escape-close.ts
  lib/
    inbox-api.ts
    inbox-constants.ts
    inbox-utils.ts
  types/
    inbox-types.ts
  index.ts
```

### Component and Hook Responsibilities
1. `inbox-dashboard.tsx`  
Owns composition only. Wires hooks to components and keeps layout parity with current page.

2. `inbox-header.tsx`  
Renders title + action buttons (`Sign in`, `Chat`, `Refresh`, `Recategorize`, `Logout`).

3. `category-pane.tsx`  
Renders left category list, active state, counts, and `Configure categories` toggle.

4. `email-result-pane.tsx`  
Switches between `category-config-pane` and `thread-list-pane` based on `showConfigure`.

5. `category-config-pane.tsx`  
Owns create/update/delete category form rendering only; mutations come from `use-inbox-data`.

6. `thread-list-pane.tsx`  
Renders selected bucket thread list and click-to-open action.

7. `chat-pane.tsx`  
Chat modal shell with query input, results list, and detail mode toggle.

8. `category-message-pane.tsx`  
Category email modal wrapper for selected thread.

9. `email-viewer.tsx`  
Reusable email content viewer used by both chat and category modal (subject/from/loading/error/iframe).

10. `email-modal.tsx`  
Shared modal container UI (overlay, panel, close button, title).

11. `use-inbox-data.ts`  
Handles inbox fetch/hydration/polling, auth/connect/logout, recategorize, category CRUD, bucket selection, configure-mode state.

12. `use-chat-pane.ts`  
Handles chat query, search, selected chat email, message detail fetch, and close/reset behavior.

13. `use-category-message.ts`  
Handles category thread -> message detail fetch and open/close state.

14. `use-escape-close.ts`  
Centralizes Escape-key handling priority (category modal closes before chat modal).

### Public Interfaces and Types
1. Move all page-local types into `types/inbox-types.ts`: `BucketDefinition`, `BucketedThread`, `GroupedBucket`, `InboxResponse`, `ChatResultItem`, `ChatSearchResponse`, `MessageDetailResponse`, `CheckNewResponse`.

2. Add `lib/inbox-api.ts` with typed API helpers for:
`getThreads`, `checkNewMessages`, `startGoogleAuth`, `logout`, `classify`, `createBucket`, `updateBucket`, `deleteBucket`, `searchChat`, `getMessageDetail`.

3. Add `lib/inbox-utils.ts` for:
`normalizeInboxResponse`, `sortThreadsByRecency`, `getImportantBucketId`, `formatThreadDate`, `buildMessageSrcDoc`, bucket ordering/icon helpers.

4. `src/pages/index.tsx` becomes a thin entry page:
renders `<Head />` + `<InboxDashboard />` only.

### Implementation Sequence
1. Create `types/inbox-types.ts`, `lib/inbox-constants.ts`, `lib/inbox-utils.ts`, and `lib/inbox-api.ts`.
2. Extract data logic into `use-inbox-data.ts` without changing behavior.
3. Extract chat logic into `use-chat-pane.ts`.
4. Extract category-message modal logic into `use-category-message.ts`.
5. Build reusable UI units (`email-modal.tsx`, `email-viewer.tsx`).
6. Build feature panes (`category-pane.tsx`, `email-result-pane.tsx`, `category-config-pane.tsx`, `thread-list-pane.tsx`, `chat-pane.tsx`, `category-message-pane.tsx`, `inbox-header.tsx`).
7. Compose all in `inbox-dashboard.tsx`.
8. Replace page body in `src/pages/index.tsx` with `InboxDashboard`.
9. Run `npm run typecheck` and `npm run check`.

### Test Cases and Scenarios
1. Initial load shows spinner then inbox data.
2. Cached inbox hydrates first, then background refresh runs.
3. Category selection switches thread list correctly.
4. Configure mode toggles and category create/update/delete flows still work.
5. Recategorize updates data and keeps valid selected bucket fallback.
6. Chat modal opens, search validates min length, returns results, loads detail.
7. Chat detail back action restores results view.
8. Category thread click opens modal and loads message content.
9. Escape key behavior: closes category modal first, then chat modal.
10. Google auth states still show sign-in/connect flows.
11. Refresh button shows updating badge behavior unchanged.

### Assumptions and Defaults
1. No behavioral or visual redesign; this is structural modularization only.
2. No backend/Convex endpoint changes are needed.
3. Existing Tailwind classes are preserved unless extraction requires minor duplication cleanup.
4. Feature code stays under `src/components/inbox` as requested.
5. All multi-word files use kebab-case naming.
