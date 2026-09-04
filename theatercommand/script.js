'use strict';
/* ==========================================================================
   THEATERCOMMAND — Game Engine
   Vanilla JS. Geen frameworks. Eén centrale State, functies per subsysteem.
   Secties: 1 Config  2 Utils  3 State/Generatie  4 Simulatietick
            5 OLBM AI  6 Vijand AI  7 Events  8 Politiek  9 Rendering
            10 UI/Interactie  11 Debrief  12 Save/Load  13 Boot
   ========================================================================== */

/* ---------------------------------------------------------------------- */
/* 1. CONFIG                                                               */
/* ---------------------------------------------------------------------- */
const CFG = {
  TILE_KM: 10,
  PHASES_PER_DAY: 6,
  PHASE_HOURS: 4,
  MAX_DAYS: 90,
  PHASE_MS_BASE: 10000,          // reële ms per fase bij 1x ( => 60s/dag )
  SUPPORT_RANGE_KM: 150,          // "De 150 km-drempel"
  TRUCK_RANGE_KM: 250,
  DRONE_LOGISTIC_RANGE_KM: 20,
  START_POLITICAL: 100,
};

const TERRAIN = {
  open:      { label: 'Open veld',   color: '#3a3f2e', speedMod: 1.0 },
  bos:       { label: 'Bos',         color: '#26331f', speedMod: 0.7 },
  stedelijk: { label: 'Stedelijk',   color: '#3a3a3a', speedMod: 0.6 },
  rivier:    { label: 'Rivier',      color: '#1c3550', speedMod: 0.15 },
  heuvel:    { label: 'Heuvelachtig',color: '#4a4326', speedMod: 0.75 },
};

const NODE_TYPES = {
  hub:        { label: 'Strategische Hub',    color: '#87ceeb', radius: 9, classes: ['I','III','IV','V','VI','VII','VIII','IX','X'] },
  distributie:{ label: 'Distributiepunt',     color: '#6fa8dc', radius: 7, classes: ['I','III','IV','V','VI','VII','VIII','IX','X'] },
  farp:       { label: 'FARP',                color: '#ffbf00', radius: 5, classes: ['III','V','IX'] },
  microdepot: { label: 'Mobiel Micro-Depot',  color: '#b5a642', radius: 3.5, classes: ['I','III','V','VIII'] },
  energy:     { label: 'Energy Hub',          color: '#7ec8e3', radius: 5, classes: ['X','IX'] },
  medical:    { label: 'Medical Node',        color: '#e0e0e0', radius: 5, classes: ['VIII'] },
};

const UNIT_TYPES = {
  infanterie:    { label: 'Infanterie',     system: 'infanterie', speedKmDag: 25, personnel: [7000, 9000] },
  gemechaniseerd:{ label: 'Gemechaniseerd', system: 'infanterie', speedKmDag: 45, personnel: [9000, 13000] },
  pantser:       { label: 'Pantser',        system: 'artillerie', speedKmDag: 50, personnel: [8000, 11000] },
  artillerie:    { label: 'Artillerie',     system: 'artillerie', speedKmDag: 20, personnel: [5000, 7000] },
  drone:         { label: 'Drone/EW',       system: 'drones',     speedKmDag: 35, personnel: [3000, 5000] },
  logistiek:     { label: 'Logistiek',      system: 'infanterie', speedKmDag: 30, personnel: [4000, 6000] },
};

const CLASS_LABEL = {
  I: 'Class I — Rantsoenen/Water', III: 'Class III — Brandstof', IV: 'Class IV — Onderdak',
  V: 'Class V — Munitie', VI: 'Class VI — Uitrusting', VII: 'Class VII — Zware wapens',
  VIII: 'Class VIII — Medisch', IX: 'Class IX — Onderdelen', X: 'Class X — Energie/Data',
};
const DAY_CLASSES = ['I', 'III', 'V', 'VIII']; // klassen bijgehouden in "dagen voorraad"
const PCT_CLASSES = ['IV', 'VI', 'VII', 'IX', 'X']; // klassen bijgehouden als 0-100%

const PRIORITY_LABEL = { P1: 'P1 — Kritiek', P2: 'P2 — Hoog', P3: 'P3 — Normaal', P4: 'P4 — Laag' };
const PRIORITY_WEIGHT = { P1: 2.2, P2: 1.4, P3: 1.0, P4: 0.6 };

const TRANSPORT_MODES = {
  vrachtwagen: { label: 'Vrachtwagen', speedKmU: 30, riskMod: 1.0, maxKm: 400, fuelCost: 0 },
  helikopter:  { label: 'Helikopter',  speedKmU: 150, riskMod: 1.8, maxKm: 300, fuelCost: 8 },
  drone:       { label: 'Drone-logistiek', speedKmU: 60, riskMod: 0.7, maxKm: CFG.DRONE_LOGISTIC_RANGE_KM, fuelCost: 0 },
  spoor:       { label: 'Spoorweg', speedKmU: 40, riskMod: 0.4, maxKm: 999, fuelCost: 0 },
};

const QUOTES = {
  classIII: '"Amateurs discuss tactics; professionals discuss logistics." — vaak toegeschreven aan Omar Bradley.',
  km150: 'De Wehrmacht in 1941 stagneerde niet door gebrek aan moed, maar door gebrek aan Heizöl.',
  decisionDebt: 'De OODA-loop van John Boyd: observe, orient, decide, act. Sneller is niet altijd beter — accuraatheid in "orient" is crucialer dan snelheid in "act".',
  drones: 'De paradox van precisie: minder volume, meer complexiteit. Een FPV-drone vervangt geen vrachtwagen, maar transformeert de last-mile.',
};

const SCENARIOS = [
  { id: 'lange_mars', name: 'De Lange Mars', distanceKm: 400, terrainBias: 'open', enemyBias: 'delay',
    desc: 'Open veld, beperkte infrastructuur, gemotoriseerde reserves, bruggen opgeblazen.',
    learn: 'Leerdoel: de 150km-drempel, spoorweglogistiek, stapsgewijze depot-opbouw.' },
  { id: 'stedelijk', name: 'Stedelijk Labyrint', distanceKm: 150, terrainBias: 'urban', enemyBias: 'infantry',
    desc: '60% stedelijk terrein, asymmetrische tegenstander, drones in stedelijk gebied.',
    learn: 'Leerdoel: infanterie-dominantie, Class VIII (medisch), laatste-mijl logistiek.' },
  { id: 'drone_oorlog', name: 'Drone-Oorlog', distanceKm: 400, terrainBias: 'tech', enemyBias: 'ew',
    desc: 'Minimale infanterie, maximale technologische inzet, EW-zware tegenstander.',
    learn: 'Leerdoel: Class X-logistiek, energiebeheer, shifting dominantie.' },
  { id: 'perfecte_storm', name: 'De Perfecte Storm', distanceKm: 400, terrainBias: 'chaos', enemyBias: 'all',
    desc: 'Modder, tegenaanval, corruptie, supply chain-verstoring, politieke druk — alles tegelijk.',
    learn: 'Leerdoel: er is geen perfecte oplossing — trade-offs zijn onvermijdelijk.' },
  { id: 'sandbox', name: 'Sandbox', distanceKm: 400, terrainBias: 'open', enemyBias: 'delay',
    desc: 'Vrij instelbare parameters: afstand, troepenmacht, weer.',
    learn: 'Experimenteer vrij met de logistieke variabelen.' },
];

const DIFFICULTIES = [
  { id: 'cadet', name: 'Cadet', aggressiveness: 0.5, ew: false, deepfake: false,
    desc: 'Tegenstander reageert traag, valt alleen grote depots aan, geen EW.' },
  { id: 'officier', name: 'Officier', aggressiveness: 1.0, ew: true, deepfake: false,
    desc: 'Tegenstander valt corridors aan, gebruikt drones, adaptief.' },
  { id: 'strateeg', name: 'Strateeg', aggressiveness: 1.5, ew: true, deepfake: true,
    desc: 'Gebruikt deepfake-sensorsignalen, valt Class X-nodes aan, flankeert.' },
  { id: 'theoretisch', name: 'Theoretisch (Easter Egg)', aggressiveness: 2.5, ew: true, deepfake: true,
    desc: 'Een (bijna) perfecte tegenstander — enkel om de limiet van het systeem te tonen.' },
];

/* ---------------------------------------------------------------------- */
/* 2. UTILS                                                                */
/* ---------------------------------------------------------------------- */
let rngSeed = 42;
function rng() { // deterministisch binnen een spel, herstelbaar via seed
  rngSeed = (rngSeed * 1103515245 + 12345) & 0x7fffffff;
  return (rngSeed % 100000) / 100000;
}
function rngInt(min, max) { return Math.floor(min + rng() * (max - min + 1)); }
function rngPick(arr) { return arr[Math.floor(rng() * arr.length)]; }
function rngRange(min, max) { return min + rng() * (max - min); }
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y) * CFG.TILE_KM; }
function absPhase(s) { return s.day * CFG.PHASES_PER_DAY + s.phase; }
function fmt1(n) { return (Math.round(n * 10) / 10).toFixed(1); }
function uid(prefix) { return prefix + '_' + Math.random().toString(36).slice(2, 9); }
function weightedPick(items) { // items: [{w, ...}]
  const total = items.reduce((s, i) => s + i.w, 0);
  let r = rng() * total;
  for (const it of items) { r -= it.w; if (r <= 0) return it; }
  return items[items.length - 1];
}

/* ---------------------------------------------------------------------- */
/* 3. STATE & GENERATIE                                                    */
/* ---------------------------------------------------------------------- */
let GameState = null;
let UI = { activeLeftTab: 'flow', activeRightTab: 'olbm', selectedNodeId: null, selectedUnitId: null, selectedCorridorId: null, relocatingNodeId: null, buildingNodeType: null, speed: 1, paused: true, lastTick: 0, phaseElapsed: 0 };

function newGameState(scenarioId, difficultyId, sandboxOpts) {
  const scenario = SCENARIOS.find(s => s.id === scenarioId) || SCENARIOS[0];
  const difficulty = DIFFICULTIES.find(d => d.id === difficultyId) || DIFFICULTIES[1];
  const distanceKm = (scenario.id === 'sandbox' && sandboxOpts && sandboxOpts.distanceKm) ? sandboxOpts.distanceKm : scenario.distanceKm;
  const troopMult = (scenario.id === 'sandbox' && sandboxOpts && sandboxOpts.troopMult) ? sandboxOpts.troopMult : 1;
  const gridW = Math.max(15, Math.round(distanceKm / CFG.TILE_KM));
  const gridH = 30;

  rngSeed = Date.now() & 0x7fffffff;

  const s = {
    scenarioId: scenario.id, scenarioName: scenario.name, difficultyId: difficulty.id,
    gridW, gridH, distanceKm,
    day: 1, phase: 0,
    weather: 'droog', season: 'zomer', mudFactor: 0,
    units: [], nodes: [], corridors: [], enemy: [], convoys: [],
    ooda: { observe: 1.0, orient: 1.0, decide: 1.0, act: 1.0 },
    politicalCapital: CFG.START_POLITICAL,
    aiAdvice: [], events: [], eventLog: [], messages: [],
    decisionDebt: { accepted: 0, adjusted: 0, ignored: 0, ignoredBad: 0, log: [] },
    history: [],
    lastEventDay: 0, lastDirectiveDay: 0,
    fog: null, gameOver: null,
    corridorAlertUntil: 0, hqNodeId: null,
    stats: { transportLossesTon: 0, transportTotalTon: 0, enemyEliminated: 0, decideDurations: [] },
  };

  genTerrain(s, scenario);
  genNodes(s);
  genCorridors(s);
  genUnits(s, troopMult);
  genEnemy(s, difficulty, scenario);
  updateFog(s);

  const hq = s.nodes.find(n => n.type === 'hub');
  if (hq) { hq.isHQ = true; hq.integrity = 100; hq.name = 'Kerncommando HQ'; s.hqNodeId = hq.id; }

  s.messages.push(mkMsg(`Operatie "${scenario.name}" gestart. Doel OMEGA op ${distanceKm}km. Moeilijkheid: ${difficulty.name}.`));
  return s;
}

function mkMsg(text, cls) { return { t: Date.now(), day: GameState ? GameState.day : 1, text, cls: cls || '' }; }

function genTerrain(s, scenario) {
  const grid = [];
  const urbanBias = scenario.terrainBias === 'urban';
  const chaosBias = scenario.terrainBias === 'chaos';
  // 2-3 rivieren als verticale banden die kruisen
  const riverXs = [Math.round(s.gridW * 0.3), Math.round(s.gridW * 0.62)];
  for (let y = 0; y < s.gridH; y++) {
    const row = [];
    for (let x = 0; x < s.gridW; x++) {
      let t = 'open';
      if (riverXs.some(rx => Math.abs(x - rx) <= 0 && rng() > 0.15)) t = 'rivier';
      else {
        const roll = rng();
        if (urbanBias && roll < 0.35) t = 'stedelijk';
        else if (roll < 0.12) t = 'stedelijk';
        else if (roll < 0.30) t = 'bos';
        else if (roll < 0.42) t = 'heuvel';
        else t = 'open';
      }
      row.push({ terrain: t, known: false, lastSeenPhase: -1 });
    }
    grid.push(row);
  }
  s.terrainGrid = grid;
  s.riverXs = riverXs;
  s.weather = chaosBias ? 'modderig' : 'droog';
  s.mudFactor = s.weather === 'modderig' ? 0.5 : 0;
}

const NODE_CAP_BASE = { hub: 4000, distributie: 1200, farp: 300, microdepot: 120, energy: 200, medical: 150 };
const NODE_BUILD_COST = { // klassen verbruikt van de betalende node
  distributie: { VII: 40, IV: 30 }, farp: { VII: 20, IV: 15 },
  microdepot: { VII: 10, IV: 10 }, energy: { VII: 15, IX: 10 }, medical: { VII: 15, VIII: 15 },
};
const NODE_BUILD_PHASES = { distributie: 12, farp: 6, microdepot: 3, energy: 8, medical: 6 }; // 4u per fase: 12-48u

function genNodes(s) {
  const w = s.gridW, h = s.gridH;
  const counts = { hub: Math.max(2, Math.round(w / 12)), distributie: Math.max(3, Math.round(w / 3.2)),
    farp: Math.max(5, Math.round(w / 1.6)), microdepot: Math.max(8, Math.round(w * 1.25)),
    energy: Math.max(3, Math.round(w / 3.4)), energy2: 0, medical: Math.max(2, Math.round(w / 6.5)) };
  let n = 0;
  const mkNode = (type, xFrac, yFrac) => {
    const t = NODE_TYPES[type];
    const node = {
      id: uid('nd'), type, name: `${t.label} ${(++n)}`,
      x: clamp(xFrac * (w - 1), 0, w - 1), y: clamp(yFrac * (h - 1), 0, h - 1),
      stock: {}, capacity: {}, vulnerability: rngRange(0.05, 0.2), underAttackUntil: 0,
    };
    const capBase = NODE_CAP_BASE[type];
    t.classes.forEach(c => {
      node.capacity[c] = capBase * (DAY_CLASSES.includes(c) ? 1 : 0.6);
      node.stock[c] = node.capacity[c] * rngRange(0.55, 0.95);
    });
    s.nodes.push(node);
    return node;
  };
  for (let i = 0; i < counts.hub; i++) mkNode('hub', 0.02 + i * 0.02, (i + 0.5) / counts.hub);
  for (let i = 0; i < counts.distributie; i++) mkNode('distributie', 0.12 + rng() * 0.35, rng());
  for (let i = 0; i < counts.farp; i++) mkNode('farp', 0.3 + rng() * 0.6, rng());
  for (let i = 0; i < counts.microdepot; i++) mkNode('microdepot', 0.1 + rng() * 0.85, rng());
  for (let i = 0; i < counts.energy; i++) mkNode('energy', 0.15 + rng() * 0.7, rng());
  for (let i = 0; i < counts.medical; i++) mkNode('medical', 0.05 + rng() * 0.3, rng());
}

