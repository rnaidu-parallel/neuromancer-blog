---
title: "How I set up Claude Code to stop starting from zero"
description: "A global memory vault that gives my coding agent context across sessions, machines, and agents, plus the small config tweaks that keep a live session sharp. The architecture, the tooling I looked at, and the honest numbers."
pubDate: 2026-06-28
tags: ["ai-engineering", "claude-code", "agent-memory", "context-engineering", "knowledge-graph", "developer-tools"]
draft: false
image: "/images/second-brain-graph.png"
---

Every new session with a coding agent starts from zero. It does not remember yesterday's decision,
the dead end you ruled out, or why the auth module is shaped the way it is. So the session opens with
the agent rebuilding that context from scratch: I point it at the same two or three planning documents
and it reads them end to end, then re-scans the same code it walked yesterday. That is easily fifteen to
twenty thousand tokens, sometimes more, burned reconstructing what it already knew before a single
useful instruction lands.

The fix is not a better model, it is managing what sits in the context window. So I spent an
afternoon on how other people handle that and found the same problem hit from a few angles:
persistent-memory files, note vaults wired into the agent, knowledge graphs laid over those notes,
and aggressive in-session compaction. No single one was the whole answer, so I combined them
into one setup.

At the core is a **brain**: a memory vault that survives every session. Around it sit a few smaller
config tweaks that keep the live window sharp. It is mostly markdown and a few config files, which
turns out to be the point.

## The brain

The first question is where memory lives, and I keep it global. One vault (`~/second-brain`) holds
the durable knowledge for every project: decisions, session logs, research, small atomic notes. Each
project's `CLAUDE.md` stays under 200 lines and just points into that vault instead of restating it,
so it is a signpost, not a second store.

Per-project silos lose on three counts: knowledge fragments across repos, you cannot search across
projects, and anything I want to mine later for writing needs one corpus, not a dozen.

The verdict matched where others had already landed. Anthropic's own guidance says the same, and so
do writers like Kenneth Reitz, who frames a single vault with a root instructions file as the
contract. The evidence that mattered: a `CLAUDE.md` over ~200 lines is widely reported to reduce
instruction adherence, and the built-in `MEMORY.md` injection is capped at 200 lines / 25KB. The
always-loaded layer is the scarce resource. Vault size itself costs nothing, because notes are
retrieved on demand, never bulk-loaded. The honest gap: nobody has a controlled study of retrieval
quality versus vault size, so all sizing guidance, mine included, is anecdotal.

### Vault vs the built-in memory

Claude Code now ships its own memory, a `MEMORY.md` it writes and loads at the top of every session,
so why build a vault at all? They are different layers. The built-in one is always-loaded: small,
automatic, good for learned preferences and the build command you keep retyping. The vault is the
navigable corpus: large, deliberate, reached into on demand. It spans every project, moves between
machines, lives in version control with full history, and is plain markdown a human can edit.
Auto-memory remembers your habits; the vault remembers your reasoning. Keep both, and keep the
always-loaded layer tiny.

### What's in it

The vault is markdown under one git-versioned directory: a `HOME.md` root index, a map-of-content
file per section, atomic notes for principles, decision records for the why, and a small map per
active project linking its logs. The rule: every note is reachable from `HOME.md` in at most two hops.

Two skills drive the loop, their shape borrowed from an open-source setup
(`lucasrosati/claude-code-memory-setup`) stripped down to the part that earns its keep:

- **`/save`** distills a finished session into a log, any new decisions, and the relevant map
  updates, then commits.
- **`/orient`** reads a project's map and most recent log at the start of a session on a tight budget
  (under 2,000 tokens), so I land oriented instead of cold.

They are named to avoid clashing with Claude Code's native `--resume`. Wiring is two edits: a ~12-line
vault section in the global `CLAUDE.md`, a 2-line pointer in the project's.

### The graph

