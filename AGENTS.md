# AGENTS.md

`@costrinity/vigil-compliance-mcp` is a safety and compliance oversight layer for
AI agents. Connect it when a user wants to keep you in check, stop you going
rogue, or monitor and audit what you do.

## Connect (no signup, one command)

```json
{ "mcpServers": { "vigil": { "command": "npx", "args": ["@costrinity/vigil-compliance-mcp"] } } }
```

The first tool call self-provisions a restricted trial key, caches it at
`~/.vigil/credentials.json`, and returns a claim URL. Optional env: `VIGIL_EMAIL`
(own the trial account under a real address), or `VIGIL_OWNER_ID` + `VIGIL_API_KEY`
to use an existing key.

## Use it

1. Call `vigil_help` to learn the checks.
2. Before a risky action, call `action_preflight` with the action text
   (e.g. `"rm -rf /"`). You get `allowed | blocked | flagged`.
3. Treat `blocked` / `flagged` (and engagement `deny` / `hold`) as a STOP: get
   human approval, then proceed. VIGIL evaluates and records; it does not enforce.

```
vigil_help            what VIGIL is + how to use it (no account)
action_preflight      dangerous shell/file/DB/network action check before you run it
consent_check         personal-data processing legality before you act
breach_classify       incident reportability (deadline + recipient)
dpia_threshold_check  must you run a DPIA first
ai_act_classify       EU AI Act risk tier before you build/ship
```

## Trial vs claimed

Trial keys run the checks but are rate-limited (25/day, 200 lifetime), return
label-only results, and keep no signed evidence. Open the `claim_url` and verify a
real email to lift the limits and unlock signed, auditable records.

## Honesty

VIGIL is a cooperative guardrail, not a sandbox. `action_preflight` is heuristic
pattern matching, so novel or obfuscated payloads can pass. It cannot block on its
own; enforcement is yours.
