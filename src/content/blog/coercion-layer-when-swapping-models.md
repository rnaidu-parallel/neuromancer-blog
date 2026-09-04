---
title: "If you keep swapping models in production, you need a coercion layer"
description: "I swapped Claude Sonnet for an open model ~50x cheaper. The gaps I hit are why a coercion layer is non-negotiable once you keep changing models in a production agent."
pubDate: 2026-06-08
tags: ["ai-engineering", "tool-calling", "open-models", "openrouter", "evals"]
draft: false
repo: https://github.com/rnaidu-parallel/agent-coercion-layer
---

I switched one of my agents from Claude Sonnet to an open model to save money. Most of it kept
working on the first try. Then the structured calls started coming back wrong. Not an error from
the API, nothing that threw. The call would come back incomplete, and sometimes I got a plain
string where my code expected an object. Same code that had returned clean objects on Sonnet a
minute earlier.

That kind of failure is the annoying kind, because nothing is technically broken. The request
succeeds. The model answers. The shape is just slightly off, and your parser is the thing that
falls over.

Here is what I took from it, and it is not "open models are not ready." They are ready, and they
are cheap enough that you would be leaving money on the table by ignoring them. The lesson is
narrower and more useful: the moment you start changing models in a production agent, you need a
coercion layer. A small piece that normalizes model output before your application sees it, so a
model swap does not turn into an outage.

## Why I switched

The reason is boring, and it is the whole point: cost. The open model I moved to runs around
$0.14 per million input tokens and $0.28 per million output. Sonnet is $3 and $15. That is
roughly twenty times cheaper going in and fifty times cheaper coming out. For an agent that runs
at any real volume, that is the difference between a feature that pays for itself and one that
quietly bleeds.

And for an agent, the sticker price isn't even the number that matters most. An agent resends the
same system prompt, tool definitions, and accumulated context on every turn, so once prompt caching
is on, the bill is dominated by cached input, not fresh input. That is where the gap is widest: a
cached input token is about $0.30 per million on Sonnet versus roughly $0.0028 on this open model,
around 100x, wider than both the fresh-input and the output gaps. It compounds with session length
too, because the longer the conversation, the bigger the cached prefix you re-read every turn.
(Sonnet also charges a premium to write the cache; this model does not.) The cached-read rate is
what a long-running agent should be optimized around, and it is the one number most people never
check.

And the quality held. For the large majority of calls the open model did the same job. I was not
trading correctness for price on most of the work, which is exactly why the switch was worth
making, and why the few rough edges were worth solving instead of running from.

## The setup, so you can reproduce it

Before I blame a model I try to rule out my own stack. Here is the exact setup, because the
details are what make this reproducible:

- Vercel AI SDK, with OpenRouter as the provider. Same application code for both models. I only
  change the model id.
- I tried both the OpenAI-style message format and the Anthropic protocol. Same behavior.
- Within OpenRouter I tried both the DeepInfra and the Xiaomi routes for the open model. Same
  behavior.

So it was not a message-format mistake, and it was not one unlucky provider node. The behavior
was consistent enough to be a property of the model, not my plumbing.

The numbers below are pinned to `xiaomi/mimo-v2.5` and `anthropic/claude-sonnet-4.6`, run on
2026-06-08 through the Vercel AI SDK on OpenRouter. I am spelling that out because model behavior
drifts, and a result without a version and a date is a rumor.

## The gap

In production I saw a few shapes go wrong: calls that came back incomplete, and the occasional
JSON string instead of an object. To pin it down I built a tiny harness that runs the same task
across both models with the framework's repair turned off, so I would see the raw behavior
instead of whatever the SDK quietly fixes.

The one I can hand you a clean, repeatable repro for is nullable fields. When a tool's schema had
a field marked nullable, the model would start the tool call and then stop partway through, leaving
the arguments incomplete. In one capture they came back as:

```
{"title": "...", "caption":
```

and then nothing, cut off right at the nullable field. Flip that single field from nullable to
optional, and the same call succeeds every time.