function genCorridors(s) {
  const hubs = s.nodes.filter(n => n.type === 'hub');
  const distr = s.nodes.filter(n => n.type === 'distributie');
  const farps = s.nodes.filter(n => n.type === 'farp');
  const nCorridors = clamp(Math.round(s.gridW / 4), 6, 12);
  for (let i = 0; i < nCorridors; i++) {
    const hub = hubs[i % hubs.length];
    if (!hub) continue;
    const chainDistr = distr.filter(d => Math.abs(d.y - hub.y) < s.gridH * 0.25)
      .sort((a, b) => a.x - b.x).slice(0, 2 + (i % 2));
    const chainFarp = farps.filter(f => chainDistr.some(d => Math.abs(f.y - d.y) < s.gridH * 0.2))
      .sort((a, b) => a.x - b.x).slice(0, 2);
    const chain = [hub, ...chainDistr, ...chainFarp].filter(Boolean);
    if (chain.length < 2) continue;
    s.corridors.push({
      id: uid('cor'), name: `Corridor ${String.fromCharCode(65 + i)}`,
      nodeChain: chain.map(n => n.id), mode: i % 3 === 0 ? 'spoor' : 'weg',
      vulnerability: rngRange(0.05, 0.25), status: 'veilig', recentLossPct: 0, lossWindow: [],
    });
  }
}

function genUnits(s, troopMult) {
  const legerCount = 3, divPerLeger = 4;
  const typeCycle = ['gemechaniseerd', 'infanterie', 'artillerie', 'pantser', 'drone', 'logistiek', 'infanterie', 'gemechaniseerd'];
  let idx = 0;
  let totalPersonnel = 0;
  const targetTotal = 500000 * troopMult;
  const brigades = [];
  for (let L = 1; L <= legerCount; L++) {
    for (let D = 1; D <= divPerLeger; D++) {
      const brigCount = rngInt(3, 4);
      for (let B = 1; B <= brigCount; B++) {
        const type = typeCycle[idx++ % typeCycle.length];
        const ut = UNIT_TYPES[type];
        const personnel = Math.round(rngRange(ut.personnel[0], ut.personnel[1]) * troopMult);
        totalPersonnel += personnel;
        brigades.push({
          id: uid('brig'), name: `${L}e Leger / ${D}e Div / Brig ${B} (${ut.label})`,
          leger: L, divisie: D, type, system: ut.system, personnel,
          x: rngRange(0, 1.5), y: rngRange(2, s.gridH - 2),
          destination: { x: s.gridW - 1, y: rngRange(2, s.gridH - 2) },
          status: 'moving', autoAdvance: true, morale: 100, lossesFrac: 0, priority: 'P3',
          stock: { I: rngRange(3, 6), III: rngRange(3, 6), V: rngRange(3, 6), VIII: rngRange(3, 6),
            IV: rngRange(60, 90), VI: rngRange(60, 90), VII: rngRange(70, 95), IX: rngRange(60, 90), X: rngRange(50, 85) },
          engagedUntil: 0, degradedFlags: {}, escortUntil: 0, escortCorridorId: null,
        });
      }
    }
  }
  // normaliseer naar target totaal
  const scale = targetTotal / totalPersonnel;
  brigades.forEach(b => { b.personnel = Math.round(b.personnel * scale); });
  s.units = brigades;
  s.totalPersonnelStart = brigades.reduce((sum, b) => sum + b.personnel, 0);
}

function genEnemy(s, difficulty, scenario) {
  const n = clamp(Math.round(s.gridW * 0.9 * difficulty.aggressiveness), 10, 60);
  const typesByBias = { delay: ['delay', 'armor'], infantry: ['delay', 'ew'], ew: ['ew', 'armor'], all: ['delay', 'armor', 'ew', 'artillery'] };
  const pool = typesByBias[scenario.enemyBias] || ['delay', 'armor', 'ew'];
  for (let i = 0; i < n; i++) {
    s.enemy.push({
      id: uid('red'), type: rngPick(pool), strength: rngRange(0.5, 1.0),
      x: rngRange(s.gridW * 0.35, s.gridW - 1), y: rngRange(1, s.gridH - 2),
      detected: false, lastSeenPhase: -1, eliminated: false,
    });
  }
}

/* ---------------------------------------------------------------------- */
/* 4. SIMULATIETICK                                                        */
/* ---------------------------------------------------------------------- */
function phaseMs() {
  if (UI.speed <= 0) return Infinity;
  return CFG.PHASE_MS_BASE / UI.speed;
}

function gameLoop(ts) {
  if (!UI.lastTick) UI.lastTick = ts;
  const dt = ts - UI.lastTick;
  UI.lastTick = ts;
  if (!UI.paused && GameState && !GameState.gameOver && UI.speed > 0) {
    UI.phaseElapsed += dt;
    const need = phaseMs();
    if (UI.phaseElapsed >= need) {
      UI.phaseElapsed = 0;
      advancePhase();
    }
    updateOodaCountdown(need - UI.phaseElapsed);
  }
  renderMap();
  requestAnimationFrame(gameLoop);
}

