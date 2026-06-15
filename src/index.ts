#!/usr/bin/env node
/**
 * VIGIL Compliance MCP server.
 *
 * Exposes VIGIL's compliance fabric as MCP tools so LLM agents can:
 *   - Check if processing is allowed under any active consent
 *   - Classify whether an incident is reportable per jurisdiction
 *   - Classify an AI system under the EU AI Act
 *   - Validate identifiers (Aadhaar / CPF / SIN / etc.) with masking
 *   - Generate cross-border transfer notices
 *   - Look up sub-processor disclosures, US state laws, breach deadlines
 *   - Run DPIA + ROPA + SCC Annex II + privacy notice generators
 *
 * Why this exists
 *   Compliance lives in the operator's runtime, not their planning stage.
 *   An agent that's about to send a user record cross-border should be
 *   able to ASK whether that's allowed — at request time, not in a
 *   yearly DPIA. MCP turns VIGIL from a dashboard the operator visits
 *   into a synchronous decision-support layer the agent calls.
 *
 *   Pair with `@costrinity/vigil-mcp` (the proxy/observer) for full
 *   coverage: the observer captures what the agent does, this server
 *   gives the agent compliance superpowers before it acts.
 *
 * Transport
 *   stdio JSON-RPC 2.0 — same as every other MCP server. Add to your
 *   client config:
 *
 *     {
 *       "mcpServers": {
 *         "vigil-compliance": {
 *           "command": "npx",
 *           "args": ["@costrinity/vigil-compliance-mcp"],
 *           "env": {
 *             "VIGIL_OWNER_ID": "<your-owner-uuid>",
 *             "VIGIL_API_KEY": "vigil_<your-key>",
 *             "VIGIL_BASE_URL": "https://vigil.costrinity.xyz"
 *           }
 *         }
 *       }
 *     }
 *
 * Tool catalogue
 *   The MCP `tools/list` response enumerates each tool with its input
 *   schema. Keep the catalogue stable across versions; add new tools
 *   rather than mutating signatures.
 */

import { createInterface } from 'node:readline';

const VIGIL_BASE_URL = process.env.VIGIL_BASE_URL ?? 'https://vigil.costrinity.xyz';
const VIGIL_OWNER_ID = process.env.VIGIL_OWNER_ID ?? '';
const VIGIL_API_KEY = process.env.VIGIL_API_KEY ?? '';

const SERVER_NAME = 'vigil-compliance';
const SERVER_VERSION = '0.1.0';

// ─── Tool catalogue ────────────────────────────────────────────────

interface ToolDef {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  /** Maps the MCP call to a VIGIL HTTP request. */
  call: (input: Record<string, unknown>) => { method: string; path: string; body?: unknown };
}

