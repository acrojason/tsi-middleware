// third-party/tsi-middleware/index.js
(() => {
  const MOD = 'TSI-MW';

  // -----------------------------
  // Utility / Context bootstrap
  // -----------------------------
  function onReady(cb) {
    const tryInit = () => {
      const ctx = window.SillyTavern?.getContext?.();
      if (!ctx) return false;
      const es = ctx.eventSource;
      const et = ctx.event_types || ctx.eventTypes;
      if (!es || !et) return false;

      // If app_ready has already fired in some builds
      if (ctx.isAppReady) {
        cb(ctx);
        return true;
      }

      // Otherwise subscribe to APP_READY
      es.on(et.APP_READY || 'app_ready', () => cb(ctx));
      return true;
    };

    if (!tryInit()) {
      // Fallback: try again when DOM is ready
      document.addEventListener('DOMContentLoaded', () => setTimeout(tryInit, 0));
    }
  }

  // -----------------------------
  // Styles (safe dark/light defaults)
  // -----------------------------
  function injectStyles() {
    if (document.getElementById('tsimw-styles')) return;
    const css = `
:root{
  --tsimw-bg: var(--SmartThemeWindowColor, #1e1e1e);
  --tsimw-fg: var(--SmartThemeFontColor, #f0f0f0);
  --tsimw-input: var(--SmartThemeInputColor, rgba(255,255,255,.06));
  --tsimw-border: var(--SmartThemeBorderColor, rgba(255,255,255,.2));
  --tsimw-accent: var(--SmartThemeAccent, #5271ff);
  --tsimw-body: var(--SmartThemeBodyColor, #ffffff);
}
#tsimw-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.45);display:none;align-items:center;justify-content:center;z-index:10000;}
#tsimw-modal{width:520px;max-width:95vw;background:var(--tsimw-bg);color:var(--tsimw-fg);border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.3);padding:16px;border:1px solid var(--tsimw-border);}
#tsimw-modal h3{margin:0 0 10px 0;font-size:18px;}
#tsimw-modal .row{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;}
#tsimw-modal label{font-size:12px;opacity:1;display:block;margin-bottom:4px;color:var(--tsimw-fg);}
#tsimw-modal input,#tsimw-modal select,#tsimw-modal textarea{width:100%;padding:8px;border-radius:8px;border:1px solid var(--tsimw-border);background:var(--tsimw-input);color:var(--tsimw-fg);}
#tsimw-modal textarea{resize:vertical;min-height:64px;}
#tsimw-modal .actions{display:flex;gap:8px;justify-content:flex-end;margin-top:12px;}
#tsimw-modal .actions button{padding:8px 12px;border-radius:8px;border:1px solid var(--tsimw-border);background:var(--tsimw-input);color:var(--tsimw-fg);cursor:pointer;font-weight:600;}
#tsimw-modal #tsimw-submit{background:var(--tsimw-accent);color:var(--tsimw-body);border-color:var(--tsimw-accent);}
#tsimw-modal .actions button:hover{filter:brightness(1.08);}
#tsimw-fab{position:fixed;right:12px;bottom:12px;z-index:9999;padding:8px 14px;border-radius:8px;font-size:13px;font-weight:600;background:var(--tsimw-accent);color:var(--tsimw-body);border:1px solid var(--tsimw-accent);box-shadow:0 4px 12px rgba(0,0,0,.35);cursor:pointer;}
#tsimw-fab:hover{filter:brightness(1.1);}
#tsimw-btn{margin-left:6px;padding:6px 10px;border-radius:10px;cursor:pointer;border:1px solid var(--tsimw-border);background:var(--tsimw-accent);color:var(--tsimw-body);font-size:12px;}
`;
    const style = document.createElement('style');
    style.id = 'tsimw-styles';
    style.textContent = css;
    document.head.appendChild(style);
  }

  // -----------------------------
  // Local storage helpers
  // -----------------------------
  function loadCharacters() {
    try {
      const raw = localStorage.getItem('tsimw.characters');
      if (raw) return JSON.parse(raw);
    } catch {}
    // Minimal default for first-time test
    const def = [{ name: 'Agent Drake', skills: { Surveillance: 62 } }];
    localStorage.setItem('tsimw.characters', JSON.stringify(def));
    return def;
  }

  function saveCharacters(arr) {
    localStorage.setItem('tsimw.characters', JSON.stringify(arr || []));
  }

  function loadConfig() {
    const def = { mode: 'http', httpUrl: 'http://127.0.0.1:5050/check', wsUrl: 'ws://127.0.0.1:5050' };
    try {
      const raw = localStorage.getItem('tsimw.config');
      if (!raw) {
        localStorage.setItem('tsimw.config', JSON.stringify(def));
        return def;
      }
      const obj = JSON.parse(raw);
      return Object.assign({}, def, obj);
    } catch {
      localStorage.setItem('tsimw.config', JSON.stringify(def));
      return def;
    }
  }

  function saveConfig(cfg) {
    localStorage.setItem('tsimw.config', JSON.stringify(cfg));
  }

  // -----------------------------
  // Chat injection (robust)
  // -----------------------------
  function nowStamp() {
    try {
      return new Date().toLocaleString(undefined, {
        year: 'numeric', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true
      });
    } catch { return new Date().toString(); }
  }

  function push(ctx, text, { system = false, name, extra = {} } = {}) {
    const who = name || ctx?.name2 || 'TSI-MW';      // << use active character by default
    const msg = {
      name: who,
      is_user: false,
      is_system: false,                               // render as assistant message
      send_date: nowStamp(),
      mes: text,
      extra
    };
  
    try {
      // 1) Push into chat
      ctx.chat.push(msg);
  
      // 2) Notify event bus
      const es = ctx.eventSource;
      const et = ctx.event_types || ctx.eventTypes;
      es?.emit?.(et?.MESSAGE_RECEIVED || 'message_received', msg);
  
      // 3) Force UI to render (covers builds that don't auto-paint on MESSAGE_RECEIVED)
      if (globalThis.showMoreMessages) {
        globalThis.showMoreMessages(Number.MAX_SAFE_INTEGER);
      } else {
        // fallback to slash command if available
        const SCP = window.SillyTavern?.getContext?.()?.SlashCommandParser;
        SCP?.parse?.('/chat-render');
      }
    } catch (e) {
      console.warn('[TSI-MW] push fallback failed:', e);
      ctx.addToast?.(text) || alert(text);
    }
  }


  // -----------------------------
  // Modal UI
  // -----------------------------
  function buildModal(ctx) {
    // If we already have a full modal/backdrop, reuse it
    let backdrop = document.getElementById('tsimw-modal-backdrop');
    let modal = document.getElementById('tsimw-modal');
    if (backdrop && modal) return modal;
  
    // If backdrop exists but modal was removed (inconsistent DOM), reset it
    if (backdrop && !modal) {
      backdrop.remove();
      backdrop = null;
    }
  
    // Fresh build
    backdrop = document.createElement('div');
    backdrop.id = 'tsimw-modal-backdrop';
  
    modal = document.createElement('div');
    modal.id = 'tsimw-modal';
    modal.innerHTML = `
      <h3>Top Secret/S.I. — Skill Check</h3>
  
      <div class="row">
        <div>
          <label for="tsimw-char">Character</label>
          <select id="tsimw-char"></select>
        </div>
        <div>
          <label for="tsimw-skill">Skill</label>
          <select id="tsimw-skill"></select>
        </div>
      </div>
  
      <div class="row">
        <div>
          <label for="tsimw-threshold">Threshold %</label>
          <input id="tsimw-threshold" type="number" min="0" max="100" step="1" />
        </div>
        <div>
          <label for="tsimw-roll">Roll (d%)</label>
          <input id="tsimw-roll" type="number" min="1" max="100" step="1" />
        </div>
      </div>
  
      <div class="row" style="grid-template-columns: 1fr;">
        <div>
          <label for="tsimw-reason">Reason / Context (optional)</label>
          <textarea id="tsimw-reason" placeholder="e.g., Shadow the courier through the bazaar"></textarea>
        </div>
      </div>
  
      <div class="row">
        <div>
          <label for="tsimw-url">Middleware URL (HTTP)</label>
          <input id="tsimw-url" type="text" placeholder="http://127.0.0.1:5050/check" />
        </div>
        <div>
          <label>&nbsp;</label>
          <div style="display:flex;gap:8px;align-items:center;">
            <button id="tsimw-saveurl" type="button" title="Save URL">Save URL</button>
            <span id="tsimw-url-hint" style="font-size:12px;opacity:.8;">Used for HTTP POST</span>
          </div>
        </div>
      </div>
  
      <div class="actions">
        <button id="tsimw-cancel" type="button">Cancel</button>
        <button id="tsimw-submit" type="button">Submit</button>
      </div>
    `;
  
    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);
  
    // Wire up behavior (same as before)
    const charSel = modal.querySelector('#tsimw-char');
    const skillSel = modal.querySelector('#tsimw-skill');
    const threshold = modal.querySelector('#tsimw-threshold');
    const roll = modal.querySelector('#tsimw-roll');
    const reason = modal.querySelector('#tsimw-reason');
    const urlInput = modal.querySelector('#tsimw-url');
  
    const cfg = loadConfig();
    urlInput.value = cfg.httpUrl || '';
  
    const chars = loadCharacters();
  
    function fillChars() {
      charSel.innerHTML = '';
      chars.forEach((c, i) => {
        const opt = document.createElement('option');
        opt.value = String(i);
        opt.textContent = c.name || `Char ${i + 1}`;
        charSel.appendChild(opt);
      });
    }
  
    function fillSkills() {
      skillSel.innerHTML = '';
      const c = chars[Number(charSel.value) || 0] || { skills: {} };
      const entries = Object.entries(c.skills || {});
      if (entries.length === 0) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = '(No skills)';
        skillSel.appendChild(opt);
        threshold.value = '';
        return;
      }
      for (const [name, pct] of entries) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        opt.dataset.pct = String(pct);
        skillSel.appendChild(opt);
      }
      const pct = Number(skillSel.options[skillSel.selectedIndex]?.dataset?.pct || 0);
      threshold.value = String(pct);
    }
  
    fillChars();
    fillSkills();
  
    charSel.addEventListener('change', fillSkills);
    skillSel.addEventListener('change', () => {
      const pct = Number(skillSel.options[skillSel.selectedIndex]?.dataset?.pct || 0);
      threshold.value = String(pct);
    });
  
    modal.querySelector('#tsimw-cancel').onclick = () => (backdrop.style.display = 'none');
    modal.querySelector('#tsimw-saveurl').onclick = () => {
      const cfg2 = loadConfig();
      cfg2.httpUrl = urlInput.value.trim();
      saveConfig(cfg2);
      ctx.addToast?.('TSI-MW: URL saved');
    };
    modal.querySelector('#tsimw-submit').onclick = async () => {
      const c = chars[Number(charSel.value) || 0];
      const skill = skillSel.value;
      const thr = Math.max(0, Math.min(100, Number(threshold.value || 0)));
      const r = Math.max(1, Math.min(100, Number(roll.value || 0)));
      if (!c || !skill) { ctx.addToast?.('Select a character and skill.'); return; }
  
      await sendCheck(ctx, {
        type: 'check',
        character: c.name || 'Unknown',
        skill,
        threshold: thr,
        roll: r,
        reason: (reason.value || '').trim()
      });
      backdrop.style.display = 'none';
    };
  
    // expose open/close
    modal.__open = () => { backdrop.style.display = 'flex'; };
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.style.display = 'none'; });
  
    return modal;
  }
  
  function openModal(ctx) {
    injectStyles();
    const modal = buildModal(ctx);
    modal.__open(); // safe now — buildModal always returns a modal node
  }


  // -----------------------------
  // Engine call
  // -----------------------------
  async function sendCheck(ctx, check) {
    const cfg = loadConfig();

    // preflight line (system)
    push(
      ctx,
      `[CHECK who=${check.character} skill=${check.skill} reason="${(check.reason || '').replace(/"/g, '\'')}"]\n` +
      `Rolled **${check.roll}** vs threshold **${check.threshold}%** — sending to rules engine…`,
      { system: true, name: 'System', extra: { module: 'tsi-middleware', kind: 'check_request' } }
    );

    if (cfg.mode !== 'http') {
      push(ctx, '❌ Only HTTP mode is implemented in this build. Set mode to HTTP and a /check URL.', { name: 'TSI-MW' });
      return;
    }

    try {
      const res = await fetch(cfg.httpUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(check),
        credentials: 'omit',
        mode: 'cors',
      });
      const data = await res.json();
      console.log('[TSI-MW] HTTP result:', data);
      handleEngineResult(ctx, data, check);
    } catch (e) {
      console.error('[TSI-MW] HTTP error:', e);
      push(ctx, `❌ Network error talking to rules engine: ${e?.message || e}`, { name: 'TSI-MW' });
    }
  }

  function handleEngineResult(ctx, res, check) {
    if (!res || res.ok === false) {
      push(ctx, `❌ Check failed to evaluate (${res?.error || 'unknown error'}). Please adjudicate manually.`,
        { name: 'TSI-MW', extra: { module: 'tsi-middleware', kind: 'check_error' } });
      return;
    }

    const s = res.success ? 'SUCCESS' : 'FAILURE';
    const margin = (typeof res.margin === 'number') ? ` (margin ${res.margin})` : '';
    const tag = `[CHECK_RESULT who=${check.character} skill=${check.skill} roll=${check.roll} vs=${check.threshold} result=${s}${res.quality ? ` quality=${res.quality}` : ''}]`;

    // Machine-readable line for the model (system)
    push(ctx, `[CHECK_RESULT who=${check.character} skill=${check.skill} roll=${check.roll} vs=${check.threshold} result=${s}${res.quality?` quality=${res.quality}`:''}]`,
     { extra: { module: 'tsi-middleware', kind: 'check_result_raw' } });

    // Human summary
    push(ctx, `Outcome for ${check.character}: **${s}** on **${check.skill}** (rolled ${check.roll} vs ${check.threshold}%${margin}). ${res.details || ''}`,
     { extra: { module: 'tsi-middleware', kind: 'check_result_human' } });

    ctx.addToast?.(`TSI-MW: ${s}${margin}`);
    console.log('[TSI-MW] handled result:', res);
  }

  // -----------------------------
  // UI entry points
  // -----------------------------
  function addHeaderButton(ctx) {
    const candidates = [
      '#extensionsApiButtons',
      '#btnContainer',
      '#extensionsMenu',
      '#rightNav',
      '#menu_bar',
      'header'
    ];
    const bar = candidates.map(sel => document.querySelector(sel)).find(Boolean) || document.body;

    if (document.getElementById('tsimw-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'tsimw-btn';
    btn.type = 'button';
    btn.textContent = 'Skill Check';
    btn.title = 'Open Top Secret/S.I. check modal';
    btn.onclick = () => openModal(ctx);
    btn.className = 'menu_button';
    bar.appendChild(btn);
  }

  function addFab(ctx) {
    if (document.getElementById('tsimw-fab')) return;
    const fab = document.createElement('button');
    fab.id = 'tsimw-fab';
    fab.type = 'button';
    fab.textContent = 'Skill Check';
    fab.title = 'Open Top Secret/S.I. check modal';
    fab.onclick = () => openModal(ctx);
    document.body.appendChild(fab);
  }

  // -----------------------------
  // Bootstrap
  // -----------------------------
  console.log(`[${MOD}] index.js loaded; waiting for APP_READY…`);
  onReady((ctx) => {
    console.log(`[${MOD}] app ready, installing UI`);
    injectStyles();
    addHeaderButton(ctx);
    addFab(ctx);

    // Expose helpers for console
    window.TSIMW = {
      open: () => openModal(ctx),
      setCharacters: saveCharacters,
      getCharacters: loadCharacters,
      setConfig: saveConfig,
      getConfig: loadConfig
    };

    // First-time hint
    try {
      const cfg = loadConfig();
      if (!cfg || !cfg.httpUrl) {
        ctx.addToast?.('TSI-MW: Set your middleware URL in the modal (default set).');
      }
    } catch {}
  });
})();
