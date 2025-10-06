// third-party/tsi-middleware/index.js
(() => {
  const MOD = 'TSI-MW';

  const DIFFICULTY_MODIFIERS = {
    'trivial': 10,
    'routine': 5,
    'standard': 0,
    'challenging': -5,
    'formidable': -10,
    'desperate': -20
  };
  
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
#tsimw-modal{background:#1e1e1e;color:#eee;padding:20px;border-radius:12px;width:540px;max-width:92vw;border:1px solid #3a3a3a;box-shadow:0 12px 30px rgba(0,0,0,.35);font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,"Helvetica Neue",Arial;}
#tsimw-modal h3{margin:0 0 12px;font-size:18px}
#tsimw-modal .row{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:10px}
#tsimw-modal .full-row{display:block;margin-bottom:10px}
#tsimw-modal label{display:block;font-size:12px;font-weight:600;margin:0 0 4px}
#tsimw-modal input,#tsimw-modal select,#tsimw-modal textarea{width:100%;padding:8px;border-radius:8px;border:1px solid #555;background:#2a2a2a;color:#eee;box-sizing:border-box}
#tsimw-modal input:read-only{background:#1a1a1a;color:#888}
#tsimw-modal textarea{resize:vertical;min-height:64px}
#tsimw-modal .actions{display:flex;gap:10px;justify-content:flex-end;margin-top:6px}
#tsimw-modal button{padding:8px 12px;border-radius:8px;border:0;cursor:pointer;font-weight:700}
#tsimw-cancel{background:#555;color:#fff}
#tsimw-submit{background:#007bff;color:#fff}
#tsimw-saveurl{background:#444;color:#fff;width:100%}
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
  function forceRender(ctx) {
    try {
      if (typeof ctx?.printMessages === 'function') {
        ctx.printMessages();
        console.log('[TSI-MW] Rendered via ctx.printMessages');
        return true;
      }
      
      console.warn('[TSI-MW] ctx.printMessages not available');
      return false;
    } catch (e) {
      console.error('[TSI-MW] forceRender failed:', e);
      return false;
    }
  }

  async function triggerGeneration(ctx) {
    try {
      const textarea = document.getElementById('send_textarea') || 
                       document.querySelector('#form_say textarea');
      if (textarea) {
        textarea.value = '';
      }
      
      const sendBtn = document.getElementById('send_but');
      if (sendBtn && !sendBtn.disabled) {
        console.log('[TSI-MW] Triggering generation via send button');
        sendBtn.click();
        return true;
      }
      
      console.warn('[TSI-MW] Send button not available');
      return false;
    } catch (e) {
      console.error('[TSI-MW] triggerGeneration failed:', e);
      return false;
    }
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
          <label for="tsimw-threshold">Base Threshold %</label>
          <input id="tsimw-threshold" type="number" min="0" max="100" readonly/>
        </div>
        <div>
          <label for="tsimw-modifier">Situation Modifier</label>
          <input id="tsimw-modifier" type="number" step="5" value="0" 
                 title="Difficulty adjustment (+10 trivial to -20 desperate)"/>
        </div>
      </div>

      <div class="row">
        <div>
          <label for="tsimw-roll">Roll (d%)</label>
          <input id="tsimw-roll" type="number" min="1" max="100"/>
        </div>
        <div>
          <label for="tsimw-final">Final Threshold</label>
          <input id="tsimw-final" type="number" readonly style="font-weight:700;color:#4af"/>
        </div>
      </div>

      <div class="full-row">
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
    const modInput  = modal.querySelector('#tsimw-modifier');
    const finalInput = modal.querySelector('#tsimw-final');
    const rollInput = modal.querySelector('#tsimw-roll');
    const reason    = modal.querySelector('#tsimw-reason');
    const urlInput  = modal.querySelector('#tsimw-url');

    const cfg = loadConfig();
    urlInput.value = cfg.httpUrl || '';

    const chars = loadCharacters();
    
    function updateFinalThreshold() {
      const base = Number(thrInput.value) || 0;
      const mod = Number(modInput.value) || 0;
      const final = Math.max(0, Math.min(100, base + mod));
      finalInput.value = final;
    }

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
        updateFinalThreshold();
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
      updateFinalThreshold();
    }
    
    fillChars(); 
    fillSkills();

    charSel.addEventListener('change', fillSkills);
    skillSel.addEventListener('change', () => {
      thrInput.value = skillSel.options[skillSel.selectedIndex]?.dataset?.pct || '';
      updateFinalThreshold();
    });
    modInput.addEventListener('input', updateFinalThreshold);

    modal.querySelector('#tsimw-cancel').onclick = () => (backdrop.style.display = 'none');
    modal.querySelector('#tsimw-saveurl').onclick = () => {
      saveConfig({ httpUrl: urlInput.value.trim() });
      ctx.addToast?.('TSI-MW: URL saved');
    };
    modal.querySelector('#tsimw-submit').onclick = async () => {
      const c = chars[Number(charSel.value) || 0];
      if (!c || !skillSel.value) { 
        ctx.addToast?.('Select a character and skill.'); 
        return; 
      }
      
      const finalThreshold = Number(finalInput.value);
      const roll = Math.max(1, Math.min(100, Number(rollInput.value || 0)));
      
      if (roll === 0) {
        ctx.addToast?.('Please enter a roll value (1-100).');
        return;
      }
      
      await sendCheck(ctx, {
        type: 'check',
        character: c.name || 'Unknown',
        skill: skillSel.value,
        threshold: finalThreshold,
        roll: roll,
        reason: (reason.value || '').trim(),
      });
      backdrop.style.display = 'none';
    };

    modal.__open = () => { backdrop.style.display = 'flex'; };
    backdrop.addEventListener('click', (e) => { 
      if (e.target === backdrop) backdrop.style.display = 'none'; 
    });

    return modal;
  }

  function openModal(ctx, request = null) {
    const hasChatUI = document.querySelector('#send_but') || document.querySelector('#form_say');
    if (!hasChatUI) {
      ctx.addToast?.('TSI-MW: Open a chat (e.g., The Administrator) first, then run Skill Check.');
      return;
    }
    injectStyles();
    const modal = buildModal(ctx);
    
    if (request) {
      const skillSel = modal.querySelector('#tsimw-skill');
      const modInput = modal.querySelector('#tsimw-modifier');
      const reason = modal.querySelector('#tsimw-reason');
      
      if (skillSel && request.skill) {
        for (let opt of skillSel.options) {
          if (opt.value === request.skill) {
            opt.selected = true;
            skillSel.dispatchEvent(new Event('change'));
            break;
          }
        }
      }
      
      if (modInput && request.difficulty) {
        const modifier = DIFFICULTY_MODIFIERS[request.difficulty] || 0;
        modInput.value = modifier;
        modInput.dispatchEvent(new Event('input'));
      }
      
      if (reason && request.reason) {
        reason.value = request.reason;
      }
      
      const difficultyText = request.difficulty || 'standard';
      const modifier = DIFFICULTY_MODIFIERS[difficultyText] || 0;
      const modText = modifier >= 0 ? `+${modifier}` : `${modifier}`;
      ctx.addToast?.(`The Administrator requests ${request.skill} check (${difficultyText}: ${modText})`);
    }
    
    modal.__open();
  }

  // ---------------------------
  // Middleware call
  // ---------------------------
  async function sendCheck(ctx, check) {
    const freshCtx = window.SillyTavern?.getContext?.() || ctx;
    
    const url = (loadConfig().httpUrl || '').trim();
    if (!url) { 
      freshCtx.addToast?.('TSI-MW: No middleware URL configured.'); 
      return; 
    }
  
    pushSilent(freshCtx,
      `[CHECK who=${check.character} skill=${check.skill} reason="${check.reason.replace(/"/g, "'")}"]` +
      `\nRolled **${check.roll}** vs **${check.threshold}%** — sending to rules engine…`,
      { 
        name: freshCtx?.name2 || 'The Administrator',
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
  
      pushSilent(freshCtx, tag, {
        name: freshCtx?.name2 || 'The Administrator',
        extra: { module: 'tsi-middleware', kind: 'check_result_raw' } 
      });
  
      const margin = (typeof data.margin === 'number') ? ` (margin ${data.margin})` : '';
      pushSilent(freshCtx,
        `Outcome for ${check.character}: **${s}** on **${check.skill}** (rolled ${check.roll} vs ${check.threshold}%${margin}). ${data.details || ''}`,
        { 
          name: freshCtx?.name2 || 'The Administrator',
          extra: { module: 'tsi-middleware', kind: 'check_result_human' } 
        }
      );
      
      forceRender(freshCtx);
      setTimeout(() => triggerGeneration(freshCtx), 100);
      
    } catch (e) {
      console.error(`[${MOD}] sendCheck error`, e);
      pushSilent(freshCtx, `❌ Network error talking to rules engine: ${e?.message || e}`, {
        name: freshCtx?.name2 || 'The Administrator',
        extra: { module: 'tsi-middleware', kind: 'check_error' } 
      });
      forceRender(freshCtx);
      setTimeout(() => triggerGeneration(freshCtx), 100);
    }
  }
  
  function pushSilent(ctx, textOrMsg, opts = {}) {
    const { eventSource, event_types } = ctx;
    const base = (typeof textOrMsg === 'string') ? { mes: textOrMsg } : (textOrMsg || {});
    const m = {
      is_user: false,
      is_system: false,
      name: base.name || opts.name || ctx?.name2 || 'The Administrator',
      send_date: nowStamp(),
      mes: base.mes ?? '',
      extra: { ...(base.extra || {}), ...(opts.extra || {}) },
    };
  
    if (!m.mes) {
      console.warn(`[${MOD}] pushSilent(): empty message text`);
      return;
    }
  
    try {
      ctx.chat?.push?.(m);
      eventSource?.emit?.(event_types?.MESSAGE_RECEIVED || 'message_received', m);
    } catch (e) {
      console.warn(`[${MOD}] pushSilent failed`, e);
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

    // Listen for Administrator requesting checks via text
    const es = ctx.eventSource;
    const et = ctx.event_types || ctx.eventTypes;
    
    es.on(et.MESSAGE_RECEIVED || 'message_received', (msg) => {
      console.log('[TSI-MW] MESSAGE_RECEIVED raw:', msg);
      console.log('[TSI-MW] Type:', typeof msg);
      console.log('[TSI-MW] Keys:', Object.keys(msg || {}));

      console.log('[TSI-MW] Arguments:', Array.from(arguments));
      
      // Ignore user messages
      if (msg.is_user) return;
      
      // Look for check request pattern
      const checkMatch = msg.mes.match(/\[CHECK\s+skill=(\w+)\s+difficulty=(\w+)\s+reason="([^"]+)"\]/);
      console.log('[TSI-MW] Check match result:', checkMatch);
      
      if (checkMatch) {
        const [_, skill, difficulty, reason] = checkMatch;
        console.log('[TSI-MW] Detected check request:', { skill, difficulty, reason });
        
        // Auto-open modal with pre-filled data
        setTimeout(() => {
          openModal(ctx, { skill, difficulty, reason });
        }, 500);
      }
    });

    globalThis.TSIMW = {
      open: () => openModal(ctx),
      setCharacters: saveCharacters,
      getCharacters: loadCharacters,
      setConfig: saveConfig,
      getConfig: loadConfig,
    };

    try {
      const cfg = loadConfig();
      if (!cfg.httpUrl) ctx.addToast?.('TSI-MW: Set your middleware URL in the modal.');
    } catch {}
  });
})();
