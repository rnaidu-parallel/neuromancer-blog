---
title: "I had to apply through a company's MCP server, so I made my résumé one"
description: "Most hiring MCPs make a candidate's agent apply or a recruiter's agent screen. I published my résumé as a remote MCP server instead, so a company's agent can query my work, assess fit, and reach out. The build, the security model, and the honest adoption caveat."
pubDate: 2026-06-22
tags: ["mcp", "model-context-protocol", "agents", "hiring", "open-source", "security"]
draft: false
repo: https://github.com/rnaidu-parallel/neuromancer-mcp
margin_note: "A résumé published as a remote MCP server so a company's agent can query work, assess fit, and reach out."
plate: { kind: network, params: { spokes: 8 } }
---

A few weeks ago I interviewed with a company whose application flow was not a form. They handed me an MCP server and told me to connect to it from Claude Code. One command later, my agent was doing the applying. It asked the server what the role required, assembled the material, and submitted on my behalf. I was still the human in the loop, but I was no longer the person filling boxes.

The part that stayed with me was not the tooling. It was the direction. The company had published the server, and the candidate's agent was the client. Flip that around and you get something I had not seen anyone ship: publish *yourself* as the server, and let the company's agent be the client. So I built it. My résumé is now a remote MCP server, live at `mcp.neuromancer.in`, and this is what I learned putting it on the internet.