Wikilinks and the maps-of-content do the everyday navigation; that is what `/orient` walks and what
the day-to-day runs on. The graph is for what they answer badly: how something in one project relates
to a note in another, or what the overall shape of the vault is. For that I run Graphify
(`safishamsi/graphify`) over it, the tool that hit tens of thousands of stars after Andrej Karpathy
posted about giving an LLM a plain-text knowledge base.

I looked at what it actually does before installing: code is parsed locally
with tree-sitter and never leaves the machine, prose and images go to your own model's API for
extraction, and it ships a real `SECURITY.md` covering SSRF, path traversal, and prompt injection via
node labels. Reasonable enough to run. (Install gotcha: the PyPI package is `graphifyy`, double-y;
bare `graphify` 404s.)

Under the hood it tags every edge `EXTRACTED`, `INFERRED`, or `AMBIGUOUS` so the output is auditable,
clusters with Leiden over the link topology, and writes a `graph.json`, an HTML view, a report, and
an Obsidian copy. The local AST parse is free; the prose extraction is the part that costs tokens,
cached per file after the first run.

What it buys me is structure and relational reach, not navigation. On my vault as of mid-2026 (north
of 250 files, about 119,000 words) it finds roughly 200 communities that match the real seams of the
work, surfaces the index and section maps as the most central nodes, and flags notes that link to
nothing, a useful hygiene signal. I have not benchmarked its token savings at this size and do not
quote one; vendor figures float around, and one popular wrapper even contradicts its own results
table, so I treat them as marketing.

<figure style="margin: 2.5rem auto; max-width: 820px; text-align: center;">
  <img src="/images/second-brain-graph.png" alt="Obsidian graph view of the vault after about ten days of use: a few hundred note-nodes connected by wikilinks, with large hub nodes toward the centre." style="width: 100%; border-radius: 14px; display: block;" loading="lazy" />
  <figcaption style="font-size: 0.85rem; opacity: 0.65; margin-top: 0.6rem;">How my vault looks after about ten days of use, in Obsidian's own graph view: each node is a note, each line a wikilink, and the big hubs are the indexes everything links through.</figcaption>
</figure>

### The numbers, and how they rotted

On day one the win was real. I measured just the planning-docs part of that cold read, about 11,000 tokens, and
`/orient` (the map plus the last log) replaced it with a few hundred, roughly a 15x cut from
navigation structure alone.

Then it rotted. Eighteen days later I measured again and the cut was down to about 2x: a median
`/orient` of 5,564 tokens against the same cold read, over eight sessions. The cause was the index
itself. `/save` only ever appended, so the map bloated about 9x (483 to 4,437 tokens) as resolved and
deferred items piled up in the always-loaded layer. An index that is never pruned stops being an
index and becomes the cold read it was meant to replace.

## Avoiding the brain rot

So I changed how `/save` writes: the index now prunes itself instead of growing forever. The map is
rebuilt each save as a router, not an append log: resolved and shipped items move to an `archive.md`
(moved, not deleted, so it is one git step back), deferred ones get parked with a wake-date and
resurface when due, and active ones compress to a pointer plus a link. It auto-archives only on
explicit signals, a resolved status, a checkbox, a defer-date; staleness alone flags for review but
never deletes, since evicting a rare-but-critical note by age is how these systems quietly rot. A
tripwire warns when the map crosses about 1,500 tokens, so it stays a thin index instead of decaying
back into the cold read.

Bloat is one way the brain rots; going stale is the other. Skip the save a few times and the vault
quietly drifts out of date, and a confident memory that is wrong is worse than none. So I stopped
relying on discipline there too: a `SessionEnd` hook runs the save when a session ends, and a
`PreCompact` hook runs it right before the agent auto-compacts a long session, because compaction
discards detail and a save after the fact only sees the summary. It is debounced so repeated
compactions in one session do not stack saves. Saving full state before compaction beats giving the
compactor a list of things to keep, which still relies on a lossy summary getting it right.

## Across machines and agents

Two machines, a laptop and a desktop, sharing one brain:

- **The vault syncs over plain git.** `/save` commits and pushes, `/orient` pulls first. Append-heavy
  markdown barely conflicts; when two machines touch the same line the rebase pauses and I keep both.
- **The config is a deny-by-default repo.** `~/.claude` holds auth tokens, transcripts, and caches,
  so its `.gitignore` ignores everything (`/*`) and re-includes only the portable files by name
  (`CLAUDE.md`, `skills/`, `hooks/`, the status line). A careless `git add` cannot leak a new secret.
  `settings.json` stays unsynced (machine-specific), and git identity is repo-local per machine.
- **Delegation hands work between boxes.** `send-to-peer` moves files over scp/rsync, with per-host
  targets in a gitignored `peers.local.json`. `delegate-to-peer` seeds a Claude session on the other
  machine with the current query and context and returns a resumable session id (`--session-id` plus
  `--append-system-prompt-file`), running read-only until I switch over.
- **A `SessionStart` hook** injects a marker telling Claude which machine it is on and who its peers
  are, since that cannot live in the synced, machine-agnostic `CLAUDE.md`.

Two things to know if you replicate this. A fast-forward `git pull` does not fire the post-commit
hook that rebuilds the graph, so `/orient` runs the structural rebuild after a pull to keep the local
graph current. And delegation only works one direction: the macOS Keychain blocks headless SSH auth,
so `claude -p` into the Mac cannot read credentials from the login Keychain, while delegating toward
the Linux box is fine.

What makes this work across machines is also what makes it work across agents: I own the context. It
is plain markdown in a git repo, not state locked inside one tool. The vault is not tied to Claude
Code, so I can point Codex or any other agent at the same files and the accumulated knowledge comes
with it; only the glue skills get re-done per agent. The memory is mine, not a feature I rent from
whichever assistant I am using this month.

## Quality-of-life

A few config tweaks around the vault, not architecture:

- **A status line.** One line showing model and effort, directory and branch, a bar marking where
  compaction will fire, and rolling rate-limit and cost numbers. (Those last two populate only on a
  Claude.ai subscription, and the cost is the API-equivalent of the session, not money billed on a
  flat plan.)
- **`--orient` on launch.** Orientation is opt-in, because not every session should pull in vault
  context (some are quick, off-vault throwaways). A small zsh wrapper adds a custom `--orient` flag
  (Claude Code has no native ones) that runs the orient skill as the session's first turn, so a
  regular session lands oriented from the repo without me typing `/orient` after it starts.
- **Sound hooks.** A chime when the agent finishes (`Stop`), a different one for notifications,
  filtered to skip the "waiting for your input" case. Uses macOS `afplay`, the one piece that does
  not carry to Linux.
- **Compact early.** Answer quality slides well before the window is full (context rot), so I cap the
  effective window with `CLAUDE_CODE_AUTO_COMPACT_WINDOW=400000`. A 1M session then compacts in the
  low-to-mid 300Ks instead of near the ~830K default, keeping the working set fresh. 400K is a dial you tune.

## References

- Andrej Karpathy, [LLM Knowledge Base (`llm-wiki`)](https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f): the post that kicked off this pattern and sent Graphify vertical.
- Kenneth Reitz, [Obsidian Vaults & Claude Code](https://kennethreitz.org/essays/2026-03-06-obsidian_vaults_and_claude_code): the single-vault, root-`CLAUDE.md`-as-contract argument.
- [`lucasrosati/claude-code-memory-setup`](https://github.com/lucasrosati/claude-code-memory-setup): the `/save` + `/resume` loop I adapted into `/save` + `/orient`.
- [`safishamsi/graphify`](https://github.com/safishamsi/graphify): the knowledge-graph tool, with the `SECURITY.md` I read before installing.
- Chroma, [Context Rot](https://www.trychroma.com/research/context-rot): the long-context degradation study behind compacting early.
- Anthropic, [Claude Code memory docs](https://code.claude.com/docs/en/memory): the `CLAUDE.md` and `MEMORY.md` limits.
