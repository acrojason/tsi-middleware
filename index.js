// SillyTavern third-party extension (browser-safe)
const MW = "http://127.0.0.1:8765";

const RX = /\[CHECK\s+who=(\S+)\s+skill=(\S+)\s+reason="([^"]+)"/i;

export async function init(api) {
  console.log('[TSI-MW] init with manual roll mode');

  api.registerHook('message:send', async (payload, next) => {
    if (payload?.type !== 'user' || !payload?.text) return next(payload);

    const m = payload.text.match(RX);
    if (!m) return next(payload);

    const who = m[1], skill = m[2], reason = m[3];
    // Option A: tell yourself inside chat
    await api.addAssistantMessage(
      `[NEED_ROLL who=${who} skill=${skill} reason="${reason}"]\n(Please roll manually and reply with [RESULT ...])`
    );

    // Option B: log it instead
    console.log(`[TSI-MW] Roll requested: who=${who}, skill=${skill}, reason=${reason}`);

    return; // <-- don’t forward [CHECK …] to the model
  });
}

