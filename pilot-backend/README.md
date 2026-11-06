# CardVault private pilot — 50 AI scans per tester

This folder contains a **not-yet-deployed** Cloudflare Worker that lets invited CardVault testers scan card photos using the owner's Anthropic API subscription **without exposing that subscription key in client-side code**. Each invitation receives 50 successful scans. Failed scans restore the invite allowance, while any actual Anthropic token costs are still counted.

## What is implemented

- Cryptographically random, opaque invitations. Only SHA-256 hashes are stored on the server.
- 50 successful scans per invitation, enforced by database transactions (not localStorage).
- Global pilot safety limits: **1,000 successful scans** and **$20 measured/reserved Anthropic usage**.
- Scans use **Claude Opus 4.6**, max 500 output tokens, image longest side <=600 px and JPEG payload <=200 KB.
- Atomic scan reservations, success/refund accounting, five-minute cleanup for abandoned attempts.
- Actual Anthropic input and output tokens counted per scan, costs calculated in micro-dollars at **$5 input/$25 output per million tokens** (update if Anthropic pricing changes).
- Administrator-only invite generation, usage summary and revocation. Invite codes are shown **once** when created.
- The existing CardVault production app is **not connected**. The new scanner is only wired to the `/dev/` test app.

## What you need before deploying

1. A **Cloudflare account** with Workers and D1 available.
2. Your own **Anthropic API key** with available API credits.
3. Node.js on a computer (or another supported Wrangler deployment workflow).
4. A strong random administrator token. Do **not** put these secrets in GitHub, README files, a chat message, or the browser code.

### Set up from this folder

```bash
npm install --no-save wrangler
npx wrangler login
npx wrangler d1 create cardvault-pilot
```

Copy the `database_id` returned by Cloudflare into the `[[d1_databases]]` binding in `wrangler.toml`, replacing `REPLACE_WITH_YOUR_D1_DATABASE_ID`.

```bash
npx wrangler d1 execute cardvault-pilot --remote --file=./schema.sql
npx wrangler secret put ANTHROPIC_API_KEY
npx wrangler secret put ADMIN_TOKEN
npx wrangler deploy
```

Use the Cloudflare prompts to enter each secret, not command line flags. Keep the displayed `https://...workers.dev` URL. If you deploy under another name, update the config and commands accordingly.

**Do not publish public invite codes or put the admin token into the GitHub repository.** The Worker accepts CORS calls from `https://rorymallard78-design.github.io`. This is a convenience, not authorization; possession of a code authorizes its scans. Do not hand out the same code to multiple people.

### Create test invitations

Execute the commands on your trusted computer, substituting the actual Worker URL. The admin token belongs only in the HTTP Authorization header on this command, not in a public web page.

```bash
curl -X POST "https://YOUR_WORKER.workers.dev/v1/admin/invites" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"label":"Tester 01"}'
```

The response includes a code such as `CV-<32-hex-characters>`. Send a separate code privately to each tester. The code cannot be retrieved later; create a replacement if it gets lost.

To inspect total spend, quotas, and usage:

```bash
curl "https://YOUR_WORKER.workers.dev/v1/admin/stats" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

To revoke one invitation:

```bash
curl -X POST "https://YOUR_WORKER.workers.dev/v1/admin/revoke" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{"id":"INVITATION_UUID_FROM_ADMIN_STATS"}'
```

### Connect CardVault Development

1. Open `https://rorymallard78-design.github.io/cardvault/dev/`.
2. Open **Settings → AI Pilot — 50 Free Scans**.
3. Paste the Worker URL and the tester's invitation code.
4. Press **Save & Check Allowance**. It should show 50 remaining.
5. Add a card using its photo. Verify player and other card fields prefill, and quota decreases to 49.

**No back-end has been deployed by committing this code.** Until the Cloudflare Worker is deployed and secrets configured, scanning through invitation codes will not work. The currently working production app is deliberately unaffected.

## Acceptance checks before inviting outsiders

- New code reports 50 remaining; invalid/revoked code is denied.
- A 600px JPEG scans successfully; dimensions above 600px / files above 200 KB are denied.
- One good scan decrements the remaining count by 1.
- Batch scan counts each card separately and cannot exceed 50.
- A failed scan restores the invite's allowance.
- Two simultaneous requests cannot exceed 50 or the global $20 / 1,000-scan limits.
- Two different invite codes are independent.
- Anthropic key is not visible in developer tools or GitHub Pages code.
- Usage and measured estimated cost appear in admin stats.
- Existing production inventory and other features are unchanged.

## Limitations / hardening for a larger rollout

This is a **private beta**, not a multi-user production SaaS. Invitation codes are bearer credentials, not identity verification. There are no user accounts, email validation, password reset, or persistent server-side inventory. Photos are sent to Anthropic for processing, but are not retained in the D1 scan ledger. Actual billing should be reconciled with the Anthropic console (especially if request-level usage headers, token pricing, or cache pricing change). Anthropic may still bill a model response whose JSON is unusable; that cost is included if usage is returned. Cloudflare fees, if applicable, are separate.

If the Worker fails after Anthropic processes a call but before the usage response can be recorded, the ledger cannot measure that bill. Treat the $20 ledger budget as a safeguard rather than a guaranteed Anthropic billing cap; additionally set spending limits/alerts in your Anthropic account.
