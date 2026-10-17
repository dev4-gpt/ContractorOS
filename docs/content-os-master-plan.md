# Content OS master plan
*2026-10-16. Working name: Reforge. Builds on [creatoros-research.md](../creatoros-research.md) (tool stack) and [content-os-repo-map.md](content-os-repo-map.md) (repo audit). Status: plan only, nothing merged, archived or deleted.*

## 1. Vision in one paragraph
A content operating system for solo creators and small agencies: it **studies** what the best platforms and sites do (reverse engineering and research), **creates** content across text, image, video, web and documents, **ships** it through assisted channels, **qualifies** the people who respond (voice and CRM), and **learns** from everything through one shared memory that `local-AgenticOS` also uses. It runs on your own keys (BYOK), semi-automated by default, and on free-tier infrastructure to start.

## 2. Inventory of what you provided
| Input | What it is | Status |
|---|---|---|
| `context.md` | Gemini chat: ArtCraft/Storytold suite, Kipi memory, Cua, Locally Uncensored, Tariff tools, free cloud GPUs | Read; claims verified in the research report |
| Storytold repos (17) | 13 Rust creative apps + launcher, libs, fonts, artcraft | Audited via API; Apache-2.0; early alpha; all mention MCP + CLI |
| Tariff Google Doc | Newsletter guide to 6 Chinese open-source tools plus services to sell | Read; repos verified Apache-2.0/MIT |
| `morluto/rea` | Reverse-engineering MCP/CLI | Read README only; star count implausible; sandbox only |
| Your repos: wiza, ai-website-cloner, MetaScope, websitegenerator, prospect-previews, VoiceAI, agentos, local-AgenticOS | Cloned shallow and read (see repo map for depth per repo) | Partial; second pass pending |
| Notion: Signal → Revenue System (PDF) | Sales page: 6 modules, 2 engines | Read in full |
| Notion: AI CMO Complete Blueprint (PDF) | Sales page: 45+ agents, 5 pillars | Read in full |
| Keepy Labs: Motion Design Studio | Chapter 14 of a Claude guide: director prompt + 24 repos | Read in full (web); PDF saved locally |
| The Notion links | JavaScript-rendered, fetch returned nothing; the PDFs are the same content | n/a |

## 3. What the three new sources teach us
### 3.1 AI CMO blueprint (April 2026, vendor sales page)
Claims a platform of **45+ agents in 5 pillars**, 3 interfaces (web dashboard, Claude Code via MCP, plus a third that is cut off), multi-client, bring-your-own-keys, "intentionally semi-automated".
| Pillar (agents) | Agents named | Tools named |
|---|---|---|
| SEO intelligence (8) | keyword research, validator, topic discovery, gap analyzer, trend collector, AEO visibility scanner, rank tracker, site auditor | DataForSEO, Search Console, GA4, Perplexity |
| Content production (9) | director, planner, article writer, newsletter, LinkedIn, Twitter, video scriptwriter, lead magnet, image creator | Claude, OpenRouter, HeyGen, ImageKit, WordPress, n8n |
| Competitor intelligence (5) | monitor, extractor, keyword overlap, threat assessor, competitor suggester | DataForSEO, Apify, Supabase |
| Video production (4) | script, b-roll selector, HeyGen producer, thumbnail | HeyGen, ImageKit |
| Knowledge and ops (7) | document ingester, brand voice keeper, RAG searcher, internal links, WordPress publisher, pipeline orchestrator, AI assistant | Supabase vector DB, WordPress, n8n |
Shared design: a Director dispatches specialists in parallel; shared vector knowledge base; every run logs tokens, cost and an audit trail.
Treat all numbers as marketing: "replaces 9 hires, $612-850k/yr" is the seller's own comparison, not evidence.

### 3.2 Signal → Revenue System (June 2026, vendor sales page)
Six modules on two engines sharing one unit, the **signal**:
- Inbound (demand): `demand/` content shipped across 7 channels in one voice.
- Outbound and attribution: `pipeline/` enriched accounts, `qualify/` ICP x intent scoring, `nurture/` right follow-up, `convert/` trace a closed deal back to the post that started it ("the moat").
- `guardrails/`: no auto-send on hot or high-dollar deals; protect domain and accounts.
Scorecard idea (0-6 modules running) is a useful product-maturity check. Its stated lesson: the hard parts are **scoring, attribution and the safety layer**.
Unverified: "30+ clients, 200+ founders, 12 agent types in production."

