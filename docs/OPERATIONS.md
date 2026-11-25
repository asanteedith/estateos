# Operations: agents, workflow and integrations

## The nine roles

The Command Centre lists nine operating roles (CEO/Orchestrator, Market Intelligence, Lead Generation, Sales, Marketing, Engineering, Customer Success, Finance, Security). Each role has a task queue.

All nine are marked **manual**. That is accurate: there is no scheduler or background worker in this codebase. Work happens when a person, or a Claude session acting on the founder's instructions, picks up a task and records the outcome in the Command Centre. The dashboard counts only what has been recorded.

## Acquisition workflow and where each step is recorded

| Step | Where |
| --- | --- |
| Research a market or competitor | Agent task for Market Intelligence, with source links in the task detail |
| Find an agency and its public business contacts | Prospects → Add (source URL required in practice; prospects without one are flagged "no source") |
| Score fit | Tick only the signals you checked on their site or profiles |
| Check previous outreach | The prospect page shows history and warns if they were already contacted. Also search Gmail before writing. |
| Write and send the message | Draft in Gmail or WhatsApp. Founder approval is needed before anything is sent on the founder's behalf. |
| Record it | Prospect page → Record a message (paste the Gmail message id to block double-recording) |
| Reply received | Record as inbound; it then appears under "Replies waiting for us" |
| Demo | Book meeting on the prospect page |
| Proposal | Create on the prospect page (policy price by default), mark sent once it has actually gone out |
| Deposit | Accept the proposal, issue the deposit invoice, record the payment only after checking the money arrived |
| Onboarding | Create their agency workspace via /signup with them, then load their listings |

## Integrations: what is real today

| Integration | Status |
| --- | --- |
| Gmail | Not connected to the app. A Gmail connector exists in the Claude workspace; sending and syncing still happen outside the app and are recorded by hand. |
| WhatsApp | Not connected. Messages are sent from the founder's WhatsApp and recorded by hand. |
| Calendar | Not connected. Meetings are recorded in the app. |
| Payments (MoMo, Paystack, Stripe) | Not connected. Payments are verified by a person and recorded with evidence. |
| Hosting | Not deployed. See DEPLOY.md. |

## Rules the system enforces

- No duplicate prospects (same website domain or same normalised company name).
- No message recorded twice, and no second outbound within 48 hours unless marked as a follow-up.
- No price below policy without founder approval.
- No invoice marked paid without a verified payment with evidence.
- No cost recorded without an approved spend.
- Every change is written to the activity log.
