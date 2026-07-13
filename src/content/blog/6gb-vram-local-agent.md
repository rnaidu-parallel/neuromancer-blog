---
title: "6GB of VRAM is enough, if you know where the tokens go"
description: "A personal AI agent on a 2018 gaming laptop with 6GB of VRAM. The five budget constraints that actually decide a local agent stack, each measured."
pubDate: 2026-06-11
tags: ["local-llm", "ollama", "agents", "qwen", "hermes", "self-hosting"]
draft: false
margin_note: "A personal AI agent on a 2018 gaming laptop with 6GB of VRAM, measured through five budget constraints."
plate: { kind: budget, params: { total: 6, ticks: 5, emphasis: "KV" } }
---

I have an Acer Predator Helios 300 from 2018. It has 16GB of RAM, a 6GB GTX 1660 Ti, a 256GB SSD and a 1TB hard drive, and it dual-boots Windows and Ubuntu. Everything here ran in Ubuntu.

I wanted one specific thing from it: a personal AI agent that runs entirely on the laptop. No cloud API keys, no per-token bill, nothing leaving the machine, and useful enough that I would actually reach for it. The stack is Hermes, an open-source agent framework from Nous Research, pointed at a local model served by Ollama. I talk to it from Telegram, and it can run shell commands and search the web on my behalf.

The hard part was not picking a model. On a 6GB card the model is the easy part. What decided whether the agent was usable was budget: how much of the VRAM the KV cache eats, how large the prompt grows before I have typed anything, and how much hidden latency the stack adds without telling me. Five things settled it, and each one has a number I measured on the laptop.

<figure style="margin: 2.5rem auto; max-width: 300px; text-align: center;">
  <video controls playsinline preload="metadata" poster="/hermes-phone-demo-poster.jpg" style="width: 100%; border-radius: 14px; display: block;">
    <source src="/hermes-phone-demo.mp4" type="video/mp4" />
    Your browser does not support the video tag.
  </video>
  <figcaption style="font-size: 0.85rem; opacity: 0.65; margin-top: 0.6rem;">The agent on my phone, driving the laptop over Telegram.</figcaption>
</figure>

## 1. The framework's context floor decides which models qualify

Hermes has one hard requirement that rules out most small models before quality is even on the table. It needs a model that reports at least 64,000 tokens of context, and it checks at startup. Anything under the line is rejected outright with `context window below minimum 64,000 tokens`. This is not a soft recommendation: the floor is a hardcoded constant in the framework, `MINIMUM_CONTEXT_LENGTH = 64_000`.

I started with Qwen3 8B, which I had picked as a strong 8B for tool calling. It did not work, for a reason that had nothing to do with quality. The stock Qwen3 8B in Ollama tops out at a 40,960 token context window, which is under the floor, so Hermes refuses to boot with it. And at around 5GB of weights it would have left almost nothing for a KV cache on a 6GB card anyway.

Hermes does give you an escape hatch, and it is worth understanding because the wrong use of it is a trap. If you know a model genuinely supports a larger window than it advertises, you can set `model.context_length` in the config to override the detected value. That is the legitimate case. The illegitimate one is tempting: claim 64k on a model that truly tops out lower. Hermes stops complaining, then silently truncates its own skills and tool schemas to fit the real window, and the agent starts behaving unpredictably for reasons you can no longer see. A loud failure at startup beats a silent one at runtime, so I did not force it.

That left me looking for a small model with a genuinely large native context, which is what pushed me toward a 4B. The general lesson is that an agent framework is a filter. Plenty of small models either fall under the context floor or need a fine-tuned variant to tool-call reliably through Ollama's stock build, and both of those cut the list down before you ever get to argue about which model is smarter.

## 2. On a small GPU, the KV cache is the bottleneck, not the parameter count

This is the constraint that actually mattered, and it is the one no leaderboard measures.

I started on Qwen3 4B. It is 2.5GB on disk, and unlike the 8B that fell to the context floor, Ollama serves it with a 256k context window, comfortably past Hermes's 64k line (the stock 8B tag never got the same context extension). I tuned everything I could on the server: KV cache quantized to q4_0, flash attention on, context set to 64k. It still pushed about 40% of the model onto the CPU and generated 8 to 13 tokens a second, getting slower as the session grew. The weights fit fine. The 64k KV cache, the running memory of the conversation, did not, and on a standard transformer it grows with every token of context.

