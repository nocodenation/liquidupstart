// Patch OpenClaw's openclaw.json on every start, so that the gateway works behind the proxy and
// offers the providers .env asks for.
//
// What it is for
//   config/scripts/start/openclaw.sh runs this file with the node of the OpenClaw image, in a
//   throwaway container that mounts the state directory at /state. It is a file of its own, not
//   inline in the shell script, so that its tests can run it on a copy of openclaw.json.
//
// Input (environment)
//   OPENCLAW_JSON         the file to patch (default /state/openclaw.json)
//   PRIVACY_ROUTING       off | opt-in | only; in only every direct route an earlier start wrote
//                         is removed, so the privacy providers and the local LLM are all that stays
//   ENABLE_CLAUDE_CLI, ENABLE_COPILOT, ENABLE_CODEX, ENABLE_GROK, ENABLE_LOCAL
//                         1 to wire that backend's provider and runtime
//   PRIVACY_OPENAI, PRIVACY_ANTHROPIC, PRIVACY_PROXY_URL
//                         which privacy providers to register, and the proxy they point at
//   LOCAL_LLM_API_BASE, LOCAL_LLM_API_KEY, LOCAL_LLM_MODELS_JSON
//                         the local LLM provider and its discovered model ids
//   MODEL_WILDCARDS       comma-separated `provider/*` picker entries to add
//   OPENROUTER_MODELS_JSON  OpenRouter model ids to add to the picker
//   PLUGIN_PATHS          comma-separated plugin directories to load
//
// Output
//   The file is rewritten in place; one log line per change on stdout. A provider catalogue that
//   cannot be read (outside the OpenClaw image) is logged and treated as empty.

const fs = require("fs");
const p = process.env.OPENCLAW_JSON || "/state/openclaw.json";
const c = JSON.parse(fs.readFileSync(p, "utf8"));

c.gateway = c.gateway || {};

// Delegate auth to nginx (sets X-Forwarded-User); trust it only from these
// proxy IPs. allowLoopback keeps the shared-netns openclaw-cli working.
c.gateway.auth = c.gateway.auth || {};
c.gateway.auth.mode = "trusted-proxy";
delete c.gateway.auth.token;
delete c.gateway.auth.tokenFile;
c.gateway.auth.trustedProxy = c.gateway.auth.trustedProxy || {};
c.gateway.auth.trustedProxy.userHeader = "x-forwarded-user";
c.gateway.auth.trustedProxy.allowLoopback = true;
c.gateway.trustedProxies = ["127.0.0.1/32", "10.0.0.0/8", "172.16.0.0/12", "192.168.0.0/16"];
c.gateway.allowRealIpFallback = true;

// Allow any browser origin (proxy guards access; only a CSRF-style guard).
c.gateway.controlUi = c.gateway.controlUi || {};
c.gateway.controlUi.allowedOrigins = ["*"];

// Auto-pair proxy-authenticated browsers (see header comment): allowInsecureAuth
// is localhost-only and useless behind the proxy.
delete c.gateway.controlUi.dangerouslyDisableDeviceAuth;
c.gateway.auth.trustedProxy.deviceAutoApprove = {
  enabled: true,
  scopes: ["operator.admin", "operator.read", "operator.write", "operator.approvals", "operator.questions", "operator.pairing", "operator.talk"]
};

// Per-backend provider/runtime wiring. No primary model is pinned; each
// enabled backend routes its provider/* through the right runtime and the
// user picks the concrete model in the OpenClaw model picker.
const enableClaudeCli = process.env.ENABLE_CLAUDE_CLI === "1";
const enableCopilot = process.env.ENABLE_COPILOT === "1";
const enableCodex = process.env.ENABLE_CODEX === "1";
const enableGrok = process.env.ENABLE_GROK === "1";
const enableLocal = process.env.ENABLE_LOCAL === "1";
const privacyOpenai = process.env.PRIVACY_OPENAI === "1";
const privacyAnthropic = process.env.PRIVACY_ANTHROPIC === "1";
c.agents = c.agents || {};
c.agents.defaults = c.agents.defaults || {};
c.agents.defaults.models = c.agents.defaults.models || {};