function updateOodaCountdown(msLeft) {
  const el = document.getElementById('ooda-countdown');
  if (!el) return;
  if (UI.paused || UI.speed <= 0 || !GameState || GameState.gameOver) { el.textContent = '--:--'; return; }
  const sec = Math.max(0, Math.ceil(msLeft / 1000));
  el.textContent = `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
}

function advancePhase() {
  const s = GameState;
  const decideStart = s._phaseDecideStart || Date.now();
  s.stats.decideDurations.push(Date.now() - decideStart);

  updateWeather(s);
  moveUnits(s);
  resupplyCorridorsAndNodes(s);
  resupplyUnits(s);
  resolveConvoys(s);
  applyConsumptionAndDegradation(s);
  computeDominance(s);
  enemyAiAct(s);
  resolveEngagements(s);
  updateCorridorStatus(s);
  updateEscorts(s);
  updateNodeConstruction(s);
  updateFog(s);
  checkEventCard(s);
  checkPoliticalDirective(s);
  evaluateDecisionDebt(s);
  regenerateOlbmAdvice(s);
  updateOoda(s);

  s.phase++;
  if (s.phase >= CFG.PHASES_PER_DAY) { s.phase = 0; s.day++; }
  s._phaseDecideStart = Date.now();

  pushHistorySnapshot(s);
  checkWinLose(s);
  renderAll();
}

function updateWeather(s) {
  if (s.day > 60) s.season = 'winter'; else if (s.day > 30) s.season = 'herfst'; else s.season = 'zomer';
  if (rng() < 0.06) {
    const roll = rng();
    if (s.season === 'winter') s.weather = roll < 0.5 ? 'modderig' : (roll < 0.75 ? 'sneeuw' : 'droog');
    else s.weather = roll < 0.3 ? 'modderig' : 'droog';
  }
  s.mudFactor = (s.weather === 'modderig') ? 0.5 : (s.weather === 'sneeuw' ? 0.35 : 0);
}

function nearestNode(s, unit, classesNeeded) {
  let best = null, bestD = Infinity;
  for (const nd of s.nodes) {
    if (nd.underConstruction) continue;
    if (classesNeeded && !classesNeeded.some(c => NODE_TYPES[nd.type].classes.includes(c))) continue;
    const d = dist(unit, nd);
    if (d < bestD) { bestD = d; best = nd; }
  }
  return { node: best, km: bestD };
}

function moveUnits(s) {
  for (const u of s.units) {
    if (u.lossesFrac >= 1) continue;
    if (!u.autoAdvance || u.status === 'engaged') continue;
    const { km } = nearestNode(s, u, ['I', 'III']);
    const supported = km <= CFG.SUPPORT_RANGE_KM;
    const fuelOk = u.stock.III > 0.2, foodOk = u.stock.I > 0.1;
    if (!fuelOk) { u.status = 'static'; continue; }
    const ut = UNIT_TYPES[u.type];
    const tx = Math.floor(u.x), ty = Math.floor(u.y);
    const terrain = (s.terrainGrid[ty] && s.terrainGrid[ty][tx]) ? s.terrainGrid[ty][tx].terrain : 'open';
    let speedMod = TERRAIN[terrain].speedMod * (1 - s.mudFactor);
    if (!supported) speedMod *= 0.35; // ver buiten 150km-drempel: zware degradatie
    if (!foodOk) speedMod *= 0.5;
    const kmPerPhase = (ut.speedKmDag / CFG.PHASES_PER_DAY) * speedMod;
    const dx = u.destination.x - u.x, dy = u.destination.y - u.y;
    const d = Math.hypot(dx, dy);
    if (d > 0.01) {
      const step = Math.min(d, kmPerPhase / CFG.TILE_KM);
      u.x += (dx / d) * step;
      u.y += (dy / d) * step;
    }
    u.status = supported ? 'moving' : 'degraded';
  }
}

function resupplyCorridorsAndNodes(s) {
  // Voorraad "stroomt" langs elke corridor-keten van hoog naar laag echelon, beperkt door capaciteit & kwetsbaarheid.
  for (const cor of s.corridors) {
    const chain = cor.nodeChain.map(id => s.nodes.find(n => n.id === id)).filter(Boolean);
    for (let i = 0; i < chain.length - 1; i++) {
      const from = chain[i], to = chain[i + 1];
      const modeCap = cor.mode === 'spoor' ? 2400 : 20 * 12; // ton/dag equivalent
      const perPhase = (modeCap / CFG.PHASES_PER_DAY) * (1 - cor.vulnerability);
      NODE_TYPES[to.type].classes.forEach(c => {
        if (!(c in from.stock)) return;
        const room = to.capacity[c] - to.stock[c];
        const want = Math.min(perPhase * 0.15, from.stock[c] * 0.2, Math.max(0, room));
        if (want > 0) {
          let sent = want;
          const lossPct = cor.vulnerability * (0.5 + rng() * 0.5);
          const lost = sent * lossPct;
          s.stats.transportTotalTon += sent;
          s.stats.transportLossesTon += lost;
          from.stock[c] -= sent;
          to.stock[c] += sent - lost;
        }
      });
    }
  }
}

function resupplyUnits(s) {
  // P1 eerst: bij schaarste krijgen de hoogst-prioritaire eenheden als eerst hun deel van de nodevoorraad.
  const ordered = s.units.slice().sort((a, b) => (PRIORITY_WEIGHT[b.priority] || 1) - (PRIORITY_WEIGHT[a.priority] || 1));
  for (const u of ordered) {
    if (u.lossesFrac >= 1) continue;
    const { node, km } = nearestNode(s, u, ['I', 'III']);
    if (!node) continue;
    const withinTruck = km <= CFG.TRUCK_RANGE_KM;
    if (!withinTruck) continue;
    DAY_CLASSES.forEach(c => {
      if (!(c in node.stock)) return;
      const targetDays = 6;
      if (u.stock[c] < targetDays && node.stock[c] > 5) {
        const perDayNeed = u.personnel / 6000; // schaal-eenheid t/dag
        const wantTon = (targetDays - u.stock[c]) * perDayNeed * 0.3;
        const send = Math.min(wantTon, node.stock[c] * 0.25);
        if (send > 0) {
          const riskLoss = km > CFG.SUPPORT_RANGE_KM ? 0.15 : 0.04;
          const lost = send * riskLoss * rng();
          node.stock[c] -= send;
          u.stock[c] += (send - lost) / Math.max(1, perDayNeed);
          s.stats.transportTotalTon += send;
          s.stats.transportLossesTon += lost;
        }
      }
    });
    PCT_CLASSES.forEach(c => {
      if (!(c in node.stock)) return;
      if (u.stock[c] < 70 && node.stock[c] > 10) {
        const send = Math.min(5, node.stock[c] * 0.1);
        node.stock[c] -= send;
        u.stock[c] = clamp(u.stock[c] + send * 1.5, 0, 100);
      }
    });
  }
}

/* ---- Handmatige voorraadverzending (speleractie A: "Voorraden verplaatsen") ---- */
function availableTransportModes(source, target, targetType) {
  const km = dist(source, target);
  const modes = [];
  if (targetType === 'node' && (source.type === 'hub' || source.type === 'distributie') && (target.type === 'hub' || target.type === 'distributie')) modes.push('spoor');
  if (km <= TRANSPORT_MODES.vrachtwagen.maxKm) modes.push('vrachtwagen');
  modes.push('helikopter');
  if (targetType === 'unit' && km <= TRANSPORT_MODES.drone.maxKm) modes.push('drone');
  return modes;
}

function transferEtaRisk(s, source, target, mode) {
  const km = dist(source, target);
  const tm = TRANSPORT_MODES[mode];
  const eta = km / tm.speedKmU;
  const relatedCors = s.corridors.filter(c => c.nodeChain.includes(source.id));
  const baseVuln = relatedCors.length ? relatedCors.reduce((a, c) => a + c.vulnerability, 0) / relatedCors.length : 0.15;
  const risk = clamp((0.03 + baseVuln * 0.6 + (km / 400) * 0.15) * tm.riskMod, 0.02, 0.85);
  return { km, eta, risk };
}

function sendSupply(s, sourceId, targetId, targetType, cls, amount, mode) {
  const source = s.nodes.find(n => n.id === sourceId);
  const target = targetType === 'unit' ? s.units.find(u => u.id === targetId) : s.nodes.find(n => n.id === targetId);
  if (!source || !target) return { ok: false, msg: 'Ongeldige bron of bestemming.' };
  amount = Math.min(amount, source.stock[cls] || 0);
  if (amount <= 0.01) return { ok: false, msg: 'Onvoldoende voorraad op bronlocatie.' };
  const { km, eta, risk } = transferEtaRisk(s, source, target, mode);
  source.stock[cls] -= amount;
  s.convoys.push({
    id: uid('cv'), sourceId, targetId, targetType, cls, amount, mode, km, risk,
    startPhase: absPhase(s), etaPhases: Math.max(0.25, eta / CFG.PHASE_HOURS),
    fromX: source.x, fromY: source.y, toX: target.x, toY: target.y,
  });
  const targetName = targetType === 'unit' ? target.name.split('(')[0].trim() : target.name;
  s.messages.push(mkMsg(`Konvooi onderweg: ${fmt1(amount)} ${cls} van ${source.name} naar ${targetName} (${TRANSPORT_MODES[mode].label}, ETA ${fmt1(eta)}u, risico ${Math.round(risk * 100)}%).`));
  return { ok: true };
}

function resolveConvoys(s) {
  const now = absPhase(s);
  s.convoys = s.convoys.filter(cv => {
    const elapsed = now - cv.startPhase;
    if (elapsed < cv.etaPhases) return true;
    const lostFrac = rng() < cv.risk ? clamp(rngRange(0.3, 1.0) * cv.risk, 0, 1) : cv.risk * rng() * 0.5;
    const delivered = cv.amount * (1 - lostFrac);
    const lost = cv.amount - delivered;
    s.stats.transportTotalTon += cv.amount;
    s.stats.transportLossesTon += lost;
    if (cv.targetType === 'unit') {
      const u = s.units.find(x => x.id === cv.targetId);
      if (u && u.lossesFrac < 1) {
        if (DAY_CLASSES.includes(cv.cls)) u.stock[cv.cls] += delivered / Math.max(1, u.personnel / 6000);
        else u.stock[cv.cls] = clamp(u.stock[cv.cls] + delivered, 0, 100);
      }
    } else {
      const nd = s.nodes.find(x => x.id === cv.targetId);
      if (nd) nd.stock[cv.cls] = Math.min(nd.capacity[cv.cls] || Infinity, (nd.stock[cv.cls] || 0) + delivered);
    }
    if (lostFrac > 0.4) s.messages.push(mkMsg(`Konvooi zwaar getroffen onderweg — ${Math.round(lostFrac * 100)}% verlies van de ${cv.cls}-lading.`, 'warn'));
    else s.messages.push(mkMsg(`Konvooi gearriveerd: ${fmt1(delivered)} ${cv.cls} afgeleverd.`, 'good'));
    return false;
  });
}

function applyConsumptionAndDegradation(s) {
  const phaseFrac = 1 / CFG.PHASES_PER_DAY;
  for (const u of s.units) {
    if (u.lossesFrac >= 1) continue;
    const engaged = u.status === 'engaged';
    const consMult = { I: 1, III: engaged ? 1.6 : (u.status === 'moving' ? 1.4 : 0.6), V: engaged ? 4 : 0.3, VIII: engaged ? 2 : 0.4 };
    DAY_CLASSES.forEach(c => { u.stock[c] = Math.max(0, u.stock[c] - phaseFrac * consMult[c]); });
    PCT_CLASSES.forEach(c => { u.stock[c] = Math.max(0, u.stock[c] - phaseFrac * (engaged ? 3 : 1)); });

    // Degradatieregels (sectie 3.2)
    u.degradedFlags = u.degradedFlags || {};
    if (u.stock.I < 0.05) { u.morale = clamp(u.morale - 2, 0, 100); u.degradedFlags.moraleLoss = true; }
    if (u.stock.III < 0.05) { u.autoAdvance = false; u.degradedFlags.grounded = true; } else { u.degradedFlags.grounded = false; }
    if (engaged && u.stock.V < 0.02) { u.status = 'static'; u.degradedFlags.noAmmo = true; } else { u.degradedFlags.noAmmo = false; }
    if (u.stock.VIII < 0.01 && engaged) { u.lossesFrac = clamp(u.lossesFrac + 0.01, 0, 1); u.degradedFlags.noMedevac = true; } else { u.degradedFlags.noMedevac = false; }
    if (u.morale <= 15) u.lossesFrac = clamp(u.lossesFrac + 0.005, 0, 1);
  }
}

function computeDominance(s) {
  // macro-sectoren van 4 kolommen breed, dominantiescores per systeem (sectie 3.3)
  const sectors = Math.max(1, Math.round(s.gridW / 4));
  s.dominance = [];
  for (let sec = 0; sec < sectors; sec++) {
    const x0 = sec * 4, x1 = x0 + 4;
    let urban = 0, open = 0, tiles = 0;
    for (let y = 0; y < s.gridH; y++) for (let x = x0; x < x1 && x < s.gridW; x++) {
      const t = s.terrainGrid[y][x].terrain; tiles++;
      if (t === 'stedelijk') urban++; if (t === 'open') open++;
    }
    urban /= Math.max(1, tiles); open /= Math.max(1, tiles);
    const enemyArmor = s.enemy.filter(e => e.type === 'armor' && e.x >= x0 && e.x < x1 && !e.eliminated).length / 5;
    const enemyEw = s.enemy.filter(e => e.type === 'ew' && e.x >= x0 && e.x < x1 && !e.eliminated).length / 5;
    const known = s.enemy.filter(e => e.detected && e.x >= x0 && e.x < x1).length / 5;
    const dInf = 1.0 * urban + 0.3 * open - 0.5 * enemyArmor;
    const dArt = 0.2 * urban + 1.0 * open + 0.8 * known - 0.6 * enemyEw;
    const dDrone = 0.4 * urban + 0.7 * open + 0.9 * known - 0.8 * enemyEw - 0.4 * s.mudFactor;
    s.dominance.push({ sector: sec, x0, x1, infanterie: dInf, artillerie: dArt, drones: dDrone });
  }
}

function resolveEngagements(s) {
  for (const u of s.units) {
    if (u.lossesFrac >= 1) continue;
    const nearEnemy = s.enemy.filter(e => !e.eliminated && dist(u, e) < 15);
    if (nearEnemy.length > 0) {
      u.status = 'engaged'; u.engagedUntil = s.day + 1;
      const sec = s.dominance ? s.dominance[clamp(Math.floor(u.x / 4), 0, s.dominance.length - 1)] : null;
      const myDom = sec ? sec[u.system] : 0;
      nearEnemy.forEach(e => {
        const hitChance = clamp(0.15 + myDom * 0.1 + (u.stock.V > 1 ? 0.1 : -0.1), 0.02, 0.6);
        if (rng() < hitChance) { e.strength -= 0.4; if (e.strength <= 0) e.eliminated = true; e.detected = true; s.stats.enemyEliminated++; }
        const enemyHit = clamp(0.1 * e.strength, 0.01, 0.25);
        if (rng() < enemyHit) u.lossesFrac = clamp(u.lossesFrac + 0.01, 0, 1);
      });
    } else if (u.status !== 'escort' && u.engagedUntil <= s.day) { u.status = u.degradedFlags.grounded ? 'static' : 'moving'; }
  }
}

function updateCorridorStatus(s) {
  const now = absPhase(s);
  for (const cor of s.corridors) {
    // Natuurlijk herstel: reparatieteams werken continu, tenzij een brug specifiek plat ligt.
    const bridgeDown = cor.bridgeDownUntil && cor.bridgeDownUntil > s.day;
    const escorted = cor.escortUntil && cor.escortUntil > now;
    if (!bridgeDown) {
      const baseline = 0.05;
      const recoveryRate = escorted ? 0.02 : 0.01;
      cor.vulnerability = Math.max(baseline, cor.vulnerability - recoveryRate);
    }

    cor.lossWindow = (cor.lossWindow || []).filter(w => now - w.t < 1.5).concat(
      cor.recentAttack ? [{ t: now, pct: cor.recentAttack }] : []
    );
    cor.recentAttack = 0;
    const windowLoss = cor.lossWindow.reduce((a, w) => a + w.pct, 0);
    if (windowLoss > 0.4 || bridgeDown) {
      cor.status = 'onderbroken';
      s.corridorAlertUntil = now + 2;
      if (windowLoss > 0.4) s.messages.push(mkMsg(`CORRIDOR COLLAPSE: ${cor.name} >40% uitval in 6u — herroutering vereist.`, 'crit'));
    } else if (cor.vulnerability > 0.35) cor.status = 'onder_druk';
    else cor.status = 'veilig';
  }
}

function updateEscorts(s) {
  const now = absPhase(s);
  for (const u of s.units) {
    if (u.status === 'escort' && u.escortUntil && u.escortUntil <= now) {
      u.status = u.degradedFlags.grounded ? 'static' : 'moving';
      u.autoAdvance = true;
      s.messages.push(mkMsg(`Escorte van ${u.name.split('(')[0].trim()} beëindigd — eenheid hervat opmars.`, ''));
      u.escortCorridorId = null;
    }
  }
}

function updateNodeConstruction(s) {
  const now = absPhase(s);
  for (const nd of s.nodes) {
    if (nd.underConstruction && nd.constructionCompletePhase <= now) {
      nd.underConstruction = false;
      s.messages.push(mkMsg(`Node voltooid: ${nd.name}.`, 'good'));
    }
  }
}

function updateFog(s) {
  if (!s.fog) s.fog = true;
  for (const u of s.units) {
    if (u.lossesFrac >= 1) continue;
    const range = u.type === 'drone' ? 8 : 4;
    for (let dy = -range; dy <= range; dy++) for (let dx = -range; dx <= range; dx++) {
      const gx = Math.round(u.x) + dx, gy = Math.round(u.y) + dy;
      if (gx < 0 || gy < 0 || gx >= s.gridW || gy >= s.gridH) continue;
      if (Math.hypot(dx, dy) > range) continue;
      s.terrainGrid[gy][gx].known = true;
    }
  }
  for (const e of s.enemy) {
    if (e.eliminated) continue;
    const nearUnit = s.units.some(u => u.lossesFrac < 1 && dist(u, e) < (rngPick(s.units).type === 'drone' ? 80 : 40));
    if (nearUnit && rng() < 0.4) { e.detected = true; e.lastSeenPhase = s.day * CFG.PHASES_PER_DAY + s.phase; }
    else if (s.day * CFG.PHASES_PER_DAY + s.phase - e.lastSeenPhase > 6) e.detected = false;
  }
}

function pushHistorySnapshot(s) {
  const avgStockV = s.units.reduce((a, u) => a + u.stock.V, 0) / Math.max(1, s.units.length);
  const avgStockIII = s.units.reduce((a, u) => a + u.stock.III, 0) / Math.max(1, s.units.length);
  const totalLosses = s.units.reduce((a, u) => a + u.lossesFrac * u.personnel, 0);
  s.history.push({
    day: s.day, phase: s.phase, politicalCapital: s.politicalCapital,
    avgStockV, avgStockIII, totalLossesFrac: totalLosses / s.totalPersonnelStart,
    dominance: s.dominance ? JSON.parse(JSON.stringify(s.dominance)) : [],
  });
  if (s.history.length > 600) s.history.shift();
}

function checkWinLose(s) {
  if (s.gameOver) return;
  const totalLossesFrac = s.units.reduce((a, u) => a + u.lossesFrac * u.personnel, 0) / s.totalPersonnelStart;
  const transportLossPct = s.stats.transportTotalTon > 0 ? 100 * s.stats.transportLossesTon / s.stats.transportTotalTon : 0;
  const reached = s.units.some(u => u.lossesFrac < 1 && u.x >= s.gridW - 1.5);
  const hq = s.nodes.find(n => n.id === s.hqNodeId);

  // Volgorde volgens de speluitleg: kerncommando > personeelsverlies > politiek > (Pyrrusoverwinning) > tijd.
  if (hq && hq.integrity <= 0) {
    s.gameOver = { result: 'LOSS', reason: 'Kerncommando vernietigd — de vijand heeft uw hoofdkwartier gevonden en uitgeschakeld.' };
  } else if (totalLossesFrac >= 0.5) {
    s.gameOver = { result: 'LOSS', reason: 'Gevechtsmacht boven 50% verlies door logistieke uitputting — niet meer strijdvaardig.' };
  } else if (s.politicalCapital <= 20) {
    s.gameOver = { result: 'LOSS', reason: 'Politiek krediet ingestort — u bent vervangen als J-4.' };
  } else if (reached && transportLossPct < 30) {
    s.gameOver = { result: 'WIN', reason: 'Objectief OMEGA bereikt binnen 90 dagen, met beheersbaar logistiek verlies en voldoende politiek krediet.' };
  } else if (reached && transportLossPct >= 30) {
    s.gameOver = { result: 'LOSS', reason: `Objectief OMEGA bereikt, maar logistiek verlies (${fmt1(transportLossPct)}%) ligt boven de 30%-drempel — een Pyrrusoverwinning die als operationele mislukking geldt.` };
  } else if (s.day > CFG.MAX_DAYS) {
    s.gameOver = { result: 'LOSS', reason: `Operatie vastgelopen — ${CFG.MAX_DAYS} dagen verstreken zonder OMEGA.` };
  }
  if (s.gameOver) { UI.paused = true; showDebrief(); }
}

/* ---------------------------------------------------------------------- */
/* 5. OLBM — AI BESLISSINGSONDERSTEUNING                                   */
/* ---------------------------------------------------------------------- */
function olbmCriticalityScan(s) {
  return s.units.filter(u => u.lossesFrac < 1)
    .map(u => {
      const minDays = Math.min(u.stock.V, u.stock.III, u.stock.I);
      const criticality = (1 / Math.max(0.05, minDays)) * (u.status === 'engaged' ? 3.0 : 1.0) * (PRIORITY_WEIGHT[u.priority] || 1);
      let shortage = null;
      if (u.stock.V < 0.5 && u.status === 'engaged') shortage = 'munitie';
      else if (u.stock.III < 1.0) shortage = 'brandstof';
      else if (u.stock.I < 2.0) shortage = 'rantsoenen';
      else if (u.stock.VIII < 1.0 && u.status === 'engaged') shortage = 'medisch';
      return { unit: u, criticality, shortage };
    })
    .filter(c => c.criticality > 1.6 && c.shortage)
    .sort((a, b) => b.criticality - a.criticality)
    .slice(0, 5);
}

function classForShortage(sh) { return { munitie: 'V', brandstof: 'III', rantsoenen: 'I', medisch: 'VIII' }[sh]; }

function setUnitPriority(s, unitId, p) {
  const u = s.units.find(x => x.id === unitId);
  if (!u || !PRIORITY_LABEL[p]) return;
  u.priority = p;
  s.messages.push(mkMsg(`Prioriteit van ${u.name.split('(')[0].trim()} ingesteld op ${PRIORITY_LABEL[p]}.`));
}

function olbmCorridorOptimize(fromNode, toUnit) {
  const km = dist(fromNode, toUnit);
  const risk = clamp(0.05 + (km / 400) * 0.3, 0.03, 0.6);
  const eta = km / 30; // uur, vrachtwagen-gemiddelde
  return { km: fmt1(km), eta: fmt1(eta), risk: fmt1(risk * 100) };
}

function olbmNodeGapCheck(s) {
  const gaps = [];
  for (const u of s.units) {
    if (u.lossesFrac >= 1) continue;
    const { km } = nearestNode(s, u, ['I', 'III']);
    if (km > CFG.SUPPORT_RANGE_KM) gaps.push({ unit: u, km });
  }
  return gaps.slice(0, 3);
}

function olbmEnergyPriority(s) {
  if (!s.dominance) return [];
  const shortages = [];
  const sectors = Math.max(1, Math.round(s.gridW / 4));
  for (let sec = 0; sec < sectors; sec++) {
    const x0 = sec * 4, x1 = x0 + 4;
    const unitsIn = s.units.filter(u => u.lossesFrac < 1 && u.x >= x0 && u.x < x1);
    if (!unitsIn.length) continue;
    const avgX = unitsIn.reduce((a, u) => a + u.stock.X, 0) / unitsIn.length;
    if (avgX < 40) shortages.push({ sector: sec, avgX, units: unitsIn.length });
  }
  return shortages.sort((a, b) => a.avgX - b.avgX).slice(0, 2);
}

function olbmPredictiveAlerts(s) {
  const out = [];
  for (const u of s.units) {
    if (u.lossesFrac >= 1) continue;
    if (u.type === 'drone' && u.stock.IX < 55 && u.stock.IX > 20) {
      const hoursLeft = Math.round(((u.stock.IX - 20) / 3) * CFG.PHASE_HOURS);
      out.push({ text: `${u.name.split('(')[0].trim()} is over ~${hoursLeft}u zonder drone-onderdelen bij huidig EW-tempo.`, unit: u });
    }
  }
  return out.slice(0, 3);
}

function regenerateOlbmAdvice(s) {
  const advice = [];
  olbmCriticalityScan(s).forEach(c => {
    const cls = classForShortage(c.shortage);
    const { node, km } = nearestNode(s, c.unit, [cls]);
    if (!node) return;
    const route = olbmCorridorOptimize(node, c.unit);
    advice.push({
      id: uid('adv'), kind: 'critical', severity: 'crit',
      title: `CRITICAL: ${c.unit.name.split('(')[0].trim()}`,
      body: `${CLASS_LABEL[cls]}: ${fmt1(c.unit.stock[cls])} dagen. Advies: stuur voorraad vanaf ${node.name}, ETA ${route.eta}u, risico ${route.risk}%.`,
      action: (factor = 1) => { const amt = Math.min(node.stock[cls] * 0.3, 40) * factor; node.stock[cls] -= amt; c.unit.stock[cls] += amt / Math.max(1, c.unit.personnel / 6000); },
      unitId: c.unit.id, nodeId: node.id, cls,
    });
  });
  olbmPredictiveAlerts(s).forEach(p => {
    advice.push({ id: uid('adv'), kind: 'forecast', severity: 'warn', title: 'FORECAST', body: p.text, action: null, unitId: p.unit.id });
  });
  olbmNodeGapCheck(s).forEach(g => {
    advice.push({
      id: uid('adv'), kind: 'newnode', severity: 'warn',
      title: 'NIEUWE NODE AANBEVOLEN',
      body: `${g.unit.name.split('(')[0].trim()} opereert ${fmt1(g.km)}km van dichtstbijzijnde node (>150km-drempel). Advies: micro-depot bouwen in de buurt.`,
      action: (factor = 1) => { buildMicroDepotNear(s, g.unit, factor); }, unitId: g.unit.id,
    });
  });
  olbmEnergyPriority(s).forEach(e => {
    advice.push({
      id: uid('adv'), kind: 'energy', severity: 'info',
      title: `ENERGIEPRIORITERING — Sector ${e.sector}`,
      body: `Class X gemiddeld ${fmt1(e.avgX)}% bij ${e.units} eenheden. Advies: herprioriteer energyhub-capaciteit naar deze sector.`,
      action: (factor = 1) => { s.nodes.filter(n => n.type === 'energy').forEach(n => { if (n.stock.X > 20) n.stock.X -= 10 * factor; }); s.units.forEach(u => { if (u.x >= e.sector * 4 && u.x < e.sector * 4 + 4) u.stock.X = clamp(u.stock.X + 15 * factor, 0, 100); }); },
    });
  });
  s.aiAdvice = advice.slice(0, 8);
}

/* ---- Handmatige depotbouw (speleractie B: "Depots opbouwen of verplaatsen") ---- */
function buildNewNodeAt(s, type, gx, gy) {
  const cost = NODE_BUILD_COST[type];
  if (!cost) return { ok: false, msg: 'Onbekend nodetype.' };
  const target = { x: gx, y: gy };
  const payers = s.nodes.filter(n => !n.underConstruction && Object.keys(cost).every(c => (n.stock[c] || 0) >= cost[c]))
    .sort((a, b) => dist(a, target) - dist(b, target));
  const payer = payers[0];
  if (!payer) return { ok: false, msg: 'Geen enkele node heeft genoeg Class VII/IV/IX-voorraad om dit te bekostigen.' };
  Object.keys(cost).forEach(c => { payer.stock[c] -= cost[c]; });
  const t = NODE_TYPES[type];
  const capBase = NODE_CAP_BASE[type];
  const node = {
    id: uid('nd'), type, name: `${t.label} ${s.nodes.length + 1} (nieuw)`,
    x: gx, y: gy, stock: {}, capacity: {}, vulnerability: 0.15, underAttackUntil: 0,
    underConstruction: true, constructionCompletePhase: absPhase(s) + NODE_BUILD_PHASES[type],
  };
  t.classes.forEach(c => { node.capacity[c] = capBase * (DAY_CLASSES.includes(c) ? 1 : 0.6); node.stock[c] = node.capacity[c] * 0.2; });
  s.nodes.push(node);
  s.messages.push(mkMsg(`Bouw gestart: ${node.name}, gefinancierd vanuit ${payer.name}. Voltooiing over ${NODE_BUILD_PHASES[type] * CFG.PHASE_HOURS}u.`));
  return { ok: true, node };
}

function relocateMicroDepot(s, nodeId, gx, gy) {
  const nd = s.nodes.find(n => n.id === nodeId);
  if (!nd || nd.type !== 'microdepot') return { ok: false, msg: 'Alleen mobiele micro-depots kunnen verplaatst worden.' };
  const lossFrac = 0.15;
  Object.keys(nd.stock).forEach(c => { nd.stock[c] *= (1 - lossFrac); });
  nd.x = gx; nd.y = gy;
  s.messages.push(mkMsg(`${nd.name} verplaatst — ${Math.round(lossFrac * 100)}% evacuatieverlies geleden.`, 'warn'));
  return { ok: true };
}

function buildMicroDepotNear(s, unit, factor = 1) {
  const stockAt = Math.round(60 * clamp(factor, 0.25, 1.5));
  s.nodes.push({
    id: uid('nd'), type: 'microdepot', name: `Mobiel Micro-Depot ${s.nodes.length + 1}`,
    x: unit.x - 1, y: unit.y, stock: { I: stockAt, III: stockAt, V: stockAt, VIII: stockAt },
    capacity: { I: 120, III: 120, V: 120, VIII: 120 }, vulnerability: 0.15, underAttackUntil: 0,
  });
  s.messages.push(mkMsg(`Nieuw micro-depot opgebouwd nabij ${unit.name.split('(')[0].trim()}.`, 'good'));
}

function evaluateDecisionDebt(s) {
  const now = s.day * CFG.PHASES_PER_DAY + s.phase;
  s.decisionDebt.log.forEach(entry => {
    if (entry.checked || now - entry.at < 2) return;
    entry.checked = true;
    const u = s.units.find(un => un.id === entry.unitId);
    if (!u) return;
    const bad = u.lossesFrac > entry.lossesFracAt || (entry.cls && u.stock[entry.cls] < 0.3);
    entry.outcomeBad = bad;
    if (entry.action === 'ignore' && bad) {
      s.decisionDebt.ignoredBad++;
      s.messages.push(mkMsg(`Decision Debt: negeren van advies voor ${u.name.split('(')[0].trim()} pakte slecht uit.`, 'warn'));
    }
  });
}

function updateOoda(s) {
  const now = s.day * CFG.PHASES_PER_DAY + s.phase;
  const dataAge = 0; // sensordata wordt elke fase ververst in deze simulatie
  s.ooda.observe = dataAge > 6 ? 0 : (dataAge > 2 ? 0.5 : 1);
  const conflicting = s.enemy.filter(e => e.detected).length > 0 && rng() < 0.15;
  s.ooda.orient = conflicting ? 0.5 : 1;
}

/* ---------------------------------------------------------------------- */
/* 6. VIJAND AI (ROOD)                                                     */
/* ---------------------------------------------------------------------- */
function enemyStrategicPhase(day) { return day <= 20 ? 'vertraging' : (day <= 50 ? 'corrosion' : 'counterstrike'); }

function enemyAiAct(s) {
  const diff = DIFFICULTIES.find(d => d.id === s.difficultyId) || DIFFICULTIES[1];
  const stratPhase = enemyStrategicPhase(s.day);
  const activity = diff.aggressiveness * (stratPhase === 'vertraging' ? 0.6 : stratPhase === 'corrosion' ? 1.0 : 1.4);

  if (rng() < 0.15 * activity) {
    const cor = rngPick(s.corridors);
    if (cor) {
      const impact = rngRange(0.1, 0.35) * activity;
      cor.vulnerability = clamp(cor.vulnerability + impact * 0.3, 0, 0.9);
      cor.recentAttack = (cor.recentAttack || 0) + impact;
      s.messages.push(mkMsg(`Vijandelijke actie op ${cor.name} (${stratPhase}).`, 'warn'));
    }
  }
  if (stratPhase !== 'vertraging' && rng() < 0.1 * activity) {
    const targets = diff.deepfake ? s.nodes.filter(n => n.type === 'energy' || n.type === 'hub') : s.nodes;
    const node = rngPick(targets.length ? targets : s.nodes);
    if (node) {
      node.underAttackUntil = s.day + 1;
      Object.keys(node.stock).forEach(c => { node.stock[c] *= (1 - rngRange(0.05, 0.2) * activity * 0.3); });
      s.messages.push(mkMsg(`Node onder aanval: ${node.name}.`, 'crit'));
    }
  }
  if (diff.ew && rng() < 0.08 * activity) {
    s.units.filter(u => u.type === 'drone').forEach(u => { if (rng() < 0.3) u.stock.X = clamp(u.stock.X - 15, 0, 100); });
  }
  if (diff.deepfake && rng() < 0.05) {
    const e = rngPick(s.enemy.filter(x => !x.eliminated));
    if (e) e.detected = !e.detected; // sensor-spoofing
  }
  if (stratPhase === 'counterstrike' && rng() < 0.08 * activity) {
    s.enemy.filter(e => !e.eliminated && rng() < 0.3).forEach(e => { e.x -= rngRange(2, 6); });
    s.messages.push(mkMsg('Grootschalige tegenaanval gedetecteerd — Rood manoeuvreert.', 'crit'));
  }
  if (diff.deepfake && stratPhase === 'counterstrike' && rng() < 0.04 * activity) {
    const hq = s.nodes.find(n => n.id === s.hqNodeId);
    if (hq && hq.integrity > 0) {
      hq.integrity = clamp(hq.integrity - rngRange(15, 30), 0, 100);
      hq.underAttackUntil = s.day + 1;
      s.messages.push(mkMsg(`⚠ KERNCOMMANDO ONDER ZWARE AANVAL — integriteit nog ${Math.round(hq.integrity)}%!`, 'crit'));
    }
  }
}

/* ---------------------------------------------------------------------- */
/* 7. EVENT CARDS                                                          */
/* ---------------------------------------------------------------------- */
const EVENT_POOL = [
  { id: 'brug', w: 3, title: 'Brug opgeblazen', text: 'Spoorlijn onderbroken. Herstel: 3-5 dagen, of pontonbrug (1 dag, 50% capaciteit).',
    apply: s => { const cor = rngPick(s.corridors.filter(c => c.mode === 'spoor')) || rngPick(s.corridors); if (cor) { cor.vulnerability = clamp(cor.vulnerability + 0.4, 0, 0.95); cor.bridgeDownUntil = s.day + rngInt(3, 5); } } },
  { id: 'sabotage', w: 3, title: 'Sabotage in de achterhoede', text: 'Civiele transporteurs weigeren te rijden. Class I-voorraad daalt 30% voor 2 dagen.',
    apply: s => { s.nodes.forEach(n => { if ('I' in n.stock) n.stock.I *= 0.7; }); } },
  { id: 'dronezwerm', w: 3, title: 'Drone-zwerm aanval', text: '20+ FPV-drones richten zich op een corridor. Escortes vereist, of 12u vertraging.',
    apply: s => { const cor = rngPick(s.corridors); if (cor) { cor.vulnerability = clamp(cor.vulnerability + 0.3, 0, 0.95); } } },
  { id: 'medevac', w: 2, title: 'Medische evacuatie-crisis', text: 'Veldhospitalen overstroomd. Herprioriteer helikopters naar MEDEVAC.',
    apply: s => { s.nodes.filter(n => n.type === 'medical').forEach(n => { n.stock.VIII *= 0.6; }); } },
  { id: 'corruptie', w: 2, title: 'Corruptie-onthulling', text: '15% van voorraden in een depot blijkt niet te bestaan. Morale daalt, politieke druk stijgt.',
    apply: s => { const nd = rngPick(s.nodes); if (nd) Object.keys(nd.stock).forEach(c => nd.stock[c] *= 0.85); s.politicalCapital = clamp(s.politicalCapital - 4, 0, 100); } },
  { id: 'supplychain', w: 2, title: 'Westerse supply chain verstoord', text: 'Class IX (halfgeleiders) niet beschikbaar voor 5 dagen. Drone-uitval stijgt.',
    apply: s => { s.units.filter(u => u.type === 'drone').forEach(u => { u.stock.IX = clamp(u.stock.IX - 25, 0, 100); }); } },
];

function checkEventCard(s) {
  const daysSince = s.day - s.lastEventDay;
  if (daysSince >= 2 && s.phase === 0 && rng() < 0.35) {
    const ev = weightedPick(EVENT_POOL);
    ev.apply(s);
    s.lastEventDay = s.day;
    s.eventLog.push({ day: s.day, title: ev.title, text: ev.text });
    s.messages.push(mkMsg(`EVENT: ${ev.title} — ${ev.text}`, 'warn'));
  }
}

/* ---------------------------------------------------------------------- */
/* 8. POLITIEKE LAAG                                                       */
/* ---------------------------------------------------------------------- */
const DIRECTIVES = [
  { id: 'versnel', title: 'Versnel de opmars', text: 'Politieke druk voor resultaten vóór volgende maand.',
    riskNote: 'Logistiek risico: depots overslaan verhoogt kwetsbaarheid.',
    onAccept: s => { s.politicalCapital = clamp(s.politicalCapital + 8, 0, 100); s.corridors.forEach(c => c.vulnerability = clamp(c.vulnerability + 0.08, 0, 0.9)); },
    onDecline: s => { s.politicalCapital = clamp(s.politicalCapital - 6, 0, 100); } },
  { id: 'burgers', title: 'Minimaliseer burgercasualties', text: 'Geen artillerie binnen 5km van steden.',
    riskNote: 'Tactisch risico: infanterie moet meer doen, Class VIII-verbruik stijgt.',
    onAccept: s => { s.politicalCapital = clamp(s.politicalCapital + 6, 0, 100); s.units.filter(u => u.system === 'infanterie').forEach(u => u.stock.VIII = clamp(u.stock.VIII - 0.5, 0, 20)); },
    onDecline: s => { s.politicalCapital = clamp(s.politicalCapital - 8, 0, 100); } },
  { id: 'precisie', title: 'Conserveer precisiemunitie', text: 'Internationale voorraad is beperkt.',
    riskNote: 'Economisch risico: artillerie/drones moeten selectiever inzetten.',
    onAccept: s => { s.politicalCapital = clamp(s.politicalCapital + 5, 0, 100); s.nodes.forEach(n => { if ('V' in n.stock) n.capacity.V *= 0.9; }); },
    onDecline: s => { s.politicalCapital = clamp(s.politicalCapital - 5, 0, 100); } },
];

/* ---- Handmatige corridorbeveiliging (speleractie D: "Corridors beveiligen of herrouteren") ---- */
function corridorAvgY(s, cor) {
  const chain = cor.nodeChain.map(id => s.nodes.find(n => n.id === id)).filter(Boolean);
  if (!chain.length) return 0;
  return chain.reduce((a, n) => a + n.y, 0) / chain.length;
}

function assignEscort(s, corridorId) {
  const cor = s.corridors.find(c => c.id === corridorId);
  if (!cor) return { ok: false, msg: 'Corridor niet gevonden.' };
  const chain = cor.nodeChain.map(id => s.nodes.find(n => n.id === id)).filter(Boolean);
  const candidates = s.units.filter(u => u.lossesFrac < 1 && u.system === 'artillerie' && u.status !== 'escort' && u.status !== 'engaged')
    .map(u => ({ u, d: Math.min(...chain.map(n => dist(u, n))) }))
    .filter(x => x.d <= 80)
    .sort((a, b) => a.d - b.d);
  if (!candidates.length) return { ok: false, msg: 'Geen beschikbare pantser/artillerie-eenheid binnen bereik (80km) van deze corridor.' };
  const u = candidates[0].u;
  u.status = 'escort'; u.autoAdvance = false; u.escortCorridorId = corridorId;
  u.escortUntil = absPhase(s) + CFG.PHASES_PER_DAY; // 1 dag escorte
  cor.vulnerability = clamp(cor.vulnerability - 0.15, 0.02, 0.95);
  cor.escortUntil = u.escortUntil;
  s.messages.push(mkMsg(`Escorte toegewezen: ${u.name.split('(')[0].trim()} beveiligt ${cor.name} voor 24u (kan niet oprukken zolang escorte loopt).`, 'good'));
  return { ok: true };
}

function rerouteCorridor(s, corridorId) {
  const cor = s.corridors.find(c => c.id === corridorId);
  if (!cor) return { ok: false, msg: 'Corridor niet gevonden.' };
  const myY = corridorAvgY(s, cor);
  const alt = s.corridors.filter(c => c.id !== corridorId)
    .map(c => ({ c, dy: Math.abs(corridorAvgY(s, c) - myY) }))
    .sort((a, b) => a.dy - b.dy)[0];
  if (!alt || alt.dy > s.gridH * 0.3) return { ok: false, msg: 'Geen secundaire corridor beschikbaar in dit gebied.' };
  cor.vulnerability = clamp(cor.vulnerability - 0.2, 0.02, 0.95);
  alt.c.vulnerability = clamp(alt.c.vulnerability + 0.08, 0, 0.9);
  s.messages.push(mkMsg(`Herrouteert: doorvoer van ${cor.name} deels via ${alt.c.name} — langzamer maar veiliger, extra last op ${alt.c.name}.`, 'good'));
  return { ok: true };
}

function checkPoliticalDirective(s) {
  if (s.day - s.lastDirectiveDay >= 10 && s.phase === 0 && s.day > 1) {
    s.lastDirectiveDay = s.day;
    const dir = rngPick(DIRECTIVES);
    UI.paused = true;
    showDirectiveModal(dir);
  }
}

/* ---------------------------------------------------------------------- */
/* 9. RENDERING                                                            */
/* ---------------------------------------------------------------------- */
function resizeCanvas() {
  const canvas = document.getElementById('map-canvas');
  const wrap = document.getElementById('map-wrap');
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = wrap.clientWidth * dpr;
  canvas.height = wrap.clientHeight * dpr;
  canvas.style.width = wrap.clientWidth + 'px';
  canvas.style.height = wrap.clientHeight + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function mapToPx(s, gx, gy) {
  const canvas = document.getElementById('map-canvas');
  const w = canvas.clientWidth, h = canvas.clientHeight;
  const pad = 16;
  const cellW = (w - pad * 2) / s.gridW, cellH = (h - pad * 2) / s.gridH;
  return { px: pad + gx * cellW, py: pad + gy * cellH, cellW, cellH };
}

function renderMap() {
  const s = GameState;
  const canvas = document.getElementById('map-canvas');
  if (!canvas || !s) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.clientWidth, h = canvas.clientHeight;
  ctx.clearRect(0, 0, w, h);

  // terrein
  for (let y = 0; y < s.gridH; y++) {
    for (let x = 0; x < s.gridW; x++) {
      const cell = s.terrainGrid[y][x];
      const { px, py, cellW, cellH } = mapToPx(s, x, y);
      ctx.fillStyle = cell.known ? TERRAIN[cell.terrain].color : '#161712';
      ctx.fillRect(px, py, cellW + 0.6, cellH + 0.6);
      if (!cell.known) { ctx.fillStyle = 'rgba(0,0,0,0.35)'; ctx.fillRect(px, py, cellW + 0.6, cellH + 0.6); }
    }
  }

  // objectief
  {
    const { px, py, cellH } = mapToPx(s, s.gridW - 1, 0);
    ctx.strokeStyle = '#ffbf00'; ctx.setLineDash([4, 3]); ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(px, 0); ctx.lineTo(px, h); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = '#ffbf00'; ctx.font = '10px monospace'; ctx.fillText('OMEGA', px - 30, 14);
  }

  // corridors
  for (const cor of s.corridors) {
    const chain = cor.nodeChain.map(id => s.nodes.find(n => n.id === id)).filter(Boolean);
    if (chain.length < 2) continue;
    ctx.strokeStyle = cor.status === 'onderbroken' ? '#ff3333' : cor.status === 'onder_druk' ? '#ffbf00' : '#4caf50';
    ctx.lineWidth = (cor.mode === 'spoor' ? 2.4 : 1.4) + (cor.id === UI.selectedCorridorId ? 1.6 : 0);
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    chain.forEach((n, i) => { const { px, py } = mapToPx(s, n.x, n.y); if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    ctx.stroke();
    ctx.globalAlpha = 1;
    if (cor.escortUntil && cor.escortUntil > absPhase(s)) {
      const mid = chain[Math.floor(chain.length / 2)];
      const { px, py } = mapToPx(s, mid.x, mid.y);
      ctx.fillStyle = '#87ceeb'; ctx.font = '10px monospace'; ctx.fillText('🛡', px - 5, py - 8);
    }
  }

  // nodes
  for (const nd of s.nodes) {
    const { px, py } = mapToPx(s, nd.x, nd.y);
    const t = NODE_TYPES[nd.type];
    const avgStock = Object.keys(nd.stock).reduce((a, c) => a + nd.stock[c] / Math.max(1, nd.capacity[c]), 0) / Object.keys(nd.stock).length;
    let color = avgStock > 0.4 ? '#4caf50' : avgStock > 0.15 ? '#ffbf00' : '#ff3333';
    ctx.beginPath(); ctx.arc(px, py, t.radius, 0, Math.PI * 2);
    if (nd.underConstruction) { ctx.setLineDash([2, 2]); ctx.strokeStyle = '#ffbf00'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([]); }
    else {
      ctx.fillStyle = color; ctx.globalAlpha = 0.85; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = t.color; ctx.lineWidth = 1.4; ctx.stroke();
    }
    if (nd.isHQ) {
      ctx.strokeStyle = '#ffbf00'; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(px, py, t.radius + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = '#ffbf00'; ctx.font = 'bold 9px monospace'; ctx.fillText('HQ', px + t.radius + 5, py + 3);
    }
    if (nd.underAttackUntil > s.day) { ctx.strokeStyle = '#ff3333'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, t.radius + 3 + Math.sin(Date.now() / 150) * 2, 0, Math.PI * 2); ctx.stroke(); }
    if (nd.id === UI.selectedNodeId) { ctx.strokeStyle = '#87ceeb'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(px, py, t.radius + 5, 0, Math.PI * 2); ctx.stroke(); }
  }

  // vijand
  for (const e of s.enemy) {
    if (e.eliminated || !e.detected) continue;
    const { px, py } = mapToPx(s, e.x, e.y);
    ctx.fillStyle = '#ff3333';
    ctx.beginPath(); ctx.moveTo(px, py - 5); ctx.lineTo(px + 5, py + 4); ctx.lineTo(px - 5, py + 4); ctx.closePath(); ctx.fill();
  }

  // eigen eenheden
  const PRIORITY_COLOR = { P1: '#ff3333', P2: '#ffbf00', P3: null, P4: '#6b6b6b' };
  for (const u of s.units) {
    if (u.lossesFrac >= 1) continue;
    const { px, py } = mapToPx(s, u.x, u.y);
    ctx.fillStyle = u.status === 'engaged' ? '#ff9955' : u.status === 'escort' ? '#7ec8e3' : '#87ceeb';
    ctx.fillRect(px - 4, py - 4, 8, 8);
    ctx.strokeStyle = '#0c0d0a'; ctx.lineWidth = 1; ctx.strokeRect(px - 4, py - 4, 8, 8);
    const pColor = PRIORITY_COLOR[u.priority];
    if (pColor) { ctx.fillStyle = pColor; ctx.fillRect(px + 2, py - 6, 4, 4); }
    if (u.id === UI.selectedUnitId) { ctx.strokeStyle = '#ffbf00'; ctx.lineWidth = 2; ctx.strokeRect(px - 6, py - 6, 12, 12); }
    if (u.degradedFlags && (u.degradedFlags.grounded || u.degradedFlags.noAmmo)) {
      ctx.fillStyle = '#ff3333'; ctx.font = '9px monospace'; ctx.fillText('!', px + 5, py - 4);
    }
  }

  // konvooien onderweg
  for (const cv of s.convoys) {
    const frac = clamp((absPhase(s) - cv.startPhase) / Math.max(0.01, cv.etaPhases), 0, 1);
    const gx = cv.fromX + (cv.toX - cv.fromX) * frac, gy = cv.fromY + (cv.toY - cv.fromY) * frac;
    const { px, py } = mapToPx(s, gx, gy);
    const cvColor = { I: '#4caf50', III: '#cccccc', IV: '#b5a642', V: '#ff3333', VI: '#87ceeb', VII: '#6f8a3f', VIII: '#e0e0e0', IX: '#ffbf00', X: '#7ec8e3' }[cv.cls] || '#87ceeb';
    ctx.beginPath(); ctx.arc(px, py, 3, 0, Math.PI * 2);
    ctx.fillStyle = cvColor; ctx.fill(); ctx.strokeStyle = '#0c0d0a'; ctx.lineWidth = 0.8; ctx.stroke();
  }

  if (s.corridorAlertUntil && s.day * CFG.PHASES_PER_DAY + s.phase < s.corridorAlertUntil) {
    document.getElementById('corridor-collapse-alert').classList.remove('hidden');
  } else {
    document.getElementById('corridor-collapse-alert').classList.add('hidden');
  }
}

function renderAll() {
  const s = GameState; if (!s) return;
  document.getElementById('hdr-day').textContent = s.day;
  document.getElementById('hdr-time').textContent = String(s.phase * CFG.PHASE_HOURS).padStart(2, '0') + ':00';
  document.getElementById('hdr-weather').textContent = `${s.weather}, ${s.season}`;
  document.getElementById('hdr-scenario').textContent = s.scenarioName;
  document.getElementById('hdr-political').textContent = Math.round(s.politicalCapital) + '%';

  const setDot = (id, v) => { const el = document.querySelector(`#${id} .ooda-dot`); if (!el) return; el.className = 'ooda-dot ' + (v >= 1 ? 'g' : v >= 0.5 ? 'o' : 'r'); };
  setDot('ooda-observe', s.ooda.observe); setDot('ooda-orient', s.ooda.orient);

  renderMessages(s);
  renderFlow(s); renderClasses(s); renderTransport(s); renderNodeList(s);
  renderOlbm(s); renderAlerts(s); renderEventLog(s); renderPolitical(s);
}