I had already turned every quantization knob I had. The only lever left was the architecture itself.

Qwen3.5 4B is a hybrid. It has 32 layers: 24 of them are Gated DeltaNet linear-attention layers and only 8 are full softmax attention, in a repeating three-to-one pattern. The linear layers carry a fixed-size recurrent state instead of a cache that grows with the conversation, so only about one layer in four has a KV cache that scales with context. At 64k tokens that is roughly a quarter of the long-context memory footprint of a normal transformer, for the same parameter count.

Same GPU, same settings, measured head to head on the laptop:

| Metric | Qwen3 4B | Qwen3.5 4B |
| --- | --- | --- |
| Generation speed | 8 to 13 tok/s | **44.3 tok/s (about 4x)** |
| CPU / GPU split at 64k | ~40% on CPU | **20% on CPU / 80% on GPU** |
| Native context | 262,144 | 262,144 |
| Disk size | 2.5GB | 3.4GB |
| Loaded in VRAM at 64k | — | 4.6GB |

A four times speedup on the same hardware, from changing the shape of the attention rather than the size of the model. The hybrid keeps more of itself on the GPU because it is not hauling a growing cache around. (The 3.4GB file is larger than the 2.5GB Qwen3 4B because Qwen3.5 4B is actually a 4.66B-parameter, vision-capable model; I only ever use it for text.)

Two honest caveats. First, this kind of hybrid support in Ollama and llama.cpp is new, so verify it actually engaged instead of assuming it. The check is the CPU/GPU split after the model loads: if you are not seeing roughly 80% on the GPU at 64k context, the linear path did not kick in and you are on a slow fallback. Second, 4.6GB loaded against a 6GB ceiling is tight. As a session's history grows you walk toward an out-of-memory wall, which is why a fresh session per task is the habit.

The general lesson is the useful part. On a small GPU, architecture is a stronger lever than any quantization setting, because the cache, not the weight count, is what overflows your VRAM. Check the split, do not trust the tag.

## 3. Tool schemas, not the conversation, are most of the prompt

Once the model fit and ran at a usable speed, the next problem was latency, and the biggest source of it was the prompt size.

Out of the box, my Telegram agent loaded seventeen toolsets, and every toolset injects its full schema into every message. Not once at startup. Every turn. The `skills` toolset alone was about 32KB of schema text. Measured on my setup, the fixed prompt came to roughly 43,000 tokens per message before I had typed anything at all. On a machine generating around 12 tokens a second, a 43,000 token prompt is not slow, it is unusable: the model spends close to a minute reading its own instructions before it starts to answer.

I trimmed the toolsets to the three I actually use from my phone: `clarify`, `terminal`, and `web`. The prompt dropped from about 43,000 tokens to about 2,900.

Those three are the whole reason the agent exists. `clarify` lets it ask me a multiple-choice question with real Telegram buttons instead of guessing. `web` gives it search. And `terminal` is the one that earns its keep: from Telegram, on my phone, I can have the agent run a shell command on the laptop, check on something, start a job, or hand a real task to another agent running locally, and get the result back in the chat. The laptop sits in a corner of the room and I drive it from my pocket.

And it already reaches past the laptop. My Mac is on the same network, so the same `terminal` tool runs commands, or agents, on the Mac too. The phone is one doorway, and whichever machine should do the work gets handed it. The setup that lets those machines share and collaborate on work is its own story, and I will write that one up separately.

The trim itself is the difference between a tech demo and a thing I use daily. Nothing about the model changed. I just stopped paying, on every message, to re-read schemas for tools I was never going to call.

## 4. Gateways drop API fields silently, so assert effects and not status codes

The next slice of latency was invisible by design. Every reply was burning 400 to 500 reasoning tokens I never asked for and never saw, about 40 seconds per message that showed up as nothing but a spinner.

Hermes was doing the right thing. It sent `think: false` on every request. The problem is that Ollama's OpenAI-compatible `/v1` endpoint ignores that field. The native `/api/chat` endpoint honors it; the compatibility layer drops it and returns a clean 200. The request looked successful. It just did the opposite of what I asked. This is a known upstream issue ([hermes-agent#25758](https://github.com/NousResearch/hermes-agent/issues/25758)).

The field that actually works on `/v1` is `reasoning_effort: "none"`. Setting it in the Hermes config and patching it onto every request killed the hidden reasoning entirely, verified at zero reasoning characters afterward.

