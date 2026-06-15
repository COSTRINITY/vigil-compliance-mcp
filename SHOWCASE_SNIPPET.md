# VIGIL Compliance MCP showcase snippet

Verified published on npm: `@costrinity/vigil-compliance-mcp@0.1.0` (bin: `vigil-compliance-mcp`). Paste-ready for Discord.

Run:
`npx @costrinity/vigil-compliance-mcp`

MCP client config:

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

Replace `VIGIL_OWNER_ID` and `VIGIL_API_KEY` with the values from your VIGIL dashboard.

Tools (20): consent_check, breach_classify, ai_act_classify, dpia_threshold_check, us_sectoral_check, india_sectoral_check, india_cross_border_status, japan_cross_border_status, us_state_breach_deadline, aadhaar_mask, pan_classify, gstin_validate, cpf_validate, sin_validate, iban_validate, pii_test, privacy_notice_get, sub_processors_register, global_compliance_map, india_regulators_directory
