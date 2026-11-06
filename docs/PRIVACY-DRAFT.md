# CardVault beta privacy notice — DRAFT (review before publication)

**DRAFT ONLY — DO NOT REPRESENT AS AN ACTIVE OR FINAL PRIVACY POLICY.**
The owner must supply legal business name, contact email, effective date, and confirm all hosting/AI services and retention practices before publishing.

## What the current web application stores

CardVault stores card metadata (player, sport, year, set, variation, grade, cert number), estimated values, costs, sale details, photos, Chase Cards, grading submissions, and optional receipt records **in the browser's local storage and IndexedDB on the user's device**. This does not constitute automatic cloud backup or synchronization.

The user can export a complete JSON backup including photos. A saved backup is a potentially sensitive document: keep it private and off-device. Restoring a backup replaces the collection in that browser after confirmation.

## External processing initiated by the user

- **AI identification and other model features:** When enabled, photos, card metadata and prompts are sent to the AI provider. The initial private beta plans to route identifying scans through a secured server so users never receive the owner's Anthropic key. Some legacy BYO-key operations still call an AI API directly from the browser. **Do not promise this is fixed until the backend is deployed and verified.**
- **Collection sharing:** If a user requests a share link, selected card details and photos may be uploaded to GitHub Gists. An unlisted Gist is not access-controlled: anyone with the link may view it. Do not use sharing for confidential notes, passwords or personally identifying information.
- **External links:** Links to card marketplaces, product releases, sports card resources and other websites follow those destinations' privacy rules.
- **PWA hosting:** GitHub Pages serves the application and may process normal web access data such as IP addresses for delivery and security under its own policies.

## What the present version does NOT provide

No browser-to-cloud synchronization, user accounts, or subscription billing. No centralized encrypted cloud vault. No guaranteed ability to recover records after clearing browser data without a separate backup.

## Account information and subscriptions (future)

Before adding email accounts, identity providers, Stripe, Apple or Google billing, update this notice to describe identifiers, transaction metadata, subscription status, customer support communications, retention windows, user rights and deletion methods. Do not collect full card numbers on CardVault servers.

## Children's privacy

Initial beta is intended for adults. Do not market the service to children or collect children's information until age applicability and consent requirements have been assessed.

## Contact and rights

PLACEHOLDER — verified business name, support contact, privacy contact, retention/deletion requests and effective date still needed.

## Release gate

Obtain legal review for the privacy statement and any Terms of Service. Confirm the actual system behavior before posting claims about encryption, account deletion, retention, analytics, AI provider training, or automatic backups. Never imply users have a cloud account when their data is only local.
