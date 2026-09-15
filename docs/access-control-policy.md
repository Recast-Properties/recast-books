# Recast Properties LLC — Access Control Policy

Version 1.0 · Effective 2026-09-15 · Owner: Paul Bjork, Managing Member

## 1. Purpose and scope

This policy defines who may access Recast Properties LLC's production systems and financial data, how identity is verified, and how access is granted, reviewed and removed. It covers:

- The bookkeeping application at books.recast-properties.com (Netlify site, serverless functions, data stores)
- The company's Google Workspace: accounts, the accounting workbook in Google Sheets, the document archive in Google Drive, and mail
- The Google Apps Script service that is the sole writer to the accounting workbook
- Bank data obtained through Plaid
- Third-party API credentials (Anthropic, Plaid, Netlify, Google Cloud)

Recast Properties LLC has one managing member and no employees. Two outside parties (a financial partner and the company's accountant) receive read-only access to specific reports.

## 2. Principles

1. **Least privilege.** Every person and every system component gets the minimum access its role requires.
2. **One identity.** All human access is through a Google Workspace account owned by the company. There are no shared passwords and no local user accounts.
3. **Secrets never live in code.** API keys, tokens and signing secrets are held only in the hosting platform's secret store and are set by the owner. Source repositories exclude them.
4. **Every write is attributed.** The ledger is append-only. Each entry records who or what posted it and when; corrections are reversing entries, never deletions.

## 3. Identity and authentication

- Users sign in to the bookkeeping application with Google Sign-In. The application verifies the Google ID token's signature, issuer, audience, expiry and verified-email status before issuing a session.
- Sessions are signed tokens valid for at most 12 hours, after which the user must sign in again.
- Only email addresses on the application's allowlist (the Users register) receive a session. An unknown address is refused with no session issued.
- Google Workspace accounts are required to use 2-Step Verification.
- Non-human access uses dedicated credentials: a Google service account for the application's Google access, and per-service API keys. Each automated component has its own key so its activity can be identified and revoked independently.

## 4. Roles and permissions

| Role | Who | Permissions |
|---|---|---|
| Owner | Managing member | Full access: post and void entries, manage properties, vendors, bank connections, settings and users; deploy the application; hold all secrets |
| Partner | Financial partner | Read-only: loan ledger and project results that concern the partner |
| Accountant | Outside accountant | Read-only: all reports and the ledger |

Permissions are enforced server-side on every request; the user interface hides but does not decide.

## 5. Production assets and who can reach them

| Asset | Access |
|---|---|
| Netlify site, functions, environment secrets | Owner's Netlify account only |
| Google Cloud project and service account | Owner only |
| Accounting workbook (Google Sheets) and Drive archive | Shared only with allowlisted Workspace accounts, per role above |
| Apps Script writer | Deployed and administered by the owner; callable only with a shared secret held in the hosting platform; the only component permitted to write to the workbook |
| Plaid client credentials | Stored as production-only secrets on the hosting platform; never in source, the browser, or the workbook |
| Plaid access tokens | Stored server-side in the application's data store; never sent to the browser or written to the workbook |
| Bank credentials | Never touch the company's systems. Bank accounts are connected by the owner inside Plaid Link. |

## 6. Granting, changing and removing access

- Only the owner grants access, by adding an email address and role to the Users register in the application. Access is limited to the roles in section 4.
- A role change takes effect on the person's next request.
- Access is removed by marking the user removed in the Users register (effective at the next request, and in all cases within 12 hours when the current session expires) and, for any departing person, by suspending or deleting their Google Workspace account, which ends Google sign-in immediately.
- When a person with knowledge of any secret loses access, the affected secrets are rotated.

## 7. Secrets and keys

- Secrets are set by the owner through the hosting platform's command-line tool into the production context only, and are never printed, emailed or committed.
- Each automated workload uses its own API key. Keys are rotated on suspected exposure, when a person with access departs, and when a key's expiry approaches.
- Sessions can be invalidated for all users at once by rotating the session signing secret.

## 8. Review and monitoring

- The owner reviews the Users register, the list of active API keys, and the list of connected bank accounts at least annually, whenever a role changes, and whenever the quarterly trial balance is sent to the accountant.
- The ledger records the actor (`posted_by`) and time (`posted_at`) of every entry. Automated postings are attributed to the system component that made them and are distinguishable from human postings.
- Financial data is reconciled monthly against bank statements; unexplained differences halt the close.

## 9. Incident response

On suspected compromise of an account, key or device: rotate the affected secrets, rotate the session signing secret, suspend the affected Workspace account, review the ledger for unattributed or unexpected entries, and disconnect and reconnect any affected bank connection through Plaid.

## 10. Maintenance

This policy is reviewed annually and whenever the systems it covers change materially.

Approved: Paul Bjork, Managing Member, Recast Properties LLC — 2026-09-15
