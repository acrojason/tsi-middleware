// scripts/extensions/third-party/tsi-middleware/index.js
(() => {
  const MOD = 'TSI-MW';

  // ---- Config (edit in UI later if you want) ----
  const DEFAULT_WS = 'ws://127.0.0.1:5050';
  const DEFAULT_HTTP = 'http://127.0.0.1:5050/check';
  function getCfg() {
    const raw = localStorage.getItem('tsimw.config');
    try { return raw ? JSON.parse(raw) : { mode:'ws', wsUrl:DEFAULT_WS, httpUrl:DEFAULT_HTTP }; }
    catch { return { mode:'ws', wsUrl:DEFAULT_WS, httpUrl:DEFAULT_HTTP }; }
  }
  function setCfg(cfg){ localStorage.setItem('tsimw.config', JSON.stringify(cfg)); }

  // ---- App readiness ----
  function onReady(run) {
    const st = window.SillyTavern;
    if (!st?.getContext) return setTimeout(()=>onReady(run), 150);
    const { eventSource, event_types } = st.getContext();
    eventSource.on(event_types.APP_READY, () => run(st.getContext()));
  }

  // ---- Character & skill helpers ----
  function getCharacters(ctx) {
    // Prefer real ST characters if present; else read our local list
    if (Array.isArray(ctx.characters) && ctx.characters.length) return ctx.characters;
    const raw = localStorage.getItem('tsimw.characters');
    try { return raw ? JSON.parse(raw) : []; } catch { return []; }
  }
  // Look for skill % on character. Adapt this to your schema.
  function getSkillThreshold(character, skillName) {
    // Try a few common shapes:
    // 1) character.skills[skillName] = { value: 47 } or = 47
    const s1 = character?.skills?.[skillName];
    if (typeof s1 === 'number') return s1;
    if (typeof s1?.value === 'number') return s1.value;

    // 2) character.extra?.tsi?.skills[skillName] = 47
    const s2 = character?.extra?.tsi?.skills?.[skillName];
    if (typeof s2 === 'number') return s2;

    // Fallback: empty
    return '';
  }
  function listSkillNames(characters) {
    // naive union of present skill keys to seed the dropdown
    const set = new Set();
    for (const c of characters) {
      const s = c?.skills ?? c?.extra?.tsi?.skills ?? {};
      Object.keys(s).forEach(k => set.add(k));
    }
    // provide some common TS/SI skills if none are stored yet:
    if (!set.size) ['Surveillance','Stealth','Disguise','Electronics','Forgery','Persuasion','Firearms','Driving'].forEach(k=>set.add(k));
    return Array.from(set).sort();
  }

  // ---- UI ----
  function addHeaderButton(ctx) {
  const candidates = [
    '#extensionsApiButtons',
    '#btnContainer',
    '#extensionsMenu',
    '#rightNav',
    '#menu_bar',
    'header',               // fallback
  ];
  let bar = candidates.map(sel => document.querySelector(sel)).find(Boolean) || document.body;

  const btn = document.createElement('button');
  btn.id = 'tsimw-btn';
  btn.type = 'button';
  btn.textContent = 'Check';
  btn.title = 'Top Secret/SI Skill Check';
  btn.onclick = () => openModal(ctx);
  btn.style.marginLeft = '6px';
  btn.className = 'menu_button'; // helps styling in some themes
  bar.appendChild(btn);
}


  function buildModalDom() {
    if (document.getElementById('tsimw-modal-backdrop')) return;

    const backdrop = document.createElement('div');
    backdrop.id = 'tsimw-modal-backdrop';
    const modal = document.createElement('div');
    modal.id = 'tsimw-modal';

    modal.innerHTML = `
      <h3>Top Secret/SI — Skill Check</h3>
      <div class="row">
        <div>
          <label>Character</label>
          <select id="tsimw-char"></select>
        </div>
        <div>
          <label>Skill</label>
          <select id="tsimw-skill"></select>
        </div>
      </div>
      <div class="row">
        <div>
          <label>Threshold %</label>
          <input id="tsimw-threshold" type="number" min="0" max="100" placeholder="auto" />
        </div>
        <div>
          <label>Roll (d%)</label>
          <input id="tsimw-roll" type="number" min="1" max="100" placeholder="e.g., 37" />
        </div>
      </div>
      <div>
        <label>Reason / Context (optional)</label>
        <textarea id="tsimw-reason" rows="3" placeholder="Why the check?"></textarea>
      </div>
      <div class="row">
        <div>
          <label>Middleware</label>
          <select id="tsimw-mode">
            <option value="ws">WebSocket</option>
            <option value="http">HTTP</option>
          </select>
        </div>
        <div>
          <input id="tsimw-url" placeholder="ws://127.0.0.1:5050 or http://127.0.0.1:5050/check" />
        </div>
      </div>
      <div class="actions">
        <button id="tsimw-cancel">Cancel</button>
        <button id="tsimw-submit">Submit</button>
      </div>
    `;

    backdrop.appendChild(modal);
    document.body.appendChild(backdrop);

    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    document.getElementById('tsimw-cancel').onclick = closeModal;
  }

  function openModal(ctx) {
    buildModalDom();
    const cfg = getCfg();
    const chars = getCharacters(ctx);
    const skills = listSkillNames(chars);

    const elBackdrop = document.getElementById('tsimw-modal-backdrop');
    const elChar = document.getElementById('tsimw-char');
    const elSkill = document.getElementById('tsimw-skill');
    const elThreshold = document.getElementById('tsimw-threshold');
    const elRoll = document.getElementById('tsimw-roll');
    const elReason = document.getElementById('tsimw-reason');
    const elMode = document.getElementById('tsimw-mode');
    const elUrl = document.getElementById('tsimw-url');

    // Populate character dropdown
    elChar.innerHTML = '';
    chars.forEach((c, i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = c?.name || c?.metadata?.name || `Character ${i+1}`;
      elChar.appendChild(opt);
    });
    if (!chars.length) {
      const opt = document.createElement('option');
      opt.value = -1;
      opt.textContent = 'PC';
      elChar.appendChild(opt);
    }

    // Populate skills
    elSkill.innerHTML = '';
    skills.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s;
      opt.textContent = s;
      elSkill.appendChild(opt);
    });

    // Auto threshold on skill change
    elSkill.onchange = () => {
      const idx = parseInt(elChar.value, 10);
      const skill = elSkill.value;
      if (idx >= 0) {
        elThreshold.value = getSkillThreshold(getCharacters(ctx)[idx], skill) ?? '';
      }
    };
    elChar.onchange = elSkill.onchange;
    setTimeout(elSkill.onchange, 0);

    // Load middleware mode/url
    elMode.value = cfg.mode || 'ws';
    elUrl.value = (cfg.mode === 'http' ? (cfg.httpUrl||DEFAULT_HTTP) : (cfg.wsUrl||DEFAULT_WS));
    elMode.onchange = () => {
      const c = getCfg();
      c.mode = elMode.value;
      setCfg(c);
      elUrl.value = c.mode === 'http' ? (c.httpUrl||DEFAULT_HTTP) : (c.wsUrl||DEFAULT_WS);
    };

    // Submit handler
    document.getElementById('tsimw-submit').onclick = async () => {
      const idx = parseInt(elChar.value, 10);
      const character = (idx >= 0) ? getCharacters(ctx)[idx] : { name: 'PC' };
      const payload = {
        type: 'check',
        character: character?.name || character?.metadata?.name || 'PC',
        skill: elSkill.value,
        threshold: Number(elThreshold.value || getSkillThreshold(character, elSkill.value) || 0),
        roll: Number(elRoll.value || 0),
        reason: elReason.value?.trim() || ''
      };
      // Save cfg
      const newCfg = getCfg();
      if (elMode.value === 'http') newCfg.httpUrl = elUrl.value;
      else newCfg.wsUrl = elUrl.value;
      newCfg.mode = elMode.value;
      setCfg(newCfg);

      closeModal();
      await sendCheck(ctx, payload);
    };

    elBackdrop.style.display = 'flex';
  }

  function closeModal() {
    const el = document.getElementById('tsimw-modal-backdrop');
    if (el) el.style.display = 'none';
  }

  // ---- Transport (WS with auto-reconnect, or HTTP POST) ----
  let ws, wsUrl, wsReady = false, wsQueue = [];
  function ensureWS(url, onMessage, onStatus) {
    if (ws && wsUrl === url && wsReady) return ws;
    wsUrl = url;
    try { ws?.close?.(); } catch{}
    wsReady = false;
    ws = new WebSocket(url);
    onStatus?.('connecting');
    ws.onopen = () => { wsReady = true; onStatus?.('connected'); while (wsQueue.length) ws.send(wsQueue.shift()); };
    ws.onclose = () => { wsReady = false; onStatus?.('closed'); setTimeout(()=>ensureWS(url, onMessage, onStatus), 1000); };
    ws.onerror = () => { onStatus?.('error'); };
    ws.onmessage = (e) => onMessage?.(e.data);
    return ws;
  }

  async function sendCheck(ctx, check) {
    const cfg = getCfg();
    const stamp = new Date().toISOString();

    // Tell the LLM what we asked for (structured + human)
    ctx.pushToChat?.({
      is_user: false,
      name: 'System',
      mes: `[CHECK who=${check.character} skill=${check.skill} reason="${check.reason.replace(/"/g,'\'')}"]\nRolled **${check.roll}** vs threshold **${check.threshold}%** — sending to rules engine…`,
      extra: { module: 'tsi-middleware', kind: 'check_request', stamp }
    });

    if (cfg.mode === 'http') {
      try {
        const res = await fetch(cfg.httpUrl || DEFAULT_HTTP, {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          body: JSON.stringify(check)
        });
        const data = await res.json();
        handleEngineResult(ctx, check, data);
      } catch (e) {
        handleEngineResult(ctx, check, { ok:false, error: String(e) });
      }
    } else {
      // WebSocket
      ensureWS(cfg.wsUrl || DEFAULT_WS, (msg) => {
        try {
          const data = JSON.parse(msg);
          if (data?.type === 'check_result' && data?.echo?.stamp === stamp) {
            handleEngineResult(ctx, check, data);
          } else if (data?.type === 'check_result' && !data?.echo) {
            // no correlation; still show
            handleEngineResult(ctx, check, data);
          }
        } catch {}
      }, (state) => {
        if (state === 'connected') {
          const payload = JSON.stringify({ type:'check', ...check, echo:{ stamp } });
          wsReady ? ws.send(payload) : wsQueue.push(payload);
        }
        if (state === 'error' || state === 'closed') {
          handleEngineResult(ctx, check, { ok:false, error:`Middleware ${state}` });
        }
      });
    }
  }

  function handleEngineResult(ctx, check, res) {
    if (!res || res.ok === false) {
      ctx.pushToChat?.({
        is_user:false, name:'TSI-MW',
        mes:`❌ Check failed to evaluate (${res?.error || 'unknown error'}). Please adjudicate manually.`,
        extra:{ module:'tsi-middleware', kind:'check_error' }
      });
      return;
    }
    // Expected engine shape:
    // { type:'check_result', ok:true, success:boolean, margin:number, details?:string, quality?:'crit'|'normal'|'fumble' }
    const s = res.success ? 'SUCCESS' : 'FAILURE';
    const margin = (typeof res.margin === 'number') ? ` (margin ${res.margin})` : '';
    const tag = `[CHECK_RESULT who=${check.character} skill=${check.skill} roll=${check.roll} vs=${check.threshold} result=${s}${res.quality?` quality=${res.quality}`:''}]`;

    // 1) Machine-readable line for the LLM to condition on
    ctx.pushToChat?.({
      is_user:false, name:'System',
      mes: tag,
      extra:{ module:'tsi-middleware', kind:'check_result_raw' }
    });

    // 2) Human summary for the table
    const line = `${check.character} attempts **${check.skill}** → rolled **${check.roll}** vs **${check.threshold}%** → **${s}**${margin}. ${res.details||''}`.trim();
    ctx.pushToChat?.({
      is_user:false, name:'TSI-MW',
      mes: line,
      extra:{ module:'tsi-middleware', kind:'check_result_human' }
    });
  }

  // ---- Bootstrap ----
  onReady((ctx) => {
    console.log('[TSI-MW] app ready, installing UI');
    addHeaderButton(ctx);  // will try to attach to common header containers
  
    // Slash command to open the modal
    const { eventSource, event_types } = ctx;
    eventSource.on(event_types.INPUT_FIELD_SUBMIT_BEFORE, (p) => {
      const t = (p?.text ?? '').trim();
      if (!/^\/check\b/i.test(t)) return;
      p.cancel = true;
      openModal(ctx);
    });
  
    // Make the badge clickable, as a fallback launcher
    // Make the badge clickable, as a fallback launcher
    const pill = document.createElement('div');
    pill.textContent = 'TSI-MW';
    Object.assign(pill.style, {
      position:'fixed', right:'10px', bottom:'10px', padding:'4px 8px',
      borderRadius:'10px', background:'var(--SmartThemeAccent)', color:'var(--SmartThemeBodyColor)',
      fontSize:'11px', zIndex:9999, opacity:.9, cursor:'pointer'
    });
    pill.title = 'Open Top Secret/SI check modal';
    pill.onclick = () => openModal(ctx);
    document.body.appendChild(pill);

  
    // Expose a global helper so you can open it from console
    window.TSIMW = {
      open: () => openModal(ctx),
      setCharacters: (arr) => localStorage.setItem('tsimw.characters', JSON.stringify(arr)),
    };
  });

})();
