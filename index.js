/**
 * TS Middleware Extension for SillyTavern
 * - Handles hidden world bible (world.json)
 * - Intercepts control lines and returns concise refs/results
 * - Keeps GM data out of model context
 */
const fs = require('fs');
const path = require('path');

let ST; // SillyTavern API
let cfg = { worldFile: 'world.json', logLevel: 'info', enableNlpMapper: false };
let world = null;
const log = (...args) => { if (cfg.logLevel !== 'silent') console.log('[TS-MW]', ...args); };

// ---------- helpers ----------
const WPATH = () => path.isAbsolute(cfg.worldFile) ? cfg.worldFile : path.join(process.cwd(), cfg.worldFile);

function loadWorld() {
  const p = WPATH();
  if (!fs.existsSync(p)) throw new Error(`world.json not found at ${p}`);
  world = JSON.parse(fs.readFileSync(p, 'utf8'));
  return world;
}
function saveWorld() {
  if (!world) return;
  fs.writeFileSync(WPATH(), JSON.stringify(world, null, 2), 'utf8');
}

function get(obj, dottedPath) {
  return dottedPath.split('.').reduce((o, k) => (o && o[k] !== undefined ? o[k] : undefined), obj);
}
function set(obj, dottedPath, value) {
  const ks = dottedPath.split('.');
  let cur = obj;
  for (let i = 0; i < ks.length - 1; i++) {
    const k = ks[i];
    if (!cur[k] || typeof cur[k] !== 'object') cur[k] = {};
    cur = cur[k];
  }
  cur[ks[ks.length - 1]] = value;
}

function parseKVList(s) {
  // "light:dim;distance:far" -> {light:'dim', distance:'far'}
  const out = {};
  if (!s) return out;
  s.split(';').map(x => x.trim()).filter(Boolean).forEach(pair => {
    const [k, v] = pair.split(':').map(z => z.trim());
    if (k) out[k] = v ?? true;
  });
  return out;
}

function degreeOfSuccess(success, margin, roll) {
  if (!success) {
    if (margin >= 30 || roll >= 95) return 'Complication';
    if (margin >= 20) return 'Fail';
    return 'NearMiss';
  }
  if (margin >= 30 || roll <= 5) return 'Critical';
  if (margin >= 20) return 'Excellent';
  if (margin >= 6) return 'Standard';
  return 'Marginal';
}

function d100() { return Math.floor(Math.random() * 100) + 1; }

// ---------- handlers ----------
const RX = {
  CHECK: /\[CHECK\s+who=(\S+)\s+skill=(\S+)\s+reason="([^"]+)"(?:\s+context="([^"]*)")?\s*\]/i,
  REQ_NPC: /\[REQUEST_NPC\s+city=(\S+)\s+role="([^"]+)"(?:\s+tone="([^"]*)")?\s*\]/i,
  REQ_NPC_SECRET: /\[REQUEST_NPC_SECRET\s+id=([a-zA-Z0-9._-]+)\s+key="([^"]+)"\s*\]/i,
  REQ_SCENE: /\[REQUEST_SCENE\s+city=(\S+)\s+type=(hooks|setpieces)\s*\]/i,
  REQ_ARC: /\[REQUEST_ARC_BEAT\s+id=([A-Za-z0-9_-]+)\s+city=(\S+)\s*\]/i,
  TICK: /\[TICK_CLOCK\s+city=(\S+)\s+key=([a-zA-Z0-9._-]+)\s+([+-]\d+)\s+reason="([^"]+)"\s*\]/i,
  SET: /\[SET\s+path=([a-zA-Z0-9._-]+(?:\.[a-zA-Z0-9._-]+)+)\s+value=(.+?)\s+reason="([^"]+)"\s*\]/i
};