### 3.3 Motion Design Studio (Keepy Labs, Oct 2026)
- One long "director" prompt: viewer's wrong picture first, render and self-inspect (muted pass, audio-only pass, caption and number checks), required outputs `master_16x9.mp4`, `cut_9x16.mp4`, `cut_1x1.mp4`, `captions.srt`, `SOURCES.md`, `DECISIONS.md`. Never invent numbers or quotes. Author unverified.
- Engine: **HyperFrames** (HTML to MP4, Apache-2.0, Node 22 + FFmpeg + headless Chrome, agent skills, Docker and AWS Lambda rendering; verified on its repo page). Remotion works but needs a company license check; I did not verify its terms.
- 24 motion repos listed. License warning: `onetake` is PolyForm Noncommercial. Check every repo's license before using in a product.
- **You already have HyperFrames inside local-AgenticOS** (`videoProjects.ts`, render jobs). So this guide is a quality upgrade (director prompt + verification receipt), not a new engine.

### 3.4 Market snapshot (weak evidence)
Searches returned mostly vendor-written comparisons (Averi on Jasper, Copy.ai, AirOps, Frase). **Postiz** is an open-source social scheduler with agent features (you already have a `trypost` fork for open-source scheduling). A hackathon project, **Agentra**, uses the name "ContentOS", so avoid that name. No independent test data found; verify pricing and capabilities on vendor sites before positioning.

## 4. Capability map: what you want vs what exists
| Station | Needed capability | Source of the idea | Already in AgenticOS | Candidate reuse | Gap |
|---|---|---|---|---|---|
| Research and intel | Competitor monitor, platform reverse engineering, SEO, trends | AI CMO P1/P3, your RE goal | SEO (12 routes), radar, social research | REA, MetaScope logic, DeerFlow | Competitor monitoring, platform teardown notes |
| Strategy | Brief, ICP, topic scoring | AI CMO, Signal | pipeline, leads scoring | prompts | Cross-run strategy memory |
| Text | Articles, newsletter, social, lead magnets | AI CMO P2 | hermes content factory, content studio | VoiceAI content factory | **Three factories: choose one** |
| Image/design | Thumbnails, visuals, design | AI CMO | thumbnails, OpenDesign, Penpot hook | Z-Image, Craft apps | GPU worker |
| Video | Scripted, avatar, generative, motion | AI CMO P4, Keepy | HyperFrames, HeyGen, voices | Wan 2.2, InfiniteTalk, director prompt | Real generation, verification receipt |
| Web | Rebuild, templates, concept sites | your cloner, websitegenerator | Web Studio (briefs/prompts) | cloner skill, prospect-previews | Own template library |
| Distribute | Social scheduling, email, assisted outreach | Signal | outreach (email, caps, opt-out), leads | trypost, prospect-previews | Social scheduler link; assisted flow |
| Qualify/nurture | Voice agent, CRM, follow-ups | Signal | (none) | **VoiceAI/StratosGTM** | Hand-off protocol |
| Convert/attribute | Closed deal to originating content | Signal moat | (none) | VoiceAI CRM | **Attribution is the real gap** |
| Guardrails | Approval gates, caps, suppression, audit | Signal, AI CMO | pipeline human gate, bounce breaker | prospect-previews DNC | One shared suppression list |
| Knowledge/memory | Vector or graph, brand voice, RAG | AI CMO P5 | Obsidian vault + graph | Kipi-style, optional Graphiti | Brand-voice note, dedupe index |
| Ops | Multi-client, cost tracking, audit | AI CMO | costLedger, tenancy, billing | monorepo core | Multi-client scoping |