const TOOLS: ToolDef[] = [
  // ─── Consent + processing gate ───────────────────────────────────
  {
    name: 'consent_check',
    description:
      "Pre-flight check: is processing allowed for this data principal + purpose? Returns { allowed, reason, matching_consent_id, principal_id }. Call this BEFORE processing data on behalf of a principal.",
    inputSchema: {
      type: 'object',
      required: ['purpose'],
      properties: {
        principal_id: { type: 'string', description: 'UUID of the data principal (if known).' },
        principal_ref: { type: 'string', description: 'Operator-side identifier; will be SHA-256-hashed.' },
        purpose: { type: 'string', description: "Purpose code (e.g. 'operational_observability')." },
        category: { type: 'string', description: 'Optional permitted-category check.' },
      },
    },
    call: (input) => ({
      method: 'POST',
      path: '/api/consent/check',
      body: input,
    }),
  },

  // ─── Breach + incident classification ────────────────────────────
  {
    name: 'breach_classify',
    description:
      'Decide whether an incident is reportable per the operator\'s jurisdiction (DPDP §8, GDPR Art 33, CPRA §1798.82, LGPD Art 48, PDPA §26B, US-FED sectoral). Returns reportability + reasoning + deadline + recipient.',
    inputSchema: {
      type: 'object',
      required: ['affected_count', 'data_categories', 'sensitivity', 'recovery_state'],
      properties: {
        affected_count: { type: 'integer' },
        data_categories: { type: 'array', items: { type: 'string' } },
        processing_purpose: { type: 'string' },
        sensitivity: { type: 'string', enum: ['low', 'medium', 'high', 'special'] },
        recovery_state: { type: 'string', enum: ['lost', 'exposed', 'altered', 'destroyed', 'contained'] },
        jurisdiction: { type: 'string' },
      },
    },
    call: (input) => ({ method: 'POST', path: '/api/compliance/breach-classify', body: input }),
  },

  // ─── EU AI Act risk classifier ────────────────────────────────────
  {
    name: 'ai_act_classify',
    description:
      "Classify an AI use case under the EU AI Act (Regulation 2024/1689). Returns risk tier (prohibited / high-risk / limited-risk / minimal-risk) + GPAI obligations + per-tier remediation obligations.",
    inputSchema: {
      type: 'object',
      required: ['use_case'],
      properties: {
        use_case: { type: 'string' },
        data_categories: { type: 'array', items: { type: 'string' } },
        sectors: { type: 'array', items: { type: 'string' } },
        automated_decisions: { type: 'boolean' },
        biometric: { type: 'boolean' },
        remote_identification: { type: 'boolean' },
        social_scoring: { type: 'boolean' },
        general_purpose_ai: { type: 'boolean' },
      },
    },
    call: (input) => ({ method: 'POST', path: '/api/compliance/ai-act-classify', body: input }),
  },

  // ─── DPIA threshold check ─────────────────────────────────────────
  {
    name: 'dpia_threshold_check',
    description:
      'Decide if a DPIA is mandatory before processing under GDPR Art 35 / DPDP §10 / LGPD Art 38. Returns dpia_required + 9-criterion WP29 analysis + jurisdiction-specific guidance.',
    inputSchema: {
      type: 'object',
      required: ['processing_purpose', 'data_categories'],
      properties: {
        processing_purpose: { type: 'string' },
        data_categories: { type: 'array', items: { type: 'string' } },
        scale: { type: 'string', enum: ['small', 'medium', 'large', 'mass'] },
        automated_decision: { type: 'boolean' },
        systematic_monitoring: { type: 'boolean' },
        cross_border: { type: 'boolean' },
        vulnerable_subjects: { type: 'boolean' },
        jurisdiction: { type: 'string' },
      },
    },
    call: (input) => ({ method: 'POST', path: '/api/compliance/dpia-threshold-check', body: input }),
  },

  // ─── US sectoral analysis ─────────────────────────────────────────
  {
    name: 'us_sectoral_check',
    description:
      'Determine which US sectoral laws apply (HIPAA, GLBA, COPPA, FERPA, FCRA, SOX) given a processing profile.',
    inputSchema: {
      type: 'object',
      required: ['processing_purpose', 'data_categories'],
      properties: {
        processing_purpose: { type: 'string' },
        data_categories: { type: 'array', items: { type: 'string' } },
        counterparty_types: { type: 'array', items: { type: 'string' } },
        ai_decisions: { type: 'boolean' },
        has_revenue_threshold: { type: 'boolean' },
      },
    },
    call: (input) => ({ method: 'POST', path: '/api/compliance/sectoral-check', body: input }),
  },

  // ─── Indian sectoral analysis ─────────────────────────────────────
  {
    name: 'india_sectoral_check',
    description:
      'Determine which Indian sectoral regulators apply (RBI / SEBI / IRDAI / TRAI / DoT / PFRDA) given a processing profile.',
    inputSchema: {
      type: 'object',
      required: ['processing_purpose', 'data_categories'],
      properties: {
        processing_purpose: { type: 'string' },
        data_categories: { type: 'array', items: { type: 'string' } },
        counterparty_types: { type: 'array', items: { type: 'string' } },
        sector_hint: { type: 'string' },
      },
    },
    call: (input) => ({ method: 'POST', path: '/api/compliance/india-sectoral-check', body: input }),
  },

  // ─── Cross-border lookups ─────────────────────────────────────────
  {
    name: 'india_cross_border_status',
    description:
      'Look up DPDP §16 cross-border transfer status for a destination country. Returns permitted / restricted / sectoral_restricted + RBI/SEBI/IRDAI caveats.',
    inputSchema: {
      type: 'object',
      required: ['country'],
      properties: { country: { type: 'string', description: 'ISO-3166 alpha-2 (e.g. US).' } },
    },
    call: (input) => ({
      method: 'GET',
      path: `/api/compliance/india-cross-border-countries?country=${encodeURIComponent(String(input.country ?? ''))}`,
    }),
  },
  {
    name: 'japan_cross_border_status',
    description:
      'Look up Japan APPI Art 28 cross-border status for a destination country (adequacy / standard basis / high scrutiny).',
    inputSchema: {
      type: 'object',
      required: ['country'],
      properties: { country: { type: 'string', description: 'ISO-3166 alpha-2.' } },
    },
    call: (input) => ({
      method: 'GET',
      path: `/api/compliance/japan-cross-border?country=${encodeURIComponent(String(input.country ?? ''))}`,
    }),
  },

  // ─── US state breach deadlines ────────────────────────────────────
  {
    name: 'us_state_breach_deadline',
    description:
      "Look up a US state's breach-notification window + AG recipient + threshold (e.g. 'CA' → 500 residents → CA AG → expedient).",
    inputSchema: {
      type: 'object',
      required: ['state'],
      properties: { state: { type: 'string', description: 'US 2-letter state code (CA, NY, TX, ...).' } },
    },
    call: (input) => ({
      method: 'GET',
      path: `/api/compliance/state-breach-deadlines?state=${encodeURIComponent(String(input.state ?? ''))}`,
    }),
  },

  // ─── Identifier validators (all auth-gated; pass owner_id) ───────
  {
    name: 'aadhaar_mask',
    description:
      "Mask + Verhoeff-validate an Aadhaar number. Returns masked form, validity, and an owner-scoped reference token. No persistence of the raw value.",
    inputSchema: {
      type: 'object',
      required: ['aadhaar'],
      properties: { aadhaar: { type: 'string' } },
    },
    call: (input) => ({ method: 'POST', path: '/api/india/aadhaar-mask', body: input }),
  },
  {
    name: 'pan_classify',
    description: 'Classify a PAN entity type from the 4th character (P=Person, C=Company, H=HUF, F=Firm, ...).',
    inputSchema: { type: 'object', required: ['pan'], properties: { pan: { type: 'string' } } },
    call: (input) => ({ method: 'POST', path: '/api/india/pan-classify', body: input }),
  },
  {
    name: 'gstin_validate',
    description: 'Validate a GSTIN format + mod-36 check digit; returns state code lookup.',
    inputSchema: { type: 'object', required: ['gstin'], properties: { gstin: { type: 'string' } } },
    call: (input) => ({ method: 'POST', path: '/api/india/gstn-validate', body: input }),
  },
  {
    name: 'cpf_validate',
    description: 'Validate a Brazilian CPF (mod-11 check digits, rejects all-same).',
    inputSchema: { type: 'object', required: ['cpf'], properties: { cpf: { type: 'string' } } },
    call: (input) => ({ method: 'POST', path: '/api/brazil/cpf-validate', body: input }),
  },
  {
    name: 'sin_validate',
    description: 'Validate a Canadian SIN (Luhn checksum); returns series region + masked form.',
    inputSchema: { type: 'object', required: ['sin'], properties: { sin: { type: 'string' } } },
    call: (input) => ({ method: 'POST', path: '/api/canada/sin-validate', body: input }),
  },
  {
    name: 'iban_validate',
    description: 'Validate an IBAN format + ISO 7064 mod-97 check digit; supports 66 countries.',
    inputSchema: { type: 'object', required: ['iban'], properties: { iban: { type: 'string' } } },
    call: (input) => ({ method: 'POST', path: '/api/eu/iban-validate', body: input }),
  },
  {
    name: 'pii_test',
    description:
      "Dry-run PII / threat detection against a sample event. Returns what would be tagged, redacted preview, and whether severity would be escalated. No persistence.",
    inputSchema: {
      type: 'object',
      required: ['sample_event'],
      properties: {
        sample_event: { type: 'object', description: 'event_type / message / payload fields.' },
        jurisdiction: { type: 'string' },
      },
    },
    call: (input) => ({ method: 'POST', path: '/api/compliance/pii-test', body: input }),
  },

  // ─── Read-only generators ─────────────────────────────────────────
  {
    name: 'privacy_notice_get',
    description:
      "Generate the operator's jurisdiction-templated privacy notice. Returns markdown or JSON.",
    inputSchema: {
      type: 'object',
      properties: { format: { type: 'string', enum: ['md', 'json'] } },
    },
    call: (input) => ({
      method: 'GET',
      path: `/api/compliance/privacy-notice?format=${input.format ?? 'md'}`,
    }),
  },
  {
    name: 'sub_processors_register',
    description: "Return the public sub-processor register (Supabase, Vercel, Resend, etc.).",
    inputSchema: { type: 'object', properties: {} },
    call: () => ({ method: 'GET', path: '/api/compliance/sub-processors?format=json' }),
  },
  {
    name: 'global_compliance_map',
    description: "Master catalogue of every privacy/security/sectoral regime VIGIL has fabric for (28+ regimes).",
    inputSchema: { type: 'object', properties: {} },
    call: () => ({ method: 'GET', path: '/api/compliance/global-status' }),
  },
  {
    name: 'india_regulators_directory',
    description: "Directory of Indian regulators (DPB, RBI, SEBI, IRDAI, TRAI, DoT, PFRDA, MeitY, MCA) with sectoral filter.",
    inputSchema: {
      type: 'object',
      properties: { sector: { type: 'string' } },
    },
    call: (input) => ({
      method: 'GET',
      path: input.sector
        ? `/api/india/regulators?sector=${encodeURIComponent(String(input.sector))}`
        : '/api/india/regulators',
    }),
  },
];

