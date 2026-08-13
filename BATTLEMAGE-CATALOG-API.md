# Battlemage Catalog API — Server-Side Implementation Plan

Audience: the agent/engineer working on the **battlemage inference server**.
Purpose: serve the canonical OpenCode Studio profile configs so end users never
copy-paste configs again. When you add/optimize a model, you edit one file on
the server and every user's OpenCode Studio picks it up automatically
(auto-sync on app start + a manual "Sync now" button).

---

## 1. What OpenCode Studio now implements (client contract)

OpenCode Studio ≥2.8.1 has "linked profiles":

- Two built-in presets, each pointing at a canonical URL on the battlemage server:
  - **Public data only** → `https://battlemage.tail06281.ts.net/opencode-studio/public.json`
  - **All data (private AI)** → `https://battlemage.tail06281.ts.net/opencode-studio/private.json`
- Creating a profile from a preset fetches the URL **immediately** and writes the
  result as that profile's `opencode.json`. The profile remembers its source URL
  in a marker file (`<profile>/.ocs-linked-source.json`).
- On every app start (and on demand), Studio re-fetches the URL for each linked
  profile and syncs with a **layered, model-level merge**:
  - **The catalog is the baseline**: new/updated models flow to users on every
    sync. Removed models disappear — *unless the user customized that model,
    in which case their copy is kept* (an edit makes it theirs).
  - **Local edits are overrides and are NEVER reverted.** If a user tweaks a
    model's context limit (or any provider option), their value wins while the
    rest of the catalog keeps updating around it. No prompts, no conflicts.
  - **The user's own `apiKey` is always preserved** (users enter it once in
    Settings → Provider API Keys).
  - User additions are never touched: MCP servers, their own providers/models,
    and all other top-level settings (model choice, theme, etc.) survive syncs.
  - A **"Reset to catalog"** button on the profile discards the user's
    overrides and restores the pure catalog (keys and additions still kept) —
    the escape hatch for undoing customizations.
  - If the server is unreachable (user off the tailnet), the profile keeps
    working with the last-synced config. Sync failures never clobber the file.

## 2. Endpoints to implement

Two `GET` endpoints returning JSON:

```
GET https://battlemage.tail06281.ts.net/opencode-studio/public.json
GET https://battlemage.tail06281.ts.net/opencode-studio/private.json
```

(If you want different paths, tell the Studio maintainer — the preset URLs are
constants in one place, `BUILTIN_PROFILE_PRESETS` in `server/index.js`.)

### Response requirements

| Requirement | Detail |
|---|---|
| Status | `200 OK`. Any `>= 400` is treated as "sync failed, keep last known config". |
| Content-Type | `application/json; charset=utf-8` (any JSON content type works; the client only parses the body) |
| Body | A valid **opencode.json** config object (see §3) |
| CORS | **Not needed** — the Studio backend (Node) fetches server-to-server, not the browser |
| Caching | Recommend `Cache-Control: no-cache` (or short `max-age`). Studio fetches on app start; you want same-day propagation of model changes. |
| TLS/ACL | Already HTTPS on the tailnet. **Action needed: Tailscale ACLs must allow all Studio users' nodes to reach this port/path** (same as the `/v1` inference endpoint). |

The client sends `User-Agent: opencode-studio` and uses a 10s timeout.
No auth headers are sent — the endpoints are protected by tailnet membership,
same as the inference API.

## 3. The JSON body (hard requirements)

