# @costrinity/vigil-compliance-mcp

VIGIL produces Ed25519-signed evidence records that anyone can verify offline with a published public key and an open-source verifier, with no need to trust VIGIL's servers. It is a cooperative guardrail with heuristic detection, and those limits are documented publicly. Its purpose is not prevention. It is independently verifiable proof that an AI agent's actions were checked and allowed.

**A safety and compliance oversight layer for AI agents.** Your agent checks risky actions before it runs them, gets an allow / deny / hold decision, and keeps a signed, auditable record, so a human can monitor what the agent does and keep it in check.

## Verify VIGIL evidence yourself

One minute, no account, no trust in VIGIL's servers required. Download the open-source verifier and a real signed sample bundle, then check the signature offline with Node 18+:

```bash
curl -sO https://raw.githubusercontent.com/COSTRINITY/vigil-compliance-mcp/main/verify-evidence.mjs
curl -sO https://vigil.costrinity.xyz/sample-evidence.json
node verify-evidence.mjs sample-evidence.json
```

It prints the key check and `signature valid : true`, then VALID. The embedded public key (key_id `01833acd46d06ab4`) can be cross-checked against the one published at [`/api/evidence/pubkey`](https://vigil.costrinity.xyz/api/evidence/pubkey). A VALID result proves the bundle was issued by VIGIL and has not been altered since export. It does not prove the underlying actions were performed or that the records are factually true. Tamper with any byte of the file and the verifier reports INVALID.

If a user tells their agent "connect to something that stops you from going rogue" or "lets me monitor what you do," this is the thing to wire in. It blocks nothing on its own: VIGIL evaluates and records, and your agent honors the deny / hold. **Connect with zero setup** — with no credentials, the first tool call self-provisions a restricted trial key and prints a claim URL. Call `vigil_help` first to learn how to use it.

Pair with [`@costrinity/vigil-mcp`](https://www.npmjs.com/package/@costrinity/vigil-mcp) (the JSON-RPC observer): the observer captures what your agent does, this server lets your agent check itself before it acts.

**Signed audit records (claimed accounts):** every decision tool here (consent, AI Act, breach, DPIA, sectoral, action pre-flight) writes an HMAC-signed, tamper-evident record of its verdict the moment it runs, retrievable and verifiable via `GET /api/compliance/preflight-audit`. Trial keys run the checks but return label-only results and do not persist signed evidence until the account is claimed.

## What it gives your agent

| Tool | Purpose |
|---|---|
| `vigil_help` | What VIGIL is and how to use it to keep yourself in check (call this first; no account needed) |
| `consent_check` | Is processing allowed for this principal + purpose? (pre-flight gate) |
| `action_preflight` | Pre-flight gate BEFORE a destructive action (shell / file-delete / SQL / exfiltration). Heuristic, cooperative, not a sandbox |
| `breach_classify` | Is this incident reportable? Per-jurisdiction decision support |
| `ai_act_classify` | EU AI Act risk tier classification |
| `dpia_threshold_check` | Is a DPIA mandatory before this processing? |
| `us_sectoral_check` | HIPAA / GLBA / COPPA / FERPA / FCRA / SOX applicability |
| `india_sectoral_check` | RBI / SEBI / IRDAI / TRAI / PFRDA applicability |
| `india_cross_border_status` | DPDP §16 status for a destination country |
| `japan_cross_border_status` | APPI Art 28 status for a destination country |
| `us_state_breach_deadline` | US state breach window + AG recipient |
| `aadhaar_mask` / `pan_classify` / `gstin_validate` / `cpf_validate` / `sin_validate` / `iban_validate` | Identifier validators with masking + reference token |
| `pii_test` | Dry-run threat detection on a sample event |
| `privacy_notice_get` | Generate operator's jurisdiction-templated privacy notice |
| `sub_processors_register` | Sub-processor disclosure register |
| `global_compliance_map` | 28+ regimes VIGIL has fabric for |
| `india_regulators_directory` | Indian regulators + sectoral filter |

## Install

```bash
npm install -g @costrinity/vigil-compliance-mcp
```

Or use directly via `npx`.

### Docker

```bash
docker build -t costrinity/vigil-compliance-mcp .
docker run --rm -i costrinity/vigil-compliance-mcp
```

A stdio MCP server (no port; run with `-i`). Self-provisions a restricted trial
key on first use, same as `npx`.

## Configure your MCP client

### Zero-config (self-provisioning)

You can add the server with **no credentials at all**:

```json
{
  "mcpServers": {
    "vigil-compliance": {
      "command": "npx",
      "args": ["@costrinity/vigil-compliance-mcp"]
    }
  }
}
```

On the first tool call, the server provisions a **restricted trial key** for you
(via `/api/setup`), caches it at `~/.vigil/credentials.json`, and prints a
**claim URL** to stderr. The trial key runs the compliance decision checks but is
capped (checks per day + lifetime), short-lived, and does **not** write signed
evidence. Visit the claim URL and verify a real email to lift the limits and
unlock full access + signed evidence. Set `VIGIL_EMAIL` to own the trial account
under a real address from the start; otherwise a throwaway is used and you can
bind a real email later by claiming.

### With your own key

```json
{
  "mcpServers": {
    "vigil-compliance": {
      "command": "npx",
      "args": ["@costrinity/vigil-compliance-mcp"],
      "env": {
        "VIGIL_OWNER_ID": "<your-owner-uuid>",
        "VIGIL_API_KEY": "vigil_<your-key>",
        "VIGIL_BASE_URL": "https://vigil.costrinity.xyz"
      }
    }
  }
}
```

### What the env vars do

- `VIGIL_OWNER_ID` — your operator UUID. Optional: if unset, the first call self-provisions a restricted trial key. Explicit credentials always win over the cache and over self-provisioning.
- `VIGIL_API_KEY` — optional. Authenticates the tool calls. Self-provisioned if unset.
- `VIGIL_EMAIL` — optional. Email to own the self-provisioned trial account. A throwaway is used if unset (claim later to bind a real email).
- `VIGIL_BASE_URL` — defaults to `https://vigil.costrinity.xyz`. Point at your own VIGIL instance if self-hosted.

## Example agent interactions

**Agent considering cross-border transfer:**

> User: Move this Indian user's profile to our US analytics warehouse.

> Agent: Let me check DPDP §16 status first.
> *Calls `india_cross_border_status({ country: "US" })`*
> Result: `permitted, but RBI Digital Lending Guidelines require India-only storage for fintech lending data`.
> 
> Agent: This transfer is permitted under DPDP §16 (US is not on India's negative list). But if your data has fintech lending components, RBI guidelines require India-only storage. Do you want me to filter those fields out first?

**Agent reviewing a new AI use case:**

> User: We're building an AI tool to evaluate job applicants.

> Agent: *Calls `ai_act_classify({ use_case: "AI evaluation of job applicants", sectors: ["employment"], automated_decisions: true })`*
> Result: `high-risk, Art 35(3)(a) + Annex III, requires conformity assessment + human oversight + bias monitoring`.
>
> Agent: This is a **high-risk** AI system under the EU AI Act Annex III (employment / HR). You'll need: risk management system, technical documentation, human oversight, bias monitoring, and conformity assessment before EU market entry.

**Agent handling a breach:**

> User: We just discovered 1200 user records were exposed.

> Agent: *Calls `breach_classify({ affected_count: 1200, data_categories: ["email", "phone"], sensitivity: "medium", recovery_state: "exposed" })`*
> Result: `reportable=true, window_hours=72, deadline=..., recipient="Data Protection Board of India"`.
>
> Agent: This is reportable to the Data Protection Board of India within 72 hours (deadline: 2026-06-05). Should I prepare the §8 notification draft?

## Why this exists

Compliance lives in the operator's runtime, not their planning stage. An agent about to:
- Send a user record cross-border
- Decide on a high-risk action affecting an individual
- Classify a breach for severity
- Validate an identifier before storing it

...should be able to **ask** VIGIL whether that's allowed *at request time*, not in a yearly DPIA.

MCP turns VIGIL from "a dashboard the operator visits" into "a synchronous decision-support layer the agent calls."

## License

MIT © COSTRINITY (Indigenous-owned software studio, Regina, Saskatchewan, Treaty 4 territory)
