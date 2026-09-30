# Static Application Security Testing (SAST) — Mazzado

**Owner:** Mazzado engineering
**Last reviewed:** 30 September 2026
**Audience:** Bank al Etihad / Staq production-access review, and whoever maintains this next.

---

## 1. Tool

**Semgrep**, pinned to `semgrep/semgrep:1.86.0`, run in GitHub Actions.

Semgrep rather than SonarQube. SonarQube needs a server to host, keep patched and
secure — a standing cost and one more system inside our trust boundary for a team
this size. Semgrep runs in CI with no infrastructure, and its rules are files in
this repository, so what we scan for is reviewable in the same pull request as
the code it scans.

There is no separate "security scanning environment" to compromise, and no
scanner credentials to leak. That is a deliberate choice, not an omission.

## 2. Configuration

Defined in [`.github/workflows/security-sast.yml`](../../.github/workflows/security-sast.yml).
Two layers:

**Public rulesets** — maintained by Semgrep, updated upstream:

| Ruleset | Covers |
|---|---|
| `p/javascript`, `p/typescript` | language-level defects |
| `p/react` | XSS sinks, unsafe rendering |
| `p/nodejs` | injection, path traversal, unsafe deserialisation |
| `p/secrets` | credentials committed to the repository |
| `p/owasp-top-ten` | the OWASP list |
| `p/ci` | workflow injection, unpinned actions |

**Our own rules** — [`.semgrep/mazzado.yml`](../../.semgrep/mazzado.yml). Each one
was written after a real incident or a real review finding in this codebase, not
copied from a template:

| Rule | What it prevents |
|---|---|
| `mazzado-hardcoded-admin-identity` | An email or uid literal granting production admin |
| `mazzado-client-writes-money-state` | The browser writing a payment or settlement field |
| `mazzado-payer-identifier-to-analytics` | A payer's CliQ alias, mobile or IBAN reaching analytics |
| `mazzado-secret-in-source` | Private keys, client secrets, API keys in source |
| `mazzado-bank-name-literal` | A hardcoded bank name drifting from the account record |
| `mazzado-dangerous-html` | `dangerouslySetInnerHTML` on user-supplied content |

The bank-name rule exists because the receiving account has moved banks twice,
and each move left literals behind in customer-facing copy that named the wrong
bank. It is a correctness rule with a money consequence, which is why it is in
the security scan rather than a linter nobody runs.

## 3. Cadence

| Trigger | Why |
|---|---|
| Every pull request | A finding is cheapest to fix on the branch that introduced it |
| Every push to `main` | Catches anything merged by another route |
| Weekly, Mondays 04:00 UTC | Semgrep adds rules after our last commit. A repository with no pushes is not a repository with no vulnerabilities. |
| On demand (`workflow_dispatch`) | For a review or an audit request |

## 4. The build fails on a finding

`semgrep scan --error` exits non-zero on any result, which fails the check on the
pull request.

This is deliberate. A scanner whose output is advisory becomes a list nobody
reads: findings accumulate, the count becomes background noise, and the report
handed to a reviewer is a backlog rather than a result. Failing the build keeps
the number at zero by construction, because the only moment it can rise is a pull
request that someone is already looking at.

## 5. Remediation process

1. **The build fails.** The finding is on the pull request, annotated on the
   exact line, before review.
2. **The author fixes it on that branch.** Not a ticket, not later — the pull
   request cannot merge red.
3. **If it is a false positive**, the rule is narrowed or the path excluded in
   `.semgrep/mazzado.yml`, *in the same pull request*, with a comment saying why.
   Blanket `nosem` suppressions in code are not used: a suppression in the scan
   config is visible to the next reviewer, one buried in a source line is not.
4. **If it is real but cannot be fixed immediately** — a dependency issue, or a
   change too large for that branch — the pull request does not merge. Splitting
   the fix out is the normal answer; shipping past a known finding is not.
5. **Findings from the weekly run** (a new upstream rule matching old code) open
   as an issue and are fixed on their own branch. These do not block unrelated
   work, because the code was already in production before the rule existed.

Every result is published to the repository's **Security** tab as SARIF, and kept
as a downloadable artifact for **90 days**. That artifact is the report.

## 6. What SAST does not cover

Stated plainly, because a scan report presented as complete assurance is
misleading:

- **Firestore security rules** are not JavaScript and are not covered by these
  rulesets. They are the real authorisation layer in this system. They are
  reviewed by hand on every change and asserted by the test suite — see
  `firestore.rules` and the guard tests in `src/constants/`.
- **Business-logic authorisation** — who may settle an order, who may see a
  counterparty's phone — is not a pattern a scanner recognises. It is covered by
  unit tests against the server functions (3,500+ tests, run on the same CI).
- **Dependency vulnerabilities** are `npm audit`'s job, not Semgrep's.
- **Secrets already committed in history** would not be caught by scanning the
  current tree. Nothing of that kind is known to be in this repository; the
  `.gitignore` refuses `*.crt`, `*.pem`, `*.key`, `*.p12`, `*.pfx` and
  service-account JSON.

## 7. Current status

The scan is configured and runs on every pull request. The first full-repository
result and the remediation of anything it finds are tracked in the pull request
that introduced this policy.

**One finding is already known and is being remediated separately:** a hardcoded
administrative identity (an email literal and a uid literal) appears in Cloud
Functions, Firestore rules, Storage rules and the client. It is covered by the
`mazzado-hardcoded-admin-identity` rule above and is addressed in
[`access-control-policy.md`](./access-control-policy.md). It is named here rather
than left for the scan to surface, because a policy document that omits a known
finding is worth nothing.
