# Backend API & Schema Map (for the CRM coding agent)

Snapshot of what `../server` (`index.js` + `productionSchema.js` + `reportContract.js`) actually serves today, verified against the **live data file** (`server/data/platform-db.json`), not just the route definitions. Where this doc disagrees with `src/types.ts` or `src/lib/prototypeApi.ts`, this doc describes the server; the CRM code is what needs to change.

Base URL (prod): `https://snitch-server-x3qn.onrender.com` (see `.env.example` → `VITE_API_ORIGIN`). Dev: Vite proxy (`VITE_USE_API_PROXY=true`) avoids CORS; the server's CORS allowlist (`../server/index.js:366`) also permits localhost + tunnel-pattern origins.

---

## 1. The one live data path

**`GET /api/authority-prototype/cases`** — no auth, no params. `../server/index.js:8272`

```jsonc
{ "cases": [ /* Case[], see §3 */ ], "generatedAt": "2026-06-25T..." }
```

**`POST /api/authority-prototype/cases/:id/stage`** — no auth. `../server/index.js:8281`
Body: `{ stage: CaseStage, actorRole?: string, note?: string }`. Validates `stage` against the enum below and the transition graph; `id` is matched against `production.reports[].id` first (live path), with legacy fallbacks that are currently unreachable (no legacy data exists — see §2).

```ts
type CaseStage = 'New' | 'Monitor / Enrich' | 'Bad Case' | 'Under Review'
  | 'Agent Assignment' | 'Ready For Legal' | 'Recovery In Progress' | 'Closed';
```

Transition graph (`../server/index.js:5770`) — a stage button should only be offered if the target is in the current stage's list:

| From | Allowed next |
|---|---|
| New | Monitor / Enrich, Bad Case, Under Review |
| Monitor / Enrich | New, Under Review, Closed |
| Bad Case | New, Closed |
| Under Review | Agent Assignment, Ready For Legal, Recovery In Progress, Closed |
| Agent Assignment | Under Review, Recovery In Progress, Agent Assignment |
| Ready For Legal | Under Review, Closed, Ready For Legal |
| Recovery In Progress | Under Review, Closed, Ready For Legal, Recovery In Progress |
| Closed | Under Review |

Response: `{ case: <updated production report, raw shape — NOT the Case shape> }`. Note this is a different shape than what `GET /cases` returns (it's `data.production.reports.find(...)`, not run through `buildProductionAuthorityCase`). If the CRM needs the UI-shaped object back, re-fetch from `GET /cases` rather than trusting this response's shape.

**Fact, not a bug to silently rely on:** this stage-write endpoint has no auth middleware. Anyone who can reach the server can mutate analyst stage. Flagging this so it's a conscious call if/when this surface gets exposed publicly — not something to "fix" as part of an API-mapping task.

Verified against the live data file (2026-06-25): `production.reports` = 5 rows, `production.submissions` = 12, `production.device_installs` = 3. This is the only populated path.

---

## 2. The dormant path — `/api/portal/*` (do not build toward this)

8 endpoints exist and are fully implemented (`dashboard`, `reports`, `reports/:id`, `reports/:id/review`, `reports/:id/source-review`, `venues/:id`, `case-packets`, `cases/:id/outcome` — all `../server/index.js:7981`–`8260`, all behind `requireAuth`). They are **richer** than the prototype surface (analyst verdicts, source review, venue 360, case-packet export, settlement/outcome tracking) — but they all read `data.reports` / `data.caseLedger` / `data.venues`, the **legacy** collections.

Verified directly against the live data file: `data.reports.length === 0`, `data.caseLedger.length === 0`, `data.submissions.length === 0`. Every one of these endpoints returns empty today, unconditionally, because the v2 capture pipeline (post-migration) only writes `data.production.*`. This is not a bug to route around — it's the documented state of an intentionally-deferred decision (see `server`'s migration plan: "/api/portal/* — clientless in the live workflow... removing it is its own call"). **Do not port CRM features to this surface or treat it as "the real API to grow into."** If/when it's revived, it would need to be repointed at `production.*` first — that's server-side work, not a CRM integration task.

Auth for this surface, for reference: `POST /api/auth/login` with `{ email, password, totpCode }` → `{ token, user }` (JWT, 8h expiry, `../server/platformAuth.js:85`). Bearer token in `Authorization` header. `requirePlatformAdmin` additionally requires `user.isPlatformAdmin`.

---

## 3. The `Case` shape — what's live vs. permanently stubbed

`buildProductionAuthorityCase` (`../server/index.js:6698`) is the only function that produces what `GET /cases` returns. Cross-reference against `src/types.ts`'s `Case` interface:

**Populated from real data:**

