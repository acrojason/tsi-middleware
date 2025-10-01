// --- tsi-middleware/index.js ---
const MW = "http://127.0.0.1:8765"; // Flask base
const RX = {
  CHECK: /\[CHECK\s+who=(\S+)\s+skill=(\S+)\s+reason="([^"]+)"(?:\s+context="([^"]*)")?\s*\]/i,
  RESULT: /\[RESULT\s+who=(\S+)\s+skill=(\S+)\s+roll=(\d+)\s+target=(\d+)\s+success=(true|false)(?:\s+margin=(\d+))?(?:\s+degree=(\S+))?/i,
};

function h(tag, props={}, children=[]) {
  const el = document.createElement(tag);
  Object.assign(el, props);
  if (props.className) el.setAttribute('class', props.className);
  (Array.isArray(children) ? children : [children]).filter(Boolean).forEach(ch => {
    if (typeof ch === 'string') el.appendChild(document.createTextNode(ch));
    else el.appendChild(ch);
  });
  return el;
}

async function fetchJSON(url, opts) {
  const r = await fetch(url, opts);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

function openModal(node) {
  const wrap = h('div', { className: 'tsi-modal-wrap' });
  const box = h('div', { className: 'tsi-modal' }, node);
  wrap.appendChild(box);
  document.body.appendChild(wrap);
  wrap.addEventListener('click', e => {
    if (e.target === wrap) wrap.remove();
  });
  return { close: () => wrap.remove() };
}

function ensureStyles() {
  if (document.getElementById('tsi-mw-css')) return;
  const css = `
  .tsi-fab { position: fixed; right: 18px; bottom: 18px; z-index: 9999;
    padding: 10px 14px; border-radius: 999px; background:#2b7; color:#fff; font-weight:600; cursor:pointer; box-shadow:0 2px 10px rgba(0,0,0,.25); }
  .tsi-fab:hover{ filter:brightness(1.1) }
  .tsi-modal-wrap { position: fixed; inset: 0; background: rgba(0,0,0,.35); z-index: 9999; display:flex; align-items:center; justify-content:center; }
  .tsi-modal { width: 520px; max-width: 95vw; background:#111; color:#eee; border-radius: 12px; padding: 16px; box-shadow: 0 8px 40px rgba(0,0,0,.5); }
  .tsi-row{ display:flex; gap:10px; margin:8px 0 }
  .tsi-row > *{ flex:1 }
  .tsi-help{ opacity:.8; font-size:.9em; margin-top:4px }
  .tsi-actions{ display:flex; justify-content:flex-end; gap:8px; margin-top:12px }
  .tsi-b{ padding:8px 12px; border-radius:8px; border:none; cursor:pointer; }
  .tsi-bp{ background:#2b7; color:#fff }
  .tsi-bs{ background:#444; color:#fff }
  .tsi-bd{ background:#b22; color:#fff }
  input, select, textarea { background:#181818; color:#eee; border:1px solid #333; border-radius:8px; padding:8px }
  label{ font-size:.9em; opacity:.85 }
  `;
  const style = h('style', { id: 'tsi-mw-css' }, css);
  document.head.appendChild(style);
}

async function openCheckWizard(api) {
  ensureStyles();
  const modalBody = h('div');

  // 1) Fetch characters+skills
  let chars = [];
  try {
    chars = await fetchJSON(`${MW}/world/characters`);
  } catch (e) {
    return openModal(h('div', {}, [
      h('h3', {}, 'TSI Check'),
      h('div', {}, 'Could not reach rules service at 127.0.0.1:8765. Is ts_mw.py running?'),
    ]));
  }

  const selChar = h('select');
  const selSkill = h('select');
  const inReason = h('input', { placeholder: 'Reason (what are you trying to do?)' });
  const selLight = h('select'); ['none','dim','dark'].forEach(v => selLight.appendChild(h('option',{value:v}, v)));
  const selDist = h('select'); ['near','medium','far'].forEach(v => selDist.appendChild(h('option',{value:v}, v)));
  const selCover = h('select'); ['none','partial','full'].forEach(v => selCover.appendChild(h('option',{value:v}, v)));

  const opt = (v,t)=> h('option', { value:v }, t||v);
  selChar.appendChild(opt('', '-- choose character --'));
  chars.forEach(c => selChar.appendChild(opt(c.id, c.name)));
  selSkill.appendChild(opt('', '-- choose skill --'));

  selChar.addEventListener('change', () => {
    selSkill.innerHTML = '';
    selSkill.appendChild(opt('', '-- choose skill --'));
    const found = chars.find(x => x.id === selChar.value);
    (found?.skills||[]).forEach(sk => selSkill.appendChild(opt(sk)));
  });

  const row1 = h('div', {className:'tsi-row'}, [
    h('div', {}, [h('label',{},'Character'), selChar]),
    h('div', {}, [h('label',{},'Skill'), selSkill]),
  ]);
  const row2 = h('div', {className:'tsi-row'}, [
    h('div', {}, [h('label',{},'Reason'), inReason]),
  ]);
  const row3 = h('div', {className:'tsi-row'}, [
    h('div', {}, [h('label',{},'Light'), selLight]),
    h('div', {}, [h('label',{},'Distance'), selDist]),
    h('div', {}, [h('label',{},'Cover'), selCover]),
  ]);
  const tgtBox = h('div', {className:'tsi-help'}, 'Target: — (select fields)');
  const actions = h('div', {className:'tsi-actions'}, [
    h('button', {className:'tsi-bs', onclick: ()=>dlg.close()}, 'Cancel'),
    h('button', {className:'tsi-b tsi-bp', onclick: onSendCheck}, 'Create Check'),
  ]);

  modalBody.appendChild(h('h3',{},'TSI Check'));
  modalBody.appendChild(row1);
  modalBody.appendChild(row2);
  modalBody.appendChild(row3);
  modalBody.appendChild(tgtBox);
  modalBody.appendChild(actions);

  const dlg = openModal(modalBody);

  async function refreshTarget() {
    const who = selChar.value, skill = selSkill.value;
    if (!who || !skill) { tgtBox.textContent = 'Target: —'; return; }
    const ctx = buildCtx();
    try {
      const r = await fetchJSON(`${MW}/world/skill-target`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ who, skill, context: ctx })
      });
      tgtBox.textContent = `Target: ${r.target} (base ${r.base} ${r.mods ? (r.mods > 0 ? '+' : '')+r.mods : ''})`;
      tgtBox.dataset.target = r.target;
    } catch (e) {
      tgtBox.textContent = 'Target: (error)';
    }
  }
  function buildCtx(){
    const parts = [];
    const l = selLight.value; if (l !== 'none') parts.push(`light:${l}`);
    const d = selDist.value; if (d !== 'near') parts.push(`distance:${d}`);
    const c = selCover.value; if (c !== 'none') parts.push(`cover:${c}`);
    return parts.join(';');
  }
  [selChar, selSkill, selLight, selDist, selCover].forEach(el => el.addEventListener('change', refreshTarget));

  async function onSendCheck(){
    const who = selChar.value, skill = selSkill.value, reason = inReason.value.trim();
    const ctx = buildCtx();
    if (!who || !skill || !reason) {
      tgtBox.textContent = 'Please choose character, skill, and enter a reason.';
      return;
    }
    // Show a minimal assistant prompt that asks you to roll (and keeps story log tidy).
    const t = tgtBox.dataset.target ? parseInt(tgtBox.dataset.target,10) : undefined;
    await api.addAssistantMessage(`[NEED_ROLL who=${who} skill=${skill} target=${t ?? 'unknown'} reason="${reason}" context="${ctx}"]`);
    dlg.close();

    // Immediately open the roll-entry dialog:
    openRollEntry(api, {who, skill, reason, context: ctx, target: t});
  }
}

