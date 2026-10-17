# StratosGTM: go-to-market strategy

Written 2026-09-26. Companion to `architecture-and-use-cases.md` (what is real) and `content-plan.md` (what to post).
Everything about the product comes from the repo and live endpoints; everything about competitors comes from the desk
research linked below. Proposals are marked **Proposal** and are decisions for the founder, not facts.

## 1. Goal and how we will know

**Primary goal (next 90 days): the first paying pilot customers.** Bonuses: hackathon visibility (the app already carries
a lablab.ai Voice Agent Hackathon submission) and a growing audience that makes every later launch cheaper.

Targets below are **aims, not forecasts**. They exist so each week has a number to beat.

| Horizon | Aim | Why this number |
|---|---|---|
| Day 30 | 100 target accounts researched, 30 conversations started, 8 demos | Founder-led sales needs volume before it needs polish. |
| Day 60 | 3 paying pilots signed | Enough to learn what actually converts; small enough to serve well. |
| Day 90 | 2 pilots renewed or expanded, 1 written case study with real numbers | Proof that survives a skeptical buyer. |
| Ongoing | 3 posts a week, 1 demo clip a week | Consistency beats bursts. |

## 2. Positioning

**Category:** a voice-first growth loop for people who sell high-ticket offers: talk to the visitor, qualify them, write the
lead into a CRM, then turn what was said into content, and be honest about what is real.

**One line:** *An AI voice agent on your site that qualifies buyers while you sleep, and turns the conversations into your
next posts.*

**Who it is for:** founders, creators and agencies selling offers of about $2,000 and up. One extra qualified lead is worth
real money to them, and slow or after-hours follow-up is a real leak.

**Who it is not for:** high-volume call centres, low-ticket products where a chatbot is enough, or regulated industries
where we have not done a compliance review.

**Why us, in four bets** (bets, not proven advantages; test each with customers):

1. **A loop, not a point tool.** Voice qualification feeds content, and content publishes. Most voice-agent products stop
   at the call.
2. **Honest by construction.** Every receipt says published, queued or simulated; Buyer Lab claims need verbatim quotes.
   In a market full of inflated demos, plainness is the differentiator.
3. **Made for the $2k+ seller.** The persona, discount ceiling and consultation flow are built around high-ticket
   conversations, not generic support.
4. **Simple, published pricing.** Three plans, per-minute overage stated up front, and bring-your-own keys.

## 3. Competitive landscape (desk research, September 2026)

Caveat: these are aggregator and vendor pages, several written by competitors. Treat prices and rankings as directional
and re-check the vendor's own page before quoting any of it publicly.

