/* NatureSwarm Explorer: the page around the player (viewer.html).
 *
 * Lists the recorded episodes of the three test beds, in this order: RescueEnv, PandemicEnv, NatureEnv. The list is
 * traces/demos.json (episodes of RescueEnv and NatureEnv, and `envs`: the test beds with their kinds of task) joined
 * with the list of the PandemicEnv viewer (pandemic/traces/index.json). The reader filters by test bed and kind of
 * task; before a list is expanded it shows one featured episode of each test bed or kind of task.
 *
 * Nothing is drawn here: the canvas is the player's. RescueEnv and NatureEnv episodes are played by
 * js/natureswarm-player.js; PandemicEnv episodes by the PandemicEnv viewer's own player
 * (pandemic/js/natureswarm-player.js, scene `pandemic`), loaded when one is first opened.
 *
 * The address keeps the state: viewer.html?env=rescue&task=scale&ep=rescue-8. `ep` alone opens that episode;
 * the older form viewer.html#rescue-8 still works. autoplay=0 starts paused.
 */
(function () {
  'use strict';

  const SITE_PLAYER = window.NatureSwarmPlayer;
  const SCHEMA = 'natureswarm.trace/1';
  // Used if traces/demos.json cannot be read: the recordings of the project page.
  const FALLBACK = {
    groups: [{ id: 'rescue', title: 'Wildfire rescue' }, { id: 'bees', title: 'Choosing a nest site' }, { id: 'ants', title: 'Trails between nest and food' }, { id: 'birds', title: 'Birds on migration' }],
    episodes: [
      { id: 'rescue-128', group: 'rescue', name: '128 drones: coordinator against NatureSwarm', traces: ['traces/rescue_coordinator.json', 'traces/rescue_natureswarm.json'], tags: ['128 drones'], about: '', featured: true, opts: { titles: ['Coordinator', 'NatureSwarm'], headline: 'Wildfire rescue with 128 drones', subline: 'Same map, same fire, same language model in both teams' } },
      { id: 'bees-static', group: 'bees', name: 'Seven cavities, 24 scouts', traces: ['traces/bees.json'], tags: [], about: '', featured: true, opts: {} },
      { id: 'ants-static', group: 'ants', name: 'Three paths, 24 ants', traces: ['traces/ants.json'], tags: [], about: '', featured: true, opts: {} },
      { id: 'birds-f30', group: 'birds', name: 'Flock against solitary birds', traces: ['traces/birds_flock.json', 'traces/birds_alone.json'], tags: [], about: '', featured: true, opts: { titles: ['Flock: every bird aligns with its seven nearest neighbours', 'Each bird on its own'] } },
    ],
  };
  // Used for a list without `envs`: the test beds and kinds of task are then read off groups and mission names.
  const ENVS_FALLBACK = [
    { id: 'rescue', title: 'RescueEnv', color: '#c8503f', tasks: [{ id: 'rescue', title: 'Wildfire rescue' }] },
    { id: 'nature', title: 'NatureEnv', color: '#2f8f5b', tasks: [{ id: 'nest', title: 'Nest-site choice' }, { id: 'forage', title: 'Foraging and trails' }, { id: 'compete', title: 'Competition' }, { id: 'migrate', title: 'Migration' }] },
  ];
  const TEAM_COLOR = ['#1f5fae', '#b5367a', '#17766b'];
  const MODELS = { 'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite', 'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite', 'gemini-4-argon': 'Gemini 4 Argon',
    'or/openai/gpt-oss-20b': 'gpt-oss 20B', 'or/google/gemma-3-12b-it': 'Gemma 3 12B' };
  // a trace carries the code name of a design; the panel shows the paper's name (the list's own titles come first)
  const DESIGNS = { bee: 'Bee design', ant: 'Ant design', hierarchy: 'Coordinator', solitary: 'Solitary agents', flock: 'Flock design', broadcast: 'Broadcast',
    'roost-v3': 'NatureSwarm, whole-network relay', 'roost-v1': 'NatureSwarm, whole-network relay', 'team-wide NatureSwarm': 'NatureSwarm, whole-network relay',
    'neighbour-only NatureSwarm': 'NatureSwarm', 'matched control': 'Matched control', 'two-level coordinator': 'Two-level coordinator',
    'response-threshold drones': 'Response-threshold drones',
    coordinator: 'Coordinator', coordinator_gate: 'Coordinator with NatureSwarm\'s evidence mechanism', swarm: 'NatureSwarm', swarm2: 'NatureSwarm (second version)',
    detect: 'Detection program', board: 'Shared board', none: 'No action', oracle: 'Oracle',
    'flock (three-rule model)': 'Flock (model of three mechanisms)', 'each bird alone': 'Each bird on its own' };

  const designName = (m) => (m.scene === 'pandemic' && m.design === 'coordinator' ? 'State coordinator' : DESIGNS[m.design]) || m.design;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const el = (tag, cls, html) => { const n = document.createElement(tag); if (cls) n.className = cls; if (html != null) n.innerHTML = html; return n; };
  const canvas = $('canvas');
  const cache = {}, players = {};
  const query = new URLSearchParams(location.search);
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const autoplay = query.get('autoplay') !== '0' && !reduced;

  let ENVS = [], EPS = [], GROUPS = {};
  const state = { env: 'all', task: 'all', ep: null, open: new Set() };
  let player = null, speed = 1, ticket = 0;

  // ------------------------------------------------------------------ the list of episodes
  function taskOf(e) {                       // a list without `task`: the kind of task is read off the mission's name
    const g = e.group;
    if (g === 'rescue') return 'rescue';
    const tag = (e.tags || []).map((t) => /^(nest|forage|trail|compete|migrate)-/.exec(t)).find(Boolean);
    const kind = tag ? tag[1] : { bees: 'nest', forage: 'forage', ants: 'trail', birds: 'migrate' }[g];
    return kind === 'trail' ? 'forage' : kind || 'forage';
  }

  function join(site, lists) {
    ENVS = (site.envs || ENVS_FALLBACK).map((v) => Object.assign({}, v, { tasks: (v.tasks || []).slice() }));
    (site.groups || []).forEach((g) => { GROUPS['site/' + g.id] = g; });
    EPS = site.episodes.map((e) => Object.assign({}, e, { env: e.env || (e.group === 'rescue' ? 'rescue' : 'nature'), task: e.task || taskOf(e), gkey: 'site/' + e.group, player: null }));
    ENVS.forEach((v) => {
      const d = lists[v.id]; if (!v.list) return;
      if (!d) { v.missing = true; return; }
      const base = v.base || '', pre = v.prefix || '';
      v.tasks = d.groups.map((g) => { GROUPS[v.id + '/' + g.id] = g; return { id: g.id, title: g.title, short: g.short, note: g.note }; });
      d.episodes.forEach((e) => EPS.push(Object.assign({}, e, { id: pre + e.id, env: v.id, task: e.task || e.group, gkey: v.id + '/' + e.group,
        traces: e.traces.map((t) => base + t), player: v.player || null })));
    });
    ENVS = ENVS.filter((v) => !v.missing && EPS.some((e) => e.env === v.id));
    const rank = {}; ENVS.forEach((v, i) => v.tasks.forEach((t, j) => { rank[v.id + '/' + t.id] = 1000 * i + j; }));
    EPS.forEach((e, i) => { e.rank = [rank[e.env + '/' + e.task] != null ? rank[e.env + '/' + e.task] : 1e6, e.order != null ? e.order : 1e6, i]; });
    EPS.sort((a, b) => a.rank[0] - b.rank[0] || a.rank[1] - b.rank[1] || a.rank[2] - b.rank[2]);
    // a test bed or kind of task without a featured episode: its first one is shown before the list is expanded
    if (!EPS.some((e) => e.featured)) ENVS.forEach((v) => { const e = EPS.find((x) => x.env === v.id); if (e) e.featured = true; });
  }

  const envOf = (id) => ENVS.find((v) => v.id === id);
  const taskName = (e) => { const v = envOf(e.env), t = v && v.tasks.find((x) => x.id === e.task); return t ? t.title : ''; };
  const inFilter = (e) => (state.env === 'all' || e.env === state.env) && (state.task === 'all' || e.task === state.task);
  const filtered = () => EPS.filter(inFilter);
  const byId = (id) => EPS.find((e) => e.id === id);

  // A part of the page that is drawn again keeps the keyboard focus on the control that was used (data-f names it).
  function redraw(root, draw) {
    const a = document.activeElement, key = a && root.contains(a) ? a.getAttribute('data-f') : null;
    draw();
    if (key == null) return;
    const again = Array.from(root.querySelectorAll('[data-f]')).find((n) => n.getAttribute('data-f') === key);
    if (again) again.focus({ preventScroll: true });
  }

  // ------------------------------------------------------------------ filter chips
  function chip(key, label, count, pressed, color, onclick) {
    const b = el('button', 'vw-chip', (color ? `<i style="background:${esc(color)}"></i>` : '') + `<span>${esc(label)}</span><b>${count}</b>`);
    b.type = 'button'; b.setAttribute('data-f', key); b.setAttribute('aria-pressed', pressed ? 'true' : 'false'); b.addEventListener('click', onclick);
    return b;
  }
  function renderChips() {
    redraw($('filter'), () => {
      const top = $('envchips'), sub = $('taskchips'); top.innerHTML = ''; sub.innerHTML = '';
      top.appendChild(chip('env:all', 'All', EPS.length, state.env === 'all', null, () => setFilter('all', 'all')));
      ENVS.forEach((v) => top.appendChild(chip('env:' + v.id, v.title, EPS.filter((e) => e.env === v.id).length, state.env === v.id, v.color, () => setFilter(v.id, 'all'))));
      const v = envOf(state.env);
      sub.hidden = !v || v.tasks.length < 2;
      if (sub.hidden) return;
      sub.setAttribute('aria-label', 'Kind of task in ' + v.title);
      sub.appendChild(chip('task:all', 'All tasks', EPS.filter((e) => e.env === v.id).length, state.task === 'all', null, () => setFilter(v.id, 'all')));
      v.tasks.forEach((t) => { const n = EPS.filter((e) => e.env === v.id && e.task === t.id).length; if (n) sub.appendChild(chip('task:' + t.id, t.short || t.title, n, state.task === t.id, null, () => setFilter(v.id, t.id))); });
    });
  }

  // ------------------------------------------------------------------ list: featured episodes, and all of a group on request
  function item(e, card, kicker) {
    const b = el('button', 'vw-item ' + (card ? 'card' : 'row')); b.type = 'button'; b.dataset.id = e.id; b.setAttribute('data-f', 'ep:' + e.id);
    const img = e.poster ? `<img class="vw-thumb" src="${esc(e.poster)}" alt="" loading="lazy" width="384" height="240">` : '<span class="vw-thumb none"></span>';
    const tags = (e.tags || []).filter((t) => !/^seed /.test(t)).join(' · ');
    b.innerHTML = card
      ? `${img}<span class="vw-tx">${kicker ? `<small class="vw-k">${esc(taskName(e))}</small>` : ''}<strong>${esc(e.name)}</strong><span class="vw-take">${esc(e.takeaway || tags)}</span></span>`
      : `${img}<span class="vw-tx"><strong>${esc(e.name)}</strong><small>${esc(tags)}</small></span>`;
    const pic = b.querySelector('img'); if (pic) pic.addEventListener('error', () => { pic.replaceWith(el('span', 'vw-thumb none')); });
    if (e.id === state.ep) { b.classList.add('on'); b.setAttribute('aria-current', 'true'); }
    b.addEventListener('click', () => { select(e.id); closeDrawer(true); });
    return b;
  }

  function section(key, title, note, color, eps, tasks, forced) {
    const box = el('section', 'vw-group'); box.style.setProperty('--g', color);
    const feat = eps.filter((e) => e.featured), open = forced || state.open.has(key) || feat.length === eps.length;
    const id = 'sec-' + key.replace(/[^a-z0-9]+/gi, '-');
    box.appendChild(el('div', 'vw-group-head', `<i></i><h2>${esc(title)}</h2><span>${eps.length} ${eps.length === 1 ? 'episode' : 'episodes'}</span>`));
    if (note) box.appendChild(el('p', 'vw-group-note', esc(note)));
    const body = el('div', 'vw-group-body'); body.id = id; box.appendChild(body);
    if (!open) feat.forEach((e) => body.appendChild(item(e, true, !!tasks)));
    else if (tasks) tasks.forEach((t) => {
      const mine = eps.filter((e) => e.task === t.id); if (!mine.length) return;
      body.appendChild(el('h3', 'vw-sub', `${esc(t.title)}<span>${mine.length}</span>`));
      mine.forEach((e) => body.appendChild(item(e, e.featured)));
    });
    else eps.forEach((e) => body.appendChild(item(e, e.featured)));
    if (!forced && feat.length < eps.length) {
      const more = el('button', 'vw-more', open ? '<span>Show featured only</span>' : `<span>${eps.length === 1 ? 'Show the episode' : 'Show all ' + eps.length + ' episodes'}</span>`);
      if (open && !feat.length) more.firstChild.textContent = 'Hide the list';
      more.type = 'button'; more.setAttribute('data-f', 'more:' + key); more.setAttribute('aria-expanded', open ? 'true' : 'false'); more.setAttribute('aria-controls', id);
      more.addEventListener('click', () => { if (state.open.has(key)) state.open.delete(key); else state.open.add(key); renderList(); });
      box.appendChild(more);
    }
    return box;
  }

  const keyOf = (e) => (state.env === 'all' ? e.env : e.env + '/' + e.task);
  function renderList() {
    const list = $('list');
    redraw(list, () => {
      list.innerHTML = '';
      ENVS.filter((v) => state.env === 'all' || v.id === state.env).forEach((v) => {
        const eps = EPS.filter((e) => e.env === v.id && inFilter(e)); if (!eps.length) return;
        if (state.env === 'all') list.appendChild(section(v.id, v.title, v.note, v.color, eps, v.tasks, false));
        else v.tasks.filter((t) => state.task === 'all' || t.id === state.task).forEach((t) => {
          const mine = eps.filter((e) => e.task === t.id); if (!mine.length) return;
          list.appendChild(section(v.id + '/' + t.id, t.title, t.note, v.color, mine, null, state.task !== 'all'));
        });
      });
    });
    const n = filtered().length, shown = list.querySelectorAll('.vw-item').length;
    const feat = list.querySelectorAll('.vw-item.row').length === 0 && shown < n;
    $('showing').textContent = shown < n ? `${shown} ${feat ? 'featured ' : ''}of ${n} shown` : `${n} ${n === 1 ? 'episode' : 'episodes'}`;
    const all = $('expand'); all.hidden = state.task !== 'all' || !sectionKeys().length;
    const every = sectionKeys().every((k) => state.open.has(k));
    all.textContent = every ? 'Featured only' : 'Show all'; all.setAttribute('aria-pressed', every ? 'true' : 'false');
    $('open-label').textContent = `Browse ${n} ${n === 1 ? 'episode' : 'episodes'}`;
  }
  function sectionKeys() {                    // the groups of the current filter that can be expanded
    const keys = [];
    ENVS.filter((v) => state.env === 'all' || v.id === state.env).forEach((v) => {
      if (state.env === 'all') keys.push(v.id); else v.tasks.forEach((t) => { if (EPS.some((e) => e.env === v.id && e.task === t.id && !e.featured)) keys.push(v.id + '/' + t.id); });
    });
    return keys;
  }

  // ------------------------------------------------------------------ address
  function writeAddress() {
    const q = new URLSearchParams();
    if (state.env !== 'all') q.set('env', state.env);
    if (state.task !== 'all') q.set('task', state.task);
    if (state.ep) q.set('ep', state.ep);
    if (query.get('autoplay') === '0') q.set('autoplay', '0');
    const s = q.toString();
    try { history.replaceState(null, '', location.pathname + (s ? '?' + s : '')); } catch (e) { /* a sandboxed frame */ }
  }

  function setFilter(env, task, keep) {
    state.env = env; state.task = task;
    renderChips();
    const cur = byId(state.ep);
    if (!keep && (!cur || !inFilter(cur))) { const f = filtered(), next = f.find((e) => e.featured) || f[0]; if (next) { select(next.id); return; } }
    if (cur && !cur.featured && inFilter(cur)) state.open.add(keyOf(cur));
    renderList(); pager(); writeAddress();
  }

  // ------------------------------------------------------------------ the stage
  function check(tr) {
    if (!tr || typeof tr !== 'object' || tr.schema !== SCHEMA) throw new Error('not a trace of schema ' + SCHEMA);
    if (!tr.meta || !Array.isArray(tr.frames) || tr.frames.length < 2) throw new Error('a trace needs meta and at least two frames');
    return tr;
  }
  const fetchTrace = (u) => cache[u] || (cache[u] = fetch(u).then((r) => { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); })
    .then(window.NatureSwarmTrace.unpack).then(check));
  // The PandemicEnv viewer's player is a build of the same player with the scene `pandemic`. It is loaded beside the
  // site's player, which stays the one under window.NatureSwarmPlayer.
  function loadPlayer(src) {
    if (!src) return Promise.resolve(SITE_PLAYER);
    return players[src] || (players[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script'); s.src = src;
      s.onload = () => { const P = window.NatureSwarmPlayer; window.NatureSwarmPlayer = SITE_PLAYER; resolve(P); };
      s.onerror = () => { window.NatureSwarmPlayer = SITE_PLAYER; reject(new Error(src + ' could not be loaded')); };
      document.head.appendChild(s);
    }));
  }
  const pandemicPlayer = () => { const v = ENVS.find((x) => x.player); return v ? v.player : 'pandemic/js/natureswarm-player.js'; };

  function runBy(m) {
    if (m.scene === 'pandemic' && m.policy === 'rule') return 'fixed rules, no language model';
    if (m.policy === 'rule') return (/alone/.test(m.design) ? 'each bird\'s own cue' : 'the flock model of three mechanisms') + ', an illustration';
    if (m.policy === 'classic') return 'the design\'s model-free policy, no language model';
    const id = String(m.policy).replace('llm:', '');
    return MODELS[id] || id;
  }

  function outcome(m) {
    const o = m.outcome || {};
    if (m.scene === 'rescue' || m.env === 'rescueenv') return o.victims ? [Math.round(100 * o.rescued / o.victims) + '%', `${o.rescued} of ${o.victims} victims rescued, ${o.drones_lost} of ${m.n_agents} drones lost`] : ['', ''];
    if (m.scene === 'bees') { const L = (k) => (k == null ? 'none' : String.fromCharCode(65 + k)); return [o.chose_best ? 'best cavity' : 'cavity ' + L(o.chosen), `chose cavity ${L(o.chosen)} in round ${o.round} (${o.how}); the best was cavity ${L(o.best)}`]; }
    if (m.scene === 'ants') return [String(o.food), 'units of food brought home'];
    if (m.scene === 'forage') return [String(o.food), 'units of food brought home' + (o.rival_food != null ? `; the other colony brought ${o.rival_food}` : '')];
    if (m.scene === 'pandemic') {
      const f = (v) => (v == null ? '?' : Math.round(v).toLocaleString('en-US'));
      if (m.design === 'none') return [f(o.variant), `variant infections by day ${m.days} with no action; ${f(o.all)} infections with either strain`];
      const r = o.reduction == null ? '' : (o.reduction >= 0 ? '−' : '+') + Math.abs(o.reduction).toFixed(0) + '%';
      const det = o.first_detection == null ? 'the variant was never found' : `variant first found on day ${o.first_detection}`;
      return [r, `${f(o.variant)} variant infections by day ${m.days} (no action: ${f(o.none)}); ${det}; ${o.alerts} alerts, ${o.alert_precision == null ? 'none' : o.alert_precision + '%'} of alert-days where the variant was; ${o.budget_d30}% of the alert budget spent by day 30` + (o.all != null ? `; all infections ${f(o.all)} (no action: ${f(o.all_none)})` : '')];
    }
    if (m.scene === 'birds') return [`${o.arrived} / ${m.n_agents}`, `birds arrived, ${o.lost} taken by hawks`];
    return ['', Object.keys(o).filter((k) => k !== 'trips').map((k) => k + ' ' + o[k]).join(', ')];
  }

  function show(Player, traces, entry) {
    const opts = entry.opts || {};
    if (player) player.pause();
    player = Player.mount(canvas, traces.length === 1 ? traces[0] : traces, opts);
    player.speed = speed;
    const anyEvents = traces[0].frames.some((f) => f.events && f.events.length);
    $('evbox').hidden = !anyEvents;
    player.onframe = (t, d) => {
      if (!$('pos').matches(':active')) $('pos').value = String(Math.round(1000 * t / d));
      $('clock').textContent = t.toFixed(1) + ' / ' + d.toFixed(1) + ' s';
      if (!anyEvents) return;
      const fr = traces[0].frames, k = Math.min(fr.length - 1, Math.floor(fr.length * t / d)), seen = [];
      for (let i = k; i >= 0 && seen.length < 4; i--) (fr[i].events || []).forEach((e) => { if (seen.indexOf(e) < 0) seen.push(e); });
      const html = seen.map((e) => '<li>' + esc(e) + '</li>').join('') || '<li>none yet</li>';
      if ($('events').innerHTML !== html) $('events').innerHTML = html;
    };
    const m0 = traces[0].meta, pandemic = m0.scene === 'pandemic';
    $('teams').innerHTML = traces.map((tr, i) => {
      const m = tr.meta, o = outcome(m), c = (opts.colors && opts.colors[i]) || (traces.length > 1 ? TEAM_COLOR[i % 3] : '#17766b');
      const name = (opts.titles && opts.titles[i]) || designName(m);
      return `<div class="vw-team" style="--c:${esc(c)}"><i></i><b>${esc(name)}</b><em>${esc(o[0])}</em><span>run by ${esc(runBy(m))}${o[1] ? ' · ' + esc(o[1]) : ''}</span></div>`;
    }).join('');
    $('outcome-note').hidden = !pandemic;
    const facts = pandemic
      ? [['test bed', 'PandemicEnv'], ['task', m0.mission], ['study', entry.study || 'stage ' + String(m0.stage || '').toUpperCase()], ['seed', m0.seed], ['testing teams', m0.n_agents], ['alert budget', `${m0.budget.toLocaleString('en-US')} county-days`], ['days', `${m0.days} from 15 May 2021`]]
      : [['test bed', m0.env === 'rescueenv' ? 'RescueEnv' : 'NatureEnv'], ['mission or world', m0.mission], ['seed', m0.seed], ['agents per team', m0.n_agents], ['frames', traces[0].frames.length]];
    if (!pandemic && m0.time) facts.push(['time', m0.time]);
    if (m0.source) facts.push(['source', traces.map((t) => t.meta.source).filter((s, i, a) => s && a.indexOf(s) === i).join('; ')]);
    $('facts').innerHTML = facts.map((r) => '<dt>' + esc(r[0]) + '</dt><dd>' + esc(r[1]) + '</dd>').join('');
    $('legend').hidden = !pandemic; $('taskcard').hidden = !pandemic;
    player.render(0);
    if (autoplay) { player.play(); $('pp').textContent = '❚❚'; } else $('pp').textContent = '▶';
    $('pp').setAttribute('aria-label', autoplay ? 'Pause' : 'Play');
  }

  function describe(entry) {
    const g = GROUPS[entry.gkey] || {}, v = envOf(entry.env);
    $('stage').style.setProperty('--g', (v && v.color) || '#17766b');
    $('kicker').innerHTML = v ? `<i></i><span>${esc(v.title)}</span><em>${esc(taskName(entry))}</em>` : '<i></i><span>Your trace</span>';
    $('title').textContent = entry.name;
    canvas.setAttribute('aria-label', 'Animation of the recording: ' + entry.name);
    $('tags').innerHTML = (entry.tags || []).map((t) => '<span>' + esc(t) + '</span>').join('');
    $('watch').hidden = !entry.takeaway; $('watch-text').textContent = entry.takeaway || '';
    $('about').textContent = entry.about || ''; $('about').hidden = !entry.about;
    $('method').textContent = entry.method || g.method || 'A trace opened from a file: the player draws what the file holds.';
    document.title = (entry.id ? entry.name + ' · ' : '') + 'NatureSwarm Explorer';
  }

  function pager() {
    const f = filtered(), k = f.findIndex((e) => e.id === state.ep), v = envOf(state.env), t = v && v.tasks.find((x) => x.id === state.task);
    const scope = t ? t.title : v ? v.title : 'all episodes';
    $('where').textContent = k >= 0 ? `${k + 1} / ${f.length}` : 'your trace';
    $('where').title = k >= 0 ? `Episode ${k + 1} of ${f.length} in ${scope}` : `${f.length} episodes in ${scope}`;
    $('prev').setAttribute('aria-label', 'Previous episode in ' + scope); $('next').setAttribute('aria-label', 'Next episode in ' + scope);
    $('prev').disabled = $('next').disabled = f.length < 2 && k >= 0;
  }
  function step(d) {
    const f = filtered(); if (!f.length) return;
    const k = f.findIndex((e) => e.id === state.ep);
    select(f[k < 0 ? (d > 0 ? 0 : f.length - 1) : (k + d + f.length) % f.length].id);
  }

  function wait(text) { $('wait').textContent = text; $('wait').classList.add('on'); }

  function select(id, quiet) {
    const entry = byId(id); if (!entry) return;
    state.ep = id; const mine = ++ticket;
    if (!inFilter(entry)) { state.env = 'all'; state.task = 'all'; renderChips(); }
    if (!entry.featured) state.open.add(keyOf(entry));              // the group that holds it is shown in full
    describe(entry); renderList(); pager(); if (!quiet) writeAddress();
    const on = document.querySelector('.vw-item.on');
    if (on && on.scrollIntoView && $('list').offsetParent) { const box = $('list').getBoundingClientRect(), r = on.getBoundingClientRect(); if (r.top < box.top || r.bottom > box.bottom) $('list').scrollTop += r.top - box.top - 60; }
    wait('Loading the recording…');
    Promise.all([loadPlayer(entry.player), Promise.all(entry.traces.map(fetchTrace))])
      .then(([P, t]) => { if (mine !== ticket) return; $('wait').classList.remove('on'); show(P, t, entry); })
      .catch((e) => { if (mine === ticket) wait('This recording could not be loaded (' + e.message + ').'); });
  }

  function own(traces, names, about) {       // traces from the reader's computer
    const mine = ++ticket; state.ep = null;
    const entry = { name: names.join(' and '), tags: ['opened from a file'], about: about, opts: traces.length > 1 ? { titles: traces.map((x) => designName(x.meta)) } : {} };
    describe(entry); renderList(); pager();
    loadPlayer(traces.some((t) => t.meta.scene === 'pandemic') ? pandemicPlayer() : null)
      .then((P) => { if (mine !== ticket) return; $('wait').classList.remove('on'); show(P, traces, entry); })
      .catch((e) => { if (mine === ticket) wait('This trace could not be shown (' + e.message + ').'); });
  }

  // ------------------------------------------------------------------ start
  function start() {
    $('count').textContent = String(EPS.length) + ' recorded';
    $('beds').textContent = ENVS.length === 3 ? 'three test beds' : ENVS.length + ' test beds';
    const legacy = decodeURIComponent((location.hash || '').slice(1));
    const want = byId(query.get('ep')) || byId(legacy) || byId('pandemic-' + legacy);
    const v = envOf(query.get('env')), t = v && v.tasks.find((x) => x.id === query.get('task'));
    if (v && (!want || (want.env === v.id && (!t || want.task === t.id)))) { state.env = v.id; state.task = t ? t.id : 'all'; }
    renderChips();
    const f = filtered(), first = want || f.find((e) => e.featured) || f[0];
    if (first) select(first.id, !want && !v && !location.search); else { renderList(); pager(); wait('No recording could be listed.'); }
  }

  $('prev').addEventListener('click', () => step(-1));
  $('next').addEventListener('click', () => step(1));
  $('expand').addEventListener('click', () => {
    const keys = sectionKeys(), every = keys.every((k) => state.open.has(k));
    keys.forEach((k) => { if (every) state.open.delete(k); else state.open.add(k); });
    renderList();
  });
  function closeDrawer(toStage) {
    const box = $('side'); if (!box.classList.contains('open')) return;
    box.classList.remove('open'); $('open').setAttribute('aria-expanded', 'false');
    if (toStage) $('stage').scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' });
  }
  $('open').addEventListener('click', () => { const on = $('side').classList.toggle('open'); $('open').setAttribute('aria-expanded', on ? 'true' : 'false'); });
  $('file').addEventListener('change', () => {
    const files = Array.from($('file').files).slice(0, 3); if (!files.length) return;
    Promise.all(files.map((f) => f.text().then(JSON.parse).then(window.NatureSwarmTrace.unpack).then(check)))
      .then((t) => own(t, files.map((f) => f.name), 'A trace opened from your computer; it is not uploaded anywhere.'))
      .catch((e) => wait('This file is not a trace (' + e.message + ').'));
  });
  const toggle = () => { if (!player) return; player.toggle(); $('pp').textContent = player.playing ? '❚❚' : '▶'; $('pp').setAttribute('aria-label', player.playing ? 'Pause' : 'Play'); };
  $('pp').addEventListener('click', toggle); canvas.addEventListener('click', toggle);
  $('pos').addEventListener('input', () => { if (player) player.seek($('pos').value / 1000); });
  $('speed').addEventListener('click', (e) => {
    const s = e.target.dataset.s; if (!s) return; speed = +s; if (player) player.speed = speed;
    Array.from($('speed').children).forEach((b) => { b.classList.toggle('on', b === e.target); b.setAttribute('aria-pressed', b === e.target ? 'true' : 'false'); });
  });
  const screen = $('screen');
  const fullscreen = () => { if (document.fullscreenElement) document.exitFullscreen(); else screen.requestFullscreen().catch(() => { /* not allowed here */ }); };
  if (document.fullscreenEnabled && screen.requestFullscreen) {
    $('full').hidden = false; $('full').addEventListener('click', fullscreen);
    document.addEventListener('fullscreenchange', () => { const on = document.fullscreenElement === screen; $('full').setAttribute('aria-pressed', on ? 'true' : 'false'); $('full').setAttribute('aria-label', on ? 'Leave full screen' : 'Full screen'); });
  }
  document.addEventListener('keydown', (e) => {
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    if (/^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(e.target.tagName) && e.key !== '[' && e.key !== ']') return;
    if (e.key === ' ') { e.preventDefault(); toggle(); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { if (!player) return; e.preventDefault(); player.pause(); $('pp').textContent = '▶'; $('pp').setAttribute('aria-label', 'Play'); player.seek((player.time + (e.key === 'ArrowLeft' ? -0.3 : 0.3)) / player.duration); }
    else if (e.key === '[') step(-1); else if (e.key === ']') step(1);
    else if (e.key === 'f' && !$('full').hidden) fullscreen();
  });
  window.addEventListener('hashchange', () => { const id = decodeURIComponent(location.hash.slice(1)), e = byId(id) || byId('pandemic-' + id); if (e && e.id !== state.ep) select(e.id); });

  const getJSON = (u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); });
  getJSON('traces/demos.json').then((d) => (d && d.episodes && d.episodes.length ? d : FALLBACK), () => FALLBACK)
    .then((site) => Promise.all((site.envs || []).filter((v) => v.list).map((v) => getJSON(v.list).then((d) => [v.id, d], () => [v.id, null])))
      .then((pairs) => { const lists = {}; pairs.forEach((p) => { if (p[1] && p[1].episodes) lists[p[0]] = p[1]; }); join(site, lists); }))
    .then(start);

  // for tools/make_posters.js and for tests
  window.NatureSwarmExplorer = { state, select, setFilter, get player() { return player; }, get episodes() { return EPS; }, get envs() { return ENVS; } };
})();