function openRollEntry(api, {who, skill, reason, context, target}) {
  ensureStyles();
  const rollInput = h('input', {type:'number', placeholder:'d100 roll (1-100)', min:1, max:100});
  const confirmBtn = h('button', {className:'tsi-b tsi-bp'}, 'Submit Result');
  const cancelBtn = h('button', {className:'tsi-b tsi-bs'}, 'Cancel');
  const help = h('div', {className:'tsi-help'},
    `Enter your physical/virtual d100 roll. Target = ${target ?? 'unknown'}.`);
  const body = h('div', {}, [
    h('h3', {}, 'Enter Roll Result'),
    rollInput,
    help,
    h('div', {className:'tsi-actions'}, [cancelBtn, confirmBtn]),
  ]);
  const dlg = openModal(body);
  cancelBtn.onclick = ()=> dlg.close();
  confirmBtn.onclick = async ()=>{
    const roll = parseInt(rollInput.value,10);
    if (!roll || roll < 1 || roll > 100 || !target) { help.textContent = 'Enter a roll (1-100). Ensure target was fetched.'; return; }
    const success = roll <= target;
    const margin = Math.abs(target - roll);
    const degree = success
      ? (roll <= 5 || margin >= 30) ? 'Critical'
        : (margin >= 20) ? 'Excellent'
        : (margin >= 6) ? 'Standard'
        : 'Marginal'
      : (roll >= 95 || margin >= 30) ? 'Complication'
        : (margin >= 20) ? 'Fail'
        : 'NearMiss';

    // Inject the engine-style single-line result so the next model turn will narrate:
    await api.addAssistantMessage(
      `[RESULT who=${who} skill=${skill} roll=${roll} target=${target} success=${String(success)} margin=${margin} degree=${degree} notes="${context||''}"]`
    );
    dlg.close();
  };
}

function addFAB(api){
  ensureStyles();
  if (document.getElementById('tsi-fab')) return;
  const btn = h('button', { id:'tsi-fab', className:'tsi-fab', onclick: ()=>openCheckWizard(api) }, 'Check');
  document.body.appendChild(btn);
}

export async function init(api) {
  console.log('[TSI-MW] init (UI/manual dice)');
  addFAB(api);

  // Intercept *user-typed* [CHECK ...] (if you still use typed control lines)
  api.registerHook('message:send', async (payload, next) => {
    if (payload?.type !== 'user' || !payload?.text) return next(payload);
    const m = payload.text.match(RX.CHECK);
    if (!m) return next(payload);

    const who = m[1], skill = m[2], reason = m[3];
    const context = (m[4] || '');
    // Ask you to roll (assistant line) and open the modal to enter it:
    // Pull target from service for the same context
    let target;
    try {
      const r = await fetchJSON(`${MW}/world/skill-target`, {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ who, skill, context })
      });
      target = r.target;
    } catch(e){ /* ignore; modal will warn */ }

    await api.addAssistantMessage(`[NEED_ROLL who=${who} skill=${skill} target=${target ?? 'unknown'} reason="${reason}" context="${context}"]`);
    openRollEntry(api, { who, skill, reason, context, target });

    return; // do NOT forward [CHECK ...] to the model
  });

  return { success: true, message: 'TSI Middleware (manual dice) loaded' };
}
