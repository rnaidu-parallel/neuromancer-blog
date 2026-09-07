---
title: "I built a local AI agent that plays Stardew Valley on its own"
description: "A C# SMAPI mod and a two-model Python harness let an LLM run a real farm through OpenRouter, cheaply, with objectives graded against structured game state rather than the model's own account of what it did."
pubDate: 2026-09-07
tags: ["ai-engineering", "agents", "game-agent", "structured-state", "openrouter"]
draft: false
repo: https://github.com/rnaidu-parallel/autoplay
---

I built [autoplay](https://github.com/rnaidu-parallel/autoplay): a local, autonomous Stardew Valley agent. A C# SMAPI mod exposes the game's real state and controls over a named pipe. A Python harness drives two model roles against it through OpenRouter: an **actor** that decides the next move, and a **director** that sets the next objective. It plays for real: navigating the farm, planting and watering real crops, sleeping and advancing the in-game days. And it's cheap: one representative run, two hours of wall-clock time covering about eleven in-game days on `openai/gpt-5.6-luna` (2026-09-03/04), cost $1.78 in model calls; OpenRouter's free MiniMax route works too, for iteration where cost matters more than quality.

The part I'm proudest of isn't that it plays. It's that neither model grades its own progress. Self-reported completion is a known soft spot in agent systems: a tool call can succeed at doing nothing, and nothing forces an agent (or its harness) to notice. Autoplay's design never takes that report at face value.

## The shape of it

The actor gets one fresh, stateless request per decision: no growing chat transcript, just the current structured state plus a compact set of tools (navigate, plant, till, inspect, stop). The director runs on a slower cadence. Neither grades itself: the harness completes an objective, with no extra model call, the instant a parseable success condition matches structured game state, things like `plantedCrops >= 15` or `day >= 9 and worldReady`.

"The tool call returned success" is explicitly not one of the conditions a predicate can be satisfied by. Planting a seed only counts once the harness re-reads the tile and finds a live crop on it and one fewer seed in inventory. Tilling only counts once the tile shows up as empty tilled soil in the next observation. The model's report of what it did is not evidence; the next structured read is.

## Where that discipline paid off

That rule earned its keep in a place I didn't expect: the harness's own monitoring. During one run, a mail-check tool got stuck, returning a valid, well-formed failure over and over from a spot that had worked minutes earlier. The harness had narrowed the actor's toolset while it waited, down to tools that couldn't clear the block, so a real stretch of the session produced nothing. The run's own dashboard missed it too, because it only flagged calls that errored out, not calls that "succeeded" at doing nothing; it read the run as barely wasted when the honest number was closer to ten times that.

Holding the metric to the same standard I hold gameplay to fixed both problems at once. The actor's tool list now has to release itself when its own escape hatches run out, instead of waiting on a review that never noticed in time. A stall watchdog got a matching fix: it used to mistake the in-game clock ticking for real progress, so it now masks the clock before checking whether anything actually moved.

## What's still open

The mailbox itself is still broken. That specific tool failing from a position that worked minutes earlier is a real defect further down in the game bridge, and the fix above only bounds the damage; it doesn't explain why the call fails. I shipped the guardrail and left the root cause open on purpose, rather than hiding it behind a retry. The project's own evaluation doc is blunt about the ceiling this implies today: current evidence supports bounded navigation and verified planting, not general competent autonomous play.

## The takeaway

Verifying against real state, not the model's account of it, is what let that run cover eleven in-game days without me watching every decision, cheaply enough to leave running. The same discipline also caught a wrong number on my own dashboard before I acted on it. If an agent's harness, or your production pipeline, only checks whether a step returned without error, hold its telemetry to the same bar you hold the agent to.

Repo and run logs are at [github.com/rnaidu-parallel/autoplay](https://github.com/rnaidu-parallel/autoplay).
