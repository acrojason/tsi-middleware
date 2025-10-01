// --- tsi-middleware/index.js ---
// Unified: UI + manual dice + [CHECK] interception
// Drop-in replacement for your current index.js

const MW_BASE = "http://127.0.0.1:8765"; // Flask helper (optional)

// ---------- small utilities ----------
const RX = {
  CHECK: /\[CHECK\s+who=(\S+)\s+skill=(\S+)\s+reason="([^"]+)"(?:\s+context="([^"]*)")?\s*\]/i,
};

function log(...a) { console.log("[TSI-MW]", ...a); }
function err(...a) { console.error("[TSI-MW]", ...a); }

function whenReady(fn) {
  if (document.readyState === "complete" || document.readyState === "interactive") {
    setTimeout(fn, 0);
  } else {
    document.addEventListener("DOMContentLoaded", fn, { once: true });
  }
}

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

// Robust message posting (ST builds differ)
async function postAssistant(api, text) {
  if (api?.addAssistantMessage) return api.addAssistantMessage(text);
  if (api?.sendMessageAsAssistant) return api.sendMessageAsAssistant(text);
  // final fallback: shove into textarea and simulate an assistant line (least pretty)
  const ta = document.querySelector('#send_textarea, textarea#chat_input, textarea');
  if (ta) ta.value = text;
}

async function postUser(api, text) {
  if (api?.addUserMessage) return api.addUserMessage(text);
  if (api?.sendMessageAsUser) return api.sendMessageAsUser(text);
  const ta = document.querySelector('#send_textarea, textarea#chat_input, textarea');
  const sendBtn = document.querySelector('#send_but, button.send_message, [data-testid="send-button"]');
  if (ta && sendBtn) { ta.value = text; sendBtn.click(); }
}

function ensureStyles() {
  if (document.getElementById("tsi-mw-css")) return;
  const css = `
  .tsi-fab { position: fixed; right: 18px; bottom: 18px; z-index: 99999;
    padding: 10px 14px; border-radius: 999px; background:#2b7; color:#fff; font-weight:600; cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,.25); }
  .tsi-fab:hover{ filter:brightness(1.1) }
  .tsi-overlay { position: fixed; inset:0; background: rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; z-index: 99998; }
  .tsi-modal { width: 520px; max-width: 95vw; background:#111; color:#eee; border-radius: 12px; padding: 16px; box-shadow: 0 8px 40px rgba(0,0,0,.5); }
  .tsi-row{ display:flex; gap:10px; margin:8px 0 } .tsi-row>*{ flex:1 }
  .tsi-help{ opacity:.8; font-size:.9em; margin-top:4px }
  .tsi-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top:12px }
  .tsi-b{ padding:8px 12px; border-radius:8px; border:none; cursor:pointer; }
  .tsi-bp{ background:#2b7; color:#fff } .tsi-bs{ background:#444; color:#fff } .tsi-bd{ background:#b22; color:#fff }
  input, select { background:#181818; color:#eee; border:1px solid #333; border-radius:8px; padding:8px }
  label{ font-size:.9em; opacity:.85 }
  `;
  const style = document.createElement("style");
  style.id = "tsi-mw-css";
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}

function openModal(contentNode) {
  ensureStyles();
  const wrap = document.createElement("div");
  wrap.className = "tsi-overlay";
  const box = document.createElement("div");
  box.className = "tsi-modal";
  box.appendChild(contentNode);
  wrap.appendChild(box);
  wrap.addEventListener("click", (e) => { if (e.target === wrap) wrap.remove(); });
  document.body.appendChild(wrap);
  return { close: () => wrap.remove() };
}

function h(tag, props = {}, children = []) {
  const el = document.createElement(tag);
  Object.assign(el, props);
  if (props.className) el.setAttribute("class", props.className);
  (Array.isArray(children) ? children : [children]).filter(Boolean).forEach(ch => {
    if (typeof ch === "string") el.appendChild(document.createTextNode(ch));
    else el.appendChild(ch);
  });
  return el;
}

