/* NatureSwarm project page: the evolution demos. Two views of stored runs (data/evolution.js, written by
   scripts/viz/export_evolution.py): (1) a population of ten team designs over five generations, with who was kept
   and whose mutant each newcomer is; (2) eight teams of eight drones under four kinds of selection, with the drones
   that carry a cooperative gene. Nothing is simulated in the browser. Author: Kunlun Zhu. */
(function () {
  'use strict';
  var D = window.NS_EVOLUTION;
  if (!D) return;
  var NS = 'http://www.w3.org/2000/svg';
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs || {}) { if (k === 'class') e.className = attrs[k]; else e.setAttribute(k, attrs[k]); }
    if (text != null) e.textContent = text;
    return e;
  }
  function sv(tag, attrs, text) {
    var e = document.createElementNS(NS, tag);
    for (var k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function pct(v) { return Math.round(100 * v) + '%'; }
  function seg(host, items, current, onPick, label) {
    host.innerHTML = '';
    host.setAttribute('role', 'tablist');
    if (label) host.setAttribute('aria-label', label);
    items.forEach(function (it) {
      var b = el('button', { type: 'button', role: 'tab', 'aria-selected': String(it.key === current) }, it.name);
      b.addEventListener('click', function () { onPick(it.key); });
      host.appendChild(b);
    });
  }

  /* ------------------------------------------------------------------ 1. a population of team designs */
  var COLOR = { coordinator: '#1f5fae', 'two-level': '#7aa3d8', 'ns-neighbour': '#b5367a', 'ns-team': '#dc8fb8',
                threshold: '#1c9e6b', bee: '#b9770a', wolf: '#66797a', solitary: '#b3c0bb' };
  var KEYNAME = [['coordinator', 'Coordinator'], ['two-level', 'Two-level coordinator'], ['ns-neighbour', 'NatureSwarm, neighbour-only relay'],
                 ['ns-team', 'NatureSwarm, team-wide relay'], ['threshold', 'Response-threshold drones'], ['bee', 'Bee design'],
                 ['wolf', 'Wolf-pack pairs'], ['solitary', 'Solitary drones']];
  function colourKey(p) { return p.family === 'mosaic' ? p.kind : p.family; }
  function chipText(p) {
    var g = p.genes;
    if (p.family === 'coordinator') return ['Coordinator', 'one level'];
    if (p.family === 'two-level') return ['Coordinator', 'two levels'];
    if (p.family === 'solitary') return ['Solitary drones', 'nothing shared'];
    if (p.family === 'bee') return ['Bee design', { standard: 'standard', noquorum: 'no quorum', nostop: 'no stop signal', verify: 'recruits verify' }[g.bee]];
    if (p.family === 'wolf') return ['Wolf-pack pairs', g.wolf_roles ? 'lead and flank' : 'no roles'];
    if (p.family === 'threshold') {
      var t = [g.thr_local ? 'local' : null, g.thr_areas ? 'per area' : null, g.thr_adaptive ? 'adaptive' : null].filter(Boolean);
      return ['Response threshold', t.length ? t.join(', ') : 'plain'];
    }
    return ['NatureSwarm', (g.mos_relay === 'contact' ? 'neighbour-only' : 'team-wide') + (g.mos_fade ? ', fade ' + g.mos_fade : '')];
  }
  var GENE = {}; D.genes.forEach(function (g) { GENE[g.key] = g; });
  function geneValue(k, v) {
    var g = GENE[k];
    if (g.values) return g.values[String(v)];
    return v ? 'on' : 'off';
  }

  function Population(root) {
    var stage = root.querySelector('.evo-stage'), detail = root.querySelector('.evo-detail'), summary = root.querySelector('.evo-summary');
    var segHost = root.querySelector('.evo-settings'), chipHost = root.querySelector('.evo-lines'), playBtn = root.querySelector('.evo-play');
    var settings = [];
    D.lines.forEach(function (L) { if (settings.indexOf(L.regime) < 0) settings.push(L.regime); });
    var state = { regime: 'R1', id: null, pinned: null, upto: 4, timer: null };
    var W = 1060, COLW = 208, CW = 180, RH = 42, TOP = 46, CH = 34;

    function lines() { return D.lines.filter(function (L) { return L.regime === state.regime; }); }
    function line() { return D.lines.filter(function (L) { return L.id === state.id; })[0]; }
    function x0(g) { return 10 + g * COLW; }
    function y0(r) { return TOP + r * RH; }

    function controls() {
      seg(segHost, settings.map(function (r) { return { key: r, name: D.lines.filter(function (L) { return L.regime === r; })[0].setting }; }),
          state.regime, function (r) { stop(); state.regime = r; state.id = lines()[0].id; state.pinned = null; state.upto = 4; controls(); draw(); }, 'Setting');
      chipHost.innerHTML = '';
      var count = {};
      lines().forEach(function (L) {
        count[L.model] = (count[L.model] || 0) + 1;
        var b = el('button', { type: 'button', 'aria-pressed': String(L.id === state.id) }, L.model + ' · population ' + count[L.model]);
        b.addEventListener('click', function () { stop(); state.id = L.id; state.pinned = null; state.upto = 4; controls(); draw(); });
        chipHost.appendChild(b);
      });
    }

    function lineage(L, g, r) {       // every (generation, rank) on the line of descent through this genome
      var on = {}; on[g + ':' + r] = 1;
      var gg = g, rr = r;
      while (gg > 0) {                 // back to generation 0
        var o = L.generations[gg].pop[rr].origin;
        if (o.kind === 'start' || (o.from_rank == null && o.parent_rank == null)) break;
        rr = o.kind === 'kept' ? o.from_rank : o.parent_rank; gg -= 1; on[gg + ':' + rr] = 1;
      }
      var front = [[g, r]];             // forward: copies kept and mutants made from it
      while (front.length) {
        var cur = front.pop();
        if (cur[0] >= L.generations.length - 1) continue;
        L.generations[cur[0] + 1].pop.forEach(function (p) {
          var o = p.origin, src = o.kind === 'kept' ? o.from_rank : o.parent_rank;
          if (src === cur[1] && !on[(cur[0] + 1) + ':' + p.rank]) { on[(cur[0] + 1) + ':' + p.rank] = 1; front.push([cur[0] + 1, p.rank]); }
        });
      }
      return on;
    }

    function describe(L, g, r) {
      var p = L.generations[g].pop[r], t = chipText(p), o = p.origin;
      detail.innerHTML = '';
      var head = el('div', { class: 'evo-d-head' });
      head.appendChild(el('span', { class: 'evo-sw', style: 'background:' + COLOR[colourKey(p)] }));
      head.appendChild(el('b', null, p.label));
      head.appendChild(el('span', { class: 'evo-d-fit' }, 'generation ' + g + ', rank ' + (r + 1) + ' of 10 · rescued ' + pct(p.fitness) + ' of victims on this generation\'s training worlds'));
      detail.appendChild(head);
      var how = el('p', { class: 'evo-d-how' });
      if (o.kind === 'start') how.textContent = 'Part of the starting population: five designs with a coordinator and five whose drones decide for themselves, the other genes drawn at random.';
      else if (o.kind === 'kept') how.textContent = 'Kept unchanged: it ranked ' + (o.from_rank + 1) + ' of 10 in generation ' + (g - 1) + ', in the best half.';
      else if (o.parent_rank == null) how.textContent = 'A mutant of one of the five designs kept from generation ' + (g - 1) + '.';
      else {
        var par = L.generations[g - 1].pop[o.parent_rank];
        var expressed = o.changed.filter(function (k) { return p.expressed.indexOf(k) >= 0 || par.expressed.indexOf(k) >= 0; });
        var parts = expressed.map(function (k) { return GENE[k].name.toLowerCase() + ': ' + geneValue(k, par.genes[k]) + ' → ' + geneValue(k, p.genes[k]); });
        var silent = o.changed.length - expressed.length;
        how.textContent = 'A mutant of rank ' + (o.parent_rank + 1) + ' in generation ' + (g - 1) + ' (' + par.label + '). ' +
          (parts.length ? 'Changed: ' + parts.join('; ') + '. ' : 'No gene that this design uses changed. ') +
          (silent ? silent + ' gene' + (silent > 1 ? 's' : '') + ' it does not use also changed.' : '');
      }
      detail.appendChild(how);
      var list = el('ul', { class: 'evo-genes' });
      D.genes.forEach(function (gdef) {
        if (p.expressed.indexOf(gdef.key) < 0) return;
        var li = el('li'); li.appendChild(el('span', null, gdef.name)); li.appendChild(el('b', null, geneValue(gdef.key, p.genes[gdef.key]))); list.appendChild(li);
      });
      detail.appendChild(list);
    }

    function draw() {
      var L = line(), G = L.generations;
      stage.innerHTML = '';
      var H = TOP + 10 * RH + 8;
      var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Ten team designs in each of five generations, ranked by victims rescued, with lines from each design to its copy or mutant in the next generation' });
      var hl = state.pinned ? lineage(L, state.pinned[0], state.pinned[1]) : null;
      var gl = sv('g', { class: 'evo-links' }), gc = sv('g');
      G.forEach(function (gen, g) {
        if (g > state.upto) return;
        gc.appendChild(sv('text', { x: x0(g), y: 20, class: 'evo-gen' }, 'Generation ' + g));
        gc.appendChild(sv('text', { x: x0(g) + CW, y: 20, class: 'evo-gen-r', 'text-anchor': 'end' }, 'rescued'));
        gen.pop.forEach(function (p) {
          var x = x0(g), y = y0(p.rank), on = !hl || hl[g + ':' + p.rank];
          if (g > 0 && p.origin.kind !== 'start') {
            var src = p.origin.kind === 'kept' ? p.origin.from_rank : p.origin.parent_rank;
            if (src != null) {
              var xa = x0(g - 1) + CW, ya = y0(src) + CH / 2, xb = x, yb = y + CH / 2, mx = (xa + xb) / 2;
              var lit = hl && hl[g + ':' + p.rank] && hl[(g - 1) + ':' + src];
              gl.appendChild(sv('path', { d: 'M' + xa + ' ' + ya + ' C' + mx + ' ' + ya + ' ' + mx + ' ' + yb + ' ' + xb + ' ' + yb, fill: 'none',
                stroke: p.origin.kind === 'kept' ? '#7f918d' : '#c8503f', 'stroke-width': lit ? 2.4 : 1.3,
                'stroke-dasharray': p.origin.kind === 'kept' ? '' : '4 3', opacity: hl ? (lit ? 1 : 0.1) : 0.7 }));
            }
          }
          var t = chipText(p);
          var chip = sv('g', { class: 'evo-chip', tabindex: '0', role: 'button', transform: 'translate(' + x + ' ' + y + ')', opacity: on ? 1 : 0.28,
            'aria-label': p.label + ', generation ' + g + ', rank ' + (p.rank + 1) + ', rescued ' + pct(p.fitness) });
          chip.appendChild(sv('rect', { width: CW, height: CH, rx: 8, fill: '#fff', stroke: state.pinned && state.pinned[0] === g && state.pinned[1] === p.rank ? '#15302b' : '#d5e0db',
            'stroke-width': state.pinned && state.pinned[0] === g && state.pinned[1] === p.rank ? 2 : 1 }));
          chip.appendChild(sv('rect', { x: 0, y: CH - 3, width: Math.max(2, CW * p.fitness), height: 3, rx: 1.5, fill: COLOR[colourKey(p)], opacity: 0.55 }));
          chip.appendChild(sv('rect', { x: 8, y: 9, width: 10, height: 10, rx: 3, fill: COLOR[colourKey(p)] }));
          chip.appendChild(sv('text', { x: 25, y: 15, class: 'evo-name' }, t[0]));
          chip.appendChild(sv('text', { x: 25, y: 27, class: 'evo-tag' }, t[1]));
          chip.appendChild(sv('text', { x: CW - 8, y: 19, class: 'evo-fit', 'text-anchor': 'end' }, pct(p.fitness)));
          if (g === G.length - 1 && p.rank === 0) chip.appendChild(sv('text', { x: CW - 8, y: -5, class: 'evo-win', 'text-anchor': 'end' }, 'winner'));
          function pick() { state.pinned = (state.pinned && state.pinned[0] === g && state.pinned[1] === p.rank) ? null : [g, p.rank]; draw(); if (state.pinned) describe(L, g, p.rank); else rest(); }
          chip.addEventListener('click', pick);
          chip.addEventListener('keydown', function (ev) { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); pick(); } });
          chip.addEventListener('mouseenter', function () { if (!state.pinned) describe(L, g, p.rank); });
          chip.addEventListener('focus', function () { if (!state.pinned) describe(L, g, p.rank); });
          gc.appendChild(chip);
        });
      });
      svg.appendChild(gl); svg.appendChild(gc);
      stage.appendChild(svg);
      summarize(L);
      if (!state.pinned) rest();
      playBtn.textContent = state.timer ? 'Pause' : (state.upto < G.length - 1 ? 'Continue' : 'Play the generations');
    }

    function rest() {
      var L = line();
      detail.innerHTML = '';
      detail.appendChild(el('p', { class: 'evo-d-how' }, 'Point at a design to see its genes and where it came from; select it to follow its line of descent. Solid lines: kept unchanged from the best half. Dashed lines: a mutant of the design it starts from.' +
        (L.parents ? '' : ' For this population the parents of mutants are not shown.')));
    }

    function summarize(L) {
      summary.innerHTML = '';
      var n = L.generations.length, last = n - 1;
      var bars = el('div', { class: 'evo-bars', role: 'img', 'aria-label': 'Share of coordinator, NatureSwarm and other designs in each generation' });
      for (var g = 0; g < n; g++) {
        var col = el('div', { class: 'evo-bar' + (g > state.upto ? ' off' : '') });
        [['coordinator', '#1f5fae'], ['natureswarm', '#b5367a'], ['other', '#b3c0bb']].forEach(function (k) {
          var s = el('span', { style: 'flex:' + L.share[k[0]][g] + ' 0 0;background:' + k[1] }); col.appendChild(s);
        });
        col.appendChild(el('i', null, String(g)));
        bars.appendChild(col);
      }
      var left = el('div', { class: 'evo-sum-left' });
      left.appendChild(bars);
      var lg = el('ul', { class: 'evo-key evo-key-s' });
      [['#1f5fae', 'coordinator'], ['#b5367a', 'NatureSwarm'], ['#b3c0bb', 'other']].forEach(function (k) { var li = el('li'); li.appendChild(el('span', { class: 'evo-sw', style: 'background:' + k[0] })); li.appendChild(document.createTextNode(k[1])); lg.appendChild(li); });
      left.appendChild(lg);
      summary.appendChild(left);
      var txt = el('div', { class: 'evo-sum-text' });
      txt.appendChild(el('p', null, 'Designs with a coordinator: ' + pct(L.share.coordinator[0]) + ' of the population at the start, ' + pct(L.share.coordinator[last]) + ' in generation ' + last + '. Winner: ' + L.winner.label + '.'));
      var h = D.heldout.filter(function (o) { return o.regime === L.regime && o.model === L.model; })[0];
      txt.appendChild(el('p', { class: 'evo-held' }, h
        ? 'On new worlds, the winners of this setting rescued ' + h.gain.toFixed(1) + ' percentage points more than the coordinator (95% CI ' + String(h.lo.toFixed(1)).replace('-', '\u2212') + ' to ' + h.hi.toFixed(1) + ')' +
          (h.lo < 0 ? ', a lead not clearly different from zero.' : '.')
        : (L.model === 'Gemini 4 Argon' ? 'Both populations run by the frontier model kept the coordinator.' : 'The same setting run by the frontier model kept the coordinator; choose a Gemini 4 Argon population to see it.')));
      txt.appendChild(el('p', { class: 'evo-note' }, L.note + ' Each design ran on ' + L.generations[0].seeds.length + ' training world' + (L.generations[0].seeds.length > 1 ? 's' : '') + ' per generation, drawn anew each time.'));
      summary.appendChild(txt);
    }

    function stop() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }
    playBtn.addEventListener('click', function () {
      var n = line().generations.length;
      if (state.timer) { stop(); draw(); return; }
      state.pinned = null;
      if (state.upto >= n - 1) state.upto = 0;
      draw();
      state.timer = setInterval(function () {
        if (state.upto >= n - 1) { stop(); draw(); return; }
        state.upto += 1; draw();
      }, reduce ? 700 : 1500);
      draw();
    });

    var key = el('ul', { class: 'evo-key', 'aria-label': 'Colours' });
    KEYNAME.forEach(function (k) { var li = el('li'); li.appendChild(el('span', { class: 'evo-sw', style: 'background:' + COLOR[k[0]] })); li.appendChild(document.createTextNode(k[1])); key.appendChild(li); });
    root.querySelector('.evo-keyhost').appendChild(key);
    state.id = lines()[0].id;
    controls(); draw();
  }

  /* ------------------------------------------------------------------ 2. a cooperative gene under four kinds of selection */
  function Selection(root) {
    var studyHost = root.querySelector('.sel-studies'), regHost = root.querySelector('.sel-regimes'), runHost = root.querySelector('.sel-runs');
    var teamsHost = root.querySelector('.sel-teams'), chartHost = root.querySelector('.sel-chart'), noteHost = root.querySelector('.sel-note');
    var playBtn = root.querySelector('.sel-play'), range = root.querySelector('.sel-range'), genLabel = root.querySelector('.sel-gen');
    var state = { study: 0, regime: 'K', run: 0, gen: 8, timer: null };
    var RC = { I: '#b9770a', G: '#1f5fae', K: '#1c9e6b', R: '#7f918d' };

    function study() { return D.levels[state.study]; }
    function regime() { return study().regimes.filter(function (r) { return r.key === state.regime; })[0]; }
    function run() { return regime().runs[state.run]; }

    function controls() {
      seg(studyHost, D.levels.map(function (s, i) { return { key: i, name: s.title }; }), state.study, function (i) { stop(); state.study = i; state.run = 0; state.gen = 8; controls(); draw(); }, 'Gene and cost');
      regHost.innerHTML = '';
      study().regimes.forEach(function (r) {
        var b = el('button', { type: 'button', class: 'sel-reg', 'aria-pressed': String(r.key === state.regime) });
        b.appendChild(el('span', { class: 'evo-sw', style: 'background:' + RC[r.key] }));
        b.appendChild(el('b', null, r.name));
        b.appendChild(el('span', { class: 'sel-mean' }, r.mean_final.toFixed(2)));
        b.appendChild(el('small', null, 'mean final frequency, ' + r.runs.length + ' runs'));
        b.addEventListener('click', function () { stop(); state.regime = r.key; state.run = 0; state.gen = 8; controls(); draw(); });
        regHost.appendChild(b);
      });
      runHost.innerHTML = '';
      runHost.appendChild(el('span', { class: 'chips-label' }, 'Run'));
      regime().runs.forEach(function (r, i) {
        var b = el('button', { type: 'button', 'aria-pressed': String(i === state.run) }, String(i + 1));
        b.addEventListener('click', function () { stop(); state.run = i; controls(); draw(); });
        runHost.appendChild(b);
      });
    }

    function drawTeams() {
      var G = run().gens[state.gen], W = Math.max(280, Math.min(560, teamsHost.clientWidth || 430)), RH = 30, H = 34 + 8 * RH + 6;
      var pitch = Math.min(27, (W - 52 - (W < 400 ? 52 : 170)) / 7.4), rad = Math.min(9, pitch * 0.37), barX = 52 + 8 * pitch + 6, barW = W - barX - 46;
      teamsHost.innerHTML = '';
      var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Eight teams of eight drones in generation ' + state.gen + '; a filled circle is a drone that carries the cooperative gene' });
      svg.appendChild(sv('text', { x: 0, y: 14, class: 'sel-h' }, 'Team'));
      svg.appendChild(sv('text', { x: 44, y: 14, class: 'sel-h' }, 'Its eight drones'));
      svg.appendChild(sv('text', { x: W, y: 14, class: 'sel-h', 'text-anchor': 'end' }, G.score ? (W < 400 ? 'Rescued' : 'Victims rescued') : 'Not evaluated'));
      G.teams.forEach(function (t, i) {
        var y = 34 + i * RH;
        svg.appendChild(sv('text', { x: 4, y: y + 5, class: 'sel-t' }, String(i + 1)));
        for (var k = 0; k < t.length; k++) {
          var on = t[k] === '1';
          svg.appendChild(sv('circle', { cx: 52 + k * pitch, cy: y, r: rad, fill: on ? RC[state.regime] : '#fff', stroke: on ? RC[state.regime] : '#9fb1ac', 'stroke-width': 1.6 }));
        }
        if (G.score) {
          if (barW > 40) {
            svg.appendChild(sv('rect', { x: barX, y: y - 5, width: barW, height: 10, rx: 5, fill: '#e9f0ed' }));
            svg.appendChild(sv('rect', { x: barX, y: y - 5, width: Math.max(2, barW * G.score[i]), height: 10, rx: 5, fill: '#7f918d' }));
          }
          svg.appendChild(sv('text', { x: W, y: y + 4, class: 'sel-v', 'text-anchor': 'end' }, pct(G.score[i])));
        }
      });
      teamsHost.appendChild(svg);
    }

    function drawChart() {
      var R = regime(), W = Math.max(280, Math.min(560, chartHost.clientWidth || 430)), H = 286, L = 40, Rm = 14, T = 16, B = 40, pw = W - L - Rm, ph = H - T - B;
      function X(g) { return L + pw * g / 8; } function Y(v) { return T + ph * (1 - v); }
      chartHost.innerHTML = '';
      var svg = sv('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': 'Frequency of the cooperative gene by generation in every run under ' + R.name });
      [0, 0.25, 0.5, 0.75, 1].forEach(function (v) {
        svg.appendChild(sv('line', { x1: L, x2: W - Rm, y1: Y(v), y2: Y(v), stroke: v === 0.5 ? '#9fb1ac' : '#e3ebe7', 'stroke-width': 1, 'stroke-dasharray': v === 0.5 ? '3 3' : '' }));
        svg.appendChild(sv('text', { x: L - 8, y: Y(v) + 4, class: 'sel-tick', 'text-anchor': 'end' }, v.toFixed(2).replace(/0$/, '').replace(/\.$/, '')));
      });
      for (var g = 0; g <= 8; g++) svg.appendChild(sv('text', { x: X(g), y: H - B + 16, class: 'sel-tick', 'text-anchor': 'middle' }, String(g)));
      svg.appendChild(sv('text', { x: L + pw / 2, y: H - 6, class: 'sel-axis', 'text-anchor': 'middle' }, W < 400 ? 'Generation (8: after the last selection)' : 'Generation (8 is the population after the last selection step)'));
      svg.appendChild(sv('line', { x1: X(state.gen), x2: X(state.gen), y1: T, y2: T + ph, stroke: '#15302b', 'stroke-width': 1, opacity: 0.35 }));
      R.runs.forEach(function (r, i) {
        var d = r.freq.map(function (v, g) { return (g ? 'L' : 'M') + X(g).toFixed(1) + ' ' + Y(v).toFixed(1); }).join(' ');
        var sel = i === state.run;
        svg.appendChild(sv('path', { d: d, fill: 'none', stroke: sel ? RC[state.regime] : '#b3c0bb', 'stroke-width': sel ? 2.4 : 1.2, 'stroke-linejoin': 'round', opacity: sel ? 1 : 0.8 }));
      });
      var r = run();
      svg.appendChild(sv('circle', { cx: X(state.gen), cy: Y(r.freq[state.gen]), r: 5, fill: RC[state.regime], stroke: '#fff', 'stroke-width': 2 }));
      svg.appendChild(sv('text', { x: Math.min(W - Rm - 2, X(state.gen) + 9), y: Y(r.freq[state.gen]) - 9, class: 'sel-val', 'text-anchor': state.gen > 6 ? 'end' : 'start' }, r.freq[state.gen].toFixed(2)));
      chartHost.appendChild(svg);
    }

    function draw() {
      var S = study(), R = regime();
      drawTeams(); drawChart();
      range.value = String(state.gen);
      genLabel.textContent = 'Generation ' + state.gen + ' of 8';
      var gene = S.key.indexOf('share') >= 0
        ? 'A drone with the sharing gene adds its own finds to the record it passes on; without it, the drone still reads what others share.'
        : 'A drone with the helping gene is shown calls for a second drone at a trapped victim; without it, the drone is not shown them.';
      noteHost.textContent = gene + (S.costly ? ' In this study sharing or helping costs the drone rescue time.' : ' In this study the gene costs the drone nothing.') + ' ' + R.note +
        ' Half of the drones carry the gene at the start (dashed line).';
      playBtn.textContent = state.timer ? 'Pause' : 'Play the generations';
    }

    function stop() { if (state.timer) { clearInterval(state.timer); state.timer = null; } }
    playBtn.addEventListener('click', function () {
      if (state.timer) { stop(); draw(); return; }
      if (state.gen >= 8) state.gen = 0;
      draw();
      state.timer = setInterval(function () { if (state.gen >= 8) { stop(); draw(); return; } state.gen += 1; draw(); }, reduce ? 500 : 900);
      draw();
    });
    range.addEventListener('input', function () { stop(); state.gen = +range.value; draw(); });
    var rz = null;
    window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(draw, 150); });
    controls(); draw();
  }

  function boot() {
    var a = document.getElementById('evo-population'), b = document.getElementById('evo-selection');
    if (a) Population(a);
    if (b && D.levels) Selection(b);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