```yaml
# hermes config
agent:
  reasoning_effort: none
```

```python
# custom-provider plugin: force it onto every /v1 request
# Ollama's OpenAI-compat endpoint ignores think:false; reasoning_effort:none is the one it honors.
extra_body["reasoning_effort"] = "none"
```

The takeaway outlives the bug. A 200 means your request was received, not that it was honored. When a field controls cost or latency, verify the effect instead of trusting the status code. I have hit the same class of bug on a separate cloud stack, where a router quietly dropped a provider-native field.

One cost worth noting: the patch lives in a plugin, so a Hermes update reverts it, a recurring tax until the fix lands upstream.

## 5. The unglamorous warm-up that makes it a daily driver

Everything above made it fast. This last part made it something I actually reach for, and it is the piece nobody writes up.

The cold start was brutal. The first prompt after the model unloaded took 78 seconds to evaluate. Pinning the model and its prompt cache in memory fixed it:

```bash
# keep the model and its prompt cache resident
OLLAMA_KEEP_ALIVE=-1
```

A 78 second cold start became a warm half second. Same idea as prompt caching in the cloud, except the cache is the thing sitting in my closet.

The rest of the server tuning lives in a systemd override so it survives restarts:

```ini
# /etc/systemd/system/ollama.service.d/override.conf
[Service]
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_KV_CACHE_TYPE=q4_0"
Environment="OLLAMA_CONTEXT_LENGTH=65536"
Environment="OLLAMA_KEEP_ALIVE=-1"
# weights live on the spare HDD, not the SSD
Environment="OLLAMA_MODELS=/home/ollama-models"
```

A couple more that each cost me real time before I found them:

- Run the gateway as a systemd user service. Starting it by hand with `gateway run --replace` fights the supervisor, and the two keep restarting each other. One interface, no fighting: `systemctl --user {start,stop,restart} hermes-gateway`.
- The agent's persona file says, in plain words, that every token costs real wall-clock time and replies should stay short. On a machine doing 12 tokens a second, brevity is not a style preference, it is a latency setting.

I wrapped the daily moves into one small script. `up` starts the two services and fires a throwaway request to warm the model and prime the prompt cache. `down` unloads the model from VRAM and leaves the idle Ollama service running at roughly zero cost. `status` changes nothing and just reports health.

The line in `status` I lean on most is the one that reads back the CPU/GPU split, because that is the early warning for constraint 2. If the hybrid path quietly stops engaging after an update, the split tells me before the slowness does.

```bash
# hermesctl.sh status — the health line that catches a linear-attention regression
ps_out=$(ollama ps | tail -n +2)   # columns: NAME ID SIZE PROCESSOR CONTEXT UNTIL
echo "$ps_out" | awk '{printf "model: %s  %s %s  split: %s %s  ctx: %s\n", $1,$3,$4,$5,$6,$7}'
# the PROCESSOR column is the CPU/GPU split. If it is not ~80% GPU at 64k context,
# the linear-attention path did not kick in and you are on a slow fallback.
```

The warm-up request in `up` is also where `reasoning_effort: "none"` earns its place a second time: a five-token "reply with OK" loads the weights and the cache without paying 40 seconds of hidden reasoning to do it.

## What it adds up to

An eight year old laptop. 6GB of VRAM. A 4B model. Zero dollars per token, and nothing leaving the machine. The numbers that got it there, in one place:

- Tool schema trim: 43,000 to 2,900 prompt tokens per message.
- Hidden reasoning: 400 to 500 tokens per reply, about 40 seconds, gone.
- Cold start: 78 seconds down to about half a second.
- Generation: 8 to 13 tokens a second up to 44.3, from one architecture swap.
- Offload: about 40% on the CPU down to 20%, with 80% on the GPU.

None of those came from picking a better model off a leaderboard. They came from finding where the tokens were going and refusing to pay for the ones I did not need. The benchmark question, which model is best, was the wrong question for this hardware. The right one was where my budget actually goes, and on a 6GB card the honest answer is the prompt and the cache, long before it ever reaches the weights.

And the cuts did not gut it. The quantized 4B still holds up for the job I give it: a dispatcher that routes the real work to stronger agents, on the laptop or my Mac across the network. It does not need to be brilliant, the brilliance is delegated.

If you have an old gaming laptop in a drawer, it is probably enough. You just have to know where the tokens go.
