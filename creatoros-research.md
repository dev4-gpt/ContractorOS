# CreatorOS: Research Report
*Generated: 2026-10-14 | Sources: ~20 pages/searches | Confidence: Medium (repo READMEs fetched directly; ecosystem comparisons come from secondary blogs and are flagged)*

## Executive Summary
`context.md` describes a local-first "AI workstation OS" that bundles five layers: (1) a local compute runtime, (2) computer-use agents, (3) a native creative/office app suite, (4) a markdown memory "brain" upgraded with a graph + vector store, and (5) free cloud GPUs as a fallback because the Mac lacks disk space. The pieces mostly exist and mostly have permissive licenses. Three things need correcting before you build: **licensing** (AGPL/FSL pieces limit resale), **the Storytold apps' real maturity** (unverified), and **cloud-GPU reality** (no desktop apps on free tiers, and Colab may forbid web UIs). The commercial model (free local client + paid cloud credits) is confirmed by ArtCraft's own pricing page.

---

## 1. Architecture (structured from your notes)

| Layer | Your pick | Verified role | License / catch |
|---|---|---|---|
| Brain / memory | [Kipi System](https://github.com/assafkip/kipi-system) | Markdown memory on Claude Code; dated fact graph, coverage receipts (FULL/PARTIAL/NONE), ~65 hooks, CLI + local MCP server (73 tools) | MIT. Needs Claude Code; scheduled jobs are launchd (macOS) |
| Compute | [Locally Uncensored](https://github.com/PurpleDoubleD/locally-uncensored) | Tauri v2 + React 19 app: chat, ComfyUI image/video, coding agent, MCP tools | **AGPL-3.0-only**. macOS is beta (Apple Silicon only) |
| Execution (desktop) | [Cua](https://github.com/trycua/cua) | Driver, Lume VMs, SDKs (Py/TS/Swift/Kotlin), Cua Bench, CUA-S1 models | Mostly MIT. **Spaces + Driver Bench are FSL-1.1-MIT; `cua-som` AGPL.** Several older packages deprecated |
| Execution (browser/GUI) | [UI-TARS-desktop / Agent TARS](https://github.com/bytedance/UI-TARS-desktop) | Vision-based desktop/browser agent | Check license per repo |
| Research agent | [DeerFlow 2.0](https://github.com/bytedance/deer-flow) | "Super agent harness": sub-agents, memory, sandboxes, skills, MCP | MIT. Needs Py 3.12+, Node 22+, Docker/nginx; 8 vCPU/16 GB for server use |
| Creative suite | [ArtCraft](https://github.com/storytold/artcraft) + [Storytold org](https://github.com/orgs/storytold/repositories) | 13 Craft apps via craft-launcher: photocraft, lightcraft, filmcraft, designcraft, vectorcraft, pdfcraft, effectcraft, wordcraft, deckcraft, gridcraft, cadcraft, soundcraft, figcraft | MIT/Apache-2.0 (checked on photocraft, filmcraft, craft-launcher, artcraft). **Early alpha**; other apps' status not checked |
| Talking head | [InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk) | Audio-driven photo/video animation, runs in ComfyUI via WanVideoWrapper or Gradio | Per the guide, Apache-2.0/MIT; not checked. Needs consent for real faces |
| OCR/docs | [PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | Document/table parsing | Apache-2.0 (from general knowledge, not re-checked) |
| Models | Wan 2.2, Z-Image, InfiniteTalk | Video, image, talking-head | Wan 2.2 is Apache-2.0 per [InsiderLLM](https://insiderllm.com/guides/local-ai-video-generation/) |

### Corrections to the Gemini text
1. **Your Wan link** points at `Wan-Video/Wan2.1`, not 2.2. Use the Wan 2.2 repo.
2. **"TARIFF resources"** is the name of the newsletter behind the [Google Doc you linked](https://docs.google.com/document/u/0/d/1V04lrbP5gUyes10YH7u-GFeLgXCOMC79ZAXIwDvTP94/mobilebasic?pli=1) ("6 Free Chinese AI Tools That Do What You Pay For"), not a software project. It is a promotional guide that points to the six tools (Wan2.2, Z-Image, InfiniteTalk, Agent TARS, DeerFlow, PaddleOCR) and promotes the author's Skool community. Its claims about matching paid products are unverified.
3. **AGPL-3.0** on Locally Uncensored means that if you modify it and offer it over a network, you must publish your source. This blocks a closed commercial fork. Treat it as a pluggable runtime, not your product's core.
4. **"Replaces Photoshop/Premiere/Word"** is Storytold's marketing framing. I checked all three listing pages of the org (61 repos). Page 1 holds the Craft apps; pages 2 and 3 are legacy voice/TTS (FakeYou lineage), Unreal Engine, mocap and Terraform repos, which are irrelevant here. Checked READMEs show **early alpha**: [PhotoCraft](https://github.com/storytold/photocraft) says it is "not yet a Photoshop replacement for daily professional work"; [FilmCraft](https://github.com/storytold/filmcraft) self-rates about 56% "ready for real work" (slow on large footage, limited export codecs, less tested on Windows/Linux than macOS). Star counts are high (PhotoCraft ~58.6k, FilmCraft ~12.7k) but GitHub star numbers can't be independently verified here.
   Positives: all checked repos are **MIT or Apache-2.0**, ship a macOS universal DMG via [craft-launcher](https://github.com/storytold/craft-launcher) (13 apps), and PhotoCraft/FilmCraft advertise a scriptable CLI/MCP interface, which suits agent integration.
5. ArtCraft's own repo page says it is "the IDE for artists" with a catalog of 62 models including **Midjourney, Sora, and Grok providers**. That is a hosted-model aggregator, which is a different philosophy from "local and uncensored."

## 2. Business model (confirmed)
[ArtCraft pricing](https://getartcraft.com/pricing): free open-source client, bring-your-own compute allowed. Paid credits for hosted models:

| Plan | $/mo (yearly) | Credits/mo | Roughly |
|---|---|---|---|
| Basic | 8 | 1,000 | ~250 Nano Banana images or ~45s Kling 3.0 Pro |
| Pro | 28 | 3,750 | ~938 images or ~167s video |
| Max | 48 | 6,600 | ~1,650 images or ~295s video |
| Enterprise | custom | custom | SLAs, secure models |

Takeaway: they resell third-party model access with margin. Your differentiator (privacy, local, agent memory) is a different pitch, so your revenue would more likely come from a managed/hosted tier, templates and skills, or agency licensing than from credit resale.

### Decision: bundle all Storytold Craft repos
Scope is the whole Craft suite: the 13 apps (photocraft, lightcraft, filmcraft, designcraft, vectorcraft, pdfcraft, effectcraft, wordcraft, deckcraft, gridcraft, cadcraft, soundcraft, figcraft), plus `craft-launcher`, `craft-libs`, `craft-fonts` and the `artcraft` engine. Not in scope: the legacy repos on org pages 2-3 (FakeYou voice/TTS, Unreal plugins, mocap, Terraform), which don't serve this product.

Why it is workable: every repo I opened is MIT or Apache-2.0, which allows bundling and resale. Because they are all Rust and share `craft-libs`, one build pipeline can cover them.

Constraints to handle:
1. **Trademark:** the ArtCraft name, logo and "A" mark are excluded from the license (stated in craft-launcher). Ship under your own brand and don't reuse theirs.
2. **License check per repo** before bundling. Verified so far: photocraft, filmcraft, craft-launcher, artcraft. Check the other nine, `craft-libs` and `craft-fonts` (fonts often carry their own licenses, e.g. OFL).
3. **Alpha quality:** expect rough edges everywhere. Pin each app to a commit or release tag rather than tracking `main`.
4. **Agent control surface:** only PhotoCraft and FilmCraft are confirmed to expose a scriptable CLI/MCP. Check the other eleven. Where there is no MCP, fall back to Cua Driver (GUI) as the agent path.
5. **Upstream drift:** these repos move fast (FilmCraft has about 1,900 commits). Fork under your own org and rebase on a schedule.

**Phase 1 audit result** ([docs/storytold-audit.md](docs/storytold-audit.md), run 2026-10-14 via the GitHub API, no clones): all 17 repos report **Apache-2.0** (GitHub's license field; the READMEs describe a dual MIT/Apache choice), all are Rust (`Cargo.toml` at root), and all 13 apps have tagged releases (v0.5 to v0.10) with commits in the last four days. All 13 apps mention both MCP and CLI in their README, which closes the gap on items 2 and 4 above, subject to hands-on confirmation. Still open: `craft-fonts` may contain individual font files under their own licenses, so inspect it before redistributing; `artcraft` is 1.3 GB, so never shallow-clone it on this Mac (7.5 GB free).

Proposed integration order (smallest useful slice first):
| Phase | Apps | Why |
|---|---|---|
| 1 | craft-launcher + photocraft + filmcraft | Highest-value creator tools; both already advertise CLI/MCP; one launcher handles install/update |
| 2 | vectorcraft, soundcraft, effectcraft, lightcraft | Completes the media pipeline (vector, audio, VFX, RAW) |
| 3 | designcraft, deckcraft, wordcraft, gridcraft, pdfcraft | Office/document side; pairs with PaddleOCR and DeerFlow reports |
| 4 | figcraft, cadcraft | Niche; lowest priority |

Each app registers in the Kipi-style memory layer as a tool with a manifest (name, version, commands, output types), so an agent can ask "which app makes this asset" and log every asset it produces to the graph. I haven't built or tested any of this; it is a plan.

### Second revenue model from the Google Doc: services, not software
The guide pitches selling done-for-you services built on the six tools, with its own suggested price ranges (not independently verified): ad b-roll/product clips ($200–$800), product photos ($200–$1,000), AI spokesperson videos ($300–$1,000), web admin via Agent TARS ($500–$1,500/mo), research reports via DeerFlow ($300–$1,500), document OCR processing ($500–$2,000/mo). Its hardware notes: Wan2.2 5B on a high-end consumer GPU, 14B needs an 80 GB card; Agent TARS needs Node 22+ and a vision-capable model API key; DeerFlow 1.x (branch `main-1.x`) needs Python 3.12+, uv, Node, pnpm and a Tavily key. This fits an agency-flavored CreatorOS: the OS is the internal production line, and you sell outputs.

## 3. Cloud-GPU plan (no Mac disk)
| Option | What it gives | Catch |
|---|---|---|
| Kaggle | ~30 GPU-hr/week fixed, T4/P100 | Session length sources disagree (9 vs 12 h); verify in your account |
| Lightning AI | Persistent Studio, monthly credit pool (~80 GPU-hr on spot) | Credits shrink fast on big GPUs; 4-h restarts |
| Colab free | Unpredictable T4 | Google reportedly restricts web UIs/tunnels on free tier; ToS risk |
| Modal | Serverless endpoints | Free credit figure conflicts across sources; poor for persistent UIs |
| HF ZeroGPU | ~5 min/day | Demos only |

Source: [gpuperhour](https://gpuperhour.com/blog/free-cloud-gpus-and-credits), [Pinggy](https://pinggy.io/blog/run_and_share_comfyui_on_google_colab/). Native `.dmg` apps (ArtCraft, Locally Uncensored) cannot run on any of these; only headless engines (ComfyUI, models) can. This matches the caveat already in your notes.

## 4. Additional repos to add (not in your list)

**Memory / graph (for the "graph + vector brain")**
- [Graphiti](https://github.com/getzep/graphiti): temporal knowledge graph, Apache-2.0 (per [secondary source](https://codepointer.substack.com/p/agent-memory-systems-and-knowledge); verify).
- [Cognee](https://www.cognee.ai/best-open-source-ai-memory-tools-for-llm-agents-and-developers): graph + vector, claims 100% local with Ollama (vendor claim).
- [Mem0](https://github.com/mem0ai/mem0) / OpenMemory MCP: local MCP memory server. **Caution:** its open-source graph module was reportedly removed in April 2026; the hosted platform keeps it.
- [Letta](https://github.com/letta-ai/letta): stateful agent runtime. Letta's own result shows plain files scored 74.0% vs 68.5% for Mem0's graph on LOCOMO, so **a graph is not automatically better than Kipi's markdown files**. Benchmark first.
- Vector stores: Chroma, Milvus, Qdrant, LanceDB (embedded, light for a Mac). Neo4j or Kuzu for graph.

**Agents / computer use**
- [browser-use](https://github.com/browser-use/browser-use): MIT, web-first, most popular option per [Firecrawl roundup](https://firecrawl.dev/blog/best-open-source-agent-frameworks). Star counts in sources conflict (52k vs 109k).
- [Skyvern](https://github.com/Skyvern-AI/skyvern): vision-based browser automation, **AGPL-3.0**.
- [OpenHands](https://github.com/All-Hands-AI/OpenHands): coding agent, MIT core.

**Creative engines (alternatives or complements to Storytold)**
- [ComfyUI](https://github.com/comfyanonymous/ComfyUI): the de-facto backend for diffusion/video.
- [Krita AI Diffusion](https://github.com/Acly/krita-ai-diffusion): most mature AI-in-an-editor option; uses ComfyUI as backend.
- [Kdenlive](https://kdenlive.org/): Premiere-style editor, SAM2 object segmentation and auto-subtitles (per KDE release notes).
- [OpenCut](https://github.com/OpenCut-app/OpenCut): MIT, CapCut-style; AI/MCP planned in a rewrite.
- [Penpot](https://penpot.app/): open-source Figma alternative; MCP/AI claims are third-party, verify.
- Inkscape (vector) and Ardour (DAW): mature, no confirmed AI features.
- Video models: **LTX-2.x** (fast, native audio, community license free under $10M ARR), **HunyuanVideo 1.5** (~14 GB VRAM with FP8), Wan 2.2 (Apache-2.0, 8 GB on 5B GGUF). Sources disagree on newest LTX version; check [Hugging Face](https://huggingface.co/Lightricks).

**"Agent OS" framing (competitors / inspiration)**
- Several projects use the name (Agent OS, Agent Memory OS, Mnemosyne, portable `.agent/` folder). I found no verified repos or star counts; treat as leads, not endorsements. See [search result summary](https://blog.buildbetter.ai/best-agentgpt-alternatives-in-2026-local-first-personal-ai-agents/).

## 5. Skills already installed that map to this build
From your skill list: `ecc:agentic-os`, `ecc:unified-memory`, `ecc:rag-pipeline-reviewer` (agent), `ecc:mcp-server-patterns`, `ecc:autonomous-agent-harness`, `ecc:team-agent-orchestration`, `ecc:videodb`, `ecc:fal-ai-media`, `ecc:remotion-video-creation`, `ecc:manim-video`, `ecc:data-scraper-agent`, `ecc:exa-search`, `ecc:cost-aware-llm-pipeline`, `ecc:product-capability`, `ecc:blueprint`, `agentdb-vector-search`, `agentdb-memory-patterns`, `reasoningbank-agentdb`, `graphify` (for the knowledge graph), `pinecone:*` (needs `PINECONE_API_KEY`), `browser-use`, `playwright-cli`, `computer-use`, `hyperframes*` (video), `frontend-slides`.

## 6. Risks and open questions
- **"Uncensored" as a product claim** can conflict with payment processors, app stores, and some model licenses. Decide the positioning ("privacy-first, user-controlled") before building.
- **License stack** is mixed (MIT, Apache, AGPL, FSL). Build a license matrix before choosing what ships in a paid bundle.
- **Maturity**: Locally Uncensored's Mac build is beta; Cua Spaces needs macOS 26+; Kipi is Claude-Code-bound. Your Mac may be the weakest link.
- **Scope**: this is 5+ products. A realistic MVP is two layers: Kipi-style memory + one creative workflow (e.g., ComfyUI video via cloud GPU), not the whole suite.
- Unverified: licenses of the Craft apps I didn't open (vectorcraft, wordcraft, etc.), InfiniteTalk and PaddleOCR licenses, and the Google Doc's price ranges.
- Consent and likeness: InfiniteTalk and any face/voice animation need written consent; the guide says so itself.
- DeerFlow: the guide uses 1.x; the repo's current version is a 2.0 rewrite with no shared code. Pick one deliberately.

## 7. The six Tariff tools: verified specs for integration
All six repos were fetched and their licenses confirmed as Apache-2.0 in the README. Weights can carry separate terms, noted below.

| Tool | Repo | Needs | Fits free cloud? | Caveat |
|---|---|---|---|---|
| Wan2.2 | [Wan-Video/Wan2.2](https://github.com/Wan-Video/Wan2.2) | TI2V-5B: 24 GB (RTX 4090 class). A14B models: 80 GB. Official ComfyUI support | **Partly.** A Kaggle/Lightning T4 (16 GB) is below the 24 GB official figure; a quantized GGUF 5B with offload reportedly runs from 8 GB ([InsiderLLM](https://insiderllm.com/guides/local-ai-video-generation/)) but is slow. Lightning's L40S/A100 (credit-limited) is the realistic path | No separate weights license stated; check the HF model pages |
| Z-Image | [Tongyi-MAI/Z-Image](https://github.com/Tongyi-MAI/Z-Image) | Turbo fits 16 GB; 8 steps; stable-diffusion.cpp runs it at 4 GB | **Yes** (Kaggle T4) | Omni-Base and Edit variants "to be released" |
| InfiniteTalk | [MeiGen-AI/InfiniteTalk](https://github.com/MeiGen-AI/InfiniteTalk) | No VRAM figure given; fp8 and low-VRAM flags exist; ComfyUI branch and Gradio app | Probably with fp8/low-VRAM; untested | Builds on Wan2.1-I2V-14B and a wav2vec2 encoder, whose licenses are **not stated** on the page. Color drift past ~1 min |
| Agent TARS | [bytedance/UI-TARS-desktop](https://github.com/bytedance/UI-TARS-desktop) | Node 22+, vision-model API key | **Yes**, CPU only (the model is an API call) | CLI is Beta (v0.3.0, Nov 2025) |
| DeerFlow | [bytedance/deer-flow](https://github.com/bytedance/deer-flow) | Py 3.12+, Node 22+, Tavily key; 4 vCPU/8 GB minimum, 8 vCPU/16 GB for a server | **Yes** on an always-on VM | v2.0 is a rewrite; the guide uses `main-1.x` |
| PaddleOCR | [PaddlePaddle/PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR) | v3.7.0; PaddleOCR-VL (0.9B) and PP-StructureV3; no minimum given | **Yes** (CPU for basic OCR) | Newer HPD-Parsing model listed July 2026 |

Practical split: **GPU workers** (Wan2.2, Z-Image, InfiniteTalk) and **CPU services** (Agent TARS, DeerFlow, PaddleOCR, memory layer, orchestrator).

## 8. REA: reverse-engineering as a pipeline capability
[REA](https://github.com/morluto/rea) ("Reverse Engineer Anything") is an MCP server and CLI that lets agents inspect software and return findings with evidence. It covers native binaries (via Hopper, Ghidra or IDA), Electron/JS apps, .NET, Android APKs, websites and HAR/PCAP traffic, firmware and SQLite files. License is MIT for its own code. Setup is `npx rea-agents setup`, which registers it with Claude Code, Codex, Cursor and Gemini CLI. Node 22.19+ is required.

How it fits: add it as one more MCP tool in the agent layer. Intake loop: point it at an app you are allowed to study, produce an evidence-backed spec, then have a coding agent implement a compatible module and register it in the manifest from section 1.

Read before using:
- **Stars look wrong.** The page reports ~216k stars and 53k forks for a 2,993-commit repo. That is far outside normal and I could not corroborate it. Treat the repo as unvetted: the README itself warns to only trust `morluto/rea`, `rea.tools` or the `rea-agents` npm package, which is the kind of warning that goes with impersonation risk.
- **It rewrites your agent configs** during setup and its runtime capture executes the target. Pin the npm version, read the install script, and run it first inside a disposable VM (a Cua/Lume sandbox is a good fit), not on your main Mac.
- **Legal scope.** REA's README limits use to lawful research, interoperability, preservation, and software you own or are authorized to examine, and excludes cracked tools and license bypasses. Reverse-engineering a competitor's proprietary product to rebuild its features can breach EULAs, copyright and trade-secret law depending on jurisdiction. Make the policy "open-source, self-owned, or explicitly licensed/authorized targets only" and get a lawyer's view before using it on commercial software.
- IDA, Hopper and JEB are paid; only Ghidra (and JADX for Android) are free.

## 9. Hosting on free clouds with Cua
**What Cua actually offers.** Its docs describe "computer-use infrastructure on your own machines": sandboxes created from code or the `cua` CLI (Linux Spaces, a macOS Tahoe sandbox on Apple silicon, one Linux sandbox per GitHub Actions job), remote access over a relay, SSH or Tailscale, and Cua Driver as an MCP tool for macOS, Windows and Linux. I found no hosted Cua cloud, free tier or pricing on the docs page. Lume (macOS/Linux VMs) needs Apple silicon, so it cannot run on x86 free clouds. Consequence: Cua in the cloud means **Linux sandboxes you host yourself**, not a managed service.

**Free resources, with verified limits**
| Resource | Role | Verified limits |
|---|---|---|
| Oracle Cloud Always Free (ARM) | Always-on control plane: orchestrator, DeerFlow, Agent TARS, memory DB, Cua Linux sandbox | Sources say the allowance was cut on 2026-06-15 from 4 OCPU/24 GB to 2 OCPU/12 GB (conflicting; check Oracle's docs). Idle instances can be reclaimed; "out of capacity" at signup is common ([sources](https://braindetox.kr/en/posts/oracle_always_free_backend_2026.html)) |
| Kaggle | GPU worker (Z-Image, small video jobs) | ~30 GPU-hr/week, T4/P100, session cap 9-12 h, ephemeral disk |
| Lightning AI | GPU worker with persistent disk | Monthly credit pool (about 80 GPU-hr on spot, fewer on A100/H100), 50 GB storage |
| Hugging Face Spaces | Light CPU services, demos | CPU Basic 2 vCPU/16 GB, non-persistent 50 GB, sleeps after 48 h idle; one docs page says compute Spaces now need a paid plan, so verify |
| GitHub Actions | Ephemeral Cua Linux sandboxes (documented by Cua) | Minutes quota depends on plan |
| Cloudflare Tunnel / Tailscale | Reaching everything from the Mac | Not checked here |

**Suggested topology**
1. Orchestrator (Oracle ARM): job queue, Kipi-style memory, manifest of tools, MCP gateway. Reached from the Mac over Tailscale.
2. Cua sandboxes (Oracle or Actions): run browser/desktop agents (Agent TARS, UI-TARS, REA inside a disposable box).
3. GPU workers (Kaggle, Lightning): start by polling the queue, run ComfyUI headless with Wan/Z-Image/InfiniteTalk, push results to object storage, then exit. Models re-download each session on Kaggle, so cache on Lightning's persistent disk.
4. The Mac is only a thin client: browser UI plus the Craft apps for final editing (macOS universal DMGs exist).

**Limits you should plan around**
- Free GPU is capped at tens of hours a week, so this is a prototype and low-volume setup, not a service for paying clients. The Tariff service prices only work if jobs are batched or you move to paid GPUs.
- Do not create multiple accounts per provider to multiply free quotas. That violates the providers' terms and gets accounts banned. Using one account on each of several different providers is fine.
- Colab's free tier reportedly forbids web UIs and tunnels; keep it out of the design (see section 3).
- The Craft desktop apps cannot run on any of these; only headless engines can.

## Key Takeaways
- The stack is feasible, and the free-client/paid-credits model is proven by ArtCraft.
- Start with the memory layer and test Kipi's markdown files against Graphiti/Cognee before committing to a graph DB.
- Keep AGPL/FSL components as external services behind an API, not linked into your product.
- Use Kaggle or Lightning for free GPU; use headless ComfyUI, not desktop apps.
- Pick an MVP slice and verify each Storytold app by building it.

## Sources
Fetched directly: [Google Doc guide](https://docs.google.com/document/u/0/d/1V04lrbP5gUyes10YH7u-GFeLgXCOMC79ZAXIwDvTP94/mobilebasic?pli=1), [PhotoCraft](https://github.com/storytold/photocraft), [FilmCraft](https://github.com/storytold/filmcraft), [craft-launcher](https://github.com/storytold/craft-launcher), [ArtCraft](https://github.com/storytold/artcraft), [Storytold org](https://github.com/orgs/storytold/repositories), [ArtCraft pricing](https://getartcraft.com/pricing), [Kipi](https://github.com/assafkip/kipi-system), [Cua](https://github.com/trycua/cua), [Locally Uncensored](https://github.com/PurpleDoubleD/locally-uncensored), [DeerFlow](https://github.com/bytedance/deer-flow).
Search-derived (secondary, verify): [memory tools](https://codepointer.substack.com/p/agent-memory-systems-and-knowledge), [computer-use agents](https://firecrawl.dev/blog/best-open-source-agent-frameworks), [local video models](https://insiderllm.com/guides/local-ai-video-generation/), [free GPUs](https://gpuperhour.com/blog/free-cloud-gpus-and-credits).

## Methodology
7 direct page fetches and 6 searches. Not run: parallel subagents, firecrawl/exa (not configured here). Page fetches were summarized by a small model, so details like license text should be confirmed in each repo's LICENSE file.