// ─── HTTP transport ────────────────────────────────────────────────

async function callVigil(method: string, path: string, body?: unknown): Promise<unknown> {
  const url = `${VIGIL_BASE_URL}${path}${path.includes('?') ? '&' : '?'}owner_id=${encodeURIComponent(VIGIL_OWNER_ID)}`;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': `vigil-compliance-mcp/${SERVER_VERSION}`,
  };
  if (VIGIL_API_KEY) {
    headers['Authorization'] = `Bearer ${VIGIL_API_KEY}`;
    headers['x-vigil-key'] = VIGIL_API_KEY;
  }
  const res = await fetch(url, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch {
    return { _raw: text, _status: res.status };
  }
}

// ─── MCP JSON-RPC plumbing ──────────────────────────────────────────

interface JsonRpcReq {
  jsonrpc: '2.0';
  id?: number | string | null;
  method: string;
  params?: Record<string, unknown>;
}
interface JsonRpcResp {
  jsonrpc: '2.0';
  id: number | string | null;
  result?: unknown;
  error?: { code: number; message: string; data?: unknown };
}

function send(resp: JsonRpcResp): void {
  process.stdout.write(JSON.stringify(resp) + '\n');
}

function ok(id: number | string | null, result: unknown): void {
  send({ jsonrpc: '2.0', id, result });
}
function err(id: number | string | null, code: number, message: string, data?: unknown): void {
  send({ jsonrpc: '2.0', id, error: { code, message, data } });
}

