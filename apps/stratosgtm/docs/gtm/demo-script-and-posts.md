# StratosGTM: demo call script and clip posts

Written 2026-09-26. Companion to `content-plan.md` (posts D1 to D4 and the claim check). Rules that apply to everything
here: record a real call, never a mock; no speed or latency claim; no results or customer claims; the agent
"qualifies and logs leads", it does not "book meetings".

## 1. Setup (10 minutes, once)

1. Use a clean workspace or the anonymous demo at `https://stratosgtm.vercel.app/console`. Anonymous sessions cap at five
   minutes, which is enough.
2. Use a headset or quiet room; browser mic permission on.
3. Open the CRM board in a second window so the lead can be seen appearing.
4. Screen-record the browser at a size that fits a phone screen. Do not show the Keys panel, any email inbox, or real lead data.
5. Fictional visitor for the call: "Sam Rivera", Rivera Growth Studio, a founder selling a $4,000 group coaching program.
   Use a throwaway email you own so nothing is faked in the CRM.

## 2. The call (target 90 seconds on screen)

You play the visitor. The agent's wording is live and unscripted, so do not read lines for it. Your lines:

| # | You say | What should happen (verify, do not promise) |
|---|---|---|
| 1 | Start the session, wait for the greeting | The AI disclosure is spoken first. Keep it in the clip; it is a selling point. |
| 2 | "Hi, I run a coaching program for agency founders. People visit my site at night and I miss them." | The agent asks about the offer or the visitor. |
| 3 | "The program is four thousand dollars. I get maybe twenty visitors a week who actually want it." | Budget and offer size are captured. |
| 4 | "I'd want to start in the next month or so." | Timeline captured (`qualify_lead`). |
| 5 | "My name is Sam Rivera, sam@ your throwaway address." | `create_or_update_lead` runs; the lead appears on the board. |
| 6 | "Can someone talk to me this week?" | A consultation request is recorded. Do not say it booked a calendar slot. It did not. |
| 7 | End the session | Show the lead card with budget, timeline and the consultation request. |

If the agent does something unexpected, keep the take if it is honest and interesting; re-record if it is wrong or
awkward. Do not edit speech or reorder anything. Trim only dead air at the start and end, and say so in the caption if
you cut anything else.

## 3. Screen plan for the clip

1. Console with the call starting (2 s).
2. Live captions or transcript while you speak (most of the clip).
3. Cut to the CRM board with the new lead card (5 s hold).
4. Text card: "One real call, unedited apart from trimming. The lead is logged in the CRM."

No music with claims, no fake counters, no speed numbers.

## 4. Posts (Bluesky first; each 300 characters or fewer)

**P1: the clip (D1)**
> One real call, start to finish. A visitor asks about a $4,000 program, the agent qualifies budget and timeline, and the lead lands in the CRM. Rough in places, but real. Early days: https://stratosgtm.vercel.app

**P2: the disclosure**
> The first thing the agent does on every call is tell the visitor it is an AI. Not buried in the footer. Spoken, before anything else. If you run a voice agent on your site, this matters more than the voice does.

**P3: the CRM view (D3)**
> The part I like watching: the lead card appears on the board while the call is still going. Name, budget, timeline, and a consultation request. It records the request, it does not book a calendar slot yet. We would rather say so.

**P4: the feedback ask**
> I'm building this in public and looking for feedback from founders who sell $2k+ offers. StratosGTM is a voice agent that qualifies visitors on your site and logs the lead. Early, rough in places. Try one call and tell me what felt off and what you'd never let it say. https://stratosgtm.vercel.app

**P4-paid: the paid pilot ask (HOLD until your OPT start date; do not post before then)**
> If you sell a $2k+ offer and lose visitors after hours, I would like to run this on your page for 30 days and show you what it catches. $299 for 30 days, no auto-renew, weekly review with me. Three spots. Reply or DM.

**P5: behind the clip (technical readers)**
> Behind the clip: the agent registers seven tools with the voice API. When the visitor says a budget, it calls qualify_lead. The server checks guardrails and writes the lead. Same conversation can seed a post draft. What is real and not: https://stratosgtm.vercel.app/analysis.html

## 5. Longer versions (manual on LinkedIn and X)

**LinkedIn / newsletter (about 276 words; the feedback ask, no paid offer)**
> I'm building this in public and looking for feedback from founders who sell $2k+ offers.
>
> Here is the problem I keep seeing. Someone lands on your page at 11pm, interested in a program that costs thousands of dollars. Nobody is there to talk to them, so they read a bit, leave, and often never come back. You never learn who they were.
>
> StratosGTM is my attempt at that gap. It is a voice agent that talks with visitors on your site. It asks about their situation and budget, checks timeline and fit, and writes the lead into a simple CRM while the conversation is still going. It also tells every visitor up front that they are speaking with an AI, and it asks for consent where the law requires it.
>
> It is early software, and rough in places.
>
> What it does not do yet:
> - It does not book calendar meetings. It records a consultation request on the lead.
> - It publishes to Bluesky only, for now.
> - I have not measured how fast it responds, so I will not claim a speed.
>
> What I need from you is honest feedback, not praise. If you sell a $2k+ offer, try one call with the agent and tell me three things: what felt off, what was missing, and what you would never let it say to your visitors. Blunt is welcome. I would rather hear it now.
>
> You can try it here, no signup needed for the demo: https://stratosgtm.vercel.app
>
> If you would rather talk than type, reply or send me a message and we can compare notes.
>
> I will share what I learn, including the parts that do not work.

**X thread (5 posts):** use P1, P2, P3, P5, P4 in that order, one per post.

## 6. Before you publish (claim check)

- [ ] The clip is a real, unscripted agent side; nothing sped up or reordered.
- [ ] No latency or speed claim in any caption.
- [ ] No name, email or lead data on screen that is not the fictional visitor.
- [ ] "Consultation request", not "booked".
- [ ] P4 asks for feedback only. No price, no paid offer. P4-paid waits until your OPT start date.
- [ ] Publish through the app (Publish via TryPost) and confirm the receipt says **published**, then check Bluesky.
