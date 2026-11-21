/* NatureSwarm project page: the three interactive blocks of the lab.
 *
 *   1. Comparison lab   two recorded episodes side by side, played by js/natureswarm-player.js from the list of the
 *                       Explorer (traces/demos.json). The player draws both episodes into one canvas that is never
 *                       shown; each side's map is copied from it into a canvas of its own, so the sides can stand
 *                       beside each other on a wide screen and under each other on a phone. Scores are read from the
 *                       frames of the traces. Beside the maps: one line on what to watch, the paper's result over all
 *                       seeds as two large numbers, and a closed "Details".
 *   2. Span of control  the law of the paper, D(N) = D_8 - beta log2(N/8), N* = 8 x 2^(D_8/beta), with the fitted
 *                       values and observed points of data/results.js (written by scripts/viz/export_results.py).
 *   3. Lookup           the design that led in the paper's nearest tested condition, with one number. Every answer
 *                       restates the paper; where the paper has no result the answer says so.
 *
 * No number is typed here that is not in the paper's text or in data/results.js; a comment names the source of each.
 * Author: Kunlun Zhu. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const R = window.NS_RESULTS || null;
  const CO = '#1f5fae', NS = '#b5367a', RT = '#1c9e6b', ONE = '#b9770a', GREY = '#8a9995';
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const num = (v, d) => (v < 0 ? '−' : '') + Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
  const signed = (v, d) => (v > 0 ? '+' : '') + num(v, d === undefined ? 1 : d);
  const FIGS = { fig2: ['media/paper/fig2.png', 'Fig. 2 of the manuscript'], fig3: ['media/paper/fig3.png', 'Fig. 3 of the manuscript'], fig4: ['media/paper/fig4.png', 'Fig. 4 of the manuscript'],
    fig5: ['media/paper/fig5.png', 'Fig. 5 of the manuscript'], fig6: ['media/paper/fig6.png', 'Fig. 6 of the manuscript'], sfig25: ['media/ed_fig1.png', 'Supplementary Fig. 25 of the manuscript'],
    sfig29: ['media/paper/sfig29.png', 'Supplementary Fig. 29 of the manuscript'] };
  const figref = (label, key) => (FIGS[key] ? `<button type="button" class="figref" data-full="${FIGS[key][0]}" data-alt="${FIGS[key][1]}">${esc(label)}</button>` : `<span class="figref" style="cursor:default">${esc(label)}</span>`);
  const modelOf = (name) => (R ? R.scaling.models.filter((m) => m.model === name)[0] : null);

  /* ================================================================================================ 1. comparison lab */
  (function duel() {
    const root = $('#duel'); if (!root || !window.NatureSwarmPlayer || !window.fetch) return;
    const el = { cond: $('#duel-cond'), body: $('#duel-body'), sides: $('#duel-sides'), key: $('#duel-key'), pandemic: $('#duel-pandemic'),
      play: $('#duel-play'), icon: $('#duel-play-icon'), restart: $('#duel-restart'), scrub: $('#duel-scrub'), time: $('#duel-time'),
      watch: $('#duel-watch'), seeds: $('#duel-seeds'), more: $('#duel-more'), rec: $('#duel-rec'), open: $('#duel-open') };
    const PLAY = 'M6 4.5v11l9-5.5z', PAUSE = 'M6 4h3v12H6zM11 4h3v12h-3z';

    // What each design is called, and its colour.
    const MODELS = { 'gemini-2.5-flash-lite': 'Gemini 2.5 Flash-Lite', 'gemini-3.1-flash-lite': 'Gemini 3.1 Flash-Lite', 'gemini-4-argon': 'Gemini 4 Argon', 'or/openai/gpt-oss-20b': 'gpt-oss 20B' };
    function designOf(meta) {
      const d = String(meta.design || '');
      if (/roost|whole|team-wide/i.test(d)) return { key: 'wnr', name: 'NatureSwarm, whole-network relay', color: NS };
      if (/natureswarm|mosaic/i.test(d)) return { key: 'ns', name: 'NatureSwarm', color: NS };
      if (/threshold/i.test(d)) return { key: 'rt', name: 'Response-threshold drones', color: RT };
      if (/^(coordinator|hierarchy)$/i.test(d)) return { key: 'co', name: 'Coordinator', color: CO };
      if (d === 'bee') return { key: 'bee', name: 'Bee design', color: ONE };
      if (d === 'ant') return { key: 'ant', name: 'Ant design', color: ONE };
      if (d === 'flock') return { key: 'flock', name: 'Flock design', color: ONE };
      return { key: d, name: d.charAt(0).toUpperCase() + d.slice(1), color: GREY };
    }
    function runBy(meta) {
      const p = String(meta.policy || '');
      if (p === 'classic') return 'model-free policy';
      if (p.indexOf('llm:') === 0) return MODELS[p.slice(4)] || p.slice(4);
      return p;
    }

    /* The conditions on offer. `ep` is an id of traces/demos.json. `watch` says what to look at, in at most 22 words.
       `nums` are the two large numbers of the paper's result over all seeds for the condition, `cap` names them in a
       few words, `figs` are the figures they come from and `more` is the short text of "Details". Numbers come from
       data/results.js where the paper draws them in a figure, else from the Results (the comment names the passage). */
    const sc = (name, key, n) => { const m = modelOf(name); if (!m) return ''; const k = m.sizes.indexOf(n); return k < 0 ? '' : num(key === 'natureswarm' ? m.natureswarm.y[m.natureswarm.sizes.indexOf(n)] : m[key][k], 1); };
    const fam = (row, d) => { if (!R || !R.natureenv) return ''; const r = R.natureenv.main.rows.filter((x) => x.key === row)[0]; return r ? num(r.scores[d], 1) : ''; };
    const rtAt = (key, n) => { const p = R && R.realtime ? R.realtime.panels[0] : null, k = p ? R.realtime.sizes.indexOf(n) : -1; return k < 0 ? '' : num(p[key][k], 1); };
    const two = (a, an, ac, b, bn, bc) => [[a, an, ac], [b, bn, bc]];
    const ENVS = {
      rescue: [
        { id: 'c128', label: '128 drones', ep: 'rescue-128',
          watch: 'One reply of the coordinator must place every idle drone. NatureSwarm drones choose for themselves. Count the orange sites still waiting.',
          // Results, "Smaller models' coordinators fall behind as teams grow": 41.3%, 79.2%, 78.9%
          nums: () => two('41.3%', 'coordinators', CO, '78.9%', 'NatureSwarm', NS), cap: 'victims rescued with 128 drones', figs: [['Fig. 3e,f', 'fig3']],
          more: () => `Mean of the three smaller models and both worlds; response-threshold drones rescued 79.2%. Gemini 2.5 Flash-Lite alone: ${sc('Gemini 2.5 Flash-Lite', 'coordinator', 128)}% and ${sc('Gemini 2.5 Flash-Lite', 'natureswarm', 128)}%.` },
        { id: 'c8', label: '8 drones', ep: 'rescue-8',
          watch: 'One district, eight drones. The coordinator reads eight reports, and both teams clear nearly the whole map.',
          nums: () => two(sc('Gemini 2.5 Flash-Lite', 'coordinator', 8) + '%', 'coordinator', CO, sc('Gemini 2.5 Flash-Lite', 'natureswarm', 8) + '%', 'NatureSwarm', NS), cap: 'victims rescued with 8 drones', figs: [['Fig. 3f', 'fig3']],
          more: () => 'Gemini 2.5 Flash-Lite, both worlds, three seeds. Against response-threshold drones this coordinator fell behind at about 10 drones.' },
        { id: 'complex', label: 'Complex world', ep: 'rescue-complex-128',
          watch: 'Half of the victims lie under rubble and need two drones at once. More victims appear at time step 25.',
          nums: () => two('41.3%', 'coordinators', CO, '78.9%', 'NatureSwarm', NS), cap: 'victims rescued, both worlds', figs: [['Fig. 3e,f', 'fig3']],
          more: () => 'The paper reports the mean of the simple and the complex world: three smaller models with 128 drones. In the complex world six more victims per district appear at time step 25.' },
        { id: 'threshold', label: 'Response-threshold drones', ep: 'rescue-g31-complex',
          watch: 'The base posts how much each task needs drones. A drone takes a task once the need passes its own threshold.',
          nums: () => two(sc('Gemini 3.1 Flash-Lite', 'coordinator', 128) + '%', 'coordinator', CO, sc('Gemini 3.1 Flash-Lite', 'threshold', 128) + '%', 'response-threshold drones', RT), cap: 'victims rescued with 128 drones', figs: [['Fig. 3f', 'fig3']],
          more: () => 'Gemini 3.1 Flash-Lite, both worlds, three seeds. Its coordinator fell behind these drones at about 21 drones. The recording shows the complex world.' },
        { id: 'oss', label: 'gpt-oss 20B', ep: 'rescue-oss',
          watch: 'The same comparison run by another model. Its coordinator was behind at every team size.',
          nums: () => two(sc('gpt-oss 20B', 'coordinator', 128) + '%', 'coordinator', CO, sc('gpt-oss 20B', 'natureswarm', 128) + '%', 'NatureSwarm', NS), cap: 'victims rescued with 128 drones', figs: [['Fig. 3f', 'fig3']],
          more: () => 'gpt-oss 20B, both worlds, three seeds.' },
        { id: 'frontier', label: '512 drones, frontier model', ep: 'rescue-512',
          watch: 'A frontier model runs the coordinator of 512 drones. A smaller, cheaper model runs NatureSwarm. The maps stay close.',
          nums: () => { const F = R && R.frontier, k = F ? F.sizes.indexOf(512) : -1; return k < 0 ? [] : two(Math.round(F.coordinator.rescued[k]) + '%', 'coordinator', CO, Math.round(F.natureswarm.rescued[k]) + '%', 'NatureSwarm', NS); },
          cap: 'victims rescued with 512 drones', figs: [['Fig. 2f', 'fig2']],
          more: () => { const F = R && R.frontier; return 'Gemini 4 Argon’s coordinator and Gemini 2.5 Flash-Lite’s NatureSwarm, mean of both worlds; the world waits while a model answers.' + (F ? ` List price of an episode: US$${num(F.coordinator.price['512'], 2)} and US$${num(F.natureswarm.price['512'], 2)}.` : '') + ' From 128 to 1,024 drones both rescue rates stayed nearly level.'; } },
        { id: 'realtime', label: 'Real time', ep: 'rescue-512-realtime',
          watch: 'Every model call takes time. Drones that wait for the coordinator’s orders do no work while the fire spreads.',
          // Results, "NatureSwarm holds up under disruptions and when calls take time": 41.0 points (CI 34.0 to 48.3)
          nums: () => two(rtAt('observed', 256) + '%', 'coordinator', CO, rtAt('threshold', 256) + '%', 'response-threshold drones', RT), cap: 'victims rescued with 256 drones', figs: [['Fig. 6d', 'fig6']],
          more: () => 'One time step stands for 10 s. Gemini 4 Argon’s coordinator against Gemini 2.5 Flash-Lite’s response-threshold drones, which led by 41.0 points over 32 to 256 drones (CI 34.0 to 48.3). The recording has 512 drones, more than the teams of that figure.' },
      ],
      nature: [
        { id: 'nest', label: 'Lying scouts', ep: 'bees-liars',
          watch: 'Two scouts, ringed in red, praise the poorest cavity without inspecting it. Bee-design scouts inspect a cavity before dancing for it.',
          // Results: "chose the praised cavity in 94% of episodes"; "never chose that cavity in 18 combinations of model and seed"
          nums: () => two('94%', 'coordinators', CO, 'never', 'bee design', ONE), cap: 'chose the lying scouts’ cavity', figs: [['Fig. 6b', 'fig6']],
          more: () => 'The smaller models’ coordinators chose the praised cavity in 94% of episodes. The bee design never chose it in 18 combinations of model and seed.' },
        { id: 'forage', label: 'New patches', ep: 'forage-renew-pair',
          watch: 'Three more patches flower later. The coordinator sends every forager; ant-design foragers leave marks that fade.',
          nums: () => two(fam('forage', 'hierarchy'), 'coordinator', CO, fam('forage', 'ant'), 'ant design', ONE), cap: 'score of 100, foraging missions', figs: [['Fig. 3a', 'fig3']],
          more: () => `Eight language models; the bee design scored ${fam('forage', 'bee')}. In this recording each agent follows its design’s model-free policy, and no language model is called.` },
        { id: 'trail', label: 'A shortcut opens', ep: 'ants-shortcut-pair',
          watch: 'A fourth, shorter path opens at time step 24. Ants strengthen the trail they walk; unused trails fade.',
          nums: () => two(fam('all', 'hierarchy'), 'coordinator', CO, fam('all', 'ant'), 'ant design', ONE), cap: 'score of 100, all missions', figs: [['Fig. 3a,c', 'fig3']],
          more: () => `All 24 missions, eight language models; the runner-up was the bee design (${fam('all', 'bee')}). The trail missions belong to the foraging family. In this recording each agent follows its design’s model-free policy.` },
        { id: 'migrate', label: 'Hawks on the route', ep: 'birds-llm-heavy',
          watch: 'Ten birds migrate past four hawk zones. The coordinator gives one heading; flock-design birds see their three nearest neighbours.',
          nums: () => two(fam('migrate', 'hierarchy'), 'coordinator', CO, fam('migrate', 'flock'), 'flock design', ONE), cap: 'score of 100, migration missions', figs: [['Fig. 3a', 'fig3']],
          more: () => 'Eight language models. Three of the ten birds know the way, and two of the four hawk zones lie on the route.' },
      ],
    };

    const S = { env: 'rescue', cond: {}, player: null, off: null, sides: [], token: 0, visible: false, userPaused: false, started: false, speed: 1, list: null, cache: {} };
    const getList = () => S.list || (S.list = fetch('traces/demos.json').then((r) => { if (!r.ok) throw new Error('traces/demos.json: ' + r.status); return r.json(); }));
    const unpack = (t) => (window.NatureSwarmTrace ? window.NatureSwarmTrace.unpack(t) : t);
    const getTrace = (u) => S.cache[u] || (S.cache[u] = fetch(u).then((r) => { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); }).then(unpack));

    // where each episode's picture lies inside the player's canvas (player coordinates), by the scene that drew it
    function rects(pl) {
      const st = pl.state, W = window.NatureSwarmPlayer.WIDTH, H = window.NatureSwarmPlayer.HEIGHT;
      if (st.subs) return st.subs.map((q) => [q.x0, st.top, st.pw, st.ph]);
      if (st.panels && st.panels[0] && st.panels[0].size != null) return st.panels.map((p) => [p.x0, p.y0, p.size, p.size]);
      if (st.panels && st.pw) return st.panels.map((p, k) => (st.cols ? [k * (st.pw + st.gap), 0, st.pw, st.ph] : [0, k * (st.ph + st.gap), st.pw, st.ph]));
      return [[0, 0, W, H]];
    }
    function framesOf(pl, k) {
      const st = pl.state;
      if (st.subs) { const q = st.subs[k].S; return { fr: q.fr || (q.tr && q.tr.frames), spt: q.secPerT }; }
      if (st.panels) return { fr: st.panels[k].fr, spt: st.secPerT };
      return { fr: null, spt: 0 };
    }
    function locate(fr, T) {
      const n = fr.length; if (T <= fr[0].t) return [0, 0]; if (T >= fr[n - 1].t) return [n - 2, 1];
      let lo = 0, hi = n - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (fr[m].t <= T) lo = m; else hi = m; }
      return [lo, (T - fr[lo].t) / Math.max(1e-9, fr[hi].t - fr[lo].t)];
    }
    const letter = (k) => (k == null ? 'none' : String.fromCharCode(65 + k));

    // the running score of one side at a time of the player, read from the trace's frames
    function reading(side, time) {
      const fr = side.fr, meta = side.meta, scene = side.scene, o = meta.outcome || {};
      if (!fr || !side.spt || fr.length < 2) return null;
      const [i, u] = locate(fr, time / side.spt), A = fr[i], B = fr[i + 1], done = A.score.done + (B.score.done - A.score.done) * u, total = A.score.total;
      const F = u < 0.5 ? A : B, last = fr[fr.length - 1], ended = i >= fr.length - 2 && u >= 0.999;
      if (scene === 'rescue') {
        const lost = F.agents.filter((a) => a.state === 'lost').length;
        return { value: Math.round(100 * done / total) + '%', label: 'victims rescued', frac: done / total, foot: `time step ${Math.round(A.t + (B.t - A.t) * u)} of ${Math.round(last.t)} · ${lost} ${lost === 1 ? 'drone' : 'drones'} lost` };
      }
      if (scene === 'bees') {
        const round = Math.min(Math.floor(time / side.spt) + 1, Math.max(1, Math.ceil(last.t - 1.8)));
        const end = ended && o.chosen != null ? `chose cavity ${letter(o.chosen)} in round ${o.round}` + (o.chose_best ? ', the best one' : `; the best was cavity ${letter(o.best)}`) : `round ${round}`;
        return { value: `${Math.round(done)} of ${total}`, label: 'scouts at the leading cavity', frac: done / total, foot: end };
      }
      if (scene === 'birds') {
        const lost = F.agents.filter((a) => a.state === 'lost').length;
        return { value: `${F.score.done} of ${total}`, label: 'birds at the wintering ground', frac: F.score.done / total, foot: `time step ${Math.min(fr.length, i + 1)} of ${fr.length} · ${lost} taken by hawks` };
      }
      return { value: num(done, 1), label: 'food brought home', frac: side.max ? done / side.max : 0, foot: `time step ${Math.min(fr.length, i + 1)} of ${fr.length}` };
    }

    function sync() { el.icon.setAttribute('d', S.player && S.player.playing ? PAUSE : PLAY); el.play.setAttribute('aria-label', S.player && S.player.playing ? 'Pause' : 'Play'); }
    function onframe(t, dur) {
      const pl = S.player; if (!pl) return;
      S.sides.forEach((sd) => {
        const r = sd.rect; sd.ctx.drawImage(S.off, r[0] * S.dpr, r[1] * S.dpr, r[2] * S.dpr, r[3] * S.dpr, 0, 0, sd.canvas.width, sd.canvas.height);
        const q = reading(sd, t); if (!q) return;
        if (sd.shown.value !== q.value) { sd.out.value.textContent = q.value; sd.shown.value = q.value; }
        if (sd.shown.foot !== q.foot) { sd.out.foot.textContent = q.foot; sd.shown.foot = q.foot; }
        sd.out.bar.style.width = (100 * Math.max(0, Math.min(1, q.frac))).toFixed(1) + '%';
      });
      if (!el.scrub.matches(':active')) el.scrub.value = String(Math.round(1000 * t / dur));
      el.time.textContent = t.toFixed(1) + ' / ' + dur.toFixed(1) + ' s';
    }

    function build(cond, entry, list) {
      if (S.player) S.player.pause();
      // the coordinator stands at the left in every condition (the two episodes share one world, so the order is free)
      const traces = list.map((t, k) => [t, k]).sort((a, b) => (designOf(b[0].meta).key === 'co') - (designOf(a[0].meta).key === 'co') || a[1] - b[1]).map((x) => x[0]);
      const scene = traces[0].meta.scene || 'rescue', designs = traces.map((t) => designOf(t.meta));
      S.dpr = Math.min(2, window.devicePixelRatio || 1);
      S.off = document.createElement('canvas');
      const pl = S.player = window.NatureSwarmPlayer.mount(S.off, traces.length === 1 ? traces[0] : traces,
        { dpr: S.dpr, titles: designs.map((d) => d.name), colors: designs.map((d) => d.color), subs: designs.map(() => ''), headline: '', subline: '' });
      pl.speed = S.speed;
      const R4 = rects(pl), maxFood = Math.max.apply(null, traces.map((t) => (t.frames[t.frames.length - 1].score.done || 0)));
      el.sides.textContent = '';
      el.sides.className = 'duel-sides' + (R4[0][2] / R4[0][3] > 2 ? ' rows' : '') + (traces.length === 3 ? ' three' : '');
      S.sides = traces.map((tr, k) => {
        const d = designs[k], r = R4[k] || R4[0], f = framesOf(pl, k);
        const box = document.createElement('section'); box.className = 'side'; box.style.setProperty('--c', d.color);
        box.innerHTML = `<div class="side-head"><b class="side-name">${esc(d.name)}</b><div class="side-score"><b>&nbsp;</b><span></span></div><p class="side-sub">${esc(runBy(tr.meta))}</p></div><div class="side-bar"><i></i></div><canvas></canvas><p class="side-foot">&nbsp;</p>`;
        const cv = $('canvas', box); cv.width = Math.round(r[2] * S.dpr); cv.height = Math.round(r[3] * S.dpr);
        cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', `Recorded episode, ${d.name}: ${cond.label}`);
        cv.addEventListener('click', toggle);
        el.sides.appendChild(box);
        const sd = { rect: r, canvas: cv, ctx: cv.getContext('2d'), fr: f.fr, spt: f.spt, meta: tr.meta, scene, max: maxFood, shown: {},
          out: { value: $('.side-score b', box), label: $('.side-score span', box), bar: $('.side-bar i', box), foot: $('.side-foot', box) } };
        const q0 = reading(sd, 0); sd.out.label.textContent = q0 ? q0.label : '';
        return sd;
      });
      el.key.hidden = scene !== 'rescue';
      pl.onframe = onframe;
      S.userPaused = false;
      if (calm) pl.render(pl.duration * 0.6); else { pl.render(0); if (S.visible) pl.play(); }
      sync();
    }

    function describe(cond, entry) {
      el.watch.textContent = cond.watch;
      const n = cond.nums();
      el.seeds.innerHTML = '<p class="as-k">In the paper, all seeds</p>'
        + `<p class="as-nums">${n.map((x) => `<span style="--c:${x[2]}"><b>${esc(x[0])}</b><i>${esc(x[1])}</i></span>`).join('')}</p>`
        + `<p class="as-cap"><span>${esc(cond.cap)}</span> ${cond.figs.map((f) => figref(f[0], f[1])).join(' ')}</p>`;
      el.more.textContent = cond.more();
      // one line on the recording itself: the tags of the Explorer's list (team size, world, model, seed)
      el.rec.textContent = 'One recorded episode: ' + (entry.tags || []).join(', ') + '.';
      el.open.href = 'viewer.html?ep=' + encodeURIComponent(entry.id);
    }

    function load() {
      const cond = S.cond[S.env]; if (!cond) return;
      const mine = ++S.token; S.started = true;
      if (S.player) S.player.pause();
      el.sides.className = 'duel-sides'; el.sides.innerHTML = '<p class="duel-wait" role="status">Loading the recordings…</p>'; S.sides = [];
      getList().then((d) => {
        const entry = (d.episodes || []).filter((e) => e.id === cond.ep)[0];
        if (!entry) throw new Error('episode ' + cond.ep + ' is not in the list');
        if (mine === S.token) describe(cond, entry);
        return Promise.all(entry.traces.map(getTrace)).then((tr) => { if (mine === S.token) build(cond, entry, tr); });
      }).catch((e) => { if (mine !== S.token) return; el.sides.innerHTML = '<p class="duel-wait" role="alert">The recordings could not be loaded. They need this folder to be served over HTTP. <a href="viewer.html">Open the Explorer</a></p>'; if (window.console) console.warn('comparison lab:', e.message); });
    }

    function conditions() {
      const list = ENVS[S.env] || [];
      el.cond.innerHTML = '<legend class="vh">Condition</legend>' + list.map((c) => `<label><input type="radio" name="duel-cond" value="${c.id}"${S.cond[S.env] === c ? ' checked' : ''}><span>${esc(c.label)}</span></label>`).join('');
    }
    function setEnv(env) {
      S.env = env;
      const pan = env === 'pandemic';
      el.cond.hidden = pan; el.body.hidden = pan; el.pandemic.hidden = !pan;
      if (pan) { if (S.player) { S.player.pause(); sync(); } S.token++; return; }
      if (!S.cond[env]) S.cond[env] = ENVS[env][0];
      conditions();
      if (S.started) load();
    }
    function toggle() { if (!S.player) return; S.player.toggle(); S.userPaused = !S.player.playing; sync(); }

    $$('input[name="duel-env"]', root).forEach((r) => r.addEventListener('change', () => { if (r.checked) setEnv(r.value); }));
    el.cond.addEventListener('change', (e) => { const c = (ENVS[S.env] || []).filter((x) => x.id === e.target.value)[0]; if (c) { S.cond[S.env] = c; load(); } });
    el.play.addEventListener('click', toggle);
    el.restart.addEventListener('click', () => { if (S.player) { S.player.render(0); S.userPaused = false; S.player.play(); sync(); } });
    el.scrub.addEventListener('input', () => { if (S.player) S.player.seek(el.scrub.value / 1000); });
    $$('input[name="duel-speed"]', root).forEach((r) => r.addEventListener('change', () => { if (r.checked) { S.speed = +r.value; if (S.player) S.player.speed = S.speed; } }));

    S.cond.rescue = ENVS.rescue[0]; S.cond.nature = ENVS.nature[0];
    const checked = $('input[name="duel-env"]:checked', root); setEnv(checked ? checked.value : 'rescue');
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es, io) => { if (es.some((e) => e.isIntersecting)) { io.disconnect(); if (!S.started && S.env !== 'pandemic') load(); S.started = true; } }, { rootMargin: '700px 0px' }).observe(root);
      // one callback can carry several entries (out of view, then in view again): the newest one counts
      new IntersectionObserver((es) => { S.visible = es[es.length - 1].isIntersecting; const pl = S.player; if (!pl) return; if (S.visible && !S.userPaused && !calm && S.env !== 'pandemic') pl.play(); else if (!S.visible) pl.pause(); sync(); }, { threshold: 0.12 }).observe(el.body);
    } else { S.visible = true; S.started = true; load(); }
    document.addEventListener('visibilitychange', () => { if (document.hidden && S.player) { S.player.pause(); sync(); } else if (!document.hidden && S.player && S.visible && !S.userPaused && !calm && S.env !== 'pandemic') { S.player.play(); sync(); } });
  })();

  /* ================================================================================================ 2. span of control */
  (function law() {
    const host = $('#law-plot'); if (!host || !R || !R.law) return;
    const SVG = 'http://www.w3.org/2000/svg';
    const el = { models: $('#law-models'), n: $('#law-n'), nOut: $('#law-n-out'), d8: $('#law-d8'), beta: $('#law-beta'), nstar: $('#law-nstar'), at: $('#law-at'), note: $('#law-note'), table: $('#law-table .ct-table') };
    // the models from the shortest span of control to the longest
    const L = R.law.models.slice().sort((a, b) => (a.n_star || 1e9) - (b.n_star || 1e9));
    const S = { m: Math.max(0, L.map((m) => m.model).indexOf('Gemini 3.1 Flash-Lite')), x: 6 };
    const X0 = 2.72, X1 = 10.28, Y0 = -70, Y1 = 22, SIZES = [8, 16, 32, 64, 128, 256, 512, 1024];
    const mk = (name, attrs, parent) => { const e = document.createElementNS(SVG, name); for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]); if (parent) parent.appendChild(e); return e; };
    const law = (m, n) => m.d8 - m.beta * Math.log2(n / 8);         // equation (1) of the manuscript
    const nOf = (x) => Math.round(Math.pow(2, x));
    let G = null;

    // what the paper says about each model's line (Results, "A law fitted on small teams estimates the coordinator's limit"; Methods M3, M5)
    function noteOf(m) {
      const pred = m.points.filter((p) => !p.fitted);
      if (m.model === 'Gemini 3.1 Flash-Lite') return `The worked example of the paper. The law predicts that this coordinator trails by ${num(-pred[0].predicted, 1)} points with 64 drones and by ${num(-pred[1].predicted, 1)} with 128. It trailed by ${num(-pred[0].observed, 1)} and ${num(-pred[1].observed, 1)}.`;
      if (m.model === 'gpt-oss 20B') return 'This coordinator fell behind faster than the law predicted. It is the one model of seven for which the predictions for 64 and 128 drones were far off.';
      if (m.model === 'Gemini 4 Argon') return 'The frontier model. The law projected that its coordinator would fall behind. It still led with 1,024 drones, so this test of the law failed. Argon’s coordinator is compared with decentralized designs run by Gemini 2.5 Flash-Lite.';
      if (m.model === 'Gemini 2.5 Flash-Lite') return 'The fitted line starts below zero, so the law puts this coordinator behind from eight drones on. Against response-threshold drones alone it fell behind at about 10 drones.';
      return 'One of three models run to test the law. Its line was fitted on 8 to 32 drones before its larger teams were run, and it is compared with decentralized designs run by the smaller models.';
    }

    function draw() {
      const m = L[S.m], W = Math.max(300, Math.round(host.clientWidth || 640)), H = W < 520 ? 300 : 360, mg = { l: 44, r: 12, t: 24, b: 40 };
      const iw = W - mg.l - mg.r, ih = H - mg.t - mg.b;
      const sx = (x) => mg.l + (x - X0) / (X1 - X0) * iw, sy = (y) => mg.t + (Y1 - y) / (Y1 - Y0) * ih;
      host.textContent = '';
      const svg = mk('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, 'aria-hidden': 'true' }, host);
      // who is ahead: above and below zero
      mk('rect', { x: mg.l, y: mg.t, width: iw, height: sy(0) - mg.t, fill: 'rgba(31,95,174,0.05)' }, svg);
      mk('rect', { x: mg.l, y: sy(0), width: iw, height: mg.t + ih - sy(0), fill: 'rgba(181,54,122,0.045)' }, svg);
      // sizes at which this model has no run
      if (m.last < 1024) {
        const x = sx(Math.log2(m.last) + 0.25);
        mk('rect', { x: x, y: mg.t, width: mg.l + iw - x, height: ih, fill: 'rgba(255,255,255,0.62)' }, svg);
        mk('line', { x1: x, x2: x, y1: mg.t, y2: mg.t + ih, stroke: '#c9d6d1', 'stroke-width': 1 }, svg);
        const room = mg.l + iw - x, zone = room > 250 ? `projection; runs end at ${num(m.last)} drones` : room > 76 ? 'projection' : '';
        if (zone) mk('text', { x: (x + mg.l + iw) / 2, y: mg.t + ih - 10, 'text-anchor': 'middle', class: 'lw-zone' }, svg).textContent = zone;
      }
      [-60, -40, -20, 0, 20].forEach((v) => {
        mk('line', { x1: mg.l, x2: mg.l + iw, y1: sy(v), y2: sy(v), stroke: v === 0 ? '#8fa39d' : '#e3ebe7', 'stroke-width': v === 0 ? 1.4 : 1 }, svg);
        mk('text', { x: mg.l - 8, y: sy(v) + 4, 'text-anchor': 'end', class: 'lw-tick' }, svg).textContent = num(v);
      });
      SIZES.forEach((n) => {
        const x = sx(Math.log2(n));
        mk('line', { x1: x, x2: x, y1: mg.t + ih, y2: mg.t + ih + 5, stroke: '#c9d6d1' }, svg);
        if (W >= 440 || [16, 64, 256].indexOf(n) < 0) mk('text', { x: x, y: mg.t + ih + 19, 'text-anchor': 'middle', class: 'lw-tick' }, svg).textContent = num(n);
      });
      mk('text', { x: 2, y: 13, class: 'lw-axis' }, svg).textContent = 'Coordinator advantage (percentage points)';
      mk('text', { x: mg.l + iw, y: H - 4, 'text-anchor': 'end', class: 'lw-axis' }, svg).textContent = 'Team size (drones)';
      mk('text', { x: mg.l + iw - 8, y: mg.t + 16, 'text-anchor': 'end', class: 'lw-zone' }, svg).textContent = 'coordinator ahead';
      mk('text', { x: mg.l + 8, y: mg.t + ih - 10, class: 'lw-zone' }, svg).textContent = W >= 520 ? 'best decentralized design ahead' : 'decentralized ahead';
      // the law: solid over the sizes it was fitted on, dashed where it predicts
      const fitEnd = Math.max.apply(null, m.fitted_on), y8 = law(m, 8), yf = law(m, fitEnd), ye = law(m, 1024);
      const clipY = (n, y) => (y < Y0 ? [Math.log2(8) + (m.d8 - Y0) / m.beta, Y0] : [Math.log2(n), y]);
      const end = clipY(1024, ye);
      mk('line', { x1: sx(3), y1: sy(y8), x2: sx(Math.log2(fitEnd)), y2: sy(yf), stroke: CO, 'stroke-width': 2.6, 'stroke-linecap': 'round' }, svg);
      mk('line', { x1: sx(Math.log2(fitEnd)), y1: sy(yf), x2: sx(end[0]), y2: sy(end[1]), stroke: CO, 'stroke-width': 2.2, 'stroke-dasharray': '6 5', 'stroke-linecap': 'round' }, svg);
      // the span of control: where the line crosses zero
      const ns = m.n_star;
      if (ns != null) {
        const inside = ns >= 8, xs = sx(inside ? Math.log2(ns) : 3), q = 6;
        mk('line', { x1: xs, x2: xs, y1: sy(0) - 34, y2: sy(0), stroke: '#15302b', 'stroke-width': 1.4 }, svg);
        mk('path', { d: `M${xs},${sy(0) - q}L${xs + q},${sy(0)}L${xs},${sy(0) + q}L${xs - q},${sy(0)}Z`, fill: '#15302b', stroke: '#fff', 'stroke-width': 1.6 }, svg);
        const over = m.points.some((p) => ns >= 8 && p.n > ns && p.observed > 0);
        const lab = inside ? `N* ≈ ${num(Math.round(ns))}` + (over ? ' (projected)' : '') : 'N*: 8 or fewer';
        const anchor = xs > mg.l + iw - 90 ? 'end' : 'start';
        mk('text', { x: xs + (anchor === 'end' ? -8 : 8), y: sy(0) - 24, 'text-anchor': anchor, class: 'lw-flag' }, svg).textContent = lab;
      }
      // observed points: filled where they were used in the fit, open for the larger teams
      m.points.forEach((p) => {
        mk('circle', { cx: sx(Math.log2(p.n)), cy: sy(Math.max(Y0, p.observed)), r: p.fitted ? 5.4 : 5, fill: p.fitted ? CO : '#fff', stroke: p.fitted ? '#fff' : CO, 'stroke-width': p.fitted ? 1.8 : 2.4 }, svg);
      });
      const cur = mk('g', {}, svg);
      G = { svg, cur, sx, sy, mg, iw, ih, W, H };
      cursor();
    }

    function cursor() {
      if (!G) return;
      const m = L[S.m], n = nOf(S.x), g = G.cur, y = law(m, n), yy = Math.max(Y0, Math.min(Y1, y)), x = G.sx(S.x);
      g.textContent = '';
      mk('line', { x1: x, x2: x, y1: G.mg.t, y2: G.mg.t + G.ih, stroke: '#3f5551', 'stroke-width': 1, 'stroke-dasharray': '3 3' }, g);
      const obs = m.points.filter((p) => p.n === n)[0];
      if (obs) mk('circle', { cx: x, cy: G.sy(Math.max(Y0, obs.observed)), r: 9.5, fill: 'none', stroke: CO, 'stroke-width': 1.6 }, g);
      mk('circle', { cx: x, cy: G.sy(yy), r: 6.5, fill: '#15302b', stroke: '#fff', 'stroke-width': 2 }, g);
      const txt = signed(y), w = txt.length * 7.6 + 16, left = x + 12 + w > G.W - 4, bx = left ? x - 12 - w : x + 12, by = Math.max(G.mg.t + 2, Math.min(G.mg.t + G.ih - 24, G.sy(yy) - 30));
      mk('rect', { x: bx, y: by, width: w, height: 22, rx: 7, fill: '#15302b' }, g);
      mk('text', { x: bx + w / 2, y: by + 15.5, 'text-anchor': 'middle', class: 'lw-cur' }, g).textContent = txt;
      // the read-out beside the chart
      el.nOut.textContent = num(n) + ' drones';
      el.n.setAttribute('aria-valuetext', num(n) + ' drones');
      let s = `With <b>${num(n)} drones</b> the law gives <b>${signed(y)} points</b>`;
      if (obs) s += `; observed, <b>${signed(obs.observed)}</b>.`;
      else if (n > m.last) s += `, a projection: this model ran with 8 to ${num(m.last)} drones.`;
      else s += '.';
      el.at.innerHTML = s;
    }

    function readout() {
      const m = L[S.m];
      el.d8.textContent = signed(m.d8) + ' points';
      el.beta.textContent = num(m.beta, 1) + ' points';
      // where the coordinator still led beyond the size at which the law puts its lead at zero, say so beside N*
      // (Gemini 4 Argon: the paper gives no span for it and reports that this projection failed)
      const led = m.points.filter((p) => m.n_star >= 8 && p.n > m.n_star && p.observed > 0).map((p) => p.n);
      const largest = Math.max(...m.points.map((p) => p.n));      // a span beyond the largest team run is an extrapolation
      const beyond = m.n_star > largest ? `<small>beyond the largest team run (${num(largest)} drones)</small>` : '';
      el.nstar.innerHTML = m.n_star >= 8
        ? 'about ' + num(Math.round(m.n_star)) + ' drones' + (led.length ? `<small>the law’s projection; the coordinator still led with ${num(Math.max(...led))} drones</small>` : beyond)
        : '8 drones or fewer<small>the fitted line starts below zero</small>';
      el.note.textContent = noteOf(m);
      host.setAttribute('aria-label', `Coordinator advantage against team size for ${m.model}: the law starts at ${signed(m.d8)} points with eight drones and falls by ${num(m.beta, 1)} points per doubling.`);
      const rows = m.points.map((p) => `<tr><th>${num(p.n)}</th><td>${signed(p.observed)}</td><td>${signed(law(m, p.n))}</td><td>${p.fitted ? 'used in the fit' : 'predicted'}</td></tr>`).join('');
      el.table.innerHTML = `<table><thead><tr><th>Team size (drones)</th><th>Observed advantage (points)</th><th>The law (points)</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
    }

    el.models.innerHTML = '<legend class="vh">Model that runs the coordinator</legend>' + L.map((m, k) => `<label><input type="radio" name="law-model" value="${k}"${k === S.m ? ' checked' : ''}><span>${esc(m.model)}</span></label>`).join('');
    el.models.addEventListener('change', (e) => { S.m = +e.target.value; readout(); draw(); });
    el.n.addEventListener('input', () => { S.x = +el.n.value; cursor(); });
    // dragging on the chart moves the team size; it snaps to the sizes that were run
    const fromPointer = (e) => {
      if (!G) return; const r = G.svg.getBoundingClientRect(), px = (e.clientX - r.left) * (G.W / r.width);
      let x = X0 + (px - G.mg.l) / G.iw * (X1 - X0); x = Math.max(3, Math.min(10, x));
      const near = Math.round(x); if (Math.abs(x - near) < 0.14) x = near; else x = Math.round(x * 20) / 20;
      S.x = x; el.n.value = String(x); cursor();
    };
    let drag = false;
    host.addEventListener('pointerdown', (e) => { drag = true; if (e.pointerType === 'mouse') e.preventDefault(); if (host.setPointerCapture) { try { host.setPointerCapture(e.pointerId); } catch (err) { /* not capturable */ } } fromPointer(e); });
    host.addEventListener('pointermove', (e) => { if (drag) fromPointer(e); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((t) => host.addEventListener(t, () => { drag = false; }));
    el.n.value = String(S.x);
    readout(); draw();
    if (window.ResizeObserver) { let w0 = host.clientWidth; new ResizeObserver(() => { if (Math.abs(host.clientWidth - w0) > 4) { w0 = host.clientWidth; draw(); } }).observe(host); }
    else window.addEventListener('resize', draw);
  })();

  /* ================================================================================================ 3. lookup */
  (function chooser() {
    const form = $('#chooser-form'); if (!form) return;
    const out = { status: $('#chooser-status'), label: $('#chooser-label'), lead: $('#chooser-lead'), num: $('#chooser-num'), cap: $('#chooser-cap'), why: $('#chooser-why'), refs: $('#chooser-refs'), range: $('#chooser-range') };
    const STATUS = { tested: 'Tested in the paper', near: 'Nearest tested condition', none: 'Not tested in the paper' };
    const LABEL = { tested: 'Led in the paper', near: 'Led in the nearest tested condition', none: 'For this combination' };
    const rt = R && R.realtime ? R.realtime.panels[0] : null, rtk = (n) => (R && R.realtime ? R.realtime.sizes.indexOf(n) : -1);
    const argon8 = R && R.law ? (R.law.models.filter((m) => m.model === 'Gemini 4 Argon')[0] || { points: [] }).points.filter((p) => p.n === 8)[0] : null;
    const allm = R && R.natureenv ? R.natureenv.main.rows.filter((r) => r.key === 'all')[0].scores : null;

    /* Every answer restates the paper: the design that led (`lead`), one number with a few words (`n`, `cap`), the
       figures, and for "Details" the longer sentence (`why`) and the tested range (`range`). Where the paper has no
       result the answer says so, and its number is the nearest tested condition, named as such. Sources, by answer:
       the Results of paper_nmi/sections/main_text.tex (the passage named in the comment), with figure values from
       data/results.js where a number is read from a figure. */
    function answer(q) {
      const small = q.model === 'small', F3 = [['Fig. 3e,f', 'fig3']], F6d = [['Fig. 6d', 'fig6']];
      if (q.time === 'wait' && q.links === 'ok') {
        if (small) {
          if (q.size === 's8') return { s: 'tested', c: CO, lead: 'Coordinator, level with NatureSwarm',
            // "Coordinators lead in small, reliable teams": 74.9, 9.8, 4.0 (CI -0.5 to 10.7)
            n: allm ? num(allm.hierarchy, 1) : '74.9', cap: 'NatureEnv score of 100 with a coordinator',
            why: 'Across NatureEnv’s 24 missions, teams with a coordinator scored 9.8 points above the best single-mechanism design. NatureSwarm did as well: on new seeds NatureSwarm, whole-network relay, scored 4.0 points above the coordinator (CI −0.5 to 10.7).',
            figs: [['Fig. 3a–c', 'fig3']], range: 'NatureEnv, 8 to 10 agents, eight language models. In the drone rescue with eight drones the lead depended on the model: gpt-oss 20B’s coordinator was behind at every size (Fig. 3f).' };
          if (q.size === 's32') return { s: 'tested', c: NS, lead: 'Decentralized designs take the lead',
            // "A law fitted on small teams...": about 10, about 21, every size; "Smaller models' coordinators fall behind": 0.7, 13.2
            n: '−13.2 points', cap: 'coordinators against NatureSwarm, 32 drones',
            why: 'Against response-threshold drones, a coordinator fell behind at about 10 drones with Gemini 2.5 Flash-Lite, at about 21 with Gemini 3.1 Flash-Lite and at every size with gpt-oss 20B. With 32 drones the coordinators trailed NatureSwarm by 13.2 points where teams grew by districts, and were level with it (0.7 points apart) in one shared area.',
            figs: [['Fig. 3f', 'fig3'], ['Fig. 4e', 'fig4']], range: 'Three smaller models, two worlds, three seeds. The law put their span of control at about ten drones.' };
          if (q.size === 's128') return { s: 'tested', c: RT, lead: 'Response-threshold drones and NatureSwarm',
            n: '79.2% against 41.3%', cap: 'victims rescued with 128 drones',
            why: 'With 128 drones the smaller models’ coordinators rescued 41.3% of victims, response-threshold drones 79.2% and NatureSwarm 78.9%. The gap to response-threshold drones widened by 10.0 points with each doubling of the team (CI 8.3 to 11.6).',
            figs: F3, range: 'Three smaller models, 8 to 128 drones, teams grown by districts of eight. In one shared area with 64 drones the coordinators trailed NatureSwarm by 9.1 points, against 21.7 in the district worlds.' };
          return { s: 'none', c: GREY, lead: 'No coordinator of a smaller model ran at this size',
            n: '79.2% against 41.3%', cap: 'nearest tested: 128 drones, response-threshold drones against coordinators',
            why: 'The smaller models’ coordinators ran with up to 128 drones. There, response-threshold drones (79.2% of victims rescued) and NatureSwarm (78.9%) led the coordinators (41.3%). Gemini 2.5 Flash-Lite’s decentralized designs did run with 128 to 1,024 drones, and their rescue rates stayed nearly level.',
            figs: [['Fig. 3e,f', 'fig3'], ['Fig. 2f', 'fig2']], range: 'Coordinators of the smaller models: 8 to 128 drones. Decentralized designs of Gemini 2.5 Flash-Lite: up to 1,024 drones.' };
        }
        // "A frontier model's coordinator keeps its lead while the world waits": 4.3 (CI 1.1 to 6.7); 73.3%, 69.7%; 3.0 (CI 0.8 to 4.3); US$1.94, US$7.04
        if (q.size === 's8') return { s: 'tested', c: CO, lead: 'Coordinator',
          n: argon8 ? signed(argon8.observed) + ' points' : '', cap: 'over the best decentralized design, eight drones',
          why: 'Gemini 4 Argon’s coordinator with eight drones. With 16 drones, both evolving populations run by the frontier model kept the coordinator.',
          figs: [['Fig. 4e', 'fig4'], ['Supplementary Fig. 25c', 'sfig25']], range: 'One frontier model, Gemini 4 Argon, in turn-based time. Its coordinator is compared with decentralized designs run by Gemini 2.5 Flash-Lite.' };
        if (q.size === 's32' || q.size === 's128') return { s: 'tested', c: CO, lead: 'Coordinator',
          n: '+4.3 points', cap: 'over NatureSwarm, 32 to 128 drones',
          why: 'Argon’s coordinator led NatureSwarm run by the same model (CI 1.1 to 6.7).' + (q.size === 's32' ? ' With 16 drones, both evolving populations run by the frontier model kept the coordinator.' : ''),
          figs: q.size === 's32' ? [['Fig. 3f', 'fig3'], ['Supplementary Fig. 25c', 'sfig25']] : [['Fig. 3f', 'fig3']], range: 'One frontier model, Gemini 4 Argon, 32 to 128 drones, in turn-based time: the world pauses while a model answers.' };
        return { s: 'tested', c: CO, lead: 'Coordinator, at over three times the price',
          n: '+3.0 points', cap: 'over the better decentralized design, both worlds',
          why: 'With 1,024 drones in the complex world, Argon’s coordinator rescued 73.3% of victims and Gemini 2.5 Flash-Lite’s NatureSwarm 69.7%. The lead of 3.0 points has a CI of 0.8 to 4.3. At list prices an episode cost US$7.04 with the coordinator and US$1.94 with NatureSwarm.',
          figs: [['Fig. 2f', 'fig2']], range: 'Gemini 4 Argon’s coordinator, 128 to 1,024 drones, in turn-based time. At these sizes the decentralized designs were run by the smaller model, Gemini 2.5 Flash-Lite.' };
      }
      if (q.time === 'wait' && q.links === 'fail') {
        if (small) {
          // "NatureSwarm holds up under disruptions and when calls take time": all five missions; 24.1 (CI 14.8 to 32.4); 17.8; 4.4; 19.0
          if (q.size === 's8') return { s: 'tested', c: NS, lead: 'NatureSwarm',
            n: '+24.1 points', cap: 'NatureSwarm, whole-network relay, under radio loss',
            why: 'Averaged over four models, NatureSwarm, whole-network relay, outperformed the coordinator in all five missions with a disruption (under radio loss, CI 14.8 to 32.4). With a silent base the coordinators lost 17.8 points and no other design more than 4.4. NatureSwarm with a coordinator moved every drone to its own decisions and rescued 19.0 points more than the coordinator.',
            figs: [['Fig. 6a,b', 'fig6'], ['Fig. 2e', 'fig2']], range: 'Teams of eight drones and NatureEnv missions of 8 to 10 agents, one disruption at a time: radio loss, a silent base, false reports, lying scouts or an early trail block.' };
          return { s: 'none', c: GREY, lead: 'No result at this size',
            n: '+24.1 points', cap: 'nearest tested: eight drones, NatureSwarm under radio loss',
            why: 'The missions with a silent base, radio loss or false reports used teams of eight drones. There, NatureSwarm, whole-network relay, led the coordinator, by 24.1 points under radio loss (CI 14.8 to 32.4).',
            figs: [['Fig. 6a', 'fig6']], range: 'A failing base or failing links in turn-based time: eight drones only.' };
        }
        // same section: 13.3 (CI 4.4 to 23.3), 14.4 (CI 11.1 to 18.9); Supplementary Note 19: -1.9 [-3.9, +0.4], +1.0 [+0.1, +2.0]
        if (q.size === 's8') return { s: 'tested', c: GREY, label: 'What the paper reports', lead: 'The coordinator lost ground; no leading design is named',
          n: '−13.3 points', cap: 'the coordinator with a silent base, eight drones',
          why: 'The frontier model’s coordinator was affected too. It lost 13.3 points with a silent base (CI 4.4 to 23.3) and 14.4 points under radio loss (CI 11.1 to 18.9), relative to the same mission without the failure. The main text names no leading design for a frontier model here. With the smaller models, NatureSwarm led.',
          figs: [['Supplementary Notes 7 and 14', '']], range: 'Gemini 4 Argon’s coordinator with eight drones.' };
        if (q.size === 's32') return { s: 'near', c: GREY, lead: 'About level',
          n: '−1.9 points', cap: 'NatureSwarm against the coordinator, 32 drones',
          why: 'With 32 drones and failures during the mission, NatureSwarm run by Gemini 2.5 Flash-Lite differed from Argon’s coordinator by −1.9 points (CI −3.9 to 0.4). A version in which districts leave and rejoin the coordinator rescued 1.0 points more than the coordinator (CI 0.1 to 2.0), a lead that did not hold under both tests.',
          figs: [['Supplementary Note 19', '']], range: 'Argon at the base with drones run by Gemini 2.5 Flash-Lite, 32 drones, five kinds of failure lasting 15 or 20 time steps.' };
        return { s: 'none', c: GREY, lead: 'No result at this size',
          n: '−1.9 points', cap: 'nearest tested: 32 drones, NatureSwarm against the coordinator',
          why: 'The paper reports no result for a frontier model with failing links in teams this large. Nearest tested: eight drones, where Argon’s coordinator lost 13.3 and 14.4 points, and 32 drones, where NatureSwarm run by a smaller model was about level with it.',
          figs: [['Supplementary Notes 7, 14 and 19', '']], range: 'A frontier model with a failing base or failing links: 8 and 32 drones.' };
      }
      if (small) {
        // real time, smaller models: "more than a third of their time waiting"; 9.3 (CI 3.7 to 19.3); worlds of 8 to 64 drones
        if (q.size === 's1024') return { s: 'none', c: GREY, lead: 'No result at this size',
          n: '+9.3 points', cap: 'nearest tested: 8 to 64 drones, NatureSwarm, whole-network relay',
          why: 'The smaller models’ coordinators ran in real time with 8 to 64 drones. There, with slow, lossy radio links, NatureSwarm, whole-network relay, rescued 9.3 points more than these coordinators (CI 3.7 to 19.3).',
          figs: [['Fig. 6c', 'fig6']], range: 'Smaller models in real time: worlds of 8 to 64 drones.' };
        return { s: q.links === 'fail' ? 'tested' : 'near', c: NS, lead: 'NatureSwarm',
          n: '+9.3 points', cap: 'NatureSwarm, whole-network relay, over slow, lossy links',
          why: 'In real time with slow, lossy radio links, drones under the smaller models’ coordinators spent more than a third of their time waiting for orders. Drones in decentralized designs spent almost none (CI of the lead: 3.7 to 19.3).',
          figs: [['Fig. 6c', 'fig6']],
          range: 'Worlds of 8 to 64 drones in real time. ' + (q.links === 'fail' ? 'Radio messages moved one hop per time step and one reception in ten was lost.' : 'The main text gives this result with slow, lossy radio links only. Real time with reliable links is not reported for the smaller models.') };
      }
      if (q.links === 'fail') return { s: 'none', c: GREY, lead: 'No result for this combination',
        n: '+25.0 points', cap: 'nearest tested: reliable links, NatureSwarm with 32 and 64 drones',
        why: 'The main text reports no comparison for a frontier model with failing links in real time. Nearest tested: with reliable links in real time, NatureSwarm run by Argon rescued 25.0 points more than Argon’s coordinator with 32 and 64 drones. With slow, lossy links, NatureSwarm led the smaller models’ coordinators by 9.3 points with 8 to 64 drones.',
        figs: [['Fig. 6c,d', 'fig6']], range: 'A frontier model in real time: reliable links, 16 to 256 drones.' };
      // real time, frontier model: 25.0 (CI 15.3 to 34.7); 41.0 (CI 34.0 to 48.3); 11.8 (CI 5.9 to 18.7); Fig. 6d values from data/results.js
      if (q.size === 's8') return { s: 'near', c: NS, lead: 'Decentralized drones, at the nearest tested size',
        n: rt && rtk(16) >= 0 ? `${num(rt.natureswarm[rtk(16)], 1)}% against ${num(rt.observed[rtk(16)], 1)}%` : '', cap: 'victims rescued with 16 drones, NatureSwarm against coordinator',
        why: 'The frontier model’s teams ran in real time with 16 to 256 drones.' + (rt && rtk(16) >= 0 ? ` With 16 drones, Argon’s coordinator rescued ${num(rt.observed[rtk(16)], 1)}% of victims, and NatureSwarm and response-threshold drones run by Gemini 2.5 Flash-Lite rescued ${num(rt.natureswarm[rtk(16)], 1)}% and ${num(rt.threshold[rtk(16)], 1)}%.` : ''),
        figs: F6d, range: 'Real time: one time step stands for 10 s and every model call takes simulated time. Eight drones lie below the sizes of this study.' };
      if (q.size === 's32') return { s: 'tested', c: NS, lead: 'NatureSwarm',
        n: '+25.0 points', cap: 'over the coordinator, 32 and 64 drones',
        why: 'In real time, NatureSwarm run by Argon rescued nearly every victim with 32 and 64 drones (CI of the lead: 15.3 to 34.7). With at most four calls at a time it still rescued 11.8 points more than Argon’s coordinator (CI 5.9 to 18.7).',
        figs: F6d, range: 'Gemini 4 Argon with 32 and 64 drones. Decentralized drones run by Gemini 2.5 Flash-Lite: 16 to 256 drones.' };
      if (q.size === 's128') return { s: 'tested', c: NS, lead: 'NatureSwarm and response-threshold drones',
        n: '+41.0 points', cap: 'response-threshold drones over the coordinator, 32 to 256 drones',
        why: 'In real time, Gemini 2.5 Flash-Lite’s response-threshold drones outperformed Argon’s coordinator over 32 to 256 drones (CI 34.0 to 48.3). NatureSwarm run by Argon rescued 25.0 points more than Argon’s coordinator with 32 and 64 drones (CI 15.3 to 34.7).',
        figs: F6d, range: 'Argon’s own NatureSwarm ran with 32 and 64 drones. With 128 drones the comparison is with drones run by Gemini 2.5 Flash-Lite.' };
      return { s: 'near', c: RT, lead: 'Response-threshold drones, tested up to 256 drones',
        n: '+41.0 points', cap: 'over the coordinator, 32 to 256 drones',
        why: 'In real time, Gemini 2.5 Flash-Lite’s response-threshold drones outperformed Argon’s coordinator over 32 to 256 drones (CI 34.0 to 48.3).' + (rt && rtk(256) >= 0 ? ` With 256 drones the coordinator rescued ${num(rt.observed[rtk(256)], 1)}% of victims.` : ''),
        figs: F6d, range: 'The real-time results of the main text end at 256 drones. Larger teams in real time are not reported.' };
    }

    function update() {
      const q = {}; ['size', 'links', 'time', 'model'].forEach((k) => { const r = form.querySelector(`input[name="${k}"]:checked`); q[k] = r ? r.value : ''; });
      const a = answer(q);
      out.status.textContent = STATUS[a.s];
      out.status.dataset.s = a.s;
      if (out.label) out.label.textContent = a.label || LABEL[a.s];
      out.lead.textContent = a.lead; out.lead.style.setProperty('--c', a.c);
      if (out.num) { out.num.textContent = a.n || ''; out.cap.textContent = a.cap || ''; out.num.parentNode.hidden = !a.n; }
      out.why.textContent = a.why;
      out.refs.innerHTML = a.figs.map((f) => figref(f[0], f[1])).join(' ');
      out.range.innerHTML = '<b>Tested range.</b> ' + esc(a.range);
    }
    form.addEventListener('change', update);
    update();
  })();
})();
