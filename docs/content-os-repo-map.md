# Content OS: repo map and merge plan
*Written 2026-10-16. Working name: Reforge (see naming options in chat). TokenForge is excluded; REA is used as an external tool.*

**Depth of reading.** Code-level: wiza, prospect-previews, MetaScope (server routes), agentos (README, layout, sizes). Skill/doc-level: websitegenerator, ai-website-cloner. README/tree-level only: local-AgenticOS (1,406 files, 289 API route files not opened). GitHub's rate limit stopped further reads, so the local-AgenticOS column below must be re-checked in a second pass.

## 1. What each repo really is

| Repo | What it actually is | Size / maturity | License | Reuse value | Main risk |
|---|---|---|---|---|---|
| **wiza** | Node (no deps) UI + API for a generative-video workstation: shot list, character vault, camera-rig controls, timeline. **Runs in simulation mode**; no model is called unless `WAN_INFERENCE_ENDPOINT` is set. In-memory data. | 7 files, ~1.7k lines, has tests | MIT | The UI concept and data model (shot, character, camera pose). Little else. | README promises far more than the code does; targets Wan 2.1 (we plan Wan 2.2) |
| **ai-website-cloner** (private) | Fork of JCodesMore's MIT template: a Next.js 16 + shadcn scaffold plus an agent skill (`/clone-website`) duplicated for ~12 agent tools. The skill drives browser MCP, extracts CSS/assets per section and dispatches builder agents. | 89 files, Node >= 24 | MIT (upstream) | The extraction workflow and the "spec per component" method. The 12 duplicated agent-config folders are noise. | Default scope is "pixel-perfect, no customization". `docs/research/www.shopify.com/` holds scraped third-party articles and datasets. Do not carry that over. |
| **MetaScope** | React + Express SEO meta-tag analyzer: fetch URL, Cheerio parse, score, social previews, AI suggestions (Hugging Face Flan-T5), Firebase auth/Firestore. | 81 files, Replit-era | not stated | Analysis logic and score UI as a "site audit" module. | `/api/analyze` fetches any user-supplied URL with only `new URL()` validation, so it can be pointed at internal addresses (SSRF). Old stack (Firebase, Flan-T5). |
| **websitegenerator** | A Codex skill, not an app: find weak local-business sites, fill an electrician template (Danish content), deploy to Vercel, **submit the contact forms automatically**, with a ledger and a dashboard (`tools/control.py`, port 4310). | 96 files | not stated | Template-fill pipeline, ledger concept, parallel-worker coordination notes. | Autonomous mass form submission with a fixed message and "skip CAPTCHAs". The skill and `settings.json` name **Albert Shiney / albert@shiney.ai** and a Vercel scope `albertshineys-projects`. Confirm whether that is a copied skill or an alias. |
| **prospect-previews** | TypeScript CLI (~1.3k lines, 8 test files): fetch public details politely, human reviews, generate a labeled concept site, write an identified outreach message, ledger with do-not-contact, hand replies to a CRM. | v0.1.0, tests present | MIT | **Highest.** The compliance model (robots.txt, netguard against private IPs, source-per-fact, no invented content, one contact per business, opt-out) is exactly what a famous product needs. | Discovery and weak-site judging are deliberately not built |
| **agentos** (GitHub) | Python FastAPI tool registry + MCP server + SDK/CLI: semantic tool search, OAuth2 flows, execution proxy, audit log. 5 SaaS integrations (Slack, Stripe, GitHub, Notion, Linear) plus Trello/Discord-style tool schemas. | ~1.5k lines in 5 core files, PRD, tests, Dockerfile | LICENSE present | The registry plus MCP layer becomes the Content OS tool gateway and replaces `manifest/tools.yaml` over time. | Python, while most other pieces are TypeScript |
| **local-AgenticOS** (README level) | "Veloce AgenticOS": local dashboard (Next.js, `src/app/api`) with Obsidian memory, agent hub (Claude, Codex, Hermes, OpenClaw, Kimi), voice (Jarvis), Paperclip company org, **content studios already inside**: Thumbnail, Video (+ avatars), Music (Suno), Open Design, OpenMontage, Radar (news to content ideas), Leads (Hunter/Apollo/Firecrawl), Web Studio. Also tenants, billing (BYOK vs managed wallet, $2,500 setup + $1,250/mo), Supabase, Stripe skills. | 1,406 files, heavy docs | not checked | Memory, agent hub, auth/tenancy and several studios already exist | Complexity; a public-production gate is still closed per its own README |

