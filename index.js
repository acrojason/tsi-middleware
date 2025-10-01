// third-party/tsi-middleware/index.js
(() => {
  const MOD = 'TSI-MW';

  // ---------------------------
  // Boot: wait for SillyTavern
  // ---------------------------
  function onReady(cb) {
    const tryBoot = () => {
      const ctx = globalThis.SillyTavern?.getContext?.();
      if (!ctx || !ctx.eventSource || !(ctx.event_types || ctx.eventTypes)) {
        setTimeout(tryBoot, 150);
        return;
      }
      const es = ctx.eventSource;
      const et = ctx.event_types || ctx.eventTypes;

      // If app is already ready, go now; otherwise subscribe
      if (ctx.isAppReady || document.querySelector('#send_but') || document.querySelector('#form_say')) {
        try { cb(ctx); } catch (e) { console.error(`[${MOD}] init error`, e); }
      } else {
        es.on(et.APP_READY || 'app_ready', () => {
          try { cb(ctx); } catch (e) { console.error(`[${MOD}] init error`, e); }
        });
      }
    };

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', tryBoot);
    } else {
      tryBoot();
    }
  }

  // ---------------------------
  // Styles
  // ---------------------------
  function injectStyles() {
    if (document.getElementById('tsimw-styles')) return;
    const style = document.createElement('style');
    style.id = 'tsimw-styles';
    style.textContent = `
#tsimw-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;align-items:center;justify-content:center;z-index:10000;}
#tsimw-modal{background:#1e1e1e;color:#eee;padding:20px;border-radius:12px;width:520px;max-width:92vw;border:1px solid #3a3a3a;box-shadow:0 12px 30px rgba(0,0,0,.35);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial;}
#tsimw-modal h3{margin:0 0 12px;font-size:18px}
#tsimw-modal .row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px}
#tsimw-modal label{display:block;font-size:12px;font-weight:600;margin:0 0 4px}
#tsimw-modal input,#tsimw-modal select,#tsimw-modal textarea{width:100%;padding:8px;border-radius:8px;border:1px solid #555;background:#2a2a2a;color:#eee}
#tsimw-modal textarea{resize:vertical;min-height:64px}
#tsimw-modal .actions{display:flex;gap:10px;justify-content:flex-end;margin-top:6px}
#tsimw-modal button{padding:8px 12px;border-radius:8px;border:0;cursor:pointer;font-weight:700}
#tsimw-cancel{background:#555;color:#fff}
#tsimw-submit{background:#007bff;color:#fff}
#tsimw-fab{position:fixed;right:14px;bottom:14px;z-index:9999;padding:8px 14px;border-radius:18px;font-size:13px;font-weight:700;background:#007bff;color:#fff;border:0;box-shadow:0 6px 16px rgba(0,0,0,.35);cursor:pointer}
#tsimw-fab:hover{filter:brightness(1.07)}
`;
    document.head.appendChild(style);
  }

  // ---------------------------
  // Storage helpers
  // ---------------------------
  function nowStamp() { return new Date().toISOString(); }

  function loadConfig() {
    // Support both old and new keys
    try {
      const raw =
        localStorage.getItem('tsi-mw-config') ??
        localStorage.getItem('tsimw.config');
      const parsed = raw ? JSON.parse(raw) : {};
      return Object.assign({ httpUrl: 'http://127.0.0.1:5050/check' }, parsed);
    } catch {
      return { httpUrl: 'http://127.0.0.1:5050/check' };
    }
  }
  function saveConfig(cfg) {
    const clean = Object.assign({}, loadConfig(), cfg || {});
    localStorage.setItem('tsi-mw-config', JSON.stringify(clean));
  }

  function loadCharacters() {
    try {
      const raw =
        localStorage.getItem('tsi-mw-characters') ??
        localStorage.getItem('tsimw.characters');
      if (raw) return JSON.parse(raw);
    } catch {}
    const def = [{ name: 'Agent Drake', skills: { Surveillance: 62 } }];
    localStorage.setItem('tsi-mw-characters', JSON.stringify(def));
    return def;
  }
  function saveCharacters(arr) {
    localStorage.setItem('tsi-mw-characters', JSON.stringify(arr || []));
  }

  // ---------------------------
  // Chat injection
  // ---------------------------
  function forceRender() {
    try {
      if (globalThis.showMoreMessages) {
        globalThis.showMoreMessages(Number.MAX_SAFE_INTEGER);
      } else {
        const SCP = globalThis.SillyTavern?.getContext?.()?.SlashCommandParser;
        SCP?.parse?.('/chat-render');
      }
    } catch (e) {
      console.warn(`[${MOD}] render fallback failed`, e);
    }
  }

  // Accept push(ctx, "text", {name, extra}) OR push(ctx, {mes, name, extra})
  function push(ctx, textOrMsg, opts = {}) {
    const { eventSource, event_types } = ctx;
    const base = (typeof textOrMsg === 'string') ? { mes: textOrMsg } : (textOrMsg || {});
    const m = {
      is_user: false,
      is_system: false, // render as normal assistant message
      name: base.name || opts.name || ctx?.name2 || 'The Administrator',
      send_date: nowStamp(),
      mes: base.mes ?? '',
      extra: { ...(base.extra || {}), ...(opts.extra || {}) },
    };

    if (!m.mes) {
      console.warn(`[${MOD}] push(): empty message text`, { textOrMsg, opts });
      return;
    }

    try {
      ctx.chat?.push?.(m);
      eventSource?.emit?.((ctx.event_types || ctx.eventTypes)?.MESSAGE_RECEIVED || 'message_received', m);
    } catch (e) {
      console.warn(`[${MOD}] push failed`, e);
      ctx.addToast?.(m.mes) || alert(m.mes);
    }

    forceRender();
  }

  // ---------------------------
  // Modal
  // ---------------------------
  function buildModal(ctx) {
    let backdrop = document.getElementById('tsimw-modal-backdrop');
    let modal = document.getElementById('tsimw-modal');
    if (backdrop && modal) return modal;
    if (backdrop && !modal) { backdrop.remove(); backdrop = null; }

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
          <input id="tsimw-threshold" type="number" min="0" max="100"/>
        </div>
        <div>
          <label for="tsimw-roll">Roll (d%)</label>
          <input id="tsimw-roll" type="number" min="1" max="100"/>
        </div>
      </div>

      <div>
        <label for="tsimw-reason">Reason / Context (optional)</label>
        <textarea id="tsimw-reason" placeholder="e.g., Shadow the courier through the bazaar"></textarea>
      </div>

      <div class="row">
        <div>
          <label for="tsimw-url">Middleware URL (HTTP)</label>
          <input id="tsimw-url" type="text" placeholder="http://127.0.0.1:5050/check"/>
        </div>
        <div>
          <label>&nbsp;</label>
          <button id="tsimw-saveurl" type="button">Save URL</button>
        </div>
      </div>

      <div class="actions">
        <button id="tsimw-cancel" type="button">Cancel</button>
        <button id="tsimw-submit" type="button">Submit</button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    const charSel   = modal.querySelector('#tsimw-char');
    const skillSel  = modal.querySelector('#tsimw-skill');
    const thrInput  = modal.querySelector('#tsimw-threshold');
    const rollInput = modal.querySelector('#tsimw-roll');
    const reason    = modal.querySelector('#tsimw-reason');
    const urlInput  = modal.querySelector('#tsimw-url');

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
      if (!entries.length) {
        skillSel.innerHTML = `<option value="">(No skills)</option>`;
        thrInput.value = '';
        return;
      }
      for (const [name, pct] of entries) {
        const opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        opt.dataset.pct = String(pct);
        skillSel.appendChild(opt);
      }
      thrInput.value = skillSel.options[0]?.dataset?.pct || '';
    }
    fillChars(); fillSkills();

    charSel.addEventListener('change', fillSkills);
    skillSel.addEventListener('change', () => {
      thrInput.value = skillSel.options[skillSel.selectedIndex]?.dataset?.pct || '';
    });

    modal.querySelector('#tsimw-cancel').onclick = () => (backdrop.style.display = 'none');
    modal.querySelector('#tsimw-saveurl').onclick = () => {
      saveConfig({ httpUrl: urlInput.value.trim() });
      ctx.addToast?.('TSI-MW: URL saved');
    };
    modal.querySelector('#tsimw-submit').onclick = async () => {
      const c = chars[Number(charSel.value) || 0];
      if (!c || !skillSel.value) { ctx.addToast?.('Select a character and skill.'); return; }
      await sendCheck(ctx, {
        type: 'check',
        character: c.name || 'Unknown',
        skill: skillSel.value,
        threshold: Math.max(0, Math.min(100, Number(thrInput.value || 0))),
        roll: Math.max(1, Math.min(100, Number(rollInput.value || 0))),
        reason: (reason.value || '').trim(),
      });
      backdrop.style.display = 'none';
    };

    modal.__open = () => { backdrop.style.display = 'flex'; };
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.style.display = 'none'; });

    return modal;
  }

  function openModal(ctx) {
    // Guard: only when a chat UI exists (avoid opening from card editor)
    const hasChatUI = document.querySelector('#send_but') || document.querySelector('#form_say');
    if (!hasChatUI) {
      ctx.addToast?.('TSI-MW: Open a chat (e.g., The Administrator) first, then run Skill Check.');
      return;
    }
    injectStyles();
    const modal = buildModal(ctx);
    modal.__open();
  }

  // ---------------------------
  // Middleware call
  // ---------------------------
  async function sendCheck(ctx, check) {
    console.log('[TSI-MW] sendCheck ctx.name2:', ctx?.name2);
    const url = (loadConfig().httpUrl || '').trim();
    if (!url) { ctx.addToast?.('TSI-MW: No middleware URL configured.'); return; }
  
    push(ctx,
      `[CHECK who=${check.character} skill=${check.skill} reason="${check.reason.replace(/"/g, "'")}"]` +
      `\nRolled **${check.roll}** vs **${check.threshold}%** — sending to rules engine…`,
      { 
        name: ctx?.name2 || 'The Administrator',  // <-- Add this!
        extra: { module: 'tsi-middleware', kind: 'check_request' } 
      }
    );
  
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(check),
      });
      const data = await res.json();
      console.log(`[${MOD}] handled result:`, data);
  
      const s = data.success ? 'SUCCESS' : 'FAILURE';
      const tag = `[CHECK_RESULT who=${check.character} skill=${check.skill} roll=${check.roll} vs=${check.threshold} result=${s}${data.quality ? ` quality=${data.quality}` : ''}]`;

      console.log('[TSI-MW] About to push with name:', ctx?.name2 || 'The Administrator');
      
      // Machine-readable line - USE CHARACTER NAME
      push(ctx, tag, { 
        name: ctx?.name2 || 'The Administrator',  // <-- Add this!
        extra: { module: 'tsi-middleware', kind: 'check_result_raw' } 
      });
  
      // Human summary - USE CHARACTER NAME
      const margin = (typeof data.margin === 'number') ? ` (margin ${data.margin})` : '';
      push(ctx,
        `Outcome for ${check.character}: **${s}** on **${check.skill}** (rolled ${check.roll} vs ${check.threshold}%${margin}). ${data.details || ''}`,
        { 
          name: ctx?.name2 || 'The Administrator',  // <-- And this!
          extra: { module: 'tsi-middleware', kind: 'check_result_human' } 
        }
      );
    } catch (e) {
      console.error(`[${MOD}] sendCheck error`, e);
      push(ctx, `❌ Network error talking to rules engine: ${e?.message || e}`, { 
        name: ctx?.name2 || 'The Administrator',  // <-- And this!
        extra: { module: 'tsi-middleware', kind: 'check_error' } 
      });
    }
  }

  // ---------------------------
  // UI installers
  // ---------------------------
  function addFab(ctx) {
    if (document.getElementById('tsimw-fab')) return;
    injectStyles();
    const fab = document.createElement('button');
    fab.id = 'tsimw-fab';
    fab.textContent = 'Skill Check';
    fab.title = 'Open Top Secret/S.I. check modal';
    fab.onclick = () => openModal(ctx);
    document.body.appendChild(fab);
  }

  // ---------------------------
  // Kickoff
  // ---------------------------
  console.log(`[${MOD}] index.js loaded; waiting for APP_READY…`);
  onReady((ctx) => {
    console.log(`[${MOD}] ready — installing UI & hooks`);
    injectStyles();
    addFab(ctx);

    // Force paint when a chat loads (in case anything was injected before UI painted)
    const es = ctx.eventSource;
    const et = ctx.event_types || ctx.eventTypes;
    es.on(et.chatLoaded || 'chatLoaded', () => {
      console.log(`[${MOD}] chatLoaded → force render`);
      forceRender();
    });

    // Expose console helpers again
    globalThis.TSIMW = {
      open: () => openModal(ctx),
      setCharacters: saveCharacters,
      getCharacters: loadCharacters,
      setConfig: saveConfig,
      getConfig: loadConfig,
    };

    // First-run hint
    try {
      const cfg = loadConfig();
      if (!cfg.httpUrl) ctx.addToast?.('TSI-MW: Set your middleware URL in the modal.');
    } catch {}
  });
})();
