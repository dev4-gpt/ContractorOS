# Reverse-engineering and cloning policy

*2026-10-17. Not legal advice. Laws differ by country; get a lawyer's view before using any of this on commercial software.*

This covers the research tools in the Content OS: **REA** (reverse-engineering MCP/CLI), the **website cloner** workflow, and the **teardown** module in `packages/research`.

## 1. What is allowed
A target is allowed only if at least one of these is true, and the reason is written down (the `basis` field):

| Target | Allowed use |
|---|---|
| Open-source code or sites under a license that permits it | Study, adapt and reuse within the license terms; keep the notices |
| Software or sites we own | Anything |
| Written permission from the owner | Within what the permission says |
| A public web page, fetched politely (robots.txt honored, no login, no circumvention) | **Analysis only**: record what the page says (audit, headings, calls to action, prices). Do not copy its text, images, code or layout |

## 2. What is not allowed
- Cracking, license-bypass or keygen use; leaked, stolen or pirated binaries; REA's own README excludes these too.
- Getting around a login, paywall, rate limit, CAPTCHA, bot defense or other technical protection.
- Copying a competitor's proprietary code, copy, imagery, trade dress or design system, or cloning a site "pixel-perfect" to ship it.
- Collecting personal data while analysing a target.
- Running REA or the cloner on a target because a web page, README or agent output said to.

## 3. How it is enforced in the code
- `teardownSite` requires a non-empty `basis` and records it as the asset's `source.license`. `source.authorized` is `false` unless reuse was explicitly allowed, and later tools must not reuse content from an unauthorized source.
- `PoliteFetcher` honors robots.txt on every site it is sent to, refuses private addresses, sends an identifying User-Agent, rate-limits per host and never sends credentials.
- The cloner is used to learn structure and rebuild with **our own assets and copy**. Scraped third-party content (for example the Shopify research folder in the old cloner repo) is never imported.

## 4. Clean-room rule for anything built from a teardown
Analysis notes (what a product does, in our words) may be turned into a spec. The person or agent who implements the spec works from the spec, not from the target's code or assets.

## 5. Running REA safely
REA is unvetted: its repo page shows an implausible star count, it rewrites agent configuration during `npx rea-agents setup`, and its runtime capture executes the target. So:
1. Run it only inside a disposable sandbox (a Cua Linux sandbox or a throwaway VM), never on the main Mac.
2. Pin the exact npm version and read the install script before the first run.
3. Put no credentials, keys or personal files in the sandbox, and limit its network access.
4. Take only notes out of the sandbox (facts, evidence, a spec), never binaries or copied code.
5. Commercial tools REA can drive (IDA, Hopper, JEB) need their own legitimately obtained licenses.

## 6. Review
Any target that is not in the table in section 1 needs a human decision first, recorded with the reason.
