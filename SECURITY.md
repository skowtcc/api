# Security Policy

If you believe you have found a security issue in skowt.cc or its source, this is how to report it.

## Reporting a vulnerability

Send a report to **marcel@antifield.com**. Encrypt with PGP if you prefer; public key on request.

Please include:

- A clear description of the issue and the impact you believe it has.
- Steps to reproduce (request payloads, account roles required, browser state, etc.).
- Any proof-of-concept payload or script you used.
- The earliest and latest times you observed the behaviour, if known.

You do not need to do anything else to disclose. Do not file a public GitHub issue or pull request for security findings.

Response time: **TBD**. A target will be added here once contribution volume can be predicted. Until then, reports are read and triaged on a best-effort basis by a solo maintainer.

## Scope

In scope:

- The hosts **skowt.cc** (web app) and **den.skowt.cc** (API).
- This repository's source code.

Out of scope:

- **dev.skowt.cc** and any other non-production host. Staging carries seeded data and weaker hardening and is not a meaningful production proxy.
- Third-party services we depend on (Better Stack, Turso, Cloudflare, Discord). Report findings in those products to the vendor directly.
- Issues that require physical access to a user's device, or that depend on the user installing malicious software, browser extensions, or accepting MITM certificates.
- Social engineering against Antifield staff or skowt.cc users.
- Findings that depend on outdated browsers we do not target (anything not in the latest two major versions of evergreen browsers).
- Vulnerabilities in dependencies that we cannot patch because no upstream fix exists yet. Report those to the dependency maintainer; we will track the upstream fix.

## Safe harbour

We will not pursue civil or criminal action against good-faith research that:

- Stays within the in-scope list above.
- Avoids privacy violations, data destruction, and service degradation for other users.
- Stops at the minimum interaction needed to confirm the vulnerability.
- Reports the finding privately via the channel above and gives a reasonable window for a fix before any public disclosure (default: 90 days from report).

If your research strays from those bounds, reach out before proceeding.

## What not to do

- Do not run automated vulnerability scanners against the production hosts. The traffic these generate is indistinguishable from real abuse and will be rate-limited or blocked.
- Do not attempt to access, modify, or exfiltrate data belonging to other users. A demonstration that the access _would have been possible_ is enough.
- Do not deploy denial-of-service payloads, including resource exhaustion via expensive queries, large file uploads, or login brute-forcing.
- Do not pivot from one finding to escalate against other systems we operate or to systems we depend on.
- Do not publish the finding before we have responded and agreed a disclosure window.

## Severity

We grade reports qualitatively rather than by CVSS:

- **Critical**: exploitable without authentication, leaks or modifies data across users, or grants persistent access.
- **High**: exploitable by an authenticated user to escalate role, access another user's data, or bypass moderation.
- **Medium**: exploitable by an authenticated user against their own scope in a way that breaks an explicit guarantee (e.g. bypassing a rate limit, reading data they should not see in their own account).
- **Low**: defence-in-depth gaps that require a chain of other issues to weaponise, or hardening recommendations.

We may regrade your initial assessment after triage; the grade does not affect whether the report is read.

## What gets credit

If your report leads to a fix, we will credit you in the release notes and (with permission) in this file. If you prefer to stay anonymous, say so in the report.