function handleCHECK(m) {
  console.log('[TS-MW] outgoing text =', payload.text);

  const [, who, skill, reason, ctxRaw] = m;
  loadWorld();
  const stats = get(world, `extensions.stats.${who}`);
  if (!stats) return `[ERROR msg="unknown character id: ${who}"]`;
  const base = get(world, `extensions.stats.${who}.skills.${skill}`);
  if (typeof base !== 'number') return `[ERROR msg="unknown skill for ${who}: ${skill}"]`;

  const ctx = parseKVList(ctxRaw);
  // simple example modifiers (expand to your TS/SI table)
  let mods = 0;
  if (ctx.light === 'dim') mods -= 10;
  if (ctx.light === 'dark') mods -= 20;
  if (ctx.distance === 'far') mods -= 10;
  if (ctx.cover === 'partial') mods -= 10;

  const target = base + mods;
  const roll = d100();
  const success = roll <= target;
  const margin = success ? (target - roll) : (roll - target);
  const degree = degreeOfSuccess(success, margin, roll);

  // optional: bump city alert on loud failures
  if (!success && margin >= 20 && ctx.city) {
    const alert = get(world, `cities.${ctx.city}.gm.clocks.alert`) ?? 0;
    set(world, `cities.${ctx.city}.gm.clocks.alert`, alert + 1);
    saveWorld();
  }
  const notes = (ctxRaw || '').replace(/"/g, "'");

  return `[RESULT who=${who} skill=${skill} roll=${roll} target=${target} success=${success} margin=${margin} degree=${degree} notes="${notes}"]`;
}

function fuzzyFindNpc(cityKey, role) {
  const city = get(world, `cities.${cityKey}`);
  if (!city) return null;
  const npcs = city.npcs || {};
  // exact role match first
  for (const id in npcs) {
    if ((npcs[id].role || '').toLowerCase() === role.toLowerCase()) {
      return { id, ...npcs[id] };
    }
  }
  // substring match
  const rlow = role.toLowerCase();
  for (const id in npcs) {
    const s = `${npcs[id].role} ${npcs[id].surface}`.toLowerCase();
    if (s.includes(rlow)) return { id, ...npcs[id] };
  }
  return null;
}

function handleREQ_NPC(m) {
  const [, city, role, tone] = m;
  loadWorld();
  const npc = fuzzyFindNpc(city, role);
  if (!npc) return `[NPC_NONE city=${city} role="${role}"]`;
  const surface = (npc.surface || '').replace(/"/g, "'");
  const leverage = (npc.leverage || '').replace(/"/g, "'");
  const tags = (npc.tags || '');
  return `[NPC_REF id=${npc.id} name="${npc.name}" surface="${surface}" leverage="${leverage}" tags="${tags}" tone="${tone || ''}"]`;
}

function handleREQ_NPC_SECRET(m) {
  const [, id, key] = m;
  loadWorld();
  // id looks like rio.fix_viviane; find which city has this key
  const [cityKey] = id.split('.', 1);
  // brute search:
  for (const city in world.cities) {
    const npcs = world.cities[city].npcs || {};
    if (id in npcs) {
      // gate on alert/whatever if you want
      const val = npcs[id][key];
      if (!val) return `[NPC_SECRET_NONE id=${id} key="${key}"]`;
      const clean = (Array.isArray(val) ? val.join('; ') : String(val)).replace(/"/g, "'");
      return `[NPC_SECRET id=${id} key="${key}" value="${clean}"]`;
    }
  }
  return `[ERROR msg="npc not found: ${id}"]`;
}

function handleREQ_SCENE(m) {
  const [, city, type] = m;
  loadWorld();
  const arr = get(world, `cities.${city}.gm.${type}`) || [];
  if (!arr.length) return `[SCENE_NONE city=${city} type=${type}]`;
  const pick = arr[Math.floor(Math.random() * arr.length)];
  const clean = (Array.isArray(pick) ? pick.join('; ') : String(pick)).replace(/"/g, "'");
  return `[SCENE_REF city=${city} type=${type} text="${clean}"]`;
}

function handleREQ_ARC(m) {
  const [, arcId, city] = m;
  loadWorld();
  const threads = get(world, 'meta.threads') || [];
  const t = threads.find(x => x.id.toString() === arcId.toString());
  if (!t) return `[ARC_NONE id=${arcId}]`;
  // find the first beat that mentions the city
  const beat = (t.beats || []).find(b => (b || '').toLowerCase().includes(city.toLowerCase()));
  if (!beat) return `[ARC_HOLD id=${arcId} city=${city}]`;
  const clean = beat.replace(/"/g, "'");
  return `[ARC_BEAT id=${arcId} city=${city} text="${clean}"]`;
}

function handleTICK(m) {
  const [, city, key, deltaStr, reason] = m;
  loadWorld();
  const delta = parseInt(deltaStr, 10);
  const cur = get(world, `cities.${city}.gm.clocks.${key}`) ?? 0;
  const next = Math.max(0, cur + delta);
  set(world, `cities.${city}.gm.clocks.${key}`, next);
  saveWorld();
  return `[OK_CLOCK city=${city} key=${key} value=${next} reason="${reason.replace(/"/g, "'")}"]`;
}

function handleSET(m) {
  const [, pathStr, rawValue, reason] = m;
  // gate writes to allowed namespace
  if (!pathStr.startsWith('extensions.')) return `[ERROR msg="write denied: ${pathStr}"]`;
  loadWorld();
  // try to parse value as number/boolean/string
  let value = rawValue;
  if (/^\d+$/.test(rawValue)) value = parseInt(rawValue, 10);
  else if (/^\d+\.\d+$/.test(rawValue)) value = parseFloat(rawValue);
  else if (rawValue === 'true' || rawValue === 'false') value = (rawValue === 'true');
  else value = rawValue.replace(/^"(.*)"$/, '$1'); // strip quotes if present

  set(world, pathStr, value);
  saveWorld();
  return `[OK path=${pathStr} value=${JSON.stringify(value)} reason="${reason.replace(/"/g, "'")}"]`;
}

// ---------- ST lifecycle ----------
async function init(api, extensionConfig) {
  console.log('[TS-MW] init called');

  ST = api;
  cfg = Object.assign({}, cfg, extensionConfig || {});
  loadWorld();
  log('Loaded world from', WPATH());

  // Hook: before sending to the model (so we can inject computed lines)
  ST.registerHook('message:send', async (payload, next) => {
    // payload: { type: 'user'|'system'|'assistant', text: string, ... }
    if (!payload?.text) return next(payload);
    const t = payload.text;
  
    let resp = null;
    if (RX.CHECK.test(t)) resp = handleCHECK(t.match(RX.CHECK));
    else if (RX.REQ_NPC.test(t)) resp = handleREQ_NPC(t.match(RX.REQ_NPC));
    else if (RX.REQ_NPC_SECRET.test(t)) resp = handleREQ_NPC_SECRET(t.match(RX.REQ_NPC_SECRET));
    else if (RX.REQ_SCENE.test(t)) resp = handleREQ_SCENE(t.match(RX.REQ_SCENE));
    else if (RX.REQ_ARC.test(t)) resp = handleREQ_ARC(t.match(RX.REQ_ARC));
    else if (RX.TICK.test(t)) resp = handleTICK(t.match(RX.TICK));
    else if (RX.SET.test(t)) resp = handleSET(t.match(RX.SET));
  
    if (resp) {
      // Replace the outgoing user message with the computed control-line result.
      payload.text = resp;
      return next(payload);
    }
    return next(payload);
  });

  // optional: on incoming assistant text (e.g., strip accidental leaks)
  ST.registerHook('middleware:incoming', async (payload, next) => {
    // payload: { text }
    // You could redact anything that looks like raw GM data here.
    return next(payload);
  });

  return { success: true, message: 'TS Middleware initialized' };
}

module.exports = {
  init,
  // Optional commands to test from ST command bar
  commands: {
    'tsmw.reload': {
      run: async () => { loadWorld(); return 'TS Middleware: world.json reloaded.'; },
      help: 'Reload world.json'
    }
  }
};
