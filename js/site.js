/* Behaviour of the NatureSwarm project page: navigation state, reveals, counters, the small swarm in the hero, the
 * schematic of the two organizations, the episode showcase, figure zoom, copy buttons. Author: Kunlun Zhu. */
(function () {
  'use strict';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const calm = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  document.documentElement.classList.add('js');

  // ------------------------------------------------------------------ navigation
  const nav = $('#nav'), toTop = $('#to-top');
  const onScroll = () => { const y = window.scrollY; if (nav) nav.classList.toggle('scrolled', y > 8); if (toTop) toTop.classList.toggle('show', y > 900); };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  if (toTop) toTop.addEventListener('click', () => window.scrollTo({ top: 0, behavior: calm ? 'auto' : 'smooth' }));
  const links = $$('.links a');
  if ('IntersectionObserver' in window && links.length) {
    const byId = {}; links.forEach((a) => { byId[a.getAttribute('href').slice(1)] = a; });
    const spy = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { links.forEach((a) => a.classList.remove('active')); const a = byId[e.target.id]; if (a) a.classList.add('active'); } }), { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(byId).forEach((id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }

  // ------------------------------------------------------------------ reveals and counters
  const reveals = $$('.reveal');
  const showAll = () => reveals.forEach((r) => r.classList.add('in'));
  if (calm || !('IntersectionObserver' in window)) showAll();
  else {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' });
    reveals.forEach((r) => io.observe(r));
    setTimeout(showAll, 4000);          // nothing stays hidden if the observer never fires
  }
  const fmt = (v) => Math.round(v).toLocaleString('en-US');
  const counters = $$('[data-count]');
  if (!calm && 'IntersectionObserver' in window) {
    const co = new IntersectionObserver((es) => es.forEach((e) => {
      if (!e.isIntersecting) return; co.unobserve(e.target);
      const el = e.target, to = +el.dataset.count, t0 = performance.now(), dur = 1100;
      const step = (now) => { const u = Math.min(1, (now - t0) / dur), k = 1 - Math.pow(1 - u, 3); el.textContent = fmt(to * k); if (u < 1) requestAnimationFrame(step); else el.textContent = fmt(to); };
      requestAnimationFrame(step);
    }), { threshold: 0.6 });
    counters.forEach((c) => co.observe(c));
  }

  // ------------------------------------------------------------------ a small swarm in the hero
  (function heroSwarm() {
    const cv = $('#hero-swarm'); if (!cv || calm) return;
    const ctx = cv.getContext('2d'), hero = cv.parentElement; let W = 0, H = 0, dpr = 1, run = false, raf = 0;
    const N = 26, B = []; const mouse = { x: -999, y: -999 };
    const size = () => { dpr = Math.min(2, window.devicePixelRatio || 1); W = hero.clientWidth; H = hero.clientHeight; cv.width = W * dpr; cv.height = H * dpr; };
    size(); window.addEventListener('resize', size);
    let seed = 7; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    for (let i = 0; i < N; i++) B.push({ x: rnd() * W, y: H * (0.04 + rnd() * 0.1), home: H * (0.05 + (i % 5) * 0.012), vx: 0.6 + rnd() * 0.6, vy: (rnd() - 0.5) * 0.4, ph: rnd() * 6.3 });
    hero.addEventListener('pointermove', (e) => { const r = hero.getBoundingClientRect(); mouse.x = e.clientX - r.left; mouse.y = e.clientY - r.top; });
    hero.addEventListener('pointerleave', () => { mouse.x = mouse.y = -999; });
    const tick = (now) => {
      if (!run) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      for (const b of B) {
        let ax = 0, ay = 0, cx = 0, cy = 0, vx = 0, vy = 0, n = 0;
        for (const o of B) { if (o === b) continue; const dx = o.x - b.x, dy = o.y - b.y, d2 = dx * dx + dy * dy; if (d2 < 120 * 120) { n++; cx += o.x; cy += o.y; vx += o.vx; vy += o.vy; if (d2 < 26 * 26) { ax -= dx * 0.012; ay -= dy * 0.012; } } }
        if (n) { ax += (cx / n - b.x) * 0.0006 + (vx / n - b.vx) * 0.03; ay += (cy / n - b.y) * 0.0006 + (vy / n - b.vy) * 0.03; }
        const mx = b.x - mouse.x, my = b.y - mouse.y, md = Math.hypot(mx, my); if (md < 130) { ax += mx / md * 0.25; ay += my / md * 0.25; }
        // keep clear of the headline: a soft push out of the central ellipse
        const ex = (b.x - W / 2) / (W * 0.37), ey = (b.y - H * 0.47) / (H * 0.36), ee = ex * ex + ey * ey; if (ee < 1) { ay += (ey < 0 ? -1 : 1) * (1 - ee) * 0.09; ax += (ex < 0 ? -1 : 1) * (1 - ee) * 0.02; }
        ay += ((b.home) - b.y) * 0.0004; ax += 0.004;
        b.vx += ax; b.vy += ay; const sp = Math.hypot(b.vx, b.vy), cap = 1.5; if (sp > cap) { b.vx *= cap / sp; b.vy *= cap / sp; } if (sp < 0.5) { b.vx *= 1.06; }
        b.x += b.vx; b.y += b.vy; if (b.x > W + 20) b.x = -20; if (b.x < -20) b.x = W + 20; if (b.y < 10) b.vy += 0.05; if (b.y > H * 0.86) b.vy -= 0.05;
        const a = Math.atan2(b.vy, b.vx), f = 0.6 + 0.4 * Math.abs(Math.sin(now / 130 + b.ph));
        const fx = (b.x - W / 2) / (W * 0.4), fy = (b.y - H * 0.47) / (H * 0.4), fade = Math.max(0, Math.min(1, (fx * fx + fy * fy - 0.95) * 3));
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a); ctx.fillStyle = `rgba(21,48,43,${(0.42 * fade).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(5, 0); ctx.quadraticCurveTo(0, -6 * f, -6, -8 * f); ctx.quadraticCurveTo(-2, -2, -4, 0); ctx.quadraticCurveTo(-2, 2, -6, 8 * f); ctx.quadraticCurveTo(0, 6 * f, 5, 0); ctx.fill(); ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    new IntersectionObserver((es) => { run = es[0].isIntersecting; cancelAnimationFrame(raf); if (run) raf = requestAnimationFrame(tick); }).observe(hero);
  })();

  // ------------------------------------------------------------------ glyphs of the three advantages
  const GLYPHS = {
    load: () => { let s = ''; for (let k = 0; k < 9; k++) { const a = k / 9 * 6.283, x = 150 + Math.cos(a) * 92, y = 54 + Math.sin(a) * 34; s += `<line x1="${x}" y1="${y}" x2="150" y2="54" stroke="#9db8b0" stroke-width="1.4" class="g-dash"/><circle cx="${x}" cy="${y}" r="5" fill="#17766b"/>`; } return s + '<circle cx="150" cy="54" r="13" fill="#c8503f" class="g-pulse"/>'; },
    timing: () => { let s = '<circle cx="62" cy="54" r="13" fill="#c8503f"/>'; for (let k = 0; k < 5; k++) s += `<circle cx="${112 + k * 34}" cy="54" r="7" fill="#17766b" class="g-wait" style="animation-delay:${k * 0.28}s"/>`; return s + '<path d="M82 54h14" stroke="#9db8b0" stroke-width="2" class="g-dash"/>'; },
    robust: () => { const p = [[70, 34], [118, 74], [150, 30], [186, 72], [232, 40], [150, 84]]; let s = ''; [[0, 1], [0, 2], [1, 2], [2, 3], [3, 4], [2, 4], [1, 5], [3, 5]].forEach(([a, b]) => { s += `<line x1="${p[a][0]}" y1="${p[a][1]}" x2="${p[b][0]}" y2="${p[b][1]}" stroke="#9db8b0" stroke-width="1.4"/>`; }); p.forEach((q, k) => { s += `<circle cx="${q[0]}" cy="${q[1]}" r="7" fill="${k === 2 ? '#c8503f' : '#17766b'}" ${k === 2 ? 'class="g-fade"' : ''}/>`; }); return s; },
  };
  $$('.glyph').forEach((g) => { const f = GLYPHS[g.dataset.glyph]; if (f) g.innerHTML = `<svg viewBox="0 0 300 108" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${f()}</svg>`; });

  // ------------------------------------------------------------------ schematic: one hub, or many neighbours
  (function lab() {
    const cv = $('#lab-canvas'); if (!cv) return;
    const ctx = cv.getContext('2d'), SIZES = [8, 16, 32, 64, 128], W = 720, H = 520;
    const S = { mode: 'hub', n: 32, failed: false, pts: [], links: [], pulses: [], t: 0 };
    const out = { n: $('#lab-n'), reads: $('#lab-reads'), writes: $('#lab-writes'), fate: $('#lab-fate'), fail: $('#lab-fail') };
    const layout = () => {
      let seed = 11 + S.n; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const pts = []; let guard = 0; const gap = Math.max(20, 250 / Math.sqrt(S.n));
      while (pts.length < S.n && guard++ < 20000) { const x = 46 + rnd() * (W - 92), y = 46 + rnd() * (H - 92); if (Math.hypot(x - W / 2, y - H / 2) < 62) continue; if (pts.every((p) => Math.hypot(p.x - x, p.y - y) > gap)) pts.push({ x, y, ph: rnd() * 6.3 }); }
      S.pts = pts; S.links = [];
      pts.forEach((p, i) => { pts.map((q, j) => [Math.hypot(p.x - q.x, p.y - q.y), j]).filter((d) => d[1] !== i).sort((a, b) => a[0] - b[0]).slice(0, 3).forEach(([, j]) => { if (!S.links.some((l) => (l[0] === j && l[1] === i))) S.links.push([i, j]); }); });
      S.pulses = [];
    };
    const text = () => {
      out.n.textContent = S.n;
      if (S.mode === 'hub') { out.reads.textContent = `${S.n} reports`; out.writes.textContent = `${S.n} orders`; out.fate.textContent = 'no drone gets orders'; }
      else { out.reads.textContent = 'the records of drones in radio range'; out.writes.textContent = 'one choice of its own'; out.fate.textContent = 'the team keeps working'; }
      out.fail.textContent = S.failed ? 'Restore the coordinator' : 'Silence the coordinator'; out.fail.classList.toggle('on', S.failed);
    };
    const draw = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1), cw = cv.clientWidth || W, ch = cv.clientHeight || H;
      if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
      const k = Math.min(cw / W, ch / H); ctx.setTransform(dpr * k, 0, 0, dpr * k, dpr * (cw - W * k) / 2, dpr * (ch - H * k) / 2); ctx.clearRect(-200, -200, W + 400, H + 400);
      const hub = { x: W / 2, y: H / 2 }, r = S.n > 64 ? 5 : (S.n > 16 ? 6.5 : 8);
      if (S.mode === 'hub') {
        ctx.lineWidth = 1; ctx.strokeStyle = S.failed ? 'rgba(120,135,130,0.25)' : 'rgba(31,95,174,0.22)';
        S.pts.forEach((p) => { ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(hub.x, hub.y); ctx.stroke(); });
        if (!S.failed && Math.random() < Math.min(0.9, S.n / 40)) { const i = Math.floor(Math.random() * S.pts.length); S.pulses.push({ i, u: 0, back: Math.random() < 0.45 }); }
        S.pulses = S.pulses.filter((q) => q.u < 1);
        S.pulses.forEach((q) => { q.u += 0.022; const p = S.pts[q.i], u = q.back ? 1 - q.u : q.u; ctx.beginPath(); ctx.arc(p.x + (hub.x - p.x) * u, p.y + (hub.y - p.y) * u, 3, 0, 6.3); ctx.fillStyle = q.back ? '#c8503f' : '#1f5fae'; ctx.fill(); });
        const load = Math.min(1, S.n / 128), ring = 30 + load * 26;
        ctx.beginPath(); ctx.arc(hub.x, hub.y, ring + 6 + (S.failed ? 0 : Math.sin(S.t / 9) * 2), 0, 6.3); ctx.fillStyle = S.failed ? 'rgba(120,135,130,0.16)' : `rgba(200,80,63,${0.10 + load * 0.2})`; ctx.fill();
        ctx.beginPath(); ctx.arc(hub.x, hub.y, 24, 0, 6.3); ctx.fillStyle = S.failed ? '#9aa8a4' : '#1f5fae'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.stroke();
        ctx.fillStyle = '#fff'; ctx.font = '700 11px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(S.failed ? 'silent' : 'hub', hub.x, hub.y + 0.5);
      } else {
        ctx.lineWidth = 1.1; ctx.strokeStyle = 'rgba(181,54,122,0.26)';
        S.links.forEach(([a, b]) => { ctx.beginPath(); ctx.moveTo(S.pts[a].x, S.pts[a].y); ctx.lineTo(S.pts[b].x, S.pts[b].y); ctx.stroke(); });
        if (Math.random() < Math.min(0.9, S.n / 36) && S.links.length) { const l = S.links[Math.floor(Math.random() * S.links.length)]; S.pulses.push({ l, u: 0, rev: Math.random() < 0.5 }); }
        S.pulses = S.pulses.filter((q) => q.u < 1);
        S.pulses.forEach((q) => { q.u += 0.035; const a = S.pts[q.l[q.rev ? 1 : 0]], b = S.pts[q.l[q.rev ? 0 : 1]]; ctx.beginPath(); ctx.arc(a.x + (b.x - a.x) * q.u, a.y + (b.y - a.y) * q.u, 3, 0, 6.3); ctx.fillStyle = '#b5367a'; ctx.fill(); });
        ctx.beginPath(); ctx.arc(hub.x, hub.y, 15, 0, 6.3); ctx.fillStyle = S.failed ? '#c5cfcb' : '#ffffff'; ctx.fill(); ctx.strokeStyle = S.failed ? '#9aa8a4' : '#17766b'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = S.failed ? '#6f7f7a' : '#17766b'; ctx.font = '700 9.5px Inter, Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('base', hub.x, hub.y + 0.5);
      }
      S.pts.forEach((p) => {
        const idle = S.mode === 'hub' && S.failed, bob = idle ? 0 : Math.sin(S.t / 14 + p.ph) * 1.6;
        ctx.beginPath(); ctx.arc(p.x, p.y + bob, r + 1.6, 0, 6.3); ctx.fillStyle = '#fff'; ctx.fill();
        ctx.beginPath(); ctx.arc(p.x, p.y + bob, r, 0, 6.3); ctx.fillStyle = idle ? '#aab6b2' : (S.mode === 'hub' ? '#1f5fae' : '#b5367a'); ctx.fill();
      });
      S.t++;
    };
    let run = false, raf = 0; const loop = () => { if (!run) return; draw(); raf = requestAnimationFrame(loop); };
    const set = () => { layout(); text(); if (calm || !run) draw(); };
    $$('#lab .seg button').forEach((b) => b.addEventListener('click', () => { S.mode = b.dataset.mode; $$('#lab .seg button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); }); S.pulses = []; text(); if (calm) draw(); }));
    $('#lab-size').addEventListener('input', (e) => { S.n = SIZES[+e.target.value]; set(); });
    out.fail.addEventListener('click', () => { S.failed = !S.failed; S.pulses = []; text(); if (calm) draw(); });
    layout(); text(); draw();
    if (!calm && 'IntersectionObserver' in window) new IntersectionObserver((es) => { run = es[0].isIntersecting; cancelAnimationFrame(raf); if (run) raf = requestAnimationFrame(loop); }).observe(cv);
    window.addEventListener('resize', draw);
  })();

  // ------------------------------------------------------------------ episode showcase
  (function showcase() {
    const box = $('#showcase'); if (!box || !window.NatureSwarmPlayer) return;
    const DEMOS = {
      rescue: { traces: ['traces/rescue_coordinator.json', 'traces/rescue_natureswarm.json'],
        opts: { titles: ['Coordinator', 'NatureSwarm (neighbour-only)'], subs: ['one agent reads every report and gives every order', 'each drone decides from what nearby drones relay'], headline: 'Wildfire rescue with 128 drones', subline: 'Same map, same fire, same language model (Gemini 2.5 Flash-Lite) in both teams' },
        about: `<div><span class="tag">RescueEnv</span><h3>One world, two ways to organize 128 drones</h3><p>A wildfire spreads over sixteen districts. Drones with limited battery charge and radio range search for victims. Both teams are run by the same language model and start from the same map; only the organization differs.</p></div>
          <div><div class="score"><div class="co"><b>69%</b><span>Coordinator: 199 of 288 victims rescued</span></div><div class="ns"><b>93%</b><span>Neighbour-only NatureSwarm: 267 of 288</span></div></div><p class="note"><strong>Recorded episodes of the scaling study</strong> (simple world, seed 1: the seed whose two scores lie closest to the means over three seeds). Positions, drones lost, the fire and the number rescued at every time step are the stored ones. Which site each rescue belongs to is reconstructed from the drones' positions by the rule of the mission.</p></div>` },
      bees: { traces: ['traces/bees.json'],
        about: `<div><span class="tag">Honeybees</span><h3>A swarm chooses a home without a vote count</h3><p>A swarm that has left its hive hangs on a branch while scouts search for a cavity. A scout that finds one returns and dances for it, longer for a better site. Other scouts follow a dance, inspect the cavity themselves and dance in turn. When enough scouts gather at one cavity, the swarm commits and flies there.</p></div>
          <div><p class="borrow"><b>Borrowed:</b> reports that state what their sender saw itself, advertising with graded strength, and commitment by quorum.</p><p class="note">Mission <code>nest-k7-static</code>, 24 scout agents, seven cavities. Every agent follows the rule the bee design states to it; no language model is called in this recording. The swarm drawn around the scouts is decoration.</p><p class="cite">Seeley, <i>Honeybee Democracy</i> (2010); Seeley &amp; Visscher, <i>Behav. Ecol. Sociobiol.</i> 56 (2004).</p></div>` },
      ants: { traces: ['traces/ants.json'],
        about: `<div><span class="tag">Ants</span><h3>A colony finds the shortest path with marks that fade</h3><p>Ants returning from food leave a pheromone trail, and ants leaving the nest tend to follow the stronger trail. A shorter path is travelled more often in the same time, so its trail is renewed faster and draws still more ants. Because trails evaporate, a path that is no longer used is forgotten.</p></div>
          <div><p class="borrow"><b>Borrowed:</b> anonymous marks left in the shared world that fade unless they are renewed, so that old information loses its hold.</p><p class="note">Mission <code>trail-static</code>, 24 forager agents, three paths of 18, 30 and 40 steps to one food source. Every agent follows the rule the ant design states to it; no language model is called in this recording.</p><p class="cite">Goss et al., <i>Naturwissenschaften</i> 76 (1989); Jeanson et al., <i>Physiol. Entomol.</i> 28 (2003).</p></div>` },
      birds: { traces: ['traces/birds_flock.json', 'traces/birds_alone.json'], opts: { titles: ['Flock: every bird aligns with its seven nearest neighbours', 'Each bird on its own'] },
        about: `<div><span class="tag">Birds</span><h3>A flock passes news from neighbour to neighbour</h3><p>Each starling in a flock tracks its six or seven nearest neighbours, whatever their distance. A change of direction passes from bird to bird, so a few birds that know the way can guide a flock in which most do not, and no bird flies alone where hawks hunt.</p></div>
          <div><p class="borrow"><b>Borrowed:</b> relay between neighbours only. In neighbour-only NatureSwarm a record of the team's finds passes between drones in radio range, one hop per time step, with no central store.</p><p class="note">Illustration of the natural behaviour in the migration world of NatureEnv (mission <code>migrate-f30-hawks</code>, 24 birds, 30% know the way), with the standard model of collective motion with an informed minority. This rule is not one of the paper's designs. Over eight seeds, all 192 flocking birds arrived and none was taken; of 192 solitary birds, 142 arrived and 13 were taken.</p><p class="cite">Ballerini et al., <i>PNAS</i> 105 (2008); Couzin et al., <i>Nature</i> 433 (2005).</p></div>` },
    };
    const el = { canvas: $('#demo-canvas'), loading: $('#demo-loading'), about: $('#demo-about'), play: $('#demo-play'), icon: $('#demo-play-icon'), restart: $('#demo-restart'), scrub: $('#demo-scrub'), time: $('#demo-time'), ink: $('.tab-ink', box) };
    const cache = {}; let player = null, current = '', speed = 1, visible = false, userPaused = false, token = 0;
    const PLAY = 'M6 4.5v11l9-5.5z', PAUSE = 'M6 4h3v12H6zM11 4h3v12h-3z';
    const sync = () => el.icon.setAttribute('d', player && player.playing ? PAUSE : PLAY);
    const ink = () => { const b = $('.tabs button.on', box); if (b) { el.ink.style.width = b.offsetWidth + 'px'; el.ink.style.transform = `translateX(${b.offsetLeft - 5}px)`; } };
    const load = (urls) => Promise.all(urls.map((u) => cache[u] || (cache[u] = fetch(u).then((r) => { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); }))));
    const show = (name) => {
      if (name === current) return; current = name; const my = ++token, d = DEMOS[name];
      $$('.tabs button', box).forEach((b) => { const on = b.dataset.demo === name; b.classList.toggle('on', on); b.setAttribute('aria-selected', on); }); ink();
      el.about.innerHTML = d.about; el.about.classList.remove('swap'); void el.about.offsetWidth; el.about.classList.add('swap');
      if (player) player.pause(); el.loading.textContent = 'Loading the episode…'; el.loading.classList.remove('hide');
      load(d.traces).then((traces) => {
        if (my !== token) return;
        player = window.NatureSwarmPlayer.mount(el.canvas, traces.length === 1 ? traces[0] : traces, d.opts || {}); player.speed = speed;
        player.onframe = (t, dur) => { if (!el.scrub.matches(':active')) el.scrub.value = String(Math.round(1000 * t / dur)); el.time.textContent = t.toFixed(1) + ' / ' + dur.toFixed(1) + ' s'; };
        player.render(0); el.loading.classList.add('hide'); userPaused = false; if (visible && !calm) player.play(); sync();
      }).catch((e) => { el.loading.textContent = 'The episode could not be loaded. Serve this folder over HTTP.'; console.error(e); });
    };
    $$('.tabs button', box).forEach((b) => b.addEventListener('click', () => show(b.dataset.demo)));
    const toggle = () => { if (!player) return; player.toggle(); userPaused = !player.playing; sync(); };
    el.play.addEventListener('click', toggle); el.canvas.addEventListener('click', toggle);
    el.restart.addEventListener('click', () => { if (player) { player.render(0); userPaused = false; player.play(); sync(); } });
    el.scrub.addEventListener('input', () => { if (player) player.seek(el.scrub.value / 1000); });
    $('#demo-speed').addEventListener('click', (e) => { const s = e.target.dataset.s; if (!s) return; speed = +s; if (player) player.speed = speed; $$('#demo-speed button').forEach((b) => b.classList.toggle('on', b === e.target)); });
    window.addEventListener('resize', ink); if (document.fonts && document.fonts.ready) document.fonts.ready.then(ink);
    if ('IntersectionObserver' in window) {
      new IntersectionObserver((es) => { if (es[0].isIntersecting && !current) show('rescue'); }, { rootMargin: '700px 0px' }).observe(box);
      new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (!player) return; if (visible && !userPaused && !calm) player.play(); else player.pause(); sync(); }, { threshold: 0.2 }).observe(el.canvas);
    } else { visible = true; show('rescue'); }
    ink();
  })();

  // ------------------------------------------------------------------ figure zoom, copy, subtitles
  const box = $('#lightbox');
  if (box && box.showModal) {
    const img = $('img', box);
    $$('.zoom').forEach((b) => b.addEventListener('click', () => { img.src = b.dataset.full; const im = $('img', b); img.alt = im ? im.alt : b.textContent + ' of the manuscript'; box.showModal(); }));
    $('.close', box).addEventListener('click', () => box.close());
    box.addEventListener('click', (e) => { if (e.target === box) box.close(); });
  }
  $$('.copy').forEach((b) => b.addEventListener('click', () => {
    const src = document.getElementById(b.dataset.copy), txt = src.innerText, done = () => { b.textContent = 'Copied'; b.classList.add('done'); setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('done'); }, 1600); };
    const select = () => { const r = document.createRange(); r.selectNodeContents(src); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, select); else select();
  }));
  const video = $('#demo-video');
  if (video) $$('#video-sub button').forEach((b) => b.addEventListener('click', () => {
    $$('#video-sub button').forEach((x) => x.classList.toggle('on', x === b));
    const t = video.currentTime, playing = !video.paused; video.src = video.dataset[b.dataset.sub];
    video.addEventListener('loadedmetadata', function once() { video.removeEventListener('loadedmetadata', once); video.currentTime = t; if (playing) video.play(); });
  }));
})();