// The bundled model catalog of a provider plugin: every node with a string id and a
// numeric contextWindow, deduplicated to the widest entry per id.
const catalogOf = (pluginId) => {
  const found = [];
  try {
    const manifest = JSON.parse(fs.readFileSync("/app/dist/extensions/" + pluginId + "/openclaw.plugin.json", "utf8"));
    const collect = (node) => {
      if (Array.isArray(node)) { node.forEach(collect); return; }
      if (!node || typeof node !== "object") return;
      if (typeof node.id === "string" && typeof node.contextWindow === "number") found.push(node);
      Object.values(node).forEach(collect);
    };
    collect(manifest);
  } catch (e) {
    console.log("openclaw.json: could not read the " + pluginId + " model catalog (" + e.message + ")");
  }
  const widest = new Map();
  for (const m of found) {
    const prev = widest.get(m.id);
    if (!prev || m.contextWindow > prev.contextWindow) widest.set(m.id, m);
  }
  return [...widest.values()];
};
const modelEntry = (m, suffix) => ({
  id: m.id,
  name: (m.name || m.id).replace(/\s*\((Claude CLI|private)\)\s*$/, "") + " (" + suffix + ")",
  reasoning: m.reasoning === true,
  input: Array.isArray(m.input) ? m.input : ["text"],
  contextWindow: m.contextWindow,
  ...(typeof m.maxTokens === "number" ? { maxTokens: m.maxTokens } : {})
});

let cliPinnedModels = [];

delete c.agents.defaults.cliBackends;
if (enableClaudeCli) {
  c.agents.defaults.models["anthropic/*"] = c.agents.defaults.models["anthropic/*"] || {};
  c.agents.defaults.models["anthropic/*"].agentRuntime = { id: "claude-cli" };

  const CLI_DEFAULT_CONTEXT_WINDOW = 200000;
  const cliServes = (id) => /^claude-(opus|sonnet|fable|mythos)-/.test(id);
  const candidates = catalogOf("anthropic")
    .filter((m) => cliServes(m.id) && m.contextWindow > CLI_DEFAULT_CONTEXT_WINDOW);

  if (candidates.length) {
    c.models = c.models || {};
    c.models.providers = c.models.providers || {};
    c.models.providers["claude-cli"] = c.models.providers["claude-cli"] || {};
    const cliModels = Array.isArray(c.models.providers["claude-cli"].models)
      ? c.models.providers["claude-cli"].models
      : [];
    for (const model of candidates) {
      if (cliModels.some((m) => m && m.id === model.id)) continue;
      cliModels.push(modelEntry(model, "Claude CLI"));
      cliPinnedModels.push(model.id + "=" + model.contextWindow);
    }
    c.models.providers["claude-cli"].models = cliModels;
  }
}

if (enableCopilot) {
  c.agents.defaults.models["github-copilot/*"] = c.agents.defaults.models["github-copilot/*"] || {};
  c.agents.defaults.models["github-copilot/*"].agentRuntime = { id: "copilot" };
}

if (enableCodex) {
  c.agents.defaults.models["openai/*"] = c.agents.defaults.models["openai/*"] || {};
  c.agents.defaults.models["openai/*"].agentRuntime = { id: "codex" };
}

// Copilot embeddings for the RAG tools: expose /v1/embeddings and point
// memory.search at github-copilot.
if (enableCopilot) {
  c.gateway = c.gateway || {};
  c.gateway.http = c.gateway.http || {};
  c.gateway.http.endpoints = c.gateway.http.endpoints || {};
  c.gateway.http.endpoints.chatCompletions = c.gateway.http.endpoints.chatCompletions || {};
  c.gateway.http.endpoints.chatCompletions.enabled = true;
  delete c.agents.defaults.memorySearch;
  c.memory = c.memory || {};
  c.memory.search = c.memory.search || {};
  c.memory.search.provider = "github-copilot";
  if (!c.memory.search.model) c.memory.search.model = "text-embedding-3-small";
}