function renderMessages(s) {
  const el = document.getElementById('message-stream');
  const last = s.messages.slice(-6).map(m => `[D${m.day}] ${m.text}`).join('   •   ');
  el.textContent = last;
}

function renderFlow(s) {
  const el = document.getElementById('flow-diagram');
  const classColors = { I: '#4caf50', III: '#333', V: '#ff3333', VIII: '#e0e0e0', X: '#87ceeb' };
  let html = '<div class="card-sub">Strategische Hub → Spoor → Distributiepunt → Vrachtwagens → FARP/Micro-Depot → Eenheid</div>';
  const totalsByClass = {};
  ['I', 'III', 'V', 'VIII', 'X'].forEach(c => { totalsByClass[c] = s.nodes.reduce((a, n) => a + (n.stock[c] || 0), 0); });
  const maxV = Math.max(1, ...Object.values(totalsByClass));
  Object.entries(totalsByClass).forEach(([c, v]) => {
    html += `<div class="bar-row"><span class="bar-label">${c}</span><div class="bar-track"><div class="bar-fill" style="width:${(v / maxV * 100).toFixed(0)}%;background:${classColors[c]}"></div></div><span class="bar-val">${Math.round(v)}t</span></div>`;
  });
  html += `<div class="card-sub" style="margin-top:10px;">Transportverlies totaal: ${s.stats.transportTotalTon > 0 ? fmt1(100 * s.stats.transportLossesTon / s.stats.transportTotalTon) : '0.0'}%</div>`;
  el.innerHTML = html;
}