## 5. Architecture
```
reforge/ (monorepo)
  packages/
    core/      vault contract, asset+version+lineage index, hashing/dedupe, suppression, cost + audit log
    research/  rea client, competitor intake, site audit hooks
    web/       cloner skill, own templates, concept-site generator
    outreach/  prospect-previews (assisted), shared suppression, attribution tags
    studio/    Wan 2.2, Z-Image, InfiniteTalk, PaddleOCR, HyperFrames director, Craft app wrappers
    voice/     StratosGTM integration (lead hand-off, consent log)
    gateway/   agentos registry (optional)
  adapters/agenticos/   shared memory + agent hub bridge
  infra/ manifest/ docs/
```
**Signal object (new, from Signal→Revenue):** `Signal{id, kind(post|reply|call|form), content_asset_id, channel, contact_id, ts}`. Every outbound message, voice lead and deal links back to the content `Asset` that originated it. That gives attribution without new infrastructure.
**Memory contract:** vault folder `Agentic OS/Content OS/` (`Assets/ Sources/ Briefs/ Runs/ Signals/ Suppression.md`), markdown with front matter (`id, kind, source, license, parent, tool, created`), dedupe on content hash + source URL, small SQLite index for lineage queries. Shared by both products.
**Director pattern:** one orchestrator dispatches specialists in parallel and writes a run log (tokens, cost, decisions) into the vault, like AI CMO, but with a human gate before anything leaves the system.

## 6. Infrastructure
- Control plane: Oracle Always Free ARM (allowance reportedly cut to 2 OCPU/12 GB in June 2026; confirm in console). Tailscale, Docker, queue. Script ready: `infra/oracle-setup.sh`.
- GPU workers: Kaggle (about 30 hr/week) and Lightning (credit pool), headless ComfyUI, pull jobs from the queue. One account per provider.
- Cua: self-hosted Linux sandboxes only; Lume needs Apple silicon.
- **Local disk is critical:** free space fell from 7.5 GB to about 0.7 GB during this session while my clones total about 270 MB. Free space before building anything.

## 7. Roadmap (each phase ends with something runnable)
| Phase | Deliver | Exit check |
|---|---|---|
| 0. Housekeeping | Free disk; decide private monorepo; decide VoiceAI placement and websitegenerator approach; confirm Oracle account | Decisions recorded |
| 1. Core | vault contract, dedupe, suppression, cost/audit log | Same asset requested twice returns the existing one |
| 2. Assisted outreach | port prospect-previews; plug into AgenticOS outreach; shared DNC | One concept site + draft produced, human sends |
| 3. Research | MetaScope-style audit, REA sandbox, competitor intake notes in the vault | One competitor teardown written to the vault |
| 4. Studio | Z-Image job on Kaggle; HyperFrames director prompt with verification receipt | One 30-60s video with 16:9, 9:16, 1:1 + SOURCES/DECISIONS |
| 5. Voice + attribution | StratosGTM hand-off, Signal links, first closed-loop report | A lead traced to its originating asset |
| 6. Product | Multi-client scoping, BYOK, cost dashboard, packaging | Two isolated test clients |
First slice to build: **Phases 1 + 2 + a thin 3**, because they need no GPU and prove the shared memory.

## 8. Positioning notes
- Pricing references (all vendor claims, unverified): AI CMO says it replaces nine roles ($612-850k/yr). Signal→Revenue says two hires plus tools (~$150k/yr). AgenticOS's own model is $2,500 setup + $1,250/month, BYOK or managed wallet.
- Differentiators worth testing: shared memory with AgenticOS, assisted-by-default safety, reverse-engineering-informed research, local-first with BYOK.
- Both blueprints stress **guardrails and attribution**. Building those first is a credible edge over tools that only generate content.