async function handle(req: JsonRpcReq): Promise<void> {
  const id = req.id ?? null;
  try {
    switch (req.method) {
      case 'initialize':
        ok(id, {
          protocolVersion: '2024-11-05',
          capabilities: { tools: {} },
          serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        });
        return;

      case 'tools/list':
        ok(id, {
          tools: TOOLS.map((t) => ({
            name: t.name,
            description: t.description,
            inputSchema: t.inputSchema,
          })),
        });
        return;

      case 'tools/call': {
        const params = (req.params ?? {}) as { name?: string; arguments?: Record<string, unknown> };
        const tool = TOOLS.find((t) => t.name === params.name);
        if (!tool) {
          err(id, -32602, `unknown tool: ${params.name}`);
          return;
        }
        const { method, path, body } = tool.call(params.arguments ?? {});
        const result = await callVigil(method, path, body);
        ok(id, {
          content: [
            { type: 'text', text: JSON.stringify(result, null, 2) },
          ],
        });
        return;
      }

      case 'notifications/initialized':
        // Spec-required notification; no response.
        return;

      default:
        err(id, -32601, `method not found: ${req.method}`);
        return;
    }
  } catch (e) {
    err(id, -32603, e instanceof Error ? e.message : 'internal error');
  }
}

// ─── Main loop ─────────────────────────────────────────────────────

if (!VIGIL_OWNER_ID) {
  console.error(
    '[vigil-compliance-mcp] VIGIL_OWNER_ID not set — every tool call will 401. ' +
      'Set this to your operator UUID before adding the server to your MCP client.',
  );
}

const rl = createInterface({ input: process.stdin });
rl.on('line', (line) => {
  if (!line.trim()) return;
  try {
    const req = JSON.parse(line) as JsonRpcReq;
    void handle(req);
  } catch {
    // Malformed — ignore. MCP protocol assumes line-delimited valid JSON.
  }
});
