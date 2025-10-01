// === Utility Helpers ===

function injectStyles() {
  if (document.getElementById('tsimw-styles')) return;
  const style = document.createElement('style');
  style.id = 'tsimw-styles';
  style.textContent = `
    #tsimw-modal-backdrop {
      position: fixed; inset: 0; background: rgba(0,0,0,.6);
      display: none; align-items: center; justify-content: center;
      z-index: 10000;
    }
    #tsimw-modal {
      background: #1e1e1e; color: #eee; padding: 20px;
      border-radius: 12px; width: 420px; max-width: 90%;
      font-family: sans-serif; display: flex; flex-direction: column; gap: 14px;
    }
    #tsimw-modal h3 { margin: 0 0 10px; font-size: 18px; }
    #tsimw-modal label { display:block; font-weight: bold; margin-bottom: 4px; }
    #tsimw-modal input, #tsimw-modal select, #tsimw-modal textarea {
      width: 100%; padding: 6px; border-radius: 6px; border: 1px solid #555;
      background: #2e2e2e; color: #eee;
    }
    #tsimw-modal textarea { resize: vertical; min-height: 60px; }
    #tsimw-modal .row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    #tsimw-modal .actions { display: flex; justify-content: flex-end; gap: 12px; }
    #tsimw-modal button {
      padding: 6px 12px; border: none; border-radius: 6px; cursor: pointer;
      font-weight: bold;
    }
    #tsimw-modal button#tsimw-cancel { background: #555; color: #fff; }
    #tsimw-modal button#tsimw-submit { background: #007bff; color: #fff; }
  `;
  document.head.appendChild(style);
}

function nowStamp() {
  return new Date().toISOString();
}

function loadConfig() {
  try {
    return JSON.parse(localStorage.getItem('tsi-mw-config') || '{}');
  } catch {
    return {};
  }
}
function saveConfig(cfg) {
  localStorage.setItem('tsi-mw-config', JSON.stringify(cfg));
}
function loadCharacters() {
  try {
    return JSON.parse(localStorage.getItem('tsi-mw-characters') || '[]');
  } catch {
    return [];
  }
}

// === Push Helper ===
function push(ctx, textOrMsg, opts = {}) {
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
    console.warn('[TSI-MW] push(): empty message text', { textOrMsg, opts });
    return;
  }

  try {
    ctx.chat?.push?.(m);
    eventSource?.emit?.(event_types?.MESSAGE_RECEIVED || 'message_received', m);
  } catch (e) {
    console.warn('[TSI-MW] push failed', e);
    ctx.addToast?.(m.mes) || alert(m.mes);
  }

  try {
    if (globalThis.showMoreMessages) {
      globalThis.showMoreMessages(Number.MAX_SAFE_INTEGER);
    } else {
      const SCP = globalThis.SillyTavern?.getContext?.()?.SlashCommandParser;
      SCP?.parse?.('/chat-render');
    }
  } catch (err) {
    console.warn('[TSI-MW] render fallback failed', err);
  }
}

