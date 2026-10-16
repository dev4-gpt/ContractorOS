# Content OS: repo map, overlap analysis and merge plan
*Rewritten 2026-10-16 after reading code. Working name: Reforge. TokenForge excluded; REA used as an external tool. Nothing has been merged, archived or deleted yet.*

## 0. How deeply each repo was read
| Repo | What I read | Not read |
|---|---|---|
| wiza | All files (7) | n/a |
| prospect-previews | README, package, config, source sizes | Source bodies of generate/extract/fetch (8 tests exist) |
| MetaScope | server/routes.ts structure, README, tree | Client components, storage, schema |
| websitegenerator | SKILL.md, references (production, outreach), settings.json, quick_site.py head, tool list | control.py, scout_screen.py, site_assets.py bodies; template React code |
| ai-website-cloner | CLAUDE.md, clone-website skill, package.json, tree, lead API route | Component code of the bundled demo site |
| agentos | README, PRD head, MCP server, route list, layout | Tool execution proxy (~line 655), OAuth code, tests |
| VoiceAI (StratosGTM) | README, tree, architecture summary | Orchestrator source, ARCHITECTURE.md, schema |
| local-AgenticOS | README, package.json, 52 API route dirs (counted), `lib/` file list (178), and in full or in part: contentOsVideoPilot, contentStudio, webStudio, vault, vaultWriter, vaultGraph, outreach, leads, pipeline, integrationHub, videoProjects | The other ~150 lib files, the `product-experience` app, `workers/`, `infrastructure/`, tests |
Clones were shallow and size-limited; large binaries were not fetched.

## 1. What each repo is (verified)
| Repo | Reality | License | Merge value | Problems |
|---|---|---|---|---|
| **wiza** | Zero-dependency Node UI + API. Simulation mode: in-memory character vault, fake generation, 4 hard-coded model entries (Wan 2.1, SkyReels-V2, Flux). Real backend only via `WAN_INFERENCE_ENDPOINT`. | MIT | Shot/character/camera data model and workstation UI; rewire to ComfyUI + Wan 2.2 | Not a working generator today |
| **prospect-previews** | TS CLI, ~1.3k lines, 8 test files. Fetch (robots.txt, netguard, 3 pages max), human review, labeled static concept site, identified message, ledger, DNC, CRM hand-off. | MIT | **Keep nearly intact.** Its DNC ledger becomes the shared suppression list. | Discovery not built |
| **MetaScope** | React + Express SEO tag analyzer (313-line routes file), Firebase + Flan-T5. | none stated (yours) | Little: `local-AgenticOS` already has a larger SEO pipeline (12 routes, ~1.4k lines, history, intelligence) | `/api/analyze` has no private-address guard (SSRF). **Recommend retiring, porting only social-preview logic if missing.** |
| **websitegenerator** | **Fork of albertshiney/websitegenerator** (`upstream` remote). Codex skill + Python tools (~1.3k lines) + one Danish electrician template. Template fill (name/phone/email/color), Vercel deploy per prospect, ledger, dashboard, fixed outreach submitted through contact forms. | **No LICENSE file** | Ideas only (template-fill, ledger, scout screening) | Without a license you have no right to merge Albert's code or template. Outreach text and sender identity are his (`Albert Shiney`, his Vercel scope). Message has no opt-out. Do not merge as code; reimplement the ideas, or get his permission. |
| **ai-website-cloner** (private) | Fork of JCodesMore's template. Scaffold (Next 16, shadcn) + agent skill for ~12 agent CLIs. The `src/` is a bundled demo site (editions/paintings), not generic. | MIT | The clone workflow (extract tokens/assets/behaviors per section, specs per component, parallel builders) as a skill | Contains `docs/research/www.shopify.com/` scraped content; do not carry over. Default policy is "pixel-perfect, no customization", so use in rebuild-with-own-assets mode. |
| **agentos** (Python) | Small FastAPI tool registry (842-line server), MCP shim, SDK, CLI, seed schemas. The standalone MCP tool-call helper is a **stub** (returns "invoked with arguments"). **Not the same project as local-AgenticOS.** | MIT | Optional external-tool gateway (OAuth + semantic search for SaaS tools) | Prototype quality; overlaps `integrationHub` in local-AgenticOS only partly |
| **VoiceAI / StratosGTM** | Real product: Express orchestrator, Neon Postgres, Stripe, AssemblyAI voice agent with 7 tools, AI-disclosure and recording-consent, CRM, ~40 test files incl. `contentFactoryEngine` and SSRF tests. | MIT | Voice front door and CRM for the Content OS; lead hand-off target | Repo is 29 MB mostly PDFs and agent-skill folders; own billing/tenancy. Has its **own content factory**. |
| **local-AgenticOS** | Large Next.js app. State is files: Obsidian vault (`Agentic OS/Memories|Journal|Pipeline|Web Studio`), plus JSON under `~/.agentic-os`. Includes content studios (below). | none stated (yours) | The host, the memory, the agent hub | Heavy; public gate still closed |

