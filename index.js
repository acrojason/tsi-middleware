// SillyTavern third-party extension (browser-safe)
const MW = "http://127.0.0.1:8765";

const RX = {
  CHECK: /\[CHECK\s+who=(\S+)\s+skill=(\S+)\s+reason="([^"]+)"(?:\s+context="([^"]*)")?\s*\]/i,
  SET:   /\[SET\s+path=([a-zA-Z0-9._-]+(?:\.[a-zA-Z0-9._-]+)+)\s+value=(.+?)\s+reason="([^"]+)"\s*\]/i
};

export async function init(api) {
  console.log("[TSI-MW] init called (third-party)");

  api.registerHook("message:send", async (payload, next) => {
    if (payload?.type !== "user" || !payload?.text) return next(payload);
    const t = payload.text;

    // CHECK
    let m = t.match(RX.CHECK);
    if (m) {
      const [, who, skill, reason, ctx] = m;
      try {
        const r = await fetch(`${MW}/check`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ who, skill, reason, context: ctx || "" })
        }).then(x => x.json());
        if (r?.line) {
          await api.addAssistantMessage(r.line);
          return; // do NOT forward to model
        }
      } catch (e) {
        console.error("[TSI-MW] /check error", e);
        await api.addAssistantMessage("[ERROR msg=\"engine offline or bad request\"]");
        return;
      }
    }

    // SET
    m = t.match(RX.SET);
    if (m) {
      const [, path, raw, reason] = m;
      // best-effort parse
      let value = raw;
      if (/^\d+$/.test(raw)) value = parseInt(raw,10);
      else if (/^\d+\.\d+$/.test(raw)) value = parseFloat(raw);
      else if (raw === "true" || raw === "false") value = (raw === "true");
      else value = raw.replace(/^"(.*)"$/,"$1");

      try {
        const r = await fetch(`${MW}/set`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ path, value, reason })
        }).then(x => x.json());
        if (r?.line) {
          await api.addAssistantMessage(r.line);
          return; // stop here
        }
      } catch (e) {
        console.error("[TSI-MW] /set error", e);
        await api.addAssistantMessage("[ERROR msg=\"engine offline or bad request\"]");
        return;
      }
    }

    // default: let normal messages reach the model
    return next(payload);
  });

  return { success: true, message: "TSI Middleware loaded" };
}