**Voice-agent platforms (build or configure a call agent).** Aggregators describe Vapi as developer-flexible, Retell as
strong on turn-taking and calendar booking, Bland as lowest per-minute price, and Synthflow as no-code. Reported
pricing clusters around $0.07 to $0.20 per minute before language-model costs (for example Vapi about $0.05 per minute
platform fee plus model and voice costs; Retell about $0.07 to $0.18; Bland plans from about $299 a month; Synthflow
about $329 to $540 a month). Sources:
[Famulor pricing comparison](https://www.famulor.io/blog/ai-voice-agent-pricing-2026-what-10-platforms-actually-cost-per-minute),
[Tested: Retell vs Vapi vs Bland vs Synthflow](https://tested.media/retell-vs-vapi-vs-bland-vs-synthflow/),
[Builts AI comparison](https://builts.ai/blog/vapi-vs-bland-ai-vs-retell-ai/).

**Inbound lead qualification and website-visitor engagement.** Named players include Qualified's AI SDR, Smith.ai (AI
with live agents as backup), 11x's inbound agent, ElevenLabs' agents and Intercom's chat. Source:
[11x guide to inbound lead-qualification agents](https://www.11x.ai/guides/ai-voice-agents-inbound-lead-qualification)
(a vendor page; use as a landscape list, not a ranking).

**What this suggests:**

- Per-minute voice cost is a commodity across these platforms, so we should not compete on price per minute.
- Most named competitors are phone-first or enterprise-first. A website voice agent for a solo or small seller, tied to
  content and honest reporting, is a narrower lane. Whether that lane is big enough is unproven; the pilots answer it.
- We cannot claim to be faster, cheaper or more accurate than anyone. We have no measured latency and no comparative
  accuracy data. Compete on fit and honesty.

## 4. Offer and packaging

Plans in `packages/shared/plans.json` (what Stripe charges from):

| Plan | Monthly | Annual, per month | Voice minutes | Overage | Personas |
|---|---|---|---|---|---|
| Starter | $149 | $119 | 500 | $0.30 per min | 1 |
| Pro | $449 | $359 | 1,500 | $0.25 per min | 3 |
| Enterprise (agencies) | $1,497 | $1,197 | 5,000 | $0.20 per min | unlimited |

**Proposal: a founding-pilot offer** for the first three customers.

- 30 days on Pro features, concierge setup (agent persona, dossier, widget on their page), and a weekly 20-minute review.
- Priced, not free, so it tests willingness to pay: for example $249 for the 30 days, credited against the first month if
  they continue. (The number is a proposal; pick your own, but keep it paid.)
- In return: permission to share anonymized results and a short testimonial only if they choose to give one.
- No outcome guarantees. Promise the work, not the result.

The console footer used to show a hand-typed $397 for Pro. It now reads the plan name and price from the same catalog, so it can no longer drift from what Stripe charges.

## 5. The sales motion (founder-led, small and specific)

1. **Build a list of 100 accounts.** Founders, creators and agencies selling $2k+ offers with a public landing page and a
   visible way to book a call. Keep the list in a plain sheet with the offer, the page, and one specific observation.
2. **Lead with a useful artifact, not a pitch.** Run Buyer Lab on their public page (the owner uses the server-key grant,
   so it costs them nothing) and send five quote-backed objections a simulated buyer would raise. Say plainly that these
   are hypotheses, not measurements. This is honest, cheap, and specific.
3. **Offer a 15-minute demo on their own offer.** Load their offer into a dossier so the agent speaks about their
   business, not a generic script.
4. **Close with the founding-pilot offer.** Ask for a paid 30-day pilot, not a vague trial.
5. **Serve the pilot obsessively.** Review calls weekly, fix rough edges, and write down every objection.

Channels for finding accounts and starting conversations: the founder's own posts on Bluesky (connected today), X and
LinkedIn (manual for now), and communities where creators and agency owners already talk. Reply usefully, do not spam.

## 6. Launch sequence

Public launches work best when your own people can send traffic to them. The research on launch playbooks points the same
way: stagger channels, and build in public first so the launch is the payoff of weeks of compounding
([Product Hunt playbook, Causo](https://hub.causo.ai/guides/product-hunt-launch-2026-realistic-playbook),
[B2B launch strategy, LaunchPact](https://www.launchpact.io/product-hunt-launch-strategy-b2b),
[first 10 customers for B2B, Growthmode](https://medium.com/growthmode/how-to-get-your-first-10-customers-for-your-sales-led-b2b-startup-in-2026-515391f7427e)).
B2B launches give concentrated founder and buyer traffic, a permanent backlink and reusable social proof, not
consumer-scale volume. Set expectations to match.

| Phase | Weeks | What |
|---|---|---|
| 0. Fix the basics | 0 to 1 | The pre-launch checklist in section 7. |
| 1. Build in public | 1 to 4 | Daily-ish build log, weekly demo clip, candid posts about what broke (see `content-plan.md`). Start the outreach motion. |
| 2. Pilot proof | 3 to 8 | Sign and serve the first pilots; collect real numbers and, if offered, a quote. |
| 3. Launch moments | 6 to 10 | A "Show HN" style post, then a Product Hunt launch on a Tuesday or Wednesday, then the hackathon write-up, staggered a few days apart. |
| 4. Compound | 10+ | Case study, comparison content, partnerships with agencies, a referral offer to pilots. |

## 7. Before the public sees it: checklist

Do these before a launch post that links to the app:

- [x] **Fix the price mismatch.** Done 2026-09-26: the footer and the editor's pricing prompt now read from the plan catalog.
- [ ] **Use your own Google OAuth client.** Sign-in currently uses Neon's shared development keys, which show Neon
      branding and are not meant for production.
- [ ] **Search the trademark** for "Stratos" (Class 9 and 42). Several companies use it in voice and growth AI.
- [ ] **Pin the widget origins** (`WIDGET_ALLOWED_ORIGINS`) so only customer sites can mint voice tokens.
- [ ] **Measure latency** on at least 20 real calls before saying anything about speed; until then say nothing.
- [ ] **Get consent and privacy language reviewed by counsel.** The consent layer is an engineering implementation, not
      legal advice.
- [ ] **Decide Stripe live mode** and the refund terms; today billing is test-mode only.
- [ ] **Record a two-minute demo video** of a real call ending in a CRM lead, and a real post going out.
- [ ] **Write a one-page pilot agreement** in plain language.
- [ ] **Pin TryPost's health** (memory and worker checks in the operations note) before relying on scheduled posts.

## 8. What to measure

| Metric | Source | Note |
|---|---|---|
| Accounts researched, conversations, demos, pilots | The sales sheet | The whole funnel in five numbers. |
| Calls to qualified leads, per customer | CRM | Real once pilots run. |
| Time to first audio | Client-side measurement | Not measured yet; needs at least 20 turns before it can be reported. |
| Publish success rate | Receipts (`published` versus `queued` versus failed) | Already produced honestly by the pipeline. |
| Post reach and replies | The networks themselves | Track which pillar earns replies, not just likes. |
| Pilot outcome | Customer-reported and CRM | Only quote numbers a customer confirmed. |

## 9. Risks and mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| A crowded market makes us look like one more voice agent | High | Lead with the honest loop and the $2k+ seller; use Buyer Lab as the differentiated hook. |
| Speed or quality is worse than a buyer expects and we cannot prove otherwise | Medium | Measure before claiming; be candid about rough edges; fix what pilots surface. |
| Consent and recording law exposes a customer | Medium | Keep the consent layer on by default; counsel review before selling to regulated sectors. |
| The name collides with another company | Medium | Trademark search now; keep a fallback name and a domain ready. |
| One-person capacity limits pilots | High | Cap pilots at three; automate setup steps as they repeat. |
| Dependence on AssemblyAI and DeepSeek | Medium | Bring-your-own keys already shifts cost and risk to the customer; watch provider terms. |
| The publishing instance fails during a launch | Medium | It is now stable but small; run the health checks before launch and keep manual posting as a fallback. |
| Over-claiming in public damages trust | Medium | Every post goes through the claim check in `content-plan.md`. |

## 10. Decisions needed from the founder

1. Pilot price and length (the proposal above is $249 for 30 days).
2. The first 100 accounts: who owns building the list, and by when.
3. Whether to buy a second domain now (the free `getstratosgtm`-style names) as insurance against the name issue.
4. Which launch moment matters most: the hackathon deadline, or a Product Hunt day.
5. Whether to connect X and LinkedIn for publishing (each needs platform app registration) or keep posting there by hand.