if (enableCodex) {
  c.plugins = c.plugins || {};
  c.plugins.entries = c.plugins.entries || {};
  c.plugins.entries.codex = c.plugins.entries.codex || {};
  c.plugins.entries.codex.enabled = true;
  if (Array.isArray(c.plugins.allow) && !c.plugins.allow.includes("codex")) {
    c.plugins.allow.push("codex");
  }
}

if (enableGrok) {
  c.plugins = c.plugins || {};
  c.plugins.entries = c.plugins.entries || {};
  c.plugins.entries.xai = c.plugins.entries.xai || {};
  c.plugins.entries.xai.enabled = true;
  if (Array.isArray(c.plugins.allow) && !c.plugins.allow.includes("xai")) {
    c.plugins.allow.push("xai");
  }
}

if (enableLocal && process.env.LOCAL_LLM_API_BASE) {
  c.models = c.models || {};
  c.models.providers = c.models.providers || {};
  c.models.providers.local = c.models.providers.local || {};
  c.models.providers.local.baseUrl = process.env.LOCAL_LLM_API_BASE.replace(/\/+$/, "") + "/v1";
  c.models.providers.local.api = "openai-completions";
  c.models.providers.local.apiKey = process.env.LOCAL_LLM_API_KEY || "local-no-auth";
  c.models.providers.local.auth = "api-key";
  let discovered = [];
  try { discovered = JSON.parse(process.env.LOCAL_LLM_MODELS_JSON || "[]"); } catch (e) {}
  const chatModels = discovered.filter((id) => !/embed/i.test(id));
  if (chatModels.length) {
    c.models.providers.local.models = chatModels.map((id) => ({ id, name: id }));
  } else {
    delete c.models.providers.local;
  }
}

// One privacy provider per credentialed upstream, carrying the catalog of that
// upstream and routed through the dialect-native door the proxy has for it.
if (c.models && c.models.providers) delete c.models.providers.privacy;
delete c.agents.defaults.models["privacy/*"];
if ((privacyOpenai || privacyAnthropic) && process.env.PRIVACY_PROXY_URL) {
  const proxy = process.env.PRIVACY_PROXY_URL.replace(/\/+$/, "");
  const privacyProvider = (pluginId, api, baseUrl) => {
    const models = catalogOf(pluginId).map((m) => modelEntry(m, "private"));
    if (!models.length) { console.log("openclaw.json: no " + pluginId + " catalog; privacy-" + pluginId + " skipped"); return; }
    c.models = c.models || {};
    c.models.providers = c.models.providers || {};
    c.models.providers["privacy-" + pluginId] = {
      baseUrl, api, apiKey: "local-no-auth", auth: "api-key", timeoutSeconds: 600, models,
    };
  };
  if (privacyOpenai) privacyProvider("openai", "openai-completions", proxy + "/openai/v1");
  if (privacyAnthropic) privacyProvider("anthropic", "anthropic-messages", proxy + "/anthropic");
}

