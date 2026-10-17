# StratosGTM: content plan

Written 2026-09-26. Companion to `gtm-strategy.md` and `architecture-and-use-cases.md`. The goal is audience and pilot
conversations for founders, creators and agencies selling $2k+ offers, in a candid build-in-public voice: show the rough
edges, do not oversell.

## 1. Voice and rules

**Voice:** a builder telling the truth about a real product. Specific over general. Short sentences. Admit what is
unfinished. No hype words ("revolutionary", "game-changing"), no exclamation marks, no emoji clutter.

**Claim check: every post must pass all of these before it goes out:**

1. Is every number from the repo, the live app or a test we ran? If not, cut it.
2. No speed or latency claim (time to first audio is not measured).
3. No customer, revenue, conversion or "results" claims until a real customer has confirmed them.
4. Buyer Lab is always "hypotheses from simulated buyers", never a prediction or measurement.
5. Say "voice agent that qualifies and logs leads", not "books meetings": calendar booking is not built.
6. No comparison that says we are faster, cheaper or better than a named competitor.
7. If a feature is manual or partial (only Bluesky auto-publishes today), say so or leave it out.

**Never post:** invented metrics, testimonials, "used by" lists, or screenshots that show real keys, emails or lead data.

## 2. Five pillars

| Pillar | What it is | Why it earns attention |
|---|---|---|
| **Build log** | What we shipped or broke this week, with the real cause | People follow builders who tell the truth. |
| **Under the hood** | How the voice agent, tools and publishing actually work | Technical readers share it; buyers trust it. |
| **Honest AI** | Simulated versus real, receipts, grounded claims | Our differentiator, and rare in this market. |
| **Playbooks** | Practical follow-up and qualification advice for $2k+ offers | Useful even to people who never buy. |
| **Demos** | Short clips of a real call, a real lead, a real post | Proof beats description. |

## 3. Weekly rhythm

| Day | Post |
|---|---|
| Mon | Build log (what we are shipping this week) |
| Tue | Under the hood or Honest AI |
| Wed | Playbook |
| Thu | Demo clip |
| Fri | Build log wrap-up: one thing that broke, one thing that worked |
| Weekend | Reply to people; no scheduled posts |

Publish to Bluesky through StratosGTM itself (section 8); post to X and LinkedIn by hand until they are connected.

## 4. Thirty-day calendar

Post ids refer to the bank in section 5. "Manual" means copy and paste until that network is enabled.

| Week | Mon | Tue | Wed | Thu | Fri |
|---|---|---|---|---|---|
| 1 | B1 launch v0 | B4 honest receipts | B10 playbook: after-hours | D1 first demo clip | B7 the publishing bug |
| 2 | B3 what it is not | B5 Buyer Lab quotes | B11 playbook: qualifying by voice | D2 Buyer Lab clip | B8 out of memory |
| 3 | L1 LinkedIn: why we built it (manual) | B6 consent layer | B12 playbook: follow-up window | D3 lead lands in CRM | B9 sign-in detour |
| 4 | B2 what we are trying first | B13 pricing in the open | X1 thread: how a call becomes a lead (manual) | D4 publishing clip | B14 first pilot ask |

## 5. Post bank

Bluesky posts (B-numbers) are written to fit its 300-character limit; the length is checked when the file is updated.
Each has a claim-check note.

### Launch and positioning

**B1. Launch v0**
> Most inbound leads go cold after hours. StratosGTM is a voice agent that talks with visitors on your site, qualifies them, and logs them to a CRM. Early days, rough in places. Try it: https://stratosgtm.vercel.app
- Claim check: true; says "early" and "rough"; no speed, results or customer claims.

**B2. What we are trying first**
> We are looking for three founders or agencies selling $2k+ offers to run a paid 30-day pilot of StratosGTM. You get setup help and weekly reviews. We get honest feedback. If that is you, reply or DM.
- Claim check: matches the founding-pilot proposal; the price is deliberately not stated until decided.

**B3. What it is not**
> What StratosGTM is not, today: it does not book calendar meetings (it records a consultation request), and it does not auto-post to every network yet (Bluesky only). We would rather you hear it from us.
- Claim check: both facts are in `CLAUDE.md`'s status table.

### Honest AI

**B4. Honest receipts**
> Our publish button never says "published" unless the server confirms it. Accepted but unconfirmed reads "queued". It sounds small. It is the difference between a report you can trust and one you cannot.
- Claim check: matches the receipt rule (`published` only after TryPost reports it).

**B5. Buyer Lab quotes**
> Buyer Lab simulates buyers reading your page. Rule one: every claim needs a verbatim quote from the page they were shown, or it is dropped. In one check, 45 claims kept, 3 dropped. Hypotheses, not predictions.
- Claim check: 45 kept and 3 dropped from the 2026-09-21 real-model check; "hypotheses, not predictions" stated.

**B6. Consent layer**
> A voice agent that talks to strangers needs consent handled first. StratosGTM prepends an AI disclosure and asks for explicit opt-in in the 13 all-party-consent states. Engineering work, not legal advice.
- Claim check: 13 states are listed in `complianceService.ts`; the "not legal advice" line is required.

### Build log (the candid ones)

**B7. The publishing bug**
> Bug of the week: our publish call returned success but nothing posted. The API creates every post as a draft, even if you send a schedule time. Publishing is a second call. The receipt kept us honest: it said "queued".
- Claim check: verified live on 2026-09-26; see the operations note.

**B8. Out of memory**
> Our publishing server was killed for running out of memory more than three thousand times before we fixed it. Cause: too many idle workers on a 1 GB box. Fix: turn off the platforms we do not use. Boring, real.
- Claim check: the kernel counter read 3,380 kills on that container before the fix; "more than three thousand" is accurate.