## 9. Risks and rules
1. Outreach: assisted default; identified sender, opt-out, labeled concept sites, shared suppression, rate caps. Not legal advice; check jurisdictions (CAN-SPAM, EU/UK rules).
2. Reverse engineering: allowed targets are open source, self-owned, or explicitly authorized. Do not copy proprietary code or assets. REA only inside a disposable sandbox with a pinned version.
3. Cloning: rebuild with own assets; drop scraped third-party content (the Shopify folder).
4. AI-generated media: disclose, get consent for any real face or voice (InfiniteTalk, avatars).
5. Licenses: AGPL (Locally Uncensored, Skyvern, cua-som), FSL (Cua Spaces), PolyForm Noncommercial (onetake), Remotion company license (not verified), websitegenerator has **no license** and is Albert Shiney's fork.
6. Repos: ContractorOS is public. Never commit prospect data, keys, client material or PDFs of third-party documents (PDFs are now git-ignored).
7. Duplication: three content factories exist; pick one.
8. Vendor claims in the Notion pages and Keepy guide are unverified marketing.

## 10. Decisions
**Made (2026-10-16):**
1. The combined repo is **public** (ContractorOS is already public). `local-AgenticOS` stays separate and private. Consequence: everything imported becomes public, including git history, so each import needs a secret scan first, and no prospect data, keys, client material, PDFs or scraped third-party content goes in.
2. **VoiceAI is folded in** (MIT). Import without the PDFs and the agent-skill folders; keep its billing, consent and CRM code; scan history first.
3. **websitegenerator is reimplemented from the ideas, not copied.** It is a fork of `albertshiney/websitegenerator` with no LICENSE file, so its code, template and message text stay out. Optional: ask Albert to add a license.
4. First audience: **both** solo creators and small agencies.
5. Outreach is assisted by default.

**Factory decision (2026-10-16, after reading both sources):** the AgenticOS and VoiceAI factories both derive from Raja Ashok's public "Hermes Content Factory" blueprint, so credit it and copy none of its text. They are complementary: AgenticOS has the **contract** (8 stages, approval record bound to one workflow, citation/quality/delivery records, idempotency key, `autoPublish: false`), VoiceAI has the **executor** (parallel research lanes, drafting, self-healing verification loop, budget cap, live telemetry). The unified factory in the Content OS = AgenticOS contract + a clean rewrite of VoiceAI's executor. VoiceAI's seeded demo job (invented "$42k MRR" results, in-memory store) must not be imported as data.

**Layering (who owns what):**
- The **Content OS (public)** owns content-domain logic and runs standalone: factory, assets/lineage/signals, suppression, research, studio engines, concept sites, StratosGTM voice front door, attribution.
- It talks to its host through four interfaces: `MemoryStore`, `AgentRunner`, `Sender`, `CostLedger`.
- **Standalone host:** CLI + small web UI, BYOK keys, a local folder or SQLite. For solo creators without AgenticOS.
- **AgenticOS host (private):** adapters over its vault, Hermes/agent hub, Gmail outreach engine and cost ledger. AgenticOS imports Content OS packages; the Content OS never imports AgenticOS.
- **Do not rebuild** what AgenticOS has: SEO, radar, lead enrichment, the email sender, thumbnails, music, OpenDesign, tenancy and billing. Call them through adapters.
- Leads and PII stay in the StratosGTM Postgres CRM; the vault holds only Signals with contact IDs, never personal data.

**Still open:**
1. Combined-repo license (recommended: Apache-2.0).
2. Name: Reforge, Atelier, or other (availability unchecked).
3. Model provider defaults: VoiceAI's executor uses DeepSeek via a harness; keep model choice pluggable.

## 11. Not yet done
Second code read of AgenticOS (~150 unread lib files, product-experience, workers), VoiceAI orchestrator, prospect-previews source, agentos execution proxy; no live test of any Craft app, REA, or HyperFrames; no external validation of vendor claims; Remotion license terms.

## Sources
Local: `context.md`, three PDFs in the project folder, repo clones read this session.
Fetched: [Keepy Labs motion guide](https://keepylabs.com/claude-master-guide/motion-design-studio), [HyperFrames](https://github.com/heygen-com/hyperframes).
Search (vendor-heavy, weak): [Averi guide](https://www.averi.ai/guides/best-ai-tools-content-marketing), [Postiz overview](https://postiz.com/blog/ai-content-creation-tools), [open-source content automation list](https://www.sozee.ai/resources/?p=11192).
Notion pages (not fetchable; read via PDF): Signal → Revenue System, AI CMO Complete Blueprint.
