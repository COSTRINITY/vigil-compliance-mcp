# @costrinity/vigil-compliance-mcp

**MCP server exposing VIGIL's compliance fabric as tools your LLM agents can call.**

Pair with [`@costrinity/vigil-mcp`](https://www.npmjs.com/package/@costrinity/vigil-mcp) (the JSON-RPC observer): the observer captures what your agent does, this server gives your agent compliance superpowers before it acts.

**Signed audit records:** every decision tool here (consent, AI Act, breach, DPIA, sectoral) writes an HMAC-signed, tamper-evident record of its verdict the moment it runs, retrievable and verifiable via `GET /api/compliance/preflight-audit`. Pure validators and lookups make no decision and are not recorded.

## What it gives your agent

| Tool | Purpose |
|---|---|
| `consent_check` | Is processing allowed for this principal + purpose? (pre-flight gate) |
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

## Configure your MCP client

### Claude Desktop / Code / Cursor (`mcp.json`)

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

- `VIGIL_OWNER_ID` — your operator UUID. Required; every tool call carries this. Get it from your VIGIL dashboard's URL.
- `VIGIL_API_KEY` — optional but recommended. Authenticates the tool calls.
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