function renderClasses(s) {
  const el = document.getElementById('classes-dashboard');
  let html = '';
  const allClasses = [...DAY_CLASSES, ...PCT_CLASSES];
  allClasses.forEach(c => {
    const avg = c in {}; // noop
    const vals = s.units.filter(u => u.lossesFrac < 1).map(u => u.stock[c]);
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
    const isDay = DAY_CLASSES.includes(c);
    const pct = isDay ? clamp(mean / 6 * 100, 0, 100) : mean;
    const cls = pct > 50 ? '' : pct > 20 ? 'warn' : 'crit';
    const infoId = 'info-' + c;
    html += `<div class="card">
      <div class="card-title">${CLASS_LABEL[c]} ${c === 'III' ? `<span class="tooltip-info" data-q="classIII" style="cursor:pointer;color:#ffbf00;">ⓘ</span>` : ''}</div>
      <div class="bar-row"><div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct.toFixed(0)}%"></div></div><span class="bar-val">${isDay ? fmt1(mean) + 'd' : Math.round(mean) + '%'}</span></div>
    </div>`;
  });
  el.innerHTML = html;
  el.querySelectorAll('.tooltip-info').forEach(b => b.onclick = (ev) => showQuoteTooltip(ev, b.dataset.q));
}

function renderTransport(s) {
  const el = document.getElementById('transport-list');
  let html = '';
  s.corridors.forEach(cor => {
    const tag = cor.status === 'onderbroken' ? 'tag-crit' : cor.status === 'onder_druk' ? 'tag-warn' : 'tag-ok';
    html += `<div class="card"><div class="card-title">${cor.name} <span class="tag ${tag}">${cor.status}</span></div>
      <div class="card-sub">Modus: ${cor.mode} · Kwetsbaarheid: ${Math.round(cor.vulnerability * 100)}% · Nodes: ${cor.nodeChain.length}</div></div>`;
  });
  el.innerHTML = html || '<div class="card-sub">Geen corridors.</div>';
}

function renderNodeList(s) {
  const el = document.getElementById('node-list');
  const filter = (document.getElementById('node-filter').value || '').toLowerCase();
  let html = '';
  s.nodes.filter(n => !filter || n.name.toLowerCase().includes(filter) || n.type.includes(filter)).slice(0, 150).forEach(nd => {
    const avgStock = Object.keys(nd.stock).reduce((a, c) => a + nd.stock[c] / Math.max(1, nd.capacity[c]), 0) / Object.keys(nd.stock).length;
    const tag = avgStock > 0.4 ? 'tag-ok' : avgStock > 0.15 ? 'tag-warn' : 'tag-crit';
    html += `<div class="card node-row" data-id="${nd.id}" style="cursor:pointer;">
      <div class="card-title">${nd.name} <span class="tag ${tag}">${Math.round(avgStock * 100)}%</span></div>
      <div class="card-sub">${NODE_TYPES[nd.type].label}${nd.underAttackUntil > s.day ? ' · ⚠ ONDER AANVAL' : ''}</div>
    </div>`;
  });
  el.innerHTML = html;
  el.querySelectorAll('.node-row').forEach(r => r.onclick = () => { UI.selectedNodeId = r.dataset.id; openNodeModal(r.dataset.id); });
}