// Only mode: remove everything an earlier start wrote for a direct route, so that the
// privacy providers and the local LLM are all the picker shows. Kept: the "local" and
// "privacy-*" providers and their picker entries. Removed: every other provider, every other
// picker entry with its runtime, the Copilot embeddings for memory search, and the Codex and
// xAI plugins. A primary model on a removed route is dropped and chosen again below.
const routingOnly = process.env.PRIVACY_ROUTING === "only";
const keptRoute = (ref) => ref.startsWith("local/") || ref.startsWith("privacy-");
if (routingOnly) {
  for (const ref of Object.keys(c.agents.defaults.models)) {
    if (!keptRoute(ref)) delete c.agents.defaults.models[ref];
  }
  if (c.models && c.models.providers) {
    for (const id of Object.keys(c.models.providers)) {
      if (id !== "local" && !id.startsWith("privacy-")) delete c.models.providers[id];
    }
  }
  if (c.memory && c.memory.search && c.memory.search.provider === "github-copilot") delete c.memory.search;
  if (c.plugins && c.plugins.entries) {
    for (const id of ["codex", "xai"]) if (c.plugins.entries[id]) c.plugins.entries[id].enabled = false;
  }
  const primary = typeof c.agents.defaults.model === "string"
    ? c.agents.defaults.model
    : c.agents.defaults.model && c.agents.defaults.model.primary;
  if (primary && !keptRoute(primary)) {
    if (typeof c.agents.defaults.model === "object") delete c.agents.defaults.model.primary;
    else delete c.agents.defaults.model;
    console.log("openclaw.json: privacy routing only, dropped primary model " + primary);
  }
  console.log("openclaw.json: privacy routing only, kept providers [" + Object.keys((c.models || {}).providers || {}).join(", ") + "]");
}