// === Modal Builder ===
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
        <input id="tsimw-threshold" type="number" min="0" max="100" />
      </div>
      <div>
        <label for="tsimw-roll">Roll (d%)</label>
        <input id="tsimw-roll" type="number" min="1" max="100" />
      </div>
    </div>

    <div>
      <label for="tsimw-reason">Reason / Context</label>
      <textarea id="tsimw-reason"></textarea>
    </div>

    <div class="row">
      <div>
        <label for="tsimw-url">Middleware URL</label>
        <input id="tsimw-url" type="text" placeholder="http://127.0.0.1:5050/check" />
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

  // wiring
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
      opt.textContent = c.name || `Char ${i+1}`;
      charSel.appendChild(opt);
    });
  }
  function fillSkills() {
    skillSel.innerHTML = '';
    const c = chars[Number(charSel.value)||0] || { skills:{} };
    const entries = Object.entries(c.skills||{});
    if (!entries.length) {
      skillSel.innerHTML = '<option>(No skills)</option>';
      threshold.value = '';
      return;
    }
    for (const [name,pct] of entries) {
      const opt = document.createElement('option');
      opt.value = name;
      opt.textContent = name;
      opt.dataset.pct = pct;
      skillSel.appendChild(opt);
    }
    threshold.value = skillSel.options[0].dataset.pct;
  }

  fillChars(); fillSkills();
  charSel.addEventListener('change', fillSkills);
  skillSel.addEventListener('change', () => {
    threshold.value = skillSel.options[skillSel.selectedIndex]?.dataset?.pct || '';
  });

  modal.querySelector('#tsimw-cancel').onclick = () => backdrop.style.display = 'none';
  modal.querySelector('#tsimw-saveurl').onclick = () => {
    const cfg2 = loadConfig(); cfg2.httpUrl = urlInput.value.trim(); saveConfig(cfg2);
    ctx.addToast?.('TSI-MW: URL saved');
  };
  modal.querySelector('#tsimw-submit').onclick = async () => {
    const c = chars[Number(charSel.value)||0];
    if (!c) return;
    await sendCheck(ctx, {
      type:'check',
      character:c.name,
      skill:skillSel.value,
      threshold:Number(threshold.value||0),
      roll:Number(roll.value||0),
      reason:(reason.value||'').trim()
    });
    backdrop.style.display = 'none';
  };

  modal.__open = () => { backdrop.style.display='flex'; };
  backdrop.addEventListener('click', e => { if(e.target===backdrop) backdrop.style.display='none'; });

  return modal;
}

// === POST to Middleware ===
async function sendCheck(ctx, check) {
  const cfg = loadConfig();
  const url = (cfg.httpUrl||'').trim();
  if (!url) { ctx.addToast?.('TSI-MW: No middleware URL configured.'); return; }

  push(ctx, `[CHECK who=${check.character} skill=${check.skill} reason="${check.reason}"]\nRolled ${check.roll} vs ${check.threshold}% — sending…`,
    { extra:{module:'tsi-middleware', kind:'check_request'} });

  try {
    const res = await fetch(url,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify(check)
    });
    const data = await res.json();
    console.log('[TSI-MW] handled result:', data);

    const s = data.success ? 'SUCCESS' : 'FAILURE';
    push(ctx, `[CHECK_RESULT who=${check.character} skill=${check.skill} roll=${check.roll} vs=${check.threshold} result=${s}${data.quality?` quality=${data.quality}`:''}]`,
      { extra:{module:'tsi-middleware', kind:'check_result_raw'} });

    push(ctx, `Outcome for ${check.character}: **${s}** on **${check.skill}** (rolled ${check.roll} vs ${check.threshold}%). ${data.details||''}`,
      { extra:{module:'tsi-middleware', kind:'check_result_human'} });

  } catch (err) {
    console.error('[TSI-MW] sendCheck failed', err);
    push(ctx, `❌ Middleware error: ${err}`, { extra:{module:'tsi-middleware', kind:'check_error'} });
  }
}

// === Install UI onReady ===
onReady((ctx) => {
  console.log('[TSI-MW] app ready, installing UI');

  const fab = document.createElement('button');
  fab.textContent = 'Skill Check';
  fab.id = 'tsimw-fab';
  Object.assign(fab.style,{
    position:'fixed', bottom:'16px', right:'16px', zIndex:9999,
    padding:'8px 14px', background:'#007bff', color:'#fff',
    border:'none', borderRadius:'20px', fontWeight:'bold', cursor:'pointer'
  });
  fab.onclick = () => {
    const hasChatUI = document.querySelector('#send_but') || document.querySelector('#form_say');
    if (!hasChatUI) { ctx.addToast?.('TSI-MW: Open a chat first.'); return; }
    injectStyles(); buildModal(ctx).__open();
  };
  document.body.appendChild(fab);

  // repaint when chat is loaded
  const es = ctx.eventSource;
  const et = ctx.event_types || ctx.eventTypes;
  es.on(et.chatLoaded || 'chatLoaded', () => {
    console.log('[TSI-MW] chatLoaded → force render');
    try {
      if (globalThis.showMoreMessages) {
        globalThis.showMoreMessages(Number.MAX_SAFE_INTEGER);
      } else {
        const SCP = globalThis.SillyTavern?.getContext?.()?.SlashCommandParser;
        SCP?.parse?.('/chat-render');
      }
    } catch (e) {
      console.warn('[TSI-MW] chatLoaded render failed', e);
    }
  });
});