// ---------- UI: Check Wizard + Roll Entry ----------
async function openCheckWizard(api) {
  let chars = [];
  let serviceUp = true;
  try { chars = await fetchJSON(`${MW_BASE}/world/characters`); }
  catch { serviceUp = false; }

  const body = document.createElement("div");
  const selChar = serviceUp ? h("select") : h("input", { placeholder: "pc.Jack" });
  const selSkill = serviceUp ? h("select") : h("input", { placeholder: "Surveillance" });
  const inReason = h("input", { placeholder: "Reason (what are you trying to do?)" });
  const inCtx = h("input", { placeholder: "Context (k:v;...)", value: "" });

  const tgtBox = h("div", { className: "tsi-help" }, "Target: —");

  if (serviceUp) {
    const opt = (v, t) => h("option", { value: v }, t || v);
    selChar.appendChild(opt("", "-- choose character --"));
    chars.forEach(c => selChar.appendChild(opt(c.id, c.name)));
    selSkill.appendChild(opt("", "-- choose skill --"));

    selChar.addEventListener("change", () => {
      selSkill.innerHTML = "";
      selSkill.appendChild(opt("", "-- choose skill --"));
      const found = chars.find(x => x.id === selChar.value);
      (found?.skills || []).forEach(sk => selSkill.appendChild(opt(sk)));
      refreshTarget();
    });
  }

  async function refreshTarget() {
    if (!serviceUp) { tgtBox.textContent = "Target: (manual mode)"; tgtBox.dataset.target = ""; return; }
    const who = selChar.value, skill = selSkill.value;
    if (!who || !skill) { tgtBox.textContent = "Target: —"; tgtBox.dataset.target = ""; return; }
    const ctx = inCtx.value.trim();
    try {
      const r = await fetchJSON(`${MW_BASE}/world/skill-target`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ who, skill, context: ctx })
      });
      tgtBox.textContent = `Target: ${r.target} (base ${r.base} ${r.mods ? (r.mods > 0 ? '+' : '') + r.mods : ''})`;
      tgtBox.dataset.target = String(r.target);
    } catch {
      tgtBox.textContent = "Target: (error)";
      tgtBox.dataset.target = "";
    }
  }

  if (serviceUp) selSkill.addEventListener("change", refreshTarget);
  inCtx.addEventListener("input", () => { if (serviceUp) refreshTarget(); });

  const row1 = h("div", { className: "tsi-row" }, [
    h("div", {}, [h("label", {}, "Character"), selChar]),
    h("div", {}, [h("label", {}, "Skill"), selSkill]),
  ]);
  const row2 = h("div", { className: "tsi-row" }, [
    h("div", {}, [h("label", {}, "Reason"), inReason]),
  ]);
  const row3 = h("div", { className: "tsi-row" }, [
    h("div", {}, [h("label", {}, "Context (optional)"), inCtx]),
  ]);

  const actions = h("div", { className: "tsi-actions" }, [
    h("button", { className: "tsi-b tsi-bs", onclick: () => dlg.close() }, "Cancel"),
    h("button", { className: "tsi-b tsi-bp", onclick: onCreate }, "Create Check"),
  ]);

  body.appendChild(h("h3", {}, "TSI Check"));
  body.appendChild(row1);
  body.appendChild(row2);
  body.appendChild(row3);
  body.appendChild(tgtBox);
  body.appendChild(actions);

  const dlg = openModal(body);

  async function onCreate() {
    const who = serviceUp ? selChar.value : selChar.value?.trim();
    const skill = serviceUp ? selSkill.value : selSkill.value?.trim();
    const reason = inReason.value?.trim();
    const context = inCtx.value?.trim();
    if (!who || !skill || !reason) { tgtBox.textContent = "Please enter character, skill, and reason."; return; }

    // Inform the log (optional; nice breadcrumb when you scroll back)
    await postAssistant(api, `[NEED_ROLL who=${who} skill=${skill} target=${tgtBox.dataset.target || "unknown"} reason="${reason}" context="${context || ""}"]`);
    dlg.close();

    openRollEntry(api, {
      who, skill, reason, context,
      target: tgtBox.dataset.target ? parseInt(tgtBox.dataset.target, 10) : undefined
    });
  }

  if (serviceUp) refreshTarget();
}