// Model picker allowlist: add a `provider/*` wildcard per credentialed
// provider (from MODEL_WILDCARDS) so the picker is not limited to the primary.
// Idempotent and additive: existing entries (e.g. the claude-cli ref) survive.
const modelWildcards = (process.env.MODEL_WILDCARDS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
if (modelWildcards.length) {
  c.agents = c.agents || {};
  c.agents.defaults = c.agents.defaults || {};
  c.agents.defaults.models = c.agents.defaults.models || {};
  for (const w of modelWildcards) {
    if (!c.agents.defaults.models[w]) c.agents.defaults.models[w] = {};
  }
}

const currentPrimary = typeof c.agents.defaults.model === "string"
  ? c.agents.defaults.model
  : c.agents.defaults.model && c.agents.defaults.model.primary;
if (!currentPrimary) {
  const firstLocal = (((c.models || {}).providers || {}).local || {}).models;
  // In only mode the first privacy model is preferred, then the local LLM.
  const firstPrivacy = routingOnly
    ? ["privacy-anthropic", "privacy-openai"].map((id) => {
        const prov = ((c.models || {}).providers || {})[id];
        return prov && prov.models && prov.models.length ? id + "/" + prov.models[0].id : null;
      }).find(Boolean)
    : null;
  const defaultPrimary = firstPrivacy ? firstPrivacy
    : enableClaudeCli ? "anthropic/claude-opus-5"
    : enableCodex ? "openai/gpt-5.5"
    : enableCopilot ? "github-copilot/gpt-4o"
    : (Array.isArray(firstLocal) && firstLocal.length) ? "local/" + firstLocal[0].id
    : null;
  if (defaultPrimary) {
    c.agents.defaults.model = typeof c.agents.defaults.model === "object" && c.agents.defaults.model
      ? { ...c.agents.defaults.model, primary: defaultPrimary }
      : { primary: defaultPrimary };
    console.log("openclaw.json: pinned default primary model =", defaultPrimary, "(first-run model wizard skipped; change it in the UI)");
  }
}

let openrouterModels = [];
try { openrouterModels = JSON.parse(process.env.OPENROUTER_MODELS_JSON || "[]"); } catch (e) {}
if (openrouterModels.length) {
  c.agents = c.agents || {};
  c.agents.defaults = c.agents.defaults || {};
  c.agents.defaults.models = c.agents.defaults.models || {};
  for (const id of openrouterModels) {
    const ref = "openrouter/" + id;
    if (!c.agents.defaults.models[ref]) c.agents.defaults.models[ref] = {};
  }
}

// Register local plugin dirs. Our plugins ship a self-contained dist/*.mjs
// bundle, so no node_modules is needed at runtime.
const pluginPaths = (process.env.PLUGIN_PATHS || "")
  .split(",").map((s) => s.trim()).filter(Boolean);
if (pluginPaths.length) {
  c.plugins = c.plugins || {};
  c.plugins.load = c.plugins.load || {};
  // REPLACE, not append: the start script owns this list. OpenClaw validates
  // every load.path at startup and aborts if one is missing, so stale entries
  // (e.g. an old path persisted in openclaw.json) must be dropped.
  c.plugins.load.paths = pluginPaths;
  const baseAllow = ["anthropic","browser","canvas","codex","device-pair",
    "file-transfer","memory-core","ollama","openai","openrouter",
    "talk-voice","ingest-pdf"];
  if (enableGrok) baseAllow.push("xai");
  const allow = new Set([...(c.plugins.allow || []), ...baseAllow]);
  if (routingOnly) { allow.delete("codex"); allow.delete("xai"); }
  c.plugins.allow = [...allow];
  c.tools = { profile: "full", web: { search: { enabled: false } } };
}

fs.writeFileSync(p, JSON.stringify(c, null, 2) + "\n");
console.log("openclaw.json: auth.mode =", c.gateway.auth.mode, "; trustedProxies =", JSON.stringify(c.gateway.trustedProxies));
console.log("openclaw.json: allowedOrigins =", JSON.stringify(c.gateway.controlUi.allowedOrigins));
console.log("openclaw.json: trustedProxy.deviceAutoApprove =", JSON.stringify(c.gateway.auth.trustedProxy.deviceAutoApprove));
if (pluginPaths.length) {
  console.log("openclaw.json: plugins.load.paths =", JSON.stringify(c.plugins.load.paths));
}
if (modelWildcards.length) {
  console.log("openclaw.json: model allowlist wildcards =", JSON.stringify(modelWildcards));
}
if (openrouterModels.length) {
  console.log("openclaw.json: added " + openrouterModels.length + " OpenRouter models to the picker allowlist");
}
if (enableClaudeCli) {
  console.log("openclaw.json: routed anthropic/* through the claude-cli runtime");
  if (cliPinnedModels.length) {
    console.log("openclaw.json: pinned claude-cli context windows [" + cliPinnedModels.join(", ") + "] (openclaw defaults them to 200k)");
  }
}
if (enableCopilot) {
  console.log("openclaw.json: routed github-copilot/* through the copilot runtime");
  console.log("openclaw.json: enabled gateway /v1/embeddings + memory.search.provider = github-copilot (model", c.memory.search.model + ") for RAG embeddings");
}
if (enableCodex) {
  console.log("openclaw.json: routed openai/* through the codex runtime");
  console.log("openclaw.json: enabled bundled codex plugin (ChatGPT/Codex subscription harness for openai/* turns)");
}
if (enableGrok) {
  console.log("openclaw.json: enabled bundled xai plugin (Grok subscription provider for xai/* turns)");
}
for (const pid of ["privacy-openai", "privacy-anthropic"]) {
  const prov = c.models && c.models.providers && c.models.providers[pid];
  if (prov) console.log("openclaw.json: registered " + pid + " (" + prov.baseUrl + ") with models [" + prov.models.map((m) => m.id).join(", ") + "] and allowlisted " + pid + "/*");
}
if (enableLocal && c.models && c.models.providers && c.models.providers.local) {
  console.log("openclaw.json: registered self-hosted local provider (" + c.models.providers.local.baseUrl + ") with models [" + c.models.providers.local.models.map((m) => m.id).join(", ") + "] and allowlisted local/*");
} else if (enableLocal && process.env.LOCAL_LLM_API_BASE) {
  console.log("openclaw.json: local provider NOT registered — no chat models discovered from " + process.env.LOCAL_LLM_API_BASE + "/v1/models (is the endpoint up and reachable from containers?)");
}