Note: the local folder `~/Documents/Codex/Projects/AgentOS` is the AgenticOS install guide, not the `agentos` GitHub repo.

## 2. Overlap with local-AgenticOS (needs the second pass)
Already in AgenticOS by README: memory (Obsidian), agent hub, thumbnails, video + avatars, music, design studio, news radar, lead finding, web studio, tenants/billing.
Not found there by README: competitor/platform analysis (REA, MetaScope), site cloning, a content asset database with versions and lineage, the 13 Craft apps, Tariff models on GPU workers, compliant outreach.
So the Content OS adds: **research/reverse-engineering, a content database, real media engines, and compliant distribution**, and **reuses** AgenticOS memory, auth and agent hub.

## 3. Target shape (one monorepo, shared memory with AgenticOS)

```
reforge/                      # replaces ContractorOS repo
  packages/
    core/          asset + version + lineage schema, job queue client, memory adapter
    research/      metascope (audit), rea client, deerflow, competitor-intake workflow
    web/           cloner workflow, site templates, template-fill generator, preview hosting
    outreach/      prospect-previews (kept intact), ledger, CRM hand-off
    studio-video/  wiza UI -> real ComfyUI/Wan 2.2 backend on GPU workers
    studio-media/  Craft apps (MCP/CLI), Z-Image, InfiniteTalk, PaddleOCR
    gateway/       agentos registry + MCP server (tool discovery for all packages)
    adapters/agenticos/   shared memory + agent-hub bridge
  infra/  manifest/  docs/
```
Shared data model (minimum): `Asset{id, kind, uri, hash}`, `Version{asset, parent, tool, params, created}`, `Lineage` edges, `Source{url, license, authorized}`. Every module reads and writes through `core` and logs to the shared memory.

## 4. Decisions needed from you
1. **Outreach policy.** Keep `prospect-previews` rules (human reviews and sends, labeled concept site, identified sender, opt-out) as the product default. Treat `websitegenerator`'s autonomous form submission as out of scope. Mass unsolicited submissions risk site-terms and messaging-law violations, and one incident would hurt a product meant to be famous.
2. **Cloner policy.** Allow cloning only for sites you own or are authorized to study, or use it in "learn structure, rebuild with your own assets" mode. Never ship third-party content (drop the Shopify research folder).
3. **Identity.** Replace every hardcoded sender/Vercel identity with config.
4. **Language.** TypeScript core with the Python `agentos` gateway as a service, or port the gateway. I recommend keeping it a separate service.
5. **Is VoiceAI (a lead-qualifying voice agent) in scope?** Prospect-previews is built to hand leads to a voice agent like it.

## 5. Merge and deletion plan
1. Create the monorepo from `ContractorOS`. Import each repo with **git history preserved** (subtree or filter-repo), so nothing is lost.
2. Port in this order: `core` -> `outreach` (prospect-previews, nearly drop-in) -> `research` (MetaScope with a netguard fix) -> `web` -> `gateway` -> `studio-video` (real backend) -> `adapters/agenticos`.
3. For each ported module: tests pass in the monorepo, then the old repo's README points to the new location.
4. **Archive, don't delete.** Archiving is reversible; deleting is not and loses history and stars. Delete only after the module has run in the monorepo for a while and you have a backup (private mirror).
5. Never delete `local-AgenticOS`; it stays a separate product that consumes the Content OS.

## 6. Next steps
- Second pass on local-AgenticOS: list its content routes (`src/app/api`), the memory interface, auth/tenancy and the studios' backends. Needs the GitHub rate limit to reset.
- Write the shared schema (`packages/core`) and a one-page PRD.
- Pick the first end-to-end slice (suggested: audit a site with MetaScope-style analysis, generate a labeled concept site, produce an outreach draft for human review).