| Case field | Source |
|---|---|
| `id` | `report.id` (production report id — this is what `/stage` expects, NOT a submission id) |
| `timestamp` | `report.created_at` |
| `location.{name,lat,lng,city,address}` | resolved venue if matched, else declared venue context, else `'Unverified location'` / `0,0` |
| `videoProofUrl`, `absoluteProof.smallVideoUrl` | `/media/<object_key>` of the raw video asset — **relative path**, needs origin-prefixing the same way `prototypeApi.ts`'s `assetUrl()` already does |
| `aiExplanation` | `report.ai_review_brief.one_line` — disposition-free by construction; never a verdict |
| `trustGates.mediaHashKey` | `submission.media_sha256` present |
| `trustGates.payloadSignature` | `submission.signature_status === 'signed_and_verified'` |
| `trustGates.geofencingContinuity` | `submission.gps_track_analysis.pointCount >= 2` (real signal, despite the generic name) |
| `trustGates.gpsTrackSigned` / `venueCommitted` | real, from the 2026-06 hardening work |
| `songAssessment.title/artists/labelOwner` | from ACRCloud match, only if resolved (else `'Unknown Track'` / `''`) |
| `songAssessment.rightsAssociation` | `'Resolved'`-or-`report.rights_org` if `rights_owner_resolution.status === 'resolved'`, else literal string `'Pending analyst review'` |
| `absoluteProof.obstructionFlags` / `performanceContext` | `report.visual_analysis` / `report.application_assessment` / `report.space_class` — present once Phase 2 (advanced) processing has run |
| `chainOfCustody` | synthesized from submission signature + report creation + (if `processing_stage === 'full'`) a Phase 2 entry |
| `stage` | `report.analyst_stage` (lossless round-trip) else mapped from `report.analyst_status` |
| `contract` | see §4 — this is the one CRM-side field that's fully wired |

**Always stubbed — by design, not missing data, do not build UI implying these will populate:**

| Field | Always | Why |
|---|---|---|
| `pastOffences`, `expectedFine`, `qualityScore`, `recoverableValue` | `0` | "no monetary/quality model exists" (code comment) — single-report model, no corroboration clustering yet |
| `trustGates.clockSkewDetection` | `false` | not computed by the pipeline |
| `trustGates.deviceTrustBand` | `false` | `device_trust_band` is `'unscored'` by design (abuse scoring deliberately deferred) |
| `songAssessment.isrc`, `.upc` | `''` | `matched_track_id` unresolved — no catalog link wired |
| `location.phone`, `.email` | `''` | no merchant contact model on this path |
| `absoluteProof.venueImages`, `evidenceVaults[].images` | `[]` | no frame-asset wiring on this builder yet |
| `comments` | `[]` | no comment persistence on production reports |

**In `src/types.ts` but NEVER populated by this endpoint** (always `null`/absent from the live response — these types describe the dormant portal surface or are CRM-only, not server output): `enforcement`, `sourceAssessment`, `signalSummary`, `locationDelta`, `venueAttribution`, `venueContext`, and everything under `ReadinessBand` / `LicenseStatus` / `ProsecutionStrengthState` / `IncidentTimelineEntry` / `RepeatCaptureSummary` / `VenueIdentityState`. If a CRM screen renders off these, it will always show empty/default state against the live backend. (`mapPortalReportToCase` in `prototypeApi.ts` partially populates some of these from the *portal* shape — moot per §2.)

---

## 4. `contract` — the one forward-looking, fully-wired field

Mirrors the server's CRM evidence contract 1:1 (full spec: [`ReportContract.md`](../server/ReportContract.md)). Four nullable FKs, each paired with a resolution object so null is never silent:

| FK | Owner | Default status |
|---|---|---|
| `matched_track_id` | pipeline | `unresolved` / `catalog_not_connected` |
| `venue_id` | pipeline | `unresolved` / `venue_not_resolved` (resolved if Phase 2 venue match succeeds) |
| `rights_owner_org_id` | analyst | `pending_analyst_review` / `rights_catalog_not_connected` — never auto-resolves (no registry wired) |
| `merchant_master_id` | analyst | `pending_analyst_review` / `merchant_master_not_connected` — never auto-resolves |

Resolution object shape: `{ status: 'resolved'|'unresolved'|'pending_analyst_review', owner: 'pipeline'|'analyst', reason: string, resolved_value, resolved_at }`.

`contract.crm_readiness` is derived, not authoritative — `{ is_case_ready: true /* always, single-report model */, case_model: 'single_report', case_grouping_key, missing_resolution_fields: string[], analyst_required_actions: string[] }`.

**`case_grouping_key` is the submission id** (D2 in the contract: `case_grouping_key = submission_id`). This is the only place the Case object exposes the submission id — see §5, you need it.

`contract.processing_stage`: `'quick_id'` (ACRCloud-only, fast) or `'full'` (Demucs + forensic + venue-corroboration pass has run).

---

## 5. Two CRM actions call deleted routes — not a drop-in fix

