// --- robust init snippet ---
const MW = "http://127.0.0.1:8765";
let _fabAttached = false;

function whenReady(fn) {
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(fn, 0);
  } else {
    document.addEventListener('DOMContentLoaded', fn, { once: true });
  }
}

function ensureStyles() {
  if (document.getElementById('tsi-mw-css')) return;
  const css = `
  .tsi-fab { position: fixed; right: 18px; bottom: 18px; z-index: 9999;
    padding: 10px 14px; border-radius: 999px; background:#2b7; color:#fff; font-weight:600; cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,.25); }
  .tsi-fab:hover{ filter:brightness(1.1) }
  .tsi-modal-wrap { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 9999; display:flex; align-items:center; justify-content:center; }
  .tsi-modal { width: 520px; max-width: 95vw; background:#111; color:#eee; border-radius: 12px; padding: 16px; box-shadow: 0 8px 40px rgba(0,0,0,.5); }
  .tsi-row{ display:flex; gap:10px; margin:8px 0 } .tsi-row > *{ flex:1 }
  .tsi-help{ opacity:.8; font-size:.9em; margin-top:4px }
  .tsi-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top:12px }
  .tsi-b{ padding:8px 12px; border-radius:8px; border:none; cursor:pointer; }
  .tsi-bp{ background:#2b7; color:#fff } .tsi-bs{ background:#444; color:#fff } .tsi-bd{ background:#b22; color:#fff }
  input, select, textarea { background:#181818; color:#eee; border:1px solid #333; border-radius:8px; padding:8px }
  label{ font-size:.9em; opacity:.85 }
  `;
  const style = document.createElement('style');
  style.id = 'tsi-mw-css';
  style.appendChild(document.createTextNode(css));
  document.head.appendChild(style);
}

function addFAB(api) {
  if (_fabAttached) return;
  ensureStyles();
  const existing = document.getElementById('tsi-fab');
  if (existing) { _fabAttached = true; return; }

  const btn = document.createElement('button');
  btn.id = 'tsi-fab';
  btn.className = 'tsi-fab';
  btn.textContent = 'Check';
  btn.addEventListener('click', () => openCheckWizard(api));
  document.body.appendChild(btn);
  _fabAttached = true;
  console.log('[TSI-MW] FAB attached');
}

function attachFABWithRetries(api) {
  let tries = 0;
  const tick = () => {
    try {
      addFAB(api);
      // If not visible yet, try a few more times (SPA reflows)
      if (!document.getElementById('tsi-fab') && tries < 10) {
        tries++; setTimeout(tick, 500);
      }
    } catch (e) {
      console.error('[TSI-MW] FAB attach error', e);
      if (tries < 10) { tries++; setTimeout(tick, 500); }
    }
  };
  whenReady(tick);
  // Try again when ST says "app_ready" (some builds expose this emitter)
  try { api?.eventBus?.on?.('app_ready', tick); } catch {}
}

// Fallback: slash command /check opens the wizard
function registerSlash(api) {
  if (typeof api?.registerSlashCommand === 'function') {
    api.registerSlashCommand?.({
      name: 'check',
      help: 'Open the TSI Check wizard',
      fn: async (_args) => { openCheckWizard(api); }
    });
    console.log('[TSI-MW] /check registered');
  } else {
    // Ultra-fallback: intercept user input starting with /check
    api.registerHook('message:send', async (payload, next) => {
      if (payload?.type === 'user' && typeof payload.text === 'string' && payload.text.trim().startsWith('/check')) {
        openCheckWizard(api);
        return; // don’t forward /check to the model
      }
      return next(payload);
    });
    console.log('[TSI-MW] /check shim (hook) active');
  }
}

export async function init(api) {
  console.log('[TSI-MW] init (UI/manual dice)');
  registerSlash(api);
  attachFABWithRetries(api);

  // keep your existing [CHECK ...] interceptor here if you also want typed control lines to open the roll modal
  // ...
}