function renderOlbm(s) {
  document.getElementById('olbm-phase-label').textContent = `Fase ${String(s.phase * CFG.PHASE_HOURS).padStart(2, '0')}:00`;
  const el = document.getElementById('olbm-advice-list');
  if (!s.aiAdvice.length) { el.innerHTML = '<div class="card-sub">Geen kritieke adviezen deze fase.</div>'; return; }
  let html = '';
  s.aiAdvice.forEach(a => {
    html += `<div class="card advice-card ${a.severity}">
      <div class="advice-title">${a.kind === 'critical' ? '⚠️' : a.kind === 'forecast' ? '📊' : a.kind === 'newnode' ? '🗺️' : '⚡'} ${a.title}</div>
      <div class="advice-body">${a.body}</div>
      <div class="advice-actions">
        <button class="accept" data-id="${a.id}" data-act="accept" ${a.action ? '' : 'disabled'}>ACCEPT</button>
        <button class="adjust" data-id="${a.id}" data-act="adjust" ${a.action ? '' : 'disabled'}>ADJUST</button>
        <button class="ignore" data-id="${a.id}" data-act="ignore">IGNORE</button>
      </div>
    </div>`;
  });
  el.innerHTML = html;
  el.querySelectorAll('button[data-act]').forEach(b => b.onclick = () => handleAdviceAction(b.dataset.id, b.dataset.act));
}

function handleAdviceAction(adviceId, act) {
  const s = GameState;
  const adv = s.aiAdvice.find(a => a.id === adviceId);
  if (!adv) return;
  const u = s.units.find(un => un.id === adv.unitId);
  const debtEntry = { at: s.day * CFG.PHASES_PER_DAY + s.phase, unitId: adv.unitId, action: act, cls: adv.cls, lossesFracAt: u ? u.lossesFrac : 0, checked: false };
  if (act === 'accept' && adv.action) { adv.action(); s.decisionDebt.accepted++; s.messages.push(mkMsg(`OLBM-advies geaccepteerd: ${adv.title}.`, 'good')); }
  else if (act === 'adjust' && adv.action) { openAdjustModal(adv); s.decisionDebt.adjusted++; }
  else if (act === 'ignore') { s.decisionDebt.ignored++; s.decisionDebt.log.push(debtEntry); s.messages.push(mkMsg(`OLBM-advies genegeerd: ${adv.title}.`, 'warn')); }
  s.aiAdvice = s.aiAdvice.filter(a => a.id !== adviceId);
  renderAll();
}

function renderAlerts(s) {
  const el = document.getElementById('alerts-list');
  const crit = olbmCriticalityScan(s);
  let html = crit.map(c => `<div class="card"><div class="card-title">${c.unit.name.split('(')[0].trim()} <span class="tag tag-crit">${c.shortage}</span></div>
    <div class="card-sub">Min. voorraad: ${fmt1(Math.min(c.unit.stock.V, c.unit.stock.III, c.unit.stock.I))} dagen</div></div>`).join('');
  const underAttack = s.nodes.filter(n => n.underAttackUntil > s.day);
  html += underAttack.map(n => `<div class="card"><div class="card-title">${n.name} <span class="tag tag-crit">AANVAL</span></div></div>`).join('');
  el.innerHTML = html || '<div class="card-sub">Geen actieve kritieke alerts.</div>';
}

function renderEventLog(s) {
  const el = document.getElementById('event-log-list');
  el.innerHTML = s.eventLog.slice().reverse().slice(0, 30).map(e => `<div class="log-line warn"><span class="t">D${e.day}</span>${e.title} — ${e.text}</div>`).join('') || '<div class="card-sub">Nog geen events.</div>';
}

function renderPolitical(s) {
  const el = document.getElementById('political-panel');
  const pct = s.politicalCapital;
  const cls = pct > 50 ? '' : pct > 20 ? 'warn' : 'crit';
  el.innerHTML = `<div class="card"><div class="card-title">Politiek Krediet</div>
    <div class="bar-row"><div class="bar-track"><div class="bar-fill ${cls}" style="width:${pct}%"></div></div><span class="bar-val">${Math.round(pct)}%</span></div>
    <div class="card-sub">Onder 20% wordt u vervangen als J-4.</div></div>
    <div class="card-sub">Directives verschijnen elke 10 dagen. Volgende: dag ${s.lastDirectiveDay + 10}.</div>`;
}

function showQuoteTooltip(ev, key) {
  const el = document.getElementById('map-tooltip');
  el.innerHTML = `<span class="tooltip-cite">${QUOTES[key]}</span>`;
  el.style.left = (ev.clientX + 12) + 'px'; el.style.top = (ev.clientY + 12) + 'px';
  el.classList.remove('hidden');
  setTimeout(() => el.classList.add('hidden'), 4500);
}

/* ---------------------------------------------------------------------- */
/* 10. UI / INTERACTIE                                                     */
/* ---------------------------------------------------------------------- */
function openNodeModal(nodeId) {
  const s = GameState; const nd = s.nodes.find(n => n.id === nodeId); if (!nd) return;
  if (nd.underConstruction) {
    setModal(`
      <h2>${nd.name}</h2>
      <p>🚧 In aanbouw — voltooiing over ${Math.max(0, Math.round((nd.constructionCompletePhase - absPhase(s)) * CFG.PHASE_HOURS))}u.</p>
      <div class="modal-actions"><button id="modal-close" class="primary">Sluiten</button></div>
    `);
    document.getElementById('modal-close').onclick = closeModal;
    return;
  }
  const rows = Object.keys(nd.stock).map(c => `<tr><td>${CLASS_LABEL[c]}</td><td>${Math.round(nd.stock[c])} / ${Math.round(nd.capacity[c])}</td></tr>`).join('');

  const unitOptions = s.units.filter(u => u.lossesFrac < 1).map(u => `<option value="unit:${u.id}">${u.name.split('(')[0].trim()} (${u.priority})</option>`).join('');
  const nodeOptions = s.nodes.filter(n => n.id !== nd.id && !n.underConstruction).map(n => `<option value="node:${n.id}">${n.name}</option>`).join('');
  const classOptions = Object.keys(nd.stock).map(c => `<option value="${c}">${CLASS_LABEL[c]}</option>`).join('');

  setModal(`
    <h2>${nd.name}${nd.isHQ ? ' 🎖 (Kerncommando)' : ''}</h2>
    <p>${NODE_TYPES[nd.type].label} · Kwetsbaarheid ${Math.round(nd.vulnerability * 100)}% ${nd.underAttackUntil > s.day ? '· <strong style="color:#ff3333">ONDER AANVAL</strong>' : ''}${nd.isHQ ? ` · Integriteit ${Math.round(nd.integrity)}%` : ''}</p>
    <table><thead><tr><th>Klasse</th><th>Voorraad / Capaciteit</th></tr></thead><tbody>${rows}</tbody></table>

    <h3>Stuur voorraad</h3>
    <p style="font-size:0.8rem;">Kies bestemming, klasse, hoeveelheid en transportmodus. Het systeem toont ETA en risico voordat je verstuurt.</p>
    <label style="font-size:0.75rem;color:var(--text-dim);">Bestemming</label>
    <select id="send-target" style="width:100%;padding:6px;background:var(--bg-2);color:var(--text-0);border:1px solid var(--border);border-radius:4px;margin-bottom:6px;">
      <optgroup label="Eenheden">${unitOptions}</optgroup>
      <optgroup label="Nodes">${nodeOptions}</optgroup>
    </select>
    <label style="font-size:0.75rem;color:var(--text-dim);">Klasse</label>
    <select id="send-class" style="width:100%;padding:6px;background:var(--bg-2);color:var(--text-0);border:1px solid var(--border);border-radius:4px;margin-bottom:6px;">${classOptions}</select>
    <label style="font-size:0.75rem;color:var(--text-dim);">Transportmodus</label>
    <select id="send-mode" style="width:100%;padding:6px;background:var(--bg-2);color:var(--text-0);border:1px solid var(--border);border-radius:4px;margin-bottom:6px;"></select>
    <label style="font-size:0.75rem;color:var(--text-dim);">Hoeveelheid: <span id="send-amount-val">0</span></label>
    <input id="send-amount" type="range" min="1" max="100" value="10" style="width:100%;">
    <p id="send-eta-risk" class="card-sub" style="margin-top:6px;"></p>
    <div class="modal-actions">
      <button id="send-confirm" class="primary">Verstuur</button>
      ${nd.type === 'microdepot' ? '<button id="node-relocate">Verplaats depot</button>' : ''}
      <button id="modal-close">Sluiten</button>
    </div>
  `);
  document.getElementById('modal-close').onclick = closeModal;

  function currentTarget() {
    const val = document.getElementById('send-target').value;
    if (!val) return null;
    const [type, id] = val.split(':');
    return { targetType: type, target: type === 'unit' ? s.units.find(u => u.id === id) : s.nodes.find(n => n.id === id) };
  }
  function refreshModes() {
    const { targetType, target } = currentTarget() || {};
    const modeSel = document.getElementById('send-mode');
    if (!target) { modeSel.innerHTML = ''; return; }
    const modes = availableTransportModes(nd, target, targetType);
    modeSel.innerHTML = modes.map(m => `<option value="${m}">${TRANSPORT_MODES[m].label}</option>`).join('');
    refreshEtaRisk();
  }
  function refreshEtaRisk() {
    const { targetType, target } = currentTarget() || {};
    const mode = document.getElementById('send-mode').value;
    const cls = document.getElementById('send-class').value;
    const amt = Number(document.getElementById('send-amount').value);
    document.getElementById('send-amount-val').textContent = amt;
    if (!target || !mode) { document.getElementById('send-eta-risk').textContent = ''; return; }
    const { km, eta, risk } = transferEtaRisk(s, nd, target, mode);
    document.getElementById('send-eta-risk').textContent = `Afstand ${fmt1(km)}km · ETA ${fmt1(eta)}u · risico onderweg ${Math.round(risk * 100)}% · beschikbaar: ${fmt1(nd.stock[cls] || 0)}`;
  }
  document.getElementById('send-target').oninput = refreshModes;
  document.getElementById('send-class').oninput = refreshEtaRisk;
  document.getElementById('send-mode').oninput = refreshEtaRisk;
  document.getElementById('send-amount').oninput = refreshEtaRisk;
  refreshModes();

  document.getElementById('send-confirm').onclick = () => {
    const { targetType, target } = currentTarget() || {};
    const mode = document.getElementById('send-mode').value;
    const cls = document.getElementById('send-class').value;
    const amt = Number(document.getElementById('send-amount').value);
    if (!target || !mode) return;
    const res = sendSupply(s, nd.id, target.id, targetType, cls, amt, mode);
    if (!res.ok) s.messages.push(mkMsg(res.msg, 'crit'));
    closeModal(); renderAll();
  };
  const relocBtn = document.getElementById('node-relocate');
  if (relocBtn) relocBtn.onclick = () => {
    UI.relocatingNodeId = nd.id;
    s.messages.push(mkMsg(`Klik op de kaart om ${nd.name} te verplaatsen (kost 15% voorraad als evacuatieverlies).`));
    closeModal(); renderAll();
  };
}

function openUnitModal(unitId) {
  const s = GameState; const u = s.units.find(x => x.id === unitId); if (!u) return;
  const rows = Object.keys(u.stock).map(c => `<tr><td>${CLASS_LABEL[c]}</td><td>${DAY_CLASSES.includes(c) ? fmt1(u.stock[c]) + ' dagen' : Math.round(u.stock[c]) + '%'}</td></tr>`).join('');
  const prioButtons = Object.keys(PRIORITY_LABEL).map(p => `<button class="prio-btn${u.priority === p ? ' selected' : ''}" data-p="${p}">${PRIORITY_LABEL[p]}</button>`).join('');
  const { node: nearest, km } = nearestNode(s, u, ['I', 'III']);
  setModal(`
    <h2>${u.name}</h2>
    <p>Personeel: ${u.personnel.toLocaleString('nl-NL')} · Status: ${u.status} · Moraal: ${Math.round(u.morale)}% · Verliezen: ${Math.round(u.lossesFrac * 100)}%</p>
    <table><thead><tr><th>Klasse</th><th>Voorraad</th></tr></thead><tbody>${rows}</tbody></table>
    <h3>Prioriteit (P1 = kritiek, P4 = laag)</h3>
    <div class="prio-row">${prioButtons}</div>
    <p class="card-sub">Hogere prioriteit krijgt voorrang bij automatische bevoorrading en weegt zwaarder in OLBM-adviezen.</p>
    ${nearest ? `<div class="modal-actions"><button id="request-supply" class="primary">Vraag bevoorrading aan bij ${nearest.name} (${fmt1(km)}km)</button></div>` : ''}
    <div class="modal-actions"><button id="modal-close">Sluiten</button></div>
  `);
  document.getElementById('modal-close').onclick = closeModal;
  document.querySelectorAll('.prio-btn').forEach(b => b.onclick = () => { setUnitPriority(s, u.id, b.dataset.p); openUnitModal(u.id); });
  const reqBtn = document.getElementById('request-supply');
  if (reqBtn) reqBtn.onclick = () => { closeModal(); openNodeModal(nearest.id); };
}

function openCorridorModal(corridorId) {
  const s = GameState; const cor = s.corridors.find(c => c.id === corridorId); if (!cor) return;
  const chainNames = cor.nodeChain.map(id => s.nodes.find(n => n.id === id)).filter(Boolean).map(n => n.name).join(' → ');
  const bridgeDown = cor.bridgeDownUntil && cor.bridgeDownUntil > s.day;
  const escorted = cor.escortUntil && cor.escortUntil > absPhase(s);
  setModal(`
    <h2>${cor.name}</h2>
    <p>Status: <strong>${cor.status}</strong> · Modus: ${cor.mode} · Kwetsbaarheid: ${Math.round(cor.vulnerability * 100)}%${escorted ? ' · 🛡 escorte actief' : ''}${bridgeDown ? ` · brug plat tot dag ${cor.bridgeDownUntil}` : ''}</p>
    <p class="card-sub">Keten: ${chainNames}</p>
    <h3>Acties</h3>
    <p style="font-size:0.8rem;">Een escorte verlaagt de kwetsbaarheid direct, maar bindt een pantser/artillerie-eenheid 24u (die kan dan niet oprukken). Herrouteren verdeelt de last over een naburige corridor.</p>
    <div class="modal-actions">
      <button id="cor-escort" class="primary">Wijs escorte toe</button>
      <button id="cor-reroute">Herrouteer via secundaire corridor</button>
    </div>
    <div class="modal-actions"><button id="modal-close">Sluiten</button></div>
  `);
  document.getElementById('modal-close').onclick = closeModal;
  document.getElementById('cor-escort').onclick = () => { const r = assignEscort(s, cor.id); if (!r.ok) s.messages.push(mkMsg(r.msg, 'crit')); closeModal(); renderAll(); };
  document.getElementById('cor-reroute').onclick = () => { const r = rerouteCorridor(s, cor.id); if (!r.ok) s.messages.push(mkMsg(r.msg, 'crit')); closeModal(); renderAll(); };
}

