# Process overview

This file is rewritten at each crit. By Crit 10, Theseus was already a deployed multi-user application: one shared sentence, one house derived from it, persistent history and realtime updates. This week the main work was making that multi-user behaviour explicit enough that I could understand what two people were doing from the server logs, without relying on the interface.

## How I worked with the agent

I set the boundaries first, then used the agent to inspect, implement and test inside them. At the end of the Crit 10 work I reviewed `CLAUDE.md` rather than just appending to it: rules that still held stayed, and the scope moved to Crit 10 with the logging contract ([`30aa71a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/30aa71a)).

I also had to correct the agent when the process drifted. In one case it implemented code before writing the failing test. I stopped that pattern and added the rule to `CLAUDE.md` that the failing check comes first ([`3933e0a`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/3933e0a)). I also changed the CI expectations so tests run in both rule modes of the redesign rather than quietly skipping one ([`5fa620e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/5fa620e)); if the mode is unclear, the test reports an error instead of skipping it ([`176e6e2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/176e6e2)).

That mattered more to me than simply getting another green run. I wanted the correction to remain in the harness so the same mistake would be harder to repeat.

## What counts as a person

The first useful realisation was that multi-user support already existed. Independent browsers already received different visitor cookies, and the database already enforced the interaction rules. What was missing was a clear explanation of what Theseus considers a person.

I recorded that decision in [ADR 0002](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/main/docs/decisions/0002-pseudonymous-visitor-and-logging.md) ([`2234f0b`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/2234f0b)).

For Theseus, one browser holding the `theseus_visitor` cookie is one anonymous visitor. I considered stronger alternatives. Accounts would introduce signup and login to something that should work immediately from a URL. A chosen nickname would create a public identity surface that the project does not otherwise need. Device fingerprinting would identify more than is necessary.

The browser cookie is deliberately weaker. Two separate browser profiles count as separate visitors, but the public page still has no names, profiles or activity feed. That is enough identity for the server to enforce the rules without changing the character of the piece.

## Making the server behaviour visible

Before adding logging, I defined what the logs needed to show and had the agent write a failing logging contract ([`d69cdf7`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/d69cdf7)).

The implementation then landed as four separate commits, one for each kind of evidence: request information ([`0d5dc93`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/0d5dc93)), new and returning visitors ([`417c3ee`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/417c3ee)), replacement outcomes and the number of streams reached ([`07bd2a8`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/07bd2a8)), and the lifecycle of realtime streams ([`c9c0242`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/c9c0242)).

A request gets an id so related lines can be followed together. New and returning visitors can be distinguished, and an accepted replacement records enough information to explain what changed.

Rejected replacements are handled differently. The log records only the outcome: `spent`, `stale`, or `invalid` with a reason category. It never records the rejected word itself because that word never became public state.

The visitor identifier in the log is also not the cookie. It is a deterministic one-way tag. I do not log the raw cookie, IP address, user-agent string or browser fingerprint because none of those are needed to understand the interaction.

## Checking the evidence, not just the result

One recurring problem this week was deciding whether a passing run really explained an earlier failure.

A browser test failed once and then passed. I did not want to treat the second run as enough, so I asked for the measurements to be printed and for repeated runs without retries or weaker checks. The cause turned out to be leftover headless Chrome processes, not an application bug. I then fixed the test tooling itself rather than hiding the failure ([`33b10db`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/33b10db), [`68749d5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/68749d5)).

A separate timing problem followed the same pattern. I first added a regression test that demonstrated the millisecond-level bug ([`287e276`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/287e276)), then fixed the behaviour ([`b8b4af2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/commit/b8b4af2)).

These examples changed how I used the agent. A green result was useful, but if I could not explain why the earlier result was red, I kept investigating.

## Redesign work alongside Crit 10

After the Crit 9 version was complete, I also started a separate redesign branch. I kept it isolated because it changes the participation rule and adds a second, kept house rather than simply polishing the deployed version.

The redesign decisions are recorded separately in [ADR 0003](https://github.com/comp4020-agentic-coding-studio/comp4020-final-baizhenh884-dev/blob/final/theseus-redesign/docs/decisions/0003-settle-and-kept-ships.md). I did not merge them before the Crit 10 checkpoint because the Crit 10 version was the thing being assessed, and the redesign includes database changes that are harder to reverse once deployed. The branch is therefore part of the next iteration, not evidence that the Crit 10 production behaviour had already changed.

## Stack and trade-offs

The core stack stayed the same: Astro on Node, SQLite on the Fly volume, POST requests for writes and SSE for realtime updates.

POST already handles the replacement action, so realtime only needs the server to send changes back to connected pages. I chose SSE rather than WebSockets because the communication is one-way. Polling would repeatedly read the database without providing better truth, while the existing project rules also ruled out adding WebSockets without a reason.

SQLite remains the authoritative state. The realtime layer reports changes but does not replace the database.

The main trade-off in Crit 10 is that the server now knows enough to distinguish anonymous visitors in its logs, but I deliberately stop there. The system records enough information to explain what happened and debug failures, without collecting extra information about the person behind the browser.
