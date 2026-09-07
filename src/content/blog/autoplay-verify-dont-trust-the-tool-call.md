---
title: "A tool call succeeding is not proof anything happened"
description: "My AI agent's own wasted-decision metric read 7.5% on a two-hour Stardew Valley run. After I fixed how it classified a stalled loop, the same run read 80.8%. Why the harness now verifies against game state, never the model's account of its own actions."
pubDate: 2026-09-07
tags: ["ai-engineering", "agents", "game-agent", "structured-state", "openrouter"]
draft: false
repo: https://github.com/rnaidu-parallel/autoplay
---

Partway through a two-hour livestream, my AI agent got stuck trying to open a mailbox for 74 minutes. When I first pulled the run's report, `wasted_decision_rate` read 7.5%. After I went back and fixed how that metric classified a stalled loop, the same run read 80.8%.

Nothing about the gameplay changed between those two numbers. What changed was the definition: the metric had been counting a valid tool call as success, not a change in the game. That distinction, an action versus its effect, is the thing most of the harness under [autoplay](https://github.com/rnaidu-parallel/autoplay), a local autonomous Stardew Valley agent, exists to enforce.

## The shape of it

A C# SMAPI mod exposes the game's real state and controls over a named pipe: player, world, inventory, nearby objects, a local collision grid. A Python harness drives two model roles against it through OpenRouter. An **actor** gets one fresh, stateless request per decision: no growing chat transcript, just the current structured state plus a compact set of tools (navigate, plant, till, inspect, stop). A **director** runs on a slower cadence and sets the next objective. Neither grades itself.

The rule that matters: the harness completes an objective, with no extra model call, the instant a parseable success condition matches structured game state, things like `plantedCrops >= 15` or `day >= 9 and worldReady`. The director proposes; it never certifies its own play. "The tool call returned success" is explicitly not one of the conditions a predicate can be satisfied by. Planting a seed only counts once the harness re-reads the tile and finds a live crop on it and one fewer seed in inventory. Tilling only counts once the tile shows up as empty tilled soil in the next observation. The model's report of what it did is not evidence; the next structured read is.

## Where the same mistake snuck back in

The mailbox incident is the reason that rule exists as a hard line, not a preference. It happened on a run of `openai/gpt-5.6-luna` (actor at low reasoning, director at medium), 2026-09-03/04. Investigating the stall in the run log (`events.jsonl`, roughly 7,900 events) showed the harness had narrowed the actor to three tools while a mail-check was pending, and two of those three were no-ops in that state. `check_mail` kept returning a valid, well-formed failure, 31 times in a row, from the same tile and facing that had worked earlier in the run. Sleeping was the only way out, and sleeping delivered more mail, so the loop just re-armed itself across game-days.

`wasted_decision_rate` never caught it, because the metric only flagged calls that came back `rejected`, `blocked`, or `timeout`. A tool call that returns `review_requested` counted as a successful call, even though nothing in the world moved. Reclassifying those outcomes as waste is what moved the number from 7.5% to 80.8%. Separately, of the run's $1.78 in total model cost, about $1.24 (roughly 70%) bought nothing during the stall. A stall watchdog existed too, and also missed it: its progress fingerprint included the in-game clock, which advances on its own, so a frozen loop still looked like forward motion every tick.

Both fixes were the same fix: stop trusting an artifact the model can produce for free (a well-formed tool response, the passage of time) as a stand-in for the thing that is actually supposed to change. The stall fingerprint now masks the clock. The gate that narrows the actor's tools now has to self-release, pausing when its own escape hatches are exhausted or an operator intervenes, instead of trusting the next director review to notice.

## What I didn't fix

The mailbox itself is still broken. `check_mail` failing from a position that worked minutes earlier is a real defect in the SMAPI bridge, and the gate fix only bounds the damage (a few wasted calls a day instead of an unbounded loop); it doesn't explain why the call fails. I shipped the guardrail and left the root cause open, on purpose, rather than papering over it with a retry that would have hidden the next version of the same bug. The project's own evaluation doc is blunt about the ceiling this implies: current evidence supports bounded navigation and verified planting, not general competent autonomous play.

## The takeaway

If an agent's harness, or your production pipeline, scores itself on whether a step returned without error, you're one narrowed tool list away from a confident, well-instrumented, completely stalled loop. Score against the state you actually care about: the row that changed, the crop that grew, the ticket that closed. Make sure your own telemetry checks that same thing, not the model's account of it.

Repo, run logs, and the rest of the verification design are at [github.com/rnaidu-parallel/autoplay](https://github.com/rnaidu-parallel/autoplay).