function openBuildNodeChooser() {
  const options = Object.keys(NODE_BUILD_COST).map(type => {
    const t = NODE_TYPES[type];
    const cost = Object.entries(NODE_BUILD_COST[type]).map(([c, v]) => `${v} ${c}`).join(' + ');
    const hours = NODE_BUILD_PHASES[type] * CFG.PHASE_HOURS;
    return `<button class="opt-btn build-choice" data-type="${type}" style="width:100%;margin-bottom:8px;"><strong>${t.label}</strong>Kost: ${cost} (van dichtstbijzijnde node met genoeg voorraad) · Bouwtijd: ${hours}u</button>`;
  }).join('');
  setModal(`
    <h2>Nieuwe node bouwen</h2>
    <p>Kies een type, klik daarna op de kaart om de locatie te bepalen.</p>
    ${options}
    <div class="modal-actions"><button id="modal-close">Annuleren</button></div>
  `);
  document.getElementById('modal-close').onclick = closeModal;
  document.querySelectorAll('.build-choice').forEach(b => b.onclick = () => {
    UI.buildingNodeType = b.dataset.type;
    GameState.messages.push(mkMsg(`Klik op de kaart om de nieuwe ${NODE_TYPES[b.dataset.type].label} te plaatsen.`));
    closeModal();
  });
}

function openAdjustModal(advice) {
  UI.paused = true;
  setModal(`
    <h2>Advies aanpassen</h2>
    <p>${advice.title}</p>
    <p>${advice.body}</p>
    <p>Pas de hoeveelheid aan als percentage van het voorgestelde advies:</p>
    <input id="adjust-range" type="range" min="25" max="150" value="100" style="width:100%;">
    <p><span id="adjust-val">100</span>%</p>
    <div class="modal-actions">
      <button id="adjust-confirm" class="primary">Uitvoeren</button>
      <button id="adjust-cancel">Annuleren</button>
    </div>
  `);
  document.getElementById('adjust-range').oninput = (e) => { document.getElementById('adjust-val').textContent = e.target.value; };
  document.getElementById('adjust-confirm').onclick = () => {
    const factor = document.getElementById('adjust-range').value / 100;
    advice.action(factor);
    GameState.messages.push(mkMsg(`OLBM-advies aangepast uitgevoerd (${Math.round(factor * 100)}%): ${advice.title}.`, 'good'));
    closeModal(); UI.paused = false; renderAll();
  };
  document.getElementById('adjust-cancel').onclick = () => { closeModal(); UI.paused = false; };
}

function showDirectiveModal(dir) {
  setModal(`
    <h2>STRATEGISCH DIRECTIVE — Hoger Commando</h2>
    <p class="quote">${dir.text}</p>
    <p>${dir.riskNote}</p>
    <div class="modal-actions">
      <button id="dir-accept" class="primary">Accepteren</button>
      <button id="dir-decline" class="danger">Weigeren</button>
    </div>
  `);
  document.getElementById('dir-accept').onclick = () => { dir.onAccept(GameState); GameState.messages.push(mkMsg(`Directive geaccepteerd: ${dir.title}.`, 'good')); closeModal(); UI.paused = false; renderAll(); };
  document.getElementById('dir-decline').onclick = () => { dir.onDecline(GameState); GameState.messages.push(mkMsg(`Directive geweigerd: ${dir.title}.`, 'warn')); closeModal(); UI.paused = false; renderAll(); };
}

function setModal(html) { document.getElementById('modal-content').innerHTML = html; document.getElementById('modal-overlay').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

function wireTabs() {
  document.querySelectorAll('.panel-tabs').forEach(tabs => {
    tabs.querySelectorAll('.tab-btn').forEach(btn => {
      btn.onclick = () => {
        tabs.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const panel = tabs.closest('.panel');
        panel.querySelectorAll('.tab-pane').forEach(p => p.classList.remove('active'));
        panel.querySelector('#tab-' + btn.dataset.tab).classList.add('active');
      };
    });
  });
}

function wireSpeedControl() {
  document.querySelectorAll('.speed-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.speed-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const sp = Number(btn.dataset.speed);
      UI.speed = sp; UI.paused = sp === 0;
    };
  });
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 > 0 ? ((px - x1) * dx + (py - y1) * dy) / len2 : 0;
  t = clamp(t, 0, 1);
  const cx = x1 + t * dx, cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function hitTestMap(s, mx, my) {
  for (const nd of s.nodes) { const { px, py } = mapToPx(s, nd.x, nd.y); if (Math.hypot(px - mx, py - my) < 8) return { type: 'node', obj: nd }; }
  for (const u of s.units) { if (u.lossesFrac >= 1) continue; const { px, py } = mapToPx(s, u.x, u.y); if (Math.hypot(px - mx, py - my) < 7) return { type: 'unit', obj: u }; }
  for (const cor of s.corridors) {
    const chain = cor.nodeChain.map(id => s.nodes.find(n => n.id === id)).filter(Boolean);
    for (let i = 0; i < chain.length - 1; i++) {
      const a = mapToPx(s, chain[i].x, chain[i].y), b = mapToPx(s, chain[i + 1].x, chain[i + 1].y);
      if (distToSegment(mx, my, a.px, a.py, b.px, b.py) < 5) return { type: 'corridor', obj: cor };
    }
  }
  return null;
}

function pxToGrid(s, mx, my) {
  const canvas = document.getElementById('map-canvas');
  const w = canvas.clientWidth, h = canvas.clientHeight, pad = 16;
  const cellW = (w - pad * 2) / s.gridW, cellH = (h - pad * 2) / s.gridH;
  return { gx: clamp((mx - pad) / cellW, 0, s.gridW - 1), gy: clamp((my - pad) / cellH, 0, s.gridH - 1) };
}

function wireCanvasInteraction() {
  const canvas = document.getElementById('map-canvas');
  const tooltip = document.getElementById('map-tooltip');
  canvas.addEventListener('mousemove', (ev) => {
    const s = GameState; if (!s) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;
    const hit = hitTestMap(s, mx, my);
    if (UI.relocatingNodeId || UI.buildingNodeType) { canvas.style.cursor = 'crosshair'; tooltip.classList.add('hidden'); return; }
    if (hit) {
      tooltip.classList.remove('hidden');
      tooltip.style.left = (ev.clientX + 14) + 'px'; tooltip.style.top = (ev.clientY + 14) + 'px';
      if (hit.type === 'node') tooltip.innerHTML = `<strong>${hit.obj.name}</strong><br>${NODE_TYPES[hit.obj.type].label}${hit.obj.underConstruction ? ' · 🚧 in aanbouw' : ''}`;
      else if (hit.type === 'unit') tooltip.innerHTML = `<strong>${hit.obj.name}</strong><br>Status: ${hit.obj.status} · Moraal: ${Math.round(hit.obj.morale)}% · Prio: ${hit.obj.priority}`;
      else tooltip.innerHTML = `<strong>${hit.obj.name}</strong><br>Status: ${hit.obj.status} · Kwetsbaarheid ${Math.round(hit.obj.vulnerability * 100)}%`;
      canvas.style.cursor = 'pointer';
    } else { tooltip.classList.add('hidden'); canvas.style.cursor = 'crosshair'; }
  });
  canvas.addEventListener('click', (ev) => {
    const s = GameState; if (!s) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ev.clientX - rect.left, my = ev.clientY - rect.top;

    if (UI.relocatingNodeId) {
      const { gx, gy } = pxToGrid(s, mx, my);
      relocateMicroDepot(s, UI.relocatingNodeId, gx, gy);
      UI.relocatingNodeId = null;
      renderAll();
      return;
    }
    if (UI.buildingNodeType) {
      const { gx, gy } = pxToGrid(s, mx, my);
      const res = buildNewNodeAt(s, UI.buildingNodeType, gx, gy);
      if (!res.ok) GameState.messages.push(mkMsg(res.msg, 'crit'));
      UI.buildingNodeType = null;
      renderAll();
      return;
    }

    const hit = hitTestMap(s, mx, my);
    if (!hit) return;
    if (hit.type === 'node') { UI.selectedNodeId = hit.obj.id; openNodeModal(hit.obj.id); }
    else if (hit.type === 'unit') { UI.selectedUnitId = hit.obj.id; openUnitModal(hit.obj.id); }
    else if (hit.type === 'corridor') { UI.selectedCorridorId = hit.obj.id; openCorridorModal(hit.obj.id); }
  });
}

/* ---------------------------------------------------------------------- */
/* 11. DEBRIEFING                                                          */
/* ---------------------------------------------------------------------- */
function computeDebrief(s) {
  const daysUsed = s.day;
  const transportLossPct = s.stats.transportTotalTon > 0 ? 100 * s.stats.transportLossesTon / s.stats.transportTotalTon : 0;
  const totalLossesFrac = s.units.reduce((a, u) => a + u.lossesFrac * u.personnel, 0) / s.totalPersonnelStart;
  const efficiency = s.stats.enemyEliminated > 0 ? (s.stats.transportTotalTon / s.stats.enemyEliminated) : s.stats.transportTotalTon;
  const totalDebt = s.decisionDebt.accepted + s.decisionDebt.adjusted + s.decisionDebt.ignored;
  const debtAccuracy = s.decisionDebt.ignored > 0 ? 100 * (1 - s.decisionDebt.ignoredBad / s.decisionDebt.ignored) : 100;
  const avgDecideMs = s.stats.decideDurations.length ? s.stats.decideDurations.reduce((a, b) => a + b, 0) / s.stats.decideDurations.length : 0;
  return { daysUsed, transportLossPct, totalLossesFrac, efficiency, totalDebt, debtAccuracy, avgDecideMs };
}

function showDebrief() {
  const s = GameState;
  const d = computeDebrief(s);
  const verdict = s.gameOver.result === 'WIN' ? 'MISSIE VOLBRACHT' : 'MISSIE NIET VOLBRACHT';
  setModal(`
    <h2>${verdict} — POST-OPERATIE DEBRIEFING</h2>
    <p>${s.gameOver.reason}</p>
    <h3>Kernstatistieken</h3>
    <table>
      <tr><td>Operationele duur</td><td class="stat-big">${d.daysUsed}</td><td>dagen</td></tr>
      <tr><td>Transportverlies</td><td>${fmt1(d.transportLossPct)}%</td><td>van totaal getransporteerd volume</td></tr>
      <tr><td>Personeelsverlies</td><td>${fmt1(d.totalLossesFrac * 100)}%</td><td>van startsterkte</td></tr>
      <tr><td>Logistieke efficiëntie</td><td>${fmt1(d.efficiency)}</td><td>ton per uitgeschakelde tegenstanderseenheid</td></tr>
    </table>
    <h3>Decision Debt Analyse</h3>
    <p>Adviezen geaccepteerd: ${s.decisionDebt.accepted} · aangepast: ${s.decisionDebt.adjusted} · genegeerd: ${s.decisionDebt.ignored}.
    Van de genegeerde adviezen pakte ${s.decisionDebt.ignoredBad} slecht uit (nauwkeurigheid AI-advies bij negeren: ${fmt1(d.debtAccuracy)}%).</p>
    <p class="quote">${QUOTES.decisionDebt}</p>
    <h3>OODA-loop Compressie</h3>
    <p>Gemiddelde besluitvormingstijd per fase: ${fmt1(d.avgDecideMs / 1000)}s reële tijd. Snelheid is geen doel op zich — accuratesse in "orient" telt zwaarder dan tempo in "act".</p>
    <h3>Historische Vergelijking</h3>
    <p>Uw opmars naar Objectief OMEGA ${s.gameOver.result === 'WIN' ? `duurde ${d.daysUsed} dagen met ${fmt1(d.transportLossPct)}% transportverlies` : 'werd niet voltooid'}.<br>
    Ter vergelijking — Duitse opmars naar Smolensk (1941): 60 dagen, ~18% verlies.<br>
    Amerikaanse opmars naar Bagdad (2003): 21 dagen, ~5% verlies (met totale luchtsuperioriteit).</p>
    <div class="modal-actions">
      <button id="debrief-restart" class="primary">Nieuw spel</button>
      <button id="debrief-menu">Terug naar menu</button>
    </div>
  `);
  document.getElementById('debrief-restart').onclick = () => { closeModal(); startGame(s.scenarioId, s.difficultyId, null); };
  document.getElementById('debrief-menu').onclick = () => { closeModal(); goToMenu(); };
}

/* ---------------------------------------------------------------------- */
/* 12. SAVE / LOAD                                                         */
/* ---------------------------------------------------------------------- */
const SAVE_KEY = 'theatercommand_save_v1';
function saveGame() {
  if (!GameState) return;
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(GameState)); GameState.messages.push(mkMsg('Spel opgeslagen.', 'good')); renderAll(); }
  catch (e) { GameState.messages.push(mkMsg('Opslaan mislukt: ' + e.message, 'crit')); renderAll(); }
}
function hasSave() { try { return !!localStorage.getItem(SAVE_KEY); } catch (e) { return false; } }
function loadGame() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return false;
    GameState = JSON.parse(raw);
    goToGameScreen();
    return true;
  } catch (e) { return false; }
}

/* ---------------------------------------------------------------------- */
/* 13. BOOT / MENU / UITLEG / DEMO                                         */
/* ---------------------------------------------------------------------- */
function showRulesModal() {
  setModal(`
    <h2>Spelregels — TheaterCommand</h2>
    <p>Je bent Operationeel Logistiek Commandant (J-4) van ~500.000 personeelsleden die 400km moeten overbruggen naar Objectief OMEGA binnen 90 dagen. Je wint niet door zelf te schieten — je wint door de logistieke pijplijn overeind te houden terwijl alles erop uit is om die te breken.</p>
    <h3>Tijd &amp; de OODA-loop</h3>
    <p>1 speldag = 1 minuut reële tijd bij 1× snelheid (instelbaar tot 10×, of pauze). Elke dag heeft 6 fases van 4u. Elke fase doorloopt: <strong>Observe</strong> (sensoren onthullen info) → <strong>Orient</strong> (OLBM genereert advies) → <strong>Decide</strong> (jouw beslistijd — de aftellende klok rechtsboven) → <strong>Act</strong> (het systeem voert alles uit en toont het resultaat).</p>
    <h3>Zes soorten besluiten</h3>
    <p><strong>A. Voorraden verplaatsen</strong> — klik een node op de kaart, kies bestemming, klasse, hoeveelheid en transportmodus (spoor/vrachtwagen/helikopter/drone). ETA en onderweg-risico worden live getoond voordat je verstuurt.</p>
    <p><strong>B. Depots bouwen of verplaatsen</strong> — knop "🏗 Nieuwe node bouwen" in de Nodes-tab, klik daarna een locatie op de kaart (kost materiaal van de dichtstbijzijnde node en bouwtijd). Mobiele micro-depots kun je verplaatsen (15% evacuatieverlies).</p>
    <p><strong>C. Prioriteiten stellen</strong> — klik een eenheid en zet P1 (kritiek) t/m P4 (laag). Hogere prioriteit krijgt voorrang bij automatische bevoorrading en weegt zwaarder in AI-adviezen.</p>
    <p><strong>D. Corridors beveiligen of herrouteren</strong> — klik een corridorlijn op de kaart: wijs een escorte toe (verlaagt kwetsbaarheid, bindt een pantser/artillerie-eenheid 24u) of herrouteer via een naburige corridor.</p>
    <p><strong>E. AI-advies beoordelen</strong> — het OLBM-paneel rechts geeft elke fase adviezen. Per advies: <strong>Accept</strong> (exact uitvoeren), <strong>Adjust</strong> (percentage aanpassen), of <strong>Ignore</strong>. Genegeerde adviezen tellen mee in je Decision Debt, geëvalueerd in de einddebriefing.</p>
    <p><strong>F. Strategische directives</strong> — elke 10 dagen een keuze van hoger commando. Accepteren geeft politiek krediet maar verhoogt logistiek risico; weigeren is veiliger maar kost krediet. Onder 20% krediet word je vervangen als J-4.</p>
    <h3>Degradatie zonder bevoorrading</h3>
    <p>&gt;24u zonder Class I (rantsoenen): moraal daalt, desertierisico. &gt;24u zonder Class III (brandstof): voertuigen en drones staan stil. &gt;12u zonder Class V (munitie) in contact: eenheid moet terugvallen. &gt;6u zonder Class VIII (medisch) met gewonden: verliezen lopen op.</p>
    <h3>Win- en verliesvoorwaarden</h3>
    <p><strong>Winnen:</strong> Objectief OMEGA bereikt binnen 90 dagen, mét &lt;30% logistiek transportverlies, &lt;50% personeelsverlies, en politiek krediet &gt;20%.<br>
    <strong>Verliezen:</strong> 90 dagen verstreken zonder OMEGA · &gt;50% personeelsverlies · politiek krediet ≤20% (vervangen als J-4) · kerncommando (HQ) vernietigd · OMEGA bereikt maar met te hoog transportverlies (Pyrrusoverwinning).</p>
    <p class="quote">${QUOTES.classIII}</p>
    <div class="modal-actions"><button id="modal-close" class="primary">Begrepen</button></div>
  `);
  document.getElementById('modal-close').onclick = closeModal;
}