## 2. What local-AgenticOS already does (do not rebuild)
| Capability | Where | Size (lines) | Content OS decision |
|---|---|---|---|
| Memory/knowledge | `vault*.ts`: markdown search, daily memories, journal, wikilink graph | ~780 | **Reuse as the one shared memory.** Content OS writes to `Agentic OS/Content OS/`. No second memory. |
| Pipeline (idea to shipped, one human gate) | `pipeline.ts` | 573 | Reuse for approval flow |
| Video | `videoProjects`, HyperFrames render jobs, HeyGen, voices (14 routes) | ~1,500 | Keep; add **real generative video** (Wan 2.2 via ComfyUI) behind it |
| Content factory | `contentStudio.ts`, `hermesContentFactory`, `contentOsVideoPilot` (a manual-pilot **Content OS** already named here) | ~500 | **Three content factories exist** (this, VoiceAI's, plus the pilot). Pick one engine. |
| SEO | 12 routes, `seo*.ts`, history, intelligence | ~1,400 | Replaces MetaScope |
| Leads + outreach | `leads.ts` (Hunter/Apollo/CSV, scoring), `outreach.ts` (email validation, 25/day cap, bounce circuit-breaker, opt-out, STOP handling) | ~1,100 | Reuse; this is already a responsible sender. Add the concept-site step. |
| Web Studio | `webStudio.ts`: project folders, brief and prompt library | ~170 | Extend with cloner workflow and template fill |
| Thumbnails, music, OpenDesign, OpenMontage, radar, social research, translate, speech | various | ~1,500 | Keep as is |
| Integrations (Plausible, Supabase, Cal.com, Listmonk, Ghost, Stirling PDF, Penpot) | `integrationHub.ts` | 247 | Already covers some tools we planned |

## 3. Genuinely new (what the Content OS adds)
1. **Research and reverse engineering**: REA client, competitor-platform intake, structured feature/UX/pricing notes written to the vault.
2. **Content asset database**: `Asset`, `Version`, `Lineage`, `Source{url, license, authorized}`. Markdown stays the source of truth in the vault; a small index (SQLite) makes lineage queries fast.
3. **Real media engines**: GPU workers (ComfyUI), Z-Image, Wan 2.2, InfiniteTalk, PaddleOCR, and the 13 Craft apps behind MCP/CLI.
4. **Concept-site step before outreach**: prospect-previews generation, feeding the existing outreach engine.
5. **Shared suppression list**: one do-not-contact store used by `outreach.ts`, prospect-previews and VoiceAI. This is what actually prevents duplicate contacts.
6. **Cloner/site rebuild workflow** and template library (own templates).

## 4. Shared-memory contract (prevents duplicates)
- Root: the existing vault, subfolder `Agentic OS/Content OS/` with `Assets/`, `Sources/`, `Briefs/`, `Runs/`, `Suppression.md`.
- Every artifact is a markdown note with front matter: `id`, `kind`, `source`, `license`, `parent`, `tool`, `created` (ISO date), plus wikilinks. The existing graph view then shows lineage for free.
- Before creating anything, a module queries the vault by content hash and source URL. A hit returns the existing asset (the dedupe rule).
- Both products use the same vault path and the same suppression file.

## 5. Target layout
```
reforge/
  packages/
    core/        vault contract, asset/lineage index, hashing/dedupe
    research/    rea client, competitor intake, site audit hooks
    web/         cloner skill, own template library, concept-site generator
    outreach/    prospect-previews (concept site, ledger) + shared suppression
    studio/      Wan 2.2 / Z-Image / InfiniteTalk / PaddleOCR clients, Craft app wrappers
    voice/       StratosGTM integration (lead hand-off, consent log)
    gateway/     agentos registry (optional)
  adapters/agenticos/   bridge to local-AgenticOS
  infra/  manifest/  docs/
```

## 6. Decisions already made
- Assisted outreach is the default: the system drafts and builds, a person reviews and sends.
- Include open-source tools broadly; the policy only governs how messages are sent.
- VoiceAI is in scope. TokenForge is out. REA is used as an external tool, sandboxed.
- Archive old repos on GitHub and delete **only local copies**, after your confirmation.

## 7. Open problems found
1. **websitegenerator license**: none. Get Albert's permission or reimplement from scratch.
2. **Three content factories** (AgenticOS, StratosGTM, the pilot): choose one engine and make the others call it.
3. **SSRF** in MetaScope; use prospect-previews' network guard anywhere a user URL is fetched.
4. **Scraped third-party content** inside ai-website-cloner (Shopify); excluded.
5. **Prospect data and consent**: any lead data from Hunter/Apollo/forms must stay out of this public repo.
6. **Public repo**: ContractorOS is public. Merging private repos (ai-website-cloner, local-AgenticOS) into it would expose them. Make the monorepo private first, or keep AgenticOS separate (recommended).

## 8. Archive and delete plan (needs your explicit go-ahead at each step)
Order: port a module into the monorepo with history, run its tests there, then archive its GitHub repo, then delete only the local copy.
Candidates to archive: wiza, prospect-previews, MetaScope, ai-website-cloner, websitegenerator (your fork only; Albert's original is untouched), VoiceAI (if you decide to fold it in; I recommend keeping it separate as a product), agentos (optional).
**Never** touch: local-AgenticOS, the local `~/Documents/Codex/Projects/AgentOS` folder (that is the AgenticOS install guide), or the monorepo.
Local copies that would be deleted: `~/Developer/wiza`, `~/Developer/prospect-previews`, plus my scratchpad clones. Nothing is deleted until you confirm the exact list.

## 9. Next steps
1. You confirm: monorepo private? VoiceAI folded in or kept separate? websitegenerator: ask Albert or reimplement?
2. Build `packages/core` (vault contract + dedupe) and port prospect-previews first.
3. Second read pass on what I did not open: the rest of AgenticOS `lib/`, `product-experience`, VoiceAI orchestrator, prospect-previews source bodies.
