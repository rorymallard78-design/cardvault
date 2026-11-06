# CardVault — private web beta readiness

Status: **NOT PUBLIC-LAUNCH-READY**. This is the release checklist and threat model for a small invite-only beta. Do not confuse code committed to a branch with a deployed or tested service.

## Scope and product decisions

- One website/PWA for iPhone, Android and desktop now; **defer Capacitor and store apps until after web beta**.
- Invite approximately 5–10 hobby collectors initially.
- Founding testers: invitation-based allowance of **50 AI identification scans**, with server-side accounting when the pilot Worker is deployed.
- After beta: **no free AI scans for new free users**. Proposed Free plan is manual inventory/basic tracking; paid Pro adds AI and advanced features. Plans, actual payments, and user accounts are **not yet implemented**.
- Users must retain ability to view and export their existing collections even after trial or cancellation.
- Keep original card/sale data unchanged and maintain export/restore compatibility.

## Threats and controls

| Risk | Current behavior | Needed for beta | Needed for public launch |
| --- | --- | --- | --- |
| Loss of collection | Browser-local data; complete JSON backup exists | Show clear export/restore guide, require backup test | Authenticated encrypted cloud sync and disaster recovery |
| Exposed API credentials | Browser localStorage and direct provider calls are present in legacy BYO mode | Deploy secure AI Worker; share no owner keys; review legacy BYO exposure | Remove browser-stored secrets, use server-held per-user credentials, monitor abusive requests |
| Shared links leak data | Read-only Gists can be viewed by anyone with link | Whitelist shared card fields, validate images and Gist URLs; no cost/notes | Share-permission model and expiring/revocable links |
| Cross-site scripting | Some template HTML built from user-provided strings | Escape text and attributes; no untrusted executable URLs, validate imported JSON | Full lint/CSP audit, secure DOM templates, independent review |
| Quotas can be bypassed | Client-side paywall would be trivial to bypass | D1-backed quotas and global cost safety cap, admin revocation | Authenticated entitlements and server-side authorization |
| Stored app access | Dev, beta and app share a web origin but use different storage keys | Do not direct testers to /dev/; never enter real credentials there | Separate staging origin; private app/backend boundaries |
| Old code exposed | Repository and shipped JS publicly readable | Do not ship secrets; restrict beta invites | Private source repo where possible, move valuable logic server-side |
| Payment handling | None | None needed for free private beta | Stripe for permitted web payments; Apple/Google in-app purchases and verified webhooks |
| Abuse / availability | Small beta Worker is not fully deployed | Rate limits, quotas, backend logs, error handling | Per-user monitoring, alerting, abuse response and incident plan |
| Privacy | No centralized collection storage; optional API/Gist transfers | Accurate privacy notice and opt-in sharing | Data access/deletion processes, retention policy, consent and privacy counsel review |

## Go/no-go gates for first external tester

- [x] Existing main app collection preserved; work performed in isolated Git branch.
- [x] Static security review and first input-escaping changes.
- [x] Help Center with features, data-protection instructions, and trial explanation added to review branch.
- [x] Static automated syntax and file-dependency checks added.
- [ ] Security pull request reviewed, smoke-tested manually on Android and iPhone, and merged.
- [ ] Fully deployed Cloudflare Worker with D1 database and Anthropic API key held in Worker secrets.
- [ ] Valid invitation code successfully scans a real card, returns fields and decrements 50→49.
- [ ] Confirm failures, retries, invalid codes, revoke, 50-scan exhaustion, global cap and batch scanning behavior.
- [ ] Resolve browser-stored personal API key handling for beta guests; never distribute owner API keys.
- [ ] Designate permanent tester web URL (not /dev/) and test upgrading from the trial to the intended paid flow without losing local data.
- [ ] New user tests backup/export and restore on a different browser/device.
- [ ] Publish accurate beta privacy statement and terms, with collection risk and third-party processing disclosures.
- [ ] Confirm mobile accessibility, camera permissions, photo storage, offline behavior, screen rotations, navigation and large imported collections.
- [ ] Verify Sentry/analytics or other telemetry is opt-in, minimal and excludes card photos, personal tokens and notes.
- [ ] Owner can revoke access and halt AI spending immediately.

### Important

A "global $20 budget" in the pilot D1 database is an application-level control based on returned token usage and reservations, **not an absolute Anthropic bill guarantee**. Configure account-level spending controls and alerts independently.

Users are not technically limited to free features yet. Do not advertise paid tiers or invite nontechnical paying subscribers until identity, entitlements and payment integration are operational.

## Beta test script

1. Open the designated trial URL in a new mobile browser with no prior CardVault data.
2. Read onboarding, add one manual card, upload a photo, enter cost/value and verify Dashboard.
3. Record a sale with price/fees, reopen Sold Tracker and confirm P&L.
4. Import several cards, edit, search, open Players, use Chase Cards and Hobby Pulse.
5. Enter unique pilot invite; verify 50 scans, scan a clearly identified card, correct mistaken fields before saving.
6. Export complete JSON backup; save it off-device. Restore in a second isolated browser and compare card and photo counts.
7. Test support/help, report a confusing screen and record a user task outcome.
8. Disconnect network and document which features still work.
9. Confirm loss or expiration of AI allowance never hides, edits, or deletes previous cards.

## Suggested beta metrics

Active testers, users who add 5 cards, scan attempts, successful scans, correction rate, mean tokens/cost per scan, sold records created, export/restore completion, support issues and serious defects.

## Launch rule

Never automatically replace or clear live data for an update. Promote code only after backup and import/restore test, static CI, device smoke checks, and a reviewed changelog.