`backfillPrototypeCaseAudioDeconstruction` and `reevaluatePrototypeCase` (`src/lib/prototypeApi.ts:513`, `:536`, wired to live buttons in `src/App.tsx:648` and `:692`) call:

- `POST /api/authority-prototype/cases/:id/audio-deconstruction`
- `POST /api/authority-prototype/cases/:id/re-evaluate`

**Both routes are gone.** They were deleted as confirmed-dead legacy code (they operated on the empty `caseLedger`). Calling them today 404s — these two buttons are currently broken in production. Confirmed: `grep -n "authority-prototype" ../server/index.js` shows only the two routes in §1 remain.

The intended replacements exist, but **swapping the URL alone will not work** — three things differ simultaneously:

| | Old (dead) call | New endpoint |
|---|---|---|
| **ID type** | report id (`caseId` = `Case.id`) | **submission id** — `POST /api/admin/v2/submissions/:id/process-advanced` and `.../reprocess` both do `prodFindSubmission(data, submissionId)`, not a report lookup |
| **Auth** | none sent | `requireAuth` + `requirePlatformAdmin` — JWT with `isPlatformAdmin: true`, obtained via `/api/auth/login` (§2) |
| **Response shape** | synchronous `{ case: <updated Case> }` | `{ queued: true, submission_id, demucs_backend }` — async; the processing job is queued, not finished, when the response returns |

To actually wire these up, the CRM needs to:
1. Resolve the submission id from `case.contract.crm_readiness.case_grouping_key` (per §4) — there is currently no more direct field.
2. Add a portal-admin auth flow (login form collecting email/password/TOTP, store the JWT, send as `Authorization: Bearer`) — there is currently zero portal-auth UI in the CRM.
3. Change the UI from "click → see updated case" to "click → queued → poll `GET /cases` until `processing_stage` flips to `'full'` (or the relevant report fields change)."

Endpoint reference (`../server/index.js:8727`–`8805`, all `requireAuth, requirePlatformAdmin`):
- `POST /api/admin/v2/submissions/:id/process-advanced` → `{ queued, submission_id, demucs_backend }`
- `POST /api/admin/v2/process-advanced/batch?status=identified,needs_advanced` → `{ queued: <count>, references: string[], demucs_backend }`
- `POST /api/admin/v2/submissions/:id/reprocess` → alias for the above, `{ queued, submission_id }`
- `GET /api/admin/v2/hardening-summary` → fleet-wide GPS-track-signing / venue-commitment adoption counts
- `GET /api/admin/abuse-queue` → `{ installs, rejectedSubmissions }` from `production.device_installs` / `production.submissions`
- `GET /api/admin/rewards/overview`
- `POST /api/admin/reports/:id/rescore` → re-runs visual/forensic rescoring on a report id (this one *does* take a report id)

This is presented as a decision, not a fix applied here: either build the three changes above into the CRM, or remove/disable the two buttons until that auth + polling work is scoped.

---

## 6. Schema — `production.*` tables

Canonical source: [`productionSchema.js`](../server/productionSchema.js) (row factories — every field always present, snake_case, 1:1 future-Postgres columns). Tables: `mobile_users`, `device_installs`, `capture_sessions`, `submissions`, `assets`, `venues`, `reports`, `processing_jobs`. The CRM never reads these directly (no DB access) — they're here so the Case-shape mapping in §3 is traceable to its source.

- **`submissions`** — one per capture. Carries `media_sha256`, `signature_status`, `gps_track` / `gps_track_analysis`, `radio_context` (full lossless Wi-Fi/BLE bundle), `selected_venue_context` (the snitcher's declared venue, quarantined — see `captureContext.js` `reconcileContext`), `raw_video_asset_id`, `derived_audio_asset_id`.
- **`reports`** — one per submission today (`case_grouping_key = submission_id`, D2 in the contract — no corroboration clustering yet). Full field list + resolution-object contract: [`ReportContract.md`](../server/ReportContract.md).
- **`assets`** — `object_key` is the path served at `/media/<object_key>` (static, `../server/index.js:432`). `kind`, `mime_type`, `sha256`, `size_bytes`.
- **`venues`** — `place_provider_id`, `name`, `address`, `city`, `location: {lat,lng}`. Upserted as captures arrive; `venue_id` on a report is null until Phase 2 venue-matching resolves it.
- **`device_installs`** — `public_key` (signing key), `abuse_score` (currently always `0` — abuse scoring is deliberately deferred), `mobile_user_id`.
- **`mobile_users`**, **`capture_sessions`**, **`processing_jobs`** — not currently surfaced through any CRM-facing endpoint.

Mobile capture write path (`/api/mobile/v2/capture/submissions*`, `/api/mobile/capture/install|session*`, all `requireMobileAuth`) is what produces the rows above — the CRM never calls these directly, listed only for traceability: `../server/index.js:7449`–`7980`.
