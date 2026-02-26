# Grand Plan: AI Bucketed Inbox (React Web)

## 1) Product Goal

Build a React-based web interface where users:

1. Authenticate a Google Workspace (G-Suite) account via OAuth.
2. Grant Gmail read access.
3. On load, fetch the latest 200 Gmail threads.
4. Classify threads into buckets such as `Important`, `Can Wait`, `Auto-Archive`, `Newsletter` using an LLM-powered pipeline.
5. View each thread as subject + preview snippet in bucketed lists (no full email detail view required).
6. Create custom buckets and trigger full recategorization of all 200 threads against the new bucket set.

## 2) Scope and Non-Goals

### In Scope

- OAuth login with Google.
- Gmail API integration for list/summary data.
- Thread list UI grouped by buckets.
- Default bucket taxonomy + custom bucket creation.
- LLM-driven classification and recategorization.
- Basic observability, caching, and error handling.

### Out of Scope

- Replying/sending emails.
- Opening full thread content.
- Multi-account inbox management.
- Mobile app (this plan chooses web/React).

## 3) Functional Requirements

1. User can sign in with Google and authorize Gmail scopes.
2. System fetches the latest 200 threads on initial load.
3. Each thread shows:
   - Subject
   - Short preview/snippet
   - Bucket label
4. System provides default buckets:
   - `Important`
   - `Can Wait`
   - `Auto-Archive`
   - `Newsletter`
5. User can create one or more custom buckets.
6. On bucket changes, all 200 threads are reclassified.
7. Classification must complete with graceful fallback if LLM fails.

## 4) High-Level Architecture

### Frontend (React / Next.js)

- Auth entry and session state.
- Bucket overview UI with thread cards.
- Custom bucket management UI.
- Reclassify trigger and progress state.

### Backend (Next.js API routes or standalone service)

- OAuth callback/token exchange.
- Gmail thread retrieval service.
- LLM classification orchestrator.
- Bucket configuration service (default + custom).
- Persistence layer for tokens, bucket definitions, and classification results.

### Data Layer

- `users`
- `oauth_tokens` (encrypted at rest)
- `bucket_definitions`
- `thread_snapshots` (thread id, subject, snippet, metadata)
- `thread_classifications` (thread id -> bucket, confidence, rationale summary)

## 5) LLM Classification Pipeline Design

## 5.1 Inputs

Per thread:

- `threadId`
- `subject`
- `snippet`
- Optional derived features: sender domain, recipient count, has-unsubscribe hint.

Global:

- Current bucket definitions (default + user custom).
- Classification policy prompt with strict output schema.

## 5.2 Pipeline Stages

1. Preprocessing:
   - Normalize subject/snippet.
   - Remove boilerplate.
   - Extract lightweight heuristics (newsletter signals, urgency terms).
2. First-pass rules:
   - Deterministic placement for obvious cases (for example high-confidence newsletters).
3. LLM classification:
   - Batch threads (for cost/performance).
   - Prompt includes bucket definitions and examples.
   - Enforce JSON schema output.
4. Validation:
   - Reject unknown bucket names.
   - Fill missing/invalid assignments with fallback bucket `Can Wait`.
5. Post-processing:
   - Confidence scoring.
   - Optional rationale string for debug logs.
6. Persist and return grouped result.

## 5.3 Recategorization Strategy for Custom Buckets

When user adds/edits buckets:

1. Save new bucket definitions.
2. Re-run pipeline for all 200 cached threads.
3. Use same staged flow with updated bucket taxonomy.
4. Replace prior bucket assignments atomically.

## 5.4 Prompt Contract (Implementation Requirement)

- Output must be strict JSON.
- One classification object per thread id.
- Must choose exactly one bucket from provided list.
- Provide confidence in [0, 1].
- No prose outside JSON.

## 6) UX Plan

### Main Screen

- Header: account identity + refresh button.
- Bucket tabs/columns with counts.
- Thread row: subject (primary), snippet (secondary), confidence badge (optional).

### Bucket Management

- Modal/panel to create custom bucket:
  - Bucket name
  - Short rule/description (optional guidance for classifier prompt)
- Save action triggers recategorization job.
- Show non-blocking progress/loading state.

### Errors and Empty States

- Auth denied -> actionable reconnect CTA.
- Gmail fetch failed -> retry CTA.
- LLM partial failure -> show fallback classifications + warning toast.

## 7) Milestones (Parallel-Executable Workstreams)

Each milestone below includes parallel tasks that can be assigned to separate LLM agents.

### Milestone 1: Foundation and Contracts

Goal: lock interfaces so downstream teams can build independently.

Parallel tasks:

1. Define TypeScript contracts:
   - Thread DTO, Bucket DTO, Classification DTO.
2. Define API contracts:
   - `POST /api/auth/google/start`
   - `GET /api/auth/google/callback`
   - `GET /api/threads?limit=200`
   - `POST /api/classify`
   - `POST /api/buckets`
3. Create database schema + migrations.
4. Add env var contract and runtime validation.

Exit criteria:

- All interfaces documented and compile-checked.
- Migrations run successfully on local DB.

### Milestone 2: Auth + Gmail Integration

Goal: secure account connection and data retrieval.

Parallel tasks:

1. Implement Google OAuth flow (start + callback + token storage).
2. Implement Gmail thread fetch service for latest 200 threads.
3. Build token refresh and expiry handling.
4. Add integration tests with mocked Google APIs.

Exit criteria:

- User can connect Google account and fetch 200 threads with subject/snippet.

### Milestone 3: Classification Engine v1

Goal: reliable auto-bucketing with defaults.

Parallel tasks:

1. Implement preprocessing + heuristic rules module.
2. Implement LLM orchestration with batch requests.
3. Implement schema validation + fallback handling.
4. Implement persistence for classification results.

Exit criteria:

- All fetched threads are assigned exactly one default bucket.
- Invalid model output is recovered without breaking UI response.

### Milestone 4: React Inbox Experience

Goal: shippable bucketed inbox UI.

Parallel tasks:

1. Build authenticated app shell and loading states.
2. Build bucketed thread list view (subject + preview only).
3. Build API hooks/state management for fetch + refresh.
4. Add error and empty-state UX paths.

Exit criteria:

- User can view grouped threads by bucket after login.

### Milestone 5: Custom Buckets + Reclassification

Goal: user-defined organization.

Parallel tasks:

1. Build custom bucket creation UI.
2. Persist user bucket definitions.
3. Trigger and monitor full recategorization for 200 threads.
4. Update UI live after reclassification completes.

Exit criteria:

- New custom bucket appears and affects categorization across all threads.

### Milestone 6: Reliability, Security, and Performance

Goal: production readiness.

Parallel tasks:

1. Add rate limiting, retries, timeout guards for Gmail/LLM calls.
2. Encrypt tokens and harden secret handling.
3. Add structured logs + tracing for classification pipeline.
4. Add caching strategy (thread snapshot TTL, classification invalidation rules).

Exit criteria:

- System degrades gracefully under transient API/model errors.

### Milestone 7: QA and Launch Readiness

Goal: verify behavior and ship.

Parallel tasks:

1. End-to-end tests: auth -> fetch -> classify -> custom bucket -> recategorize.
2. Load tests for repeated 200-thread categorization cycles.
3. Prompt quality review and bucket accuracy sampling.
4. Release checklist and rollback playbook.

Exit criteria:

- All critical user flows pass in CI and staging.

## 8) Execution Graph (Dependency Map)

- Milestone 1 is prerequisite for all others.
- Milestone 2 and Milestone 3 can run in parallel after Milestone 1.
- Milestone 4 can begin once Milestone 1 is done; full integration waits on 2 and 3.
- Milestone 5 depends on 3 and 4.
- Milestone 6 runs in parallel with late 4/5 hardening.
- Milestone 7 depends on completion of 2 through 6.

## 9) Agent Assignment Blueprint (Parallel LLM Team)

Recommended agent split:

1. Agent A (Platform): schema, API contracts, env validation.
2. Agent B (Auth/Data): Google OAuth + Gmail retrieval.
3. Agent C (AI Pipeline): LLM classifier + validation/fallback.
4. Agent D (Frontend): React inbox + bucket UI.
5. Agent E (Quality): tests, observability, performance hardening.

Coordination cadence:

- Daily contract sync (DTO/API changes).
- Shared fixture dataset for 200 thread mocks.
- Blocking issues escalated to integration owner.

## 10) Acceptance Criteria (Final)

1. User signs in with Google and grants Gmail access.
2. App fetches 200 recent threads and displays subject/snippet only.
3. Threads are grouped into default buckets via LLM pipeline.
4. User creates custom bucket(s).
5. App recategorizes all 200 threads based on updated bucket list.
6. App handles API/model failures with fallbacks and clear UI states.

## 11) Risks and Mitigations

1. LLM misclassification risk:
   - Mitigation: deterministic first-pass rules + confidence + fallback bucket.
2. API quota/rate limits:
   - Mitigation: caching, batching, retry/backoff, incremental refresh.
3. OAuth/token security risk:
   - Mitigation: encrypted storage, least-privilege scopes, rotation policy.
4. Slow recategorization UX:
   - Mitigation: background job + progress indicator + optimistic UI labels.