Must be a JSON object with a **non-empty `provider` object**. Anything else is
rejected with "not a valid opencode config" and the user's file is left untouched.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "battlemage": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Battlemage (all models)",
      "options": {
        "baseURL": "https://battlemage.tail06281.ts.net/v1",
        "timeout": 1800000,
        "chunkTimeout": 1800000
        // NO apiKey here — ever. Users enter their own key locally;
        // sync preserves it. A key served here would be written into
        // user configs that don't have one yet — don't do it.
      },
      "models": {
        "qwen36-35b": {
          "name": "Qwen3.6-35B-A3B",
          "tool_call": true,
          "reasoning": true,
          "limit": { "context": 262144, "output": 32768 }
        }
        // ... every model you currently offer
      }
    },
    "battlemage-cpu": { "…": "…" }
  },

  // ONLY in private.json — this is the entire difference between the two:
  "enabled_providers": ["battlemage", "battlemage-cpu"]
}
```

Rules:
- `provider` — required, non-empty. All model metadata (`limit`, `tool_call`,
  `reasoning`, …) lives here; this is the curated catalog Studio cannot infer
  from the OpenAI-compatible `/v1/models` endpoint.
- **Never** include `apiKey` (or any secret) in the served files.
- `enabled_providers` — omit from `public.json`; include in `private.json`.
- Any other valid opencode.json top-level keys are allowed and will be synced
  (e.g. a recommended default `model`).

## 4. Daily workflow after this ships

1. Add/optimize a model on battlemage (as today).
2. Edit `public.json` + `private.json` (or regenerate them — see §6).
3. Done. Users get it on next app start (toast: "Model catalog updated"), or
   immediately via the profile's **Sync** button. No repo commits, no app
   update, no copy-paste, no version bump.

Removing a model from the catalog removes it from synced configs on next sync.

## 5. Suggested server implementations

Any of these works — pick what matches your stack.

**nginx (static files):**
```nginx
location /opencode-studio/ {
    alias /srv/battlemage/opencode-studio/;   # public.json, private.json
    add_header Cache-Control "no-cache";
    default_type application/json;
}
```

**Caddy:**
```
handle_path /opencode-studio/* {
    root * /srv/battlemage/opencode-studio
    header Cache-Control "no-cache"
    file_server
}
```

**Node/Express (if the inference server has an HTTP router):**
```js
app.use('/opencode-studio', express.static('/srv/battlemage/opencode-studio', {
  setHeaders: (res) => {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache');
  }
}));
```

**Quick local test (Python):**
```bash
cd /srv/battlemage/opencode-studio && python3 -m http.server 8081
```

## 6. Recommended: generate both files from one source of truth

The two files differ only by `enabled_providers`. Avoid drift:

```python
# generate_catalogs.py — run after changing the model registry
import json, os

catalog = build_catalog_from_your_registry()   # your existing model source

base = {
    "$schema": "https://opencode.ai/config.json",
    "provider": catalog,                        # battlemage + battlemage-cpu
}

out = "/srv/battlemage/opencode-studio"
write_atomic(f"{out}/public.json", base)        # write temp file, os.replace()
write_atomic(f"{out}/private.json",
             {**base, "enabled_providers": ["battlemage", "battlemage-cpu"]})
```

**Write atomically** (write temp + rename) so a Studio sync never reads a
half-written file. (Studio rejects invalid JSON and keeps the last good config,
but atomic writes remove the failure mode entirely.)

## 7. Acceptance checklist (server side)

- [ ] `curl -sf https://battlemage.tail06281.ts.net/opencode-studio/public.json | jq -e '.provider | keys | length > 0'` → `true`
- [ ] Same for `private.json`, plus `jq -e '.enabled_providers | index("battlemage")'` → matches
- [ ] Neither file contains `apiKey`: `grep -c apiKey *.json` → `0`
- [ ] `Cache-Control` header present (no long-lived caching)
- [ ] Reachable from a *different* tailnet node than the server (ACL check)
- [ ] Files update atomically (temp + rename), not edited in place

## 8. End-to-end verification (Studio side, after server is live)

1. Profiles → **New from Preset** → "Public data only" → profile appears,
   `~/.config/opencode-profiles/public-data-only/opencode.json` matches the
   served file (minus any key).
2. Settings → **Provider API Keys** → enter key for `battlemage` → saved into
   the profile's opencode.json.
3. Edit a context limit on the server → click **Sync** on the profile →
   catalog updates, **your apiKey is still there**.
4. Edit a limit *locally* (Raw Config), then change the remote → Sync →
   **both survive**: the remote model update applies, the local limit stays.
5. "Reset to catalog" on the profile → local overrides revert to catalog,
   apiKey/MCP/additions remain.
6. Disconnect from tailnet → Sync → error reported, file untouched.

## 9. Failure modes (all safe by design)

| Situation | Studio behavior |
|---|---|
| Server offline / off tailnet | Keep last synced config; sync status shows the error |
| Invalid JSON served | Rejected; user file untouched |
| `provider` missing/empty | Rejected; user file untouched |
| User edited a managed model + remote changed | **Both kept**: remote update applies, user's edit wins for that model (override) |
| Admin removed a model the user edited | User's copy kept (an edit makes it theirs) |
| User wants clean slate | "Reset to catalog" button restores pure catalog (keys/additions kept) |
| Half-written file served | Prevented server-side by atomic writes (§6) |