Most job-search tooling built on the [Model Context Protocol](https://modelcontextprotocol.io) points one of two ways: a candidate's agent auto-applies to job boards, or a recruiter's agent screens a stack of résumés. Both treat the candidate as data being moved through someone else's workflow. The inversion is to publish yourself as a remote MCP server that a company's agent connects to. It can read your work, judge it against a role, and reach out, all without you sending a PDF. Your résumé stops being an attachment and becomes an endpoint.

The whole thing is one command on my site:

```bash
claude mcp add --transport http rahul https://mcp.neuromancer.in/api/mcp
```

Then, inside the agent:

> "Look up this candidate. What have they actually shipped with agents? If they fit our staff engineer role, get in touch."

The agent reads `about_me`, pulls `get_experience` and `list_projects`, runs the role through `fit_for_role`, checks `availability`, and, if the fit is real, calls `contact_me`. I get an email. The company's MCP closed the application loop. This one closes the outreach loop.

## What it exposes

The server has eight tools and one resource. The temptation is to add more, and I had to talk myself out of it. Every extra tool is another choice the calling model has to make. A tight surface is a feature, so I designed the tools as the path a curious agent would naturally take: overview, evidence, fit, outreach.

It starts wide. `about_me` is the entry point: a short bio, education, and the key links. `get_profile` returns the full profile in one call for an agent that would rather load everything than ask six questions. From there, it narrows. `get_experience` filters work history at the bullet level, so an agent asking about agents gets the agent bullets, not the entire job. `search` is free-text lookup across experience, projects, and skills. `list_projects` is the proof layer: public shipped work with links, claims you can click rather than adjectives you have to trust.

Then it turns toward a decision. `fit_for_role` takes a job description. `availability` says what I am open to and, just as usefully, what I am not open to, so an agent can disqualify the role before bothering me. `contact_me` is the one action: it sends me a message and returns a booking link.

The ninth surface is a resource, `profile://me`, which returns the entire profile as one markdown document. More on why both a resource *and* a `get_profile` tool exist later, because that turned into a small compatibility lesson.

## What I learned building it to spec

A few things about the protocol only became real once I had a server other people could actually connect to.

The transport matters, and the recommendation moved. The MCP spec says [Streamable HTTP](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) replaces the older HTTP+SSE transport, and the current [Claude Code MCP docs](https://code.claude.com/docs/en/mcp) call HTTP the recommended option for remote servers while marking SSE as deprecated. Picking the current transport is the difference between an endpoint that works in modern clients and one that fails with confusing handshake errors.

Stateless is worth the discipline. The local server uses Streamable HTTP with `sessionIdGenerator: undefined`, and the deployed Vercel route uses the same capability registration. Each request can stand on its own, and any instance can answer it. That makes the server easy to host and hard to wedge into a half-connected state, which is exactly what I want from something strangers point their agents at.

Structured output is worth doing if you want reach. The MCP tools spec supports both unstructured `content` and machine-readable [`structuredContent` with an `outputSchema`](https://modelcontextprotocol.io/specification/2025-06-18/server/tools). In this server, the data-returning tools expose human-readable text plus typed structured output. `fit_for_role` is the exception by design: it returns a prompt-like context bundle for the calling agent to judge, not a verdict-shaped JSON object. A frontier model is happy reading prose, but a programmatic client wants JSON it can trust. Giving both makes the server useful beyond chat.

And resources are not as universal as the spec makes them feel. MCP [resources](https://modelcontextprotocol.io/specification/2025-06-18/server/resources) are application-driven: clients decide whether and how to expose them. I exposed the profile as `profile://me`, which is the clean way to let a client ground on a document. Then I tested with a tools-only agent that never read resources at all, and it missed half the surface. So `get_profile` exists as a tool that returns the same content. If you want every client to see something, a tool is the lowest common denominator, and a resource is the cleaner interface on top.

## Putting a public, unauthenticated endpoint on the internet

Here is the part that took the most care. The [MCP transport guidance](https://modelcontextprotocol.io/specification/2025-06-18/basic/transports) says public HTTP servers should think seriously about origin validation, authentication, and abuse controls. This server is public and intentionally unauthenticated, because the whole point is that any agent can connect without me handing out keys. That means anyone, and any bot, can call every tool. So the security question is not "how do I keep people out?" It is "what is the worst thing they can do once they are in?" The answer has to be: not much.

Seven of the eight tools are read-only over information I have already decided to make public. All of the meaningful attack surface lives in the one tool with a side effect, `contact_me`, and that is where the defenses go.

It is inbound only. The tool notifies *me*. It never sends mail *as* me to a third party. I considered an outbound version, an agent that could introduce me to people, and rejected it immediately. A tool that lets a stranger send mail as me, to any address they choose, is one abuse away from putting my name on spam and my domain on a blocklist. Inbound-only still closes the engagement loop, and the worst case is that I get an email I did not want.

So I hardened the part that can email me. In production, the Vercel endpoint can use Upstash-backed per-IP rate limits, with a stricter bucket for `contact_me`. It also deduplicates repeated contact attempts for ten minutes when Redis is configured, so an agent retry does not send the same message five times. The email is sent as plain text, never rendered as HTML. There is no SQL database behind the profile. The data tools read from a single static file I control, not a live store. And because `fit_for_role` echoes an untrusted job description back toward a model, the tool description explicitly tells clients to treat that text as third-party input, not as an instruction. The notification email also flags that the sender's claims are self-reported and unverified.

One honest moment from the build belongs here because it is the kind of thing that bites quietly. The first time I wired up email, the send call returned cleanly and no mail arrived. I was sending from a domain the email provider had not verified, and the provider accepted the request but did not deliver the message. A successful API response is not proof of a delivered effect. I only caught it because I checked my inbox instead of trusting the status code, switched to a verified sender, and watched a real email land.

## Why bet on a thing no one will use yet

I built this for a reader that barely exists yet. That is the bet, and it is a bet on direction. Agents are moving from reasoning, where they answer questions, to acting, where they do things on someone's behalf, and acting needs three things a human normally brokers: a way to communicate, a way to pay, and an identity. My server is a small instance of the first one. An agent it has never met can reach me, with context, without me in the loop.

And it rides a layer that is genuinely shipping rather than promised. MCP is past ten thousand public servers and tens of millions of SDK downloads a month, and it has been handed to neutral governance under the Linux Foundation, with Anthropic, OpenAI, and the major cloud providers behind it. Building on this is a bet on an established rail, not a science project, even if traffic on my particular stretch of it is light.

Today almost no recruiter has an agent out sourcing talent, and the few that do could already query a server like mine the way any client queries a tool over MCP: the agent calls in, reads the profile, and decides whether to reach out. That is the shape of it right now, a recruiter's agent talking to a candidate's tool. The direction it points is a world where sourcing through an agent is ordinary, and a recruiter's agent and one standing in for me handle the opening exchange directly, agent to agent, over a standard like A2A, with neither of us in the room for the first move. What that future is waiting on is the part nobody has built yet, a way for an agent to discover an individual's server and trust who is behind it. Agent identity and discovery are the acknowledged open problem of this whole space, not a gap specific to me.

So I am not going to pretend a wave of recruiters is about to connect their agents to my résumé. They are not, and the reason is that gap. Nothing yet tells an agent that a candidate has published a server, or where to find it, and the web standards that might carry that signal are early, fragmented, and easy for crawlers to ignore. Agent-addressability for individuals is roughly where the structured web was fifteen years ago.

So this is a low-volume, high-signal channel, not a traffic firehose, and I would be lying to call it otherwise. But the small set of people who *would* paste a URL into their agent and ask it to evaluate a candidate is exactly the set I want to hear from: AI-forward founders, technical hiring managers, and people building agent teams. The volume being low is part of the point. The signal of who shows up is high.

And there is a payoff that does not depend on anyone connecting at all. Making yourself addressable by an agent is itself a credential. It says "I think in agents" more convincingly than any résumé bullet claiming the same thing, and that remains true whether two people connect or two hundred.

## Connect to it, or build your own

Two invitations to close on.

If you want to see it work, point an agent at mine. One command adds it, and then you can ask your assistant to look me up, push a job description through `fit_for_role`, or read what I have shipped:

```bash
claude mcp add --transport http rahul https://mcp.neuromancer.in/api/mcp
# ...ask your agent about me, then:
claude mcp remove rahul
```

And if you want one of your own, the [repository](https://github.com/rnaidu-parallel/neuromancer-mcp) is built to be forked. The entire profile lives in a single file. You edit that file, deploy it anywhere that runs Node, and put your own `claude mcp add` line on your site. The server invents nothing and fetches nothing. It only reads from the file you control, which is what makes it safe to hand to strangers.

The résumé as a PDF is a document that waits to be opened. The résumé as a server is something an agent can interrogate, reason about, and act on without you in the room. I do not know yet whether this becomes how hiring works. But it cost me a weekend to find out, and it is a better answer to "are you actually into agents?" than anything I could have written in a cover letter.