function openRollEntry(api, { who, skill, reason, context, target }) {
  const body = document.createElement("div");
  const inRoll = h("input", { type: "number", min: 1, max: 100, placeholder: "d100 roll (1-100)" });
  const help = h("div", { className: "tsi-help" }, `Enter physical/virtual roll. Target = ${target ?? "unknown"}.`);
  const actions = h("div", { className: "tsi-actions" }, [
    h("button", { className: "tsi-b tsi-bs", onclick: () => dlg.close() }, "Cancel"),
    h("button", {
      className: "tsi-b tsi-bp", onclick: async () => {
        const roll = parseInt(inRoll.value, 10);
        if (!roll || roll < 1 || roll > 100 || !target) { help.textContent = "Enter 1–100 and ensure target was fetched/known."; return; }
        const success = roll <= target;
        const margin = Math.abs(target - roll);
        const degree = success
          ? (roll <= 5 || margin >= 30) ? "Critical"
          : (margin >= 20) ? "Excellent"
          : (margin >= 6) ? "Standard"
          : "Marginal"
          : (roll >= 95 || margin >= 30) ? "Complication"
          : (margin >= 20) ? "Fail"
          : "NearMiss";

        await postAssistant(api, `[RESULT who=${who} skill=${skill} roll=${roll} target=${target} success=${String(success)} margin=${margin} degree=${degree} notes="${(context || "").replace(/"/g, '\\"')}"]`);
        dlg.close();
      }
    }, "Submit Result"),
  ]);

  body.appendChild(h("h3", {}, "Enter Roll Result"));
  body.appendChild(inRoll);
  body.appendChild(help);
  body.appendChild(actions);
  const dlg = openModal(body);
}

// ---------- FAB + slash + hooks ----------
let FAB_ATTACHED = false;

function addFAB(api) {
  if (FAB_ATTACHED) return;
  ensureStyles();
  const have = document.getElementById("tsi-fab");
  if (have) { FAB_ATTACHED = true; return; }
  const btn = document.createElement("button");
  btn.id = "tsi-fab";
  btn.className = "tsi-fab";
  btn.textContent = "Check";
  btn.addEventListener("click", () => openCheckWizard(api));
  document.body.appendChild(btn);
  FAB_ATTACHED = true;
  log("FAB attached");
}

function attachFABWithRetries(api) {
  let tries = 0;
  const tick = () => {
    try {
      addFAB(api);
      if (!document.getElementById("tsi-fab") && tries < 10) { tries++; setTimeout(tick, 500); }
    } catch (e) {
      err("FAB attach error", e);
      if (tries < 10) { tries++; setTimeout(tick, 500); }
    }
  };
  whenReady(tick);
  try { api?.eventBus?.on?.("app_ready", tick); } catch {}
}

// Slash command /check opens the wizard (fallback if FAB hidden)
function registerSlash(api) {
  if (typeof api?.registerSlashCommand === "function") {
    api.registerSlashCommand({
      name: "check",
      help: "Open the TSI Check wizard",
      fn: async () => openCheckWizard(api),
    });
    log("/check registered");
  } else {
    // ultra-fallback: intercept user text starting with /check
    api.registerHook("message:send", async (payload, next) => {
      if (payload?.type === "user" && typeof payload.text === "string" && payload.text.trim().startsWith("/check")) {
        openCheckWizard(api);
        return;
      }
      return next(payload);
    });
    log("/check shim (hook) active");
  }
}

// Intercept typed [CHECK ...] to open roll modal and generate [NEED_ROLL]/[RESULT]
function registerCheckInterceptor(api) {
  api.registerHook("message:send", async (payload, next) => {
    if (payload?.type !== "user" || !payload?.text) return next(payload);
    const m = payload.text.match(RX.CHECK);
    if (!m) return next(payload);

    const who = m[1], skill = m[2], reason = m[3];
    const context = (m[4] || "");
    let target;

    try {
      const r = await fetchJSON(`${MW_BASE}/world/skill-target`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ who, skill, context })
      });
      target = r.target;
    } catch { /* allow unknown target */ }

    await postAssistant(api, `[NEED_ROLL who=${who} skill=${skill} target=${target ?? "unknown"} reason="${reason}" context="${context}"]`);
    openRollEntry(api, { who, skill, reason, context, target });

    return; // don't forward original [CHECK] to the model
  });
}

// ---------- ST entrypoint ----------
export async function init(api) {
  log("init (UI + manual dice + interceptor)");
  registerSlash(api);
  attachFABWithRetries(api);
  registerCheckInterceptor(api);

  // Tip: keep your SYSTEM prompt strict:
  // - Never produce [CHECK]/[RESULT]/[REQUEST_*]/[SET] yourself.
  // - If last assistant message is [NEED_ROLL], wait.
  // - If last assistant message is [RESULT], narrate consequences only.

  return { success: true, message: "TSI Middleware ready" };
}