function legendRow(swatchHtml, title, desc) {
  return `<div class="legend-row"><div class="legend-swatch-wrap">${swatchHtml}</div><div class="legend-text"><strong>${title}</strong><span>${desc}</span></div></div>`;
}

function showLegendModal() {
  let html = `<h2>Legenda — Beeldelementen</h2><p class="card-sub">Alles wat je op de kaart en in de panelen ziet, op een rij.</p>`;

  html += `<div class="legend-section-title">Terrein &amp; zicht</div><div class="legend-grid">`;
  Object.values(TERRAIN).forEach(t => { html += legendRow(`<div class="legend-swatch" style="background:${t.color}"></div>`, t.label, `Snelheidsmodifier voor eenheden: ${Math.round(t.speedMod * 100)}%.`); });
  html += legendRow(`<div class="legend-swatch" style="background:#161712;opacity:.7"></div>`, 'Grijze waas (fog of war)', 'Onverkend gebied — wordt onthuld door sensoren van je eenheden (drones zien het verst).');
  html += `</div>`;

  html += `<div class="legend-section-title">Nodes (logistieke knooppunten)</div><div class="legend-grid">`;
  Object.values(NODE_TYPES).forEach(t => { html += legendRow(`<div class="legend-swatch round" style="background:${t.color};width:${Math.max(10, t.radius * 1.6)}px;height:${Math.max(10, t.radius * 1.6)}px;"></div>`, t.label, `Voert klassen: ${t.classes.join(', ')}.`); });
  html += legendRow(`<div class="legend-swatch round" style="background:#4caf50"></div>`, 'Vulkleur groen / oranje / rood', 'Gemiddelde voorraad t.o.v. capaciteit: &gt;40% groen, 15–40% oranje, &lt;15% rood.');
  html += legendRow(`<div class="legend-swatch round" style="border:2px dashed #ffbf00;background:transparent"></div>`, '🚧 In aanbouw', 'Node is nog niet operationeel en telt niet mee voor bevoorrading.');
  html += legendRow(`<div class="legend-swatch round" style="border:2px solid #ff3333;background:transparent"></div>`, 'Knipperende rode ring', 'Node staat onder vijandelijke aanval.');
  html += legendRow(`<div class="legend-swatch round" style="border:2px solid #ffbf00;background:transparent"></div>`, 'HQ-ring + label', 'Kerncommando — valt dit weg, dan is de operatie direct verloren.');
  html += `</div>`;

  html += `<div class="legend-section-title">Corridors</div><div class="legend-grid">`;
  html += legendRow(`<div class="legend-swatch line" style="background:#4caf50"></div>`, 'Groen — veilig', 'Normale doorvoer, lage kwetsbaarheid.');
  html += legendRow(`<div class="legend-swatch line" style="background:#ffbf00"></div>`, 'Oranje — onder druk', 'Kwetsbaarheid &gt;35% — merkbaar transportverlies.');
  html += legendRow(`<div class="legend-swatch line" style="background:#ff3333"></div>`, 'Rood — onderbroken', '&gt;40% uitval in 6u: collapse-alert, herroutering nodig.');
  html += legendRow(`<div class="legend-swatch line" style="background:#6fa8dc;height:5px;"></div>`, 'Dikke lijn / dunne lijn', 'Dik = spoorweg (hoge capaciteit), dun = wegtransport.');
  html += legendRow(`🛡`, 'Schild-icoon op de lijn', 'Escorte actief — kwetsbaarheid verlaagd, één eenheid 24u gebonden.');
  html += `</div>`;

  html += `<div class="legend-section-title">Eenheden</div><div class="legend-grid">`;
  html += legendRow(`<div class="legend-swatch" style="background:#87ceeb"></div>`, 'Blauw blokje', 'Eigen eenheid, bewegend of statisch.');
  html += legendRow(`<div class="legend-swatch" style="background:#ff9955"></div>`, 'Oranje blokje', 'Eenheid in gevecht (engaged) met vijand in de buurt.');
  html += legendRow(`<div class="legend-swatch" style="background:#7ec8e3"></div>`, 'Lichtblauw blokje', 'Eenheid toegewezen als corridor-escorte (staat stil, 24u).');
  html += legendRow(`<div class="legend-swatch" style="clip-path:polygon(50% 0,100% 100%,0 100%);background:#ff3333"></div>`, 'Rode driehoek', 'Bekende (gedetecteerde) vijandelijke eenheid — onbekende blijven onzichtbaar in de waas.');
  html += legendRow(`<span style="color:#ff3333;font-weight:bold;font-size:14px;">!</span>`, 'Rood uitroepteken', 'Eenheid is gedegradeerd — geen brandstof of munitie meer.');
  html += legendRow(`<div class="legend-swatch" style="background:#ff3333;width:8px;height:8px;"></div>`, 'Rood hoekje op eenheid', 'Prioriteit P1 (kritiek). Amber = P2, grijs = P4, geen hoekje = P3.');
  html += `</div>`;

  html += `<div class="legend-section-title">Konvooien &amp; overig</div><div class="legend-grid">`;
  html += legendRow(`<div class="legend-swatch round" style="background:#ff3333;width:8px;height:8px;"></div>`, 'Kleine bewegende stip', 'Konvooi onderweg tussen bron en bestemming — kleur = vervoerde klasse.');
  html += legendRow(`<div class="legend-swatch" style="border-right:3px dashed #ffbf00;background:transparent;height:16px;"></div>`, 'Stippellijn "OMEGA"', 'Rechterrand van de kaart: het operationele doel.');
  html += `</div>`;

  html += `<div class="legend-section-title">OODA-statusbalk</div><div class="legend-grid">`;
  html += legendRow(`<div class="legend-swatch round" style="background:#4caf50"></div>`, 'Groen', 'Observe/Orient: informatie is actueel en betrouwbaar.');
  html += legendRow(`<div class="legend-swatch round" style="background:#ffbf00"></div>`, 'Oranje', 'Verouderd of tegenstrijdig — wees voorzichtiger met snelle besluiten.');
  html += legendRow(`<div class="legend-swatch round" style="background:#ff3333"></div>`, 'Rood', 'Sterk verouderd/onbetrouwbaar.');
  html += `</div>`;

  html += `<div class="modal-actions"><button id="modal-close" class="primary">Sluiten</button></div>`;
  setModal(html);
  document.getElementById('modal-close').onclick = () => { closeModal(); removeTourUI(); };
}

/* ---- Demo & rondleiding ---- */
const TOUR_STEPS = [
  { sel: '#header', title: 'Header', text: 'Dag, fase, weer, scenario en politiek krediet. Rechts: de "?"-knop (deze legenda), pauze, opslaan en terug naar menu.' },
  { sel: '#ooda-bar', title: 'OODA-statusbalk', text: 'Observe/Orient tonen hoe vers en betrouwbaar je informatiebeeld is. Decide is jouw beslistijd per fase — de aftellende klok. Act toont de uitvoering.' },
  { sel: '#panel-left', title: 'Linkerpaneel — de pijplijn', text: 'Supply Flow, het Class I–X dashboard, transportcapaciteit per corridor, en de nodelijst — hier bouw je ook nieuwe depots.' },
  { sel: '#map-wrap', title: 'De kaart', text: 'Klik een node om voorraad te sturen, een eenheid om een prioriteit te zetten, of een corridorlijn om escorte/herroutering te regelen. Grijze waas = onverkend gebied.' },
  { sel: '#panel-right', title: 'Rechterpaneel — OLBM', text: 'AI-advies per fase: Accept, Adjust (percentage aanpassen) of Ignore. Genegeerde adviezen tellen mee in je Decision Debt, terug te zien in de eindrapportage.' },
  { sel: '#footer', title: 'Footer', text: 'Berichtenstream met recente gebeurtenissen, en de snelheidsregelaar (pauze t/m 10×).' },
];

function removeTourUI() {
  const spot = document.getElementById('tour-spot'); if (spot) spot.remove();
  const card = document.getElementById('tour-card'); if (card) card.remove();
}

function runTour(i) {
  removeTourUI();
  if (i >= TOUR_STEPS.length) { showLegendModal(); return; }
  const step = TOUR_STEPS[i];
  const el = document.querySelector(step.sel);
  if (!el) { runTour(i + 1); return; }
  const r = el.getBoundingClientRect();

  const spot = document.createElement('div');
  spot.id = 'tour-spot'; spot.className = 'tour-spot';
  spot.style.left = (r.left - 4) + 'px'; spot.style.top = (r.top - 4) + 'px';
  spot.style.width = (r.width + 8) + 'px'; spot.style.height = (r.height + 8) + 'px';
  document.body.appendChild(spot);

  const card = document.createElement('div');
  card.id = 'tour-card'; card.className = 'tour-card';
  card.innerHTML = `<div class="tour-step">STAP ${i + 1}/${TOUR_STEPS.length}</div><h4>${step.title}</h4><p>${step.text}</p>
    <div class="tour-actions"><button id="tour-skip">Tour overslaan</button><button id="tour-next" class="primary">${i === TOUR_STEPS.length - 1 ? 'Legenda tonen' : 'Volgende'}</button></div>`;
  document.body.appendChild(card);

  let top = r.bottom + 12;
  if (top + card.offsetHeight > window.innerHeight - 10) top = Math.max(8, r.top - card.offsetHeight - 12);
  let left = clamp(r.left, 10, Math.max(10, window.innerWidth - card.offsetWidth - 10));
  card.style.top = top + 'px'; card.style.left = left + 'px';

  document.getElementById('tour-next').onclick = () => runTour(i + 1);
  document.getElementById('tour-skip').onclick = () => removeTourUI();
}

function startDemo() {
  GameState = newGameState('lange_mars', 'cadet', null);
  GameState.demoMode = true;
  UI = { activeLeftTab: 'flow', activeRightTab: 'olbm', selectedNodeId: null, selectedUnitId: null, selectedCorridorId: null, relocatingNodeId: null, buildingNodeType: null, speed: 0, paused: true, lastTick: 0, phaseElapsed: 0 };
  GameState._phaseDecideStart = Date.now();
  goToGameScreen();
  setTimeout(() => runTour(0), 250);
}

let selectedScenario = 'lange_mars', selectedDifficulty = 'officier';

function buildMenu() {
  const scList = document.getElementById('scenario-list');
  scList.innerHTML = SCENARIOS.map(sc => `<button class="opt-btn${sc.id === selectedScenario ? ' selected' : ''}" data-sc="${sc.id}">
    <strong>${sc.name}</strong>${sc.desc}<br><em>${sc.learn}</em></button>`).join('');
  scList.querySelectorAll('button').forEach(b => b.onclick = () => { selectedScenario = b.dataset.sc; buildMenu(); });

  const diffList = document.getElementById('difficulty-list');
  diffList.innerHTML = DIFFICULTIES.map(d => `<button class="opt-btn${d.id === selectedDifficulty ? ' selected' : ''}" data-d="${d.id}">
    <strong>${d.name}</strong>${d.desc}</button>`).join('');
  diffList.querySelectorAll('button').forEach(b => b.onclick = () => { selectedDifficulty = b.dataset.d; buildMenu(); });

  document.getElementById('btn-load-save').disabled = !hasSave();
}

function startGame(scenarioId, difficultyId, sandboxOpts) {
  GameState = newGameState(scenarioId, difficultyId, sandboxOpts);
  UI = { activeLeftTab: 'flow', activeRightTab: 'olbm', selectedNodeId: null, selectedUnitId: null, selectedCorridorId: null, relocatingNodeId: null, buildingNodeType: null, speed: 1, paused: false, lastTick: 0, phaseElapsed: 0 };
  GameState._phaseDecideStart = Date.now();
  goToGameScreen();
}

function goToGameScreen() {
  document.getElementById('screen-menu').classList.remove('active');
  document.getElementById('screen-game').classList.add('active');
  document.getElementById('demo-badge').classList.toggle('hidden', !(GameState && GameState.demoMode));
  resizeCanvas();
  renderAll();
}
function goToMenu() {
  removeTourUI();
  document.getElementById('screen-game').classList.remove('active');
  document.getElementById('screen-menu').classList.add('active');
  buildMenu();
}

function wireMenu() {
  document.getElementById('btn-start').onclick = () => startGame(selectedScenario, selectedDifficulty, null);
  document.getElementById('btn-load-save').onclick = () => { loadGame(); };
  document.getElementById('btn-rules').onclick = () => showRulesModal();
  document.getElementById('btn-demo').onclick = () => startDemo();
}
function wireHeader() {
  document.getElementById('btn-pause').onclick = () => { UI.paused = !UI.paused; document.getElementById('btn-pause').textContent = UI.paused ? '▶' : '⏸'; };
  document.getElementById('btn-save').onclick = () => saveGame();
  document.getElementById('btn-legend').onclick = () => showLegendModal();
  document.getElementById('btn-menu').onclick = () => { UI.paused = true; goToMenu(); };
  document.getElementById('node-filter').addEventListener('input', () => renderNodeList(GameState));
  document.getElementById('btn-build-node').addEventListener('click', () => openBuildNodeChooser());
}

window.addEventListener('resize', () => { if (GameState) resizeCanvas(); });

document.addEventListener('DOMContentLoaded', () => {
  buildMenu();
  wireMenu();
  wireTabs();
  wireSpeedControl();
  wireCanvasInteraction();
  wireHeader();
  requestAnimationFrame(gameLoop);
});
