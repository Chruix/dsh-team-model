# dsh-team-model

[中文](README.md) · English

> Adds per-teammate model selection to [DeepSeek Harness](https://github.com/deepseek-ai) Agent Teams: the model can pick a teammate's model itself, and you can change it at any time from the Web UI.

The stock team plugin (`@deepseek-ai/dsh-experimental-agent-team`) accepts no model parameter when it creates a teammate — `spawn_teammate` only takes `name / description / prompt / context`, and both local subagent providers only understand `providerName`. Every teammate therefore inherits the Lead's current route.

This plugin closes that gap and uses nothing but public framework surfaces: one new tool, one existing `model/selection` event written to the child session, route pinning inside `agent/request`, and a loopback RPC that backs the Web UI.

## Features

### 1. The model can assign a teammate's model

A new tool, `spawn_teammate_with_model`, takes the same arguments as the built-in `spawn_teammate` plus three optional ones:

```jsonc
{
  "name": "reviewer",              // required, [a-z0-9-], <= 64 chars
  "description": "Code review",    // required
  "prompt": "Review this change…", // required
  "context": "fresh",              // fresh | fork
  "provider": "openai",            // optional; inferred when "model" matches one catalog entry
  "model": "gpt-5",                // optional; inherits the current session when omitted
  "reasoning_effort": "high"       // optional; honoured only if the model declares it
}
```

The route is written into the child session *before* the teammate's first request, so the first reply already uses it instead of spending a turn on the inherited model.

### 2. Users can switch from three places

| Entry | Slot | Notes |
| --- | --- | --- |
| Session header pill | `conversation.session.header.actions` | Lists this team's teammates; pick a model from the popover |
| Composer tool row | `conversation.input.right` | Collapses to an icon + model name on narrow windows |
| Settings → Team models | `settings.section` | Grouped by session; per-teammate or whole-team; includes offline teammates |

Opened inside a teammate's session it focuses that teammate automatically (the title becomes "Model") and only changes that teammate's model, without listing the rest of the team.

### 3. A switch keeps applying

The built-in model selection is one-shot: `selectionFor(agent).current` is consumed by a single request and cleared, so the next request falls back to the session header or the default model — the symptom is "the switch only survives one turn". The plugin attaches an `agent/request` waterfall to **teammate** agents and overrides provider/model/reasoningEffort from the session projection `modelSelection.pending ?? lastUsed`, so the second and third turns still use the model you picked, until you change it again.

### 4. Offline teammates are queued

An offline teammate has no live Agent, so the change is queued (`queued`) and written just before its next run starts. The UI says: "This teammate is offline; the model was recorded and will apply on the next start."

## Install

The plugin is a standard DSH bundle (`package.json` + `cordis.patch.yml` plus host and client entry points).

```bash
git clone https://github.com/Chruix/dsh-team-model ~/.dsh/plugins/dsh-team-model
```

Install that directory from the DSH plugin manager (`install_bundle`), or insert a row into your profile:

```yaml
- insert:
    - id: team-model
      name: dsh-team-model
```

Required host services: `agents / agentTeams / tools / systemPrompt / sessionController / llm / connection / webServer`. If any of them is missing, the profile will not activate the plugin.

## Architecture

```
index.js   Host half (Cordis plugin)
  ├─ spawn_teammate_with_model   new tool, registered only on the Lead's agent.ctx
  ├─ applySelection / applyOrQueue
  │    ctx.sessionController.agents.selectForNextRequest(agent, selection)
  │    = append a durable model/selection event + sync the live selection
  ├─ agent/request hook          keeps overriding the route from the second turn on
  ├─ RPC /dsh-team-model         a prefix route on ctx.get('webServer')
  │    tm.state / tm.setModel / tm.globals / tm.setAll
  └─ team:model section          guidance injected into the Lead's system prompt

client.js  Web UI half
  ├─ three slot registrations (header #5 / input.right #0 / settings.section #45)
  ├─ native popover built on MenuSurface + MenuGroup, CSS module string injected once
  └─ reads via ctx.connection.rpc.call('/dsh-team-model', endpoint, payload)
```

**Why not `ctx.connection.rpc.handle` for the RPC?** In 0.2.1-rc.5 that API registers the route on the connection service's own context, which cannot read `webServer`, so third-party callers always hit `cannot get property "webServer" without inject` (surfacing as HTTP 405 on the client). `ctx.get('webServer')` retrieves the service past the inject guard, so the plugin speaks the wire format itself:

```
POST /dsh-team-model/<endpoint>
  → { type: "client-request", rpcId, method: endpoint, payload }
  ← { type: "server-response", rpcId, result: { ok: true, value } | { ok: false, error } }
```

## Configuration

```yaml
- id: team-model
  name: dsh-team-model
  config:
    defaultModel: ""        # default teammate model when none is given (provider/model or bare model id)
    defaultProvider: ""     # provider of the default model; inferred by unique catalog match when empty
    freshProvider: "spawn"  # keep the built-in tool plugin's route names
    forkProvider: "fork"
    tool: true              # register spawn_teammate_with_model
    policy: true            # inject a short usage section into the Lead's system prompt
```

## Known limitations

- Teams are isolated per session: a Lead only manages its own session's teammates, so "global settings" means iterating over every live Lead.
- The stock team plugin defaults to `maxMembers: 8` and exposes no public way to remove a teammate.
- Reasoning effort is declared per model: providers whose catalog entries carry an empty `reasoning.efforts` (some aggregator gateways, for example) show no effort selector, and forcing one is rejected with a readable error instead of being silently dropped.
- The UI depends on the virtual module `@deepseek-ai/dsh-client-ui-primitives` provided by the web shell; it must not be declared as a dependency in `package.json`.

## Development

```bash
node --check index.js && node --check client.js
```

After changing code, make the loader import it again:

```
remove_bundle dsh-team-model
install_bundle /path/to/dsh-team-model
```

Only `"application": "applied"` in the reply means it took effect (`install_bundle` answers `already-installed` for an installed package). The `test/` directory holds three Node smoke suites: rendering (fake React/primitives), RPC, and the batch endpoints.

```bash
node test/client-smoke.cjs                       # no running host required
DSH_RPC_BASE=http://127.0.0.1:43189/dsh-team-model \
  DSH_LEAD_SESSION=<lead id> DSH_CHILD_SESSION=<child id> \
  node test/rpc.cjs
DSH_RPC_BASE=http://127.0.0.1:43189/dsh-team-model node test/globals.cjs
```

## License

MIT