| tool schema | open model (`mimo-v2.5`) | Sonnet (`4.6`) |
|---|---|---|
| field marked `nullable` | fails, truncates at the field | passes |
| same field marked `optional` | passes | passes |

That is the kind of bug I like, because it is specific. It is not "the model is bad at tools."
Enums worked. Nested objects worked. A large, deeply nested structured output worked. One field
modifier was the trip wire.

## Why this is not a knock on open models

Two reasons.

First, the field moves fast. When I ran the same harness against newer and sibling models, most
of the shapes that had bitten me earlier were simply gone. That is good news, and it is also the
catch: your eval from last month may not describe the model you are running today. These things
improve quickly, and this particular edge will very likely get smoothed over in a future release
too.

Second, this is a known, solved-shaped problem, not a dead end. Look at almost any open-source
agent stack and you will find a coercion layer sitting between the model and the application. The
Hermes function-calling stack extracts the tool call from raw text, falls back through more than
one parser, and re-prompts the model when validation fails. vLLM's tool parsers coerce types and
flatten schema quirks before your code runs. LiteLLM repairs truncated and concatenated JSON.
They do it by default, quietly, because everyone running these models at scale hits the same
class of thing.

In other words, the ecosystem already treats this as normal and builds for it. I just needed the
same thing in my own stack.

## I used to do this by hand

None of this is new, which is the part I find funny. Back on gpt-3.5-turbo and gpt-4, before
structured output was reliable, I wrote my own parsers. You assumed the output would be a little
off, so you handled it: pull the JSON out of the prose, fix the quote it got wrong, coerce the
obvious type. Over time the models got better at following instructions, the APIs and SDKs grew
real structured-output support, and I quietly stopped. I started trusting the output.

Swapping models is the reminder that the parsing layer never really went away. The coercion layer is
just that old habit, brought back in a smaller, lighter form.

## The safety net

So I built a small one, and I made it transparent on purpose. It takes whatever the model
returned and recovers a clean object, and it reports every repair it had to make, so I can log
them and keep an eye on what my models are actually doing. A safety net you can see through is
worth more than one that hides the problem.

It handles the common shape problems: a code fence around the JSON, a sentence wrapped around the
object, a stringified object where I expected an object, a trailing comma. Each of those is a
real pattern the open-source stacks handle too.

There is one thing it deliberately does not try to fix: a truncated, incomplete object. If the
model stopped halfway, the data is not there, and no parser can invent it. That failure you
prevent at the schema level, not at parse time. So the rule I follow is simple: prevent the
failures you can, coerce the rest.

Prevention, concretely, is the nullable lesson from earlier. Use optional instead of nullable in
tool schemas and normalize to null in your own code. If you want to be sure it stays that way,
add a one-line check to your build that fails when a nullable field sneaks back into a tool
schema.

## The tradeoff

A coercion layer is insurance, and insurance has a premium. It is a little extra code and a few
milliseconds per call. It is also not a license to stop paying attention. It does not replace
pinning your model versions, and it does not replace running your own schemas through a quick
check whenever you change models or providers. The net catches the slips. It does not mean you
stop watching the road.

## Takeaway

Open models are production-ready, and they are cheap enough that swapping between them should be a
normal part of how you run an agent. The piece that makes swapping safe is a coercion layer that
absorbs the small shape differences between models, so changing a model id does not become an
incident. Pin your versions, test your schemas, keep the net, and stay alert, because these
models move fast and the eval you trust today is a snapshot, not a guarantee.

---

The harness and the coercion layer live in one small repo:
[github.com/rnaidu-parallel/agent-coercion-layer](https://github.com/rnaidu-parallel/agent-coercion-layer).
It runs the same task across whatever models you point it at, with repair off so you see the raw
behavior, and it ships the coercion layer so you can try the net on your own model and schema.

Sources worth reading: [Hermes-Function-Calling](https://github.com/NousResearch/Hermes-Function-Calling),
[vLLM tool parsers](https://github.com/vllm-project/vllm), [LiteLLM](https://github.com/BerriAI/litellm).