**B9. Sign-in detour**
> Spent hours on a sign-in failure. The fix: we had added our new domain to the wrong auth project. Two projects, one name. Lesson: when a config change does nothing, check you edited the right thing.
- Claim check: true story (two Neon projects).

**B14. First pilot ask**
> Week four. Goal: three paid pilots. If you sell a $2k+ offer and lose leads after hours, I would like to run StratosGTM on your page for 30 days and show you what it catches. Reply and I will send how it works.
- Claim check: a request, not a result; no numbers beyond the goal.

### Playbooks

**B10. After-hours**
> If your offer is $2k+, a lead who visits at 11pm and finds nothing to talk to may not return. Cheapest fix, before any tool: a page that says exactly when they will hear back, and a question to answer now.
- Claim check: advice, not a claim about our product or a statistic.

**B11. Qualifying by voice**
> Three questions worth asking every high-ticket lead early: what is the budget range, what is the timeline, and what happens if they do nothing. Order matters less than actually asking. A voice agent can ask all three, every time.
- Claim check: matches budget, timeline and fit capture in `qualify_lead`.

**B12. Follow-up window**
> Rule of thumb for high-ticket leads: reply the same day, and say something specific to what they told you. The reply that quotes their own words beats the polished template. Log what they said either way.
- Claim check: practitioner advice, no statistic.

**B13. Pricing in the open**
> Pricing, in the open: Starter $149 a month for 500 voice minutes, Pro $449 for 1,500, Enterprise $1,497 for 5,000, with overage per minute. No free credits. You can bring your own keys. Details on the site.
- Claim check: numbers from `plans.json`; the app footer now reads the same catalog.

### Demo captions (attach a real clip; never a mock)

**D1.** A real call, start to finish, ending with the lead appearing in the CRM. Caption: "One real call, unedited. The agent qualifies, then the lead lands in the CRM."
**D2.** A Buyer Lab run over a public page. Caption: "Simulated buyers, real quotes from the page. Hypotheses only."
**D3.** The CRM board updating during a call. Caption: "The lead appears while we are still talking."
**D4.** A post typed in the app appearing on Bluesky. Caption: "Typed here, live there. The receipt says published because the server confirmed it."
- Claim check for all four: only real recordings; no speed claim in captions.

### Longer posts (manual on LinkedIn and X)

**L1. Why we built it** (LinkedIn, about 200 words)
Outline: the moment a high-ticket lead went cold; what we tried; why voice; what we refuse to claim; the ask for pilots.
Draft opening: "I lost a good lead once because nobody answered at 11pm. I do not know that it would have converted. That is the point: I could not know, and neither could anyone else."
- Claim check: personal anecdote; only post it if it is true for the founder.

**X1. How a call becomes a lead** (thread, 6 posts)
1. A visitor speaks to the agent on the page. 2. The agent registers seven tools with the voice API. 3. When it hears a budget it calls `qualify_lead`. 4. The server checks guardrails, then writes to the CRM. 5. The same conversation can seed a post draft. 6. What is real and what is not: link to the status table.

**Long-form ideas** (blog or newsletter, each 800 to 1,200 words)
1. "The publish API said 201 and posted nothing": the draft-versus-publish story.
2. "How we made an AI agent's claims checkable": quote-grounded Buyer Lab.
3. "The 1 GB box: running a social publishing server on a trial plan."
4. "What voice agents cannot do yet, and what we do about it."
5. "A plain-language look at consent for AI voice agents in the US" (with a counsel-review note).

## 6. Launch kits

**Show HN**
- Title: `Show HN: StratosGTM, a voice agent that qualifies leads and logs them to a CRM`
- Body outline: what it is in two sentences; who it is for; what is real and what is not; the architecture in five lines; a link to the demo; what feedback we want. Be present in the comments for hours.

**Product Hunt** (Tuesday or Wednesday)
- Tagline: "A voice agent for your site that qualifies buyers and logs the lead."
- First comment: the origin story, the honest limits, and the pilot ask.
- Prep: a two-minute demo video, three screenshots, and people who will actually try it, not just upvote.

**Hackathon write-up**
- Outline: the problem, the build, what is real, what we would do next; link to the live app and the status table.

## 7. Outreach templates

**DM or email with a useful artifact**
> Hi [name]. I ran a simulated buyer panel over [their page]. Here are five objections it raised, each with the exact line from your page that triggered it. These are hypotheses, not measurements, but a couple looked worth a look. I am building a voice agent that talks to visitors on pages like yours. Would a 15-minute demo on your own offer be useful?
- Only send if the run is real and the quotes are verified.

**Reply etiquette:** answer questions first, link second; never reply with a pitch to a post that is not asking for one.

## 8. How to publish these through StratosGTM

1. Sign in at `https://stratosgtm.vercel.app`, open **Keys**, and confirm the TryPost token shows "last test passed".
2. Under **Publish via TryPost**, choose the Bluesky account and paste one post from the bank.
3. Read the receipt: **published** is the goal; **queued** means check the account before retrying.
4. Publish one post at a time. There is no duplicate protection yet.
5. Confirm on Bluesky, then log the post and its result in the tracking sheet.

Before any launch, run the health checks in `docs/superpowers/specs/2026-09-26-trypost-operations.md`.

## 9. Metrics and review

Weekly, 20 minutes: posts published, replies received, DMs started, demos booked, and which pillar drew the most replies.
Keep what earns conversations; cut what earns only likes. Update this plan monthly.
