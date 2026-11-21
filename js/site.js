/* Behaviour of the NatureSwarm project page: navigation state, reveals, the small swarm in the hero, figure zoom,
 * copy buttons, the recorded clips of the Method section, the video block and the grid of featured recordings.
 * The interactive blocks of the lab are in js/lab.js, the result charts in js/charts.js. Author: Kunlun Zhu. */
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
    const spy = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { links.forEach((a) => { a.classList.remove('active'); a.removeAttribute('aria-current'); }); const a = byId[e.target.id]; if (a) { a.classList.add('active'); a.setAttribute('aria-current', 'true'); } } }), { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(byId).forEach((id) => { const s = document.getElementById(id); if (s) spy.observe(s); });
  }
  // the menu of sections on narrow screens closes after a choice, on Escape and on a click elsewhere
  const menu = $('#menu');
  if (menu) {
    menu.addEventListener('click', (e) => { if (e.target.closest('a')) menu.open = false; });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && menu.open) { menu.open = false; $('summary', menu).focus(); } });
    document.addEventListener('click', (e) => { if (menu.open && !menu.contains(e.target)) menu.open = false; });
  }

  // ------------------------------------------------------------------ reveals
  const reveals = $$('.reveal');
  const showAll = () => reveals.forEach((r) => r.classList.add('in'));
  if (calm || !('IntersectionObserver' in window)) showAll();
  else {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -6% 0px' });
    reveals.forEach((r) => io.observe(r));
    setTimeout(showAll, 4000);          // nothing stays hidden if the observer never fires
  }

  // ------------------------------------------------------------------ a small swarm in the hero
  (function heroSwarm() {
    const cv = $('#hero-swarm'); if (!cv || calm || !('IntersectionObserver' in window)) return;
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
        const ex = (b.x - W / 2) / (W * 0.4), ey = (b.y - H * 0.47) / (H * 0.4), ee = ex * ex + ey * ey; if (ee < 1) { ay += (ey < 0 ? -1 : 1) * (1 - ee) * 0.09; ax += (ex < 0 ? -1 : 1) * (1 - ee) * 0.02; }
        ay += ((b.home) - b.y) * 0.0004; ax += 0.004;
        b.vx += ax; b.vy += ay; const sp = Math.hypot(b.vx, b.vy), cap = 1.5; if (sp > cap) { b.vx *= cap / sp; b.vy *= cap / sp; } if (sp < 0.5) { b.vx *= 1.06; }
        b.x += b.vx; b.y += b.vy; if (b.x > W + 20) b.x = -20; if (b.x < -20) b.x = W + 20; if (b.y < 10) b.vy += 0.05; if (b.y > H * 0.86) b.vy -= 0.05;
        const a = Math.atan2(b.vy, b.vx), f = 0.6 + 0.4 * Math.abs(Math.sin(now / 130 + b.ph));
        const fx = (b.x - W / 2) / (W * 0.43), fy = (b.y - H * 0.47) / (H * 0.43), fade = Math.max(0, Math.min(1, (fx * fx + fy * fy - 0.95) * 3));
        ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(a); ctx.fillStyle = `rgba(21,48,43,${(0.42 * fade).toFixed(3)})`;
        ctx.beginPath(); ctx.moveTo(5, 0); ctx.quadraticCurveTo(0, -6 * f, -6, -8 * f); ctx.quadraticCurveTo(-2, -2, -4, 0); ctx.quadraticCurveTo(-2, 2, -6, 8 * f); ctx.quadraticCurveTo(0, 6 * f, 5, 0); ctx.fill(); ctx.restore();
      }
      raf = requestAnimationFrame(tick);
    };
    new IntersectionObserver((es) => { run = es[es.length - 1].isIntersecting; cancelAnimationFrame(raf); if (run) raf = requestAnimationFrame(tick); }).observe(hero);
  })();

  // ------------------------------------------------------------------ figure zoom (any element with data-full), copy
  const box = $('#lightbox');
  if (box && box.showModal) {
    const img = $('img', box);
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-full]'); if (!b) return;
      const im = $('img', b); img.src = b.dataset.full; img.alt = b.dataset.alt || (im ? im.alt : b.textContent.trim() + ' of the manuscript'); box.showModal();
    });
    $('.close', box).addEventListener('click', () => box.close());
    box.addEventListener('click', (e) => { if (e.target === box) box.close(); });
  }
  $$('.copy').forEach((b) => b.addEventListener('click', () => {
    const src = document.getElementById(b.dataset.copy), txt = src.innerText, done = () => { b.textContent = 'Copied'; b.classList.add('done'); setTimeout(() => { b.textContent = 'Copy'; b.classList.remove('done'); }, 1600); };
    const select = () => { const r = document.createRange(); r.selectNodeContents(src); const s = window.getSelection(); s.removeAllRanges(); s.addRange(r); };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(done, select); else select();
  }));

  // a folded block lays its charts out when it opens
  $$('details.fold').forEach((d) => d.addEventListener('toggle', () => { if (d.open) window.dispatchEvent(new Event('resize')); }));

  // ------------------------------------------------------------------ recorded clips of the Method section
  // The picture is a frame of the recording. The trace is fetched when the button is pressed and played by the site's
  // player; pressing again pauses it.
  const PLAY_D = 'M7 5v10l8-5z', PAUSE_D = 'M6 4.5h3v11H6zM11 4.5h3v11h-3z';
  $$('.clip[data-traces]').forEach((b) => {
    let player = null, busy = false;
    const icon = $('.clip-play path', b), what = b.dataset.what || 'the recording';
    const sync = () => { const on = player && player.playing; if (icon) icon.setAttribute('d', on ? PAUSE_D : PLAY_D); b.setAttribute('aria-label', (on ? 'Pause ' : 'Play ') + what); };
    b.addEventListener('click', () => {
      if (player) { player.toggle(); sync(); return; }
      if (busy || !window.NatureSwarmPlayer) return;
      busy = true; b.setAttribute('aria-busy', 'true');
      Promise.all(b.dataset.traces.split(',').map((u) => fetch(u).then((r) => { if (!r.ok) throw new Error(u + ': ' + r.status); return r.json(); })))
        .then((tr) => {
          const cv = document.createElement('canvas'), im = $('img', b);
          cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', im ? im.alt : what);
          player = window.NatureSwarmPlayer.mount(cv, tr.length === 1 ? tr[0] : tr, b.dataset.titles ? { titles: b.dataset.titles.split('|') } : {});
          if (im) im.replaceWith(cv); else b.insertBefore(cv, b.firstChild);
          player.play(); b.removeAttribute('aria-busy'); sync();
          if ('IntersectionObserver' in window) new IntersectionObserver((es) => { if (!es[es.length - 1].isIntersecting && player.playing) { player.pause(); sync(); } }, { threshold: 0.05 }).observe(b);
        })
        .catch((e) => { busy = false; b.removeAttribute('aria-busy'); if (window.console) console.warn('clip:', e.message); });
    });
  });

  // ------------------------------------------------------------------ the video: everything comes from data-* (see index.html)
  const video = $('#demo-video');
  if (video) {
    const d = video.dataset, sub = $('#video-sub');
    video.src = d.en;
    const setPoster = () => { if (d.poster && !video.poster) video.poster = d.poster; };
    if ('IntersectionObserver' in window) { const io = new IntersectionObserver((es) => { if (es.some((e) => e.isIntersecting)) { setPoster(); io.disconnect(); } }, { rootMargin: '600px 0px' }); io.observe(video); } else setPoster();
    if (sub && !d.zh) { const wrap = $('#video-subwrap'); if (wrap) wrap.hidden = true; }
    else if (sub) $$('button', sub).forEach((b) => b.addEventListener('click', () => {
      $$('button', sub).forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-pressed', x === b ? 'true' : 'false'); });
      const t = video.currentTime, playing = !video.paused, started = video.currentTime > 0 || playing; video.src = d[b.dataset.sub];
      if (started) video.addEventListener('loadedmetadata', function once() { video.removeEventListener('loadedmetadata', once); video.currentTime = t; if (playing) video.play(); });
    }));
  }

  // ------------------------------------------------------------------ featured recordings of the Explorer
  // index.html carries a default set. When traces/demos.json marks episodes as featured, the grid is rebuilt from it:
  // name, test bed and order come from that file. Pictures: the frames in media/home/ rendered with the
  // site's player (listed here), else the file the list names as `poster`.
  (function explorer() {
    const grid = $('#ep-grid'); if (!grid || !window.fetch) return;
    const FRAMES = ['rescue-128', 'rescue-512-realtime', 'bees-liars', 'hard-risk', 'compete-coordinator', 'hard-ridge'];
    const ENV = { rescue: ['RescueEnv', '#c8503f'], pandemic: ['PandemicEnv', '#6b4fa3'], nature: ['NatureEnv', '#2f8f5b'] };
    const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    fetch('traces/demos.json').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (!d || !d.episodes) return;
      const envs = d.envs || [], order = envs.map((e) => e.id), tasks = {};
      // the number of recordings: this list and the lists it names (PandemicEnv has its own)
      const lists = envs.filter((e) => e.list).map((e) => fetch(e.list).then((r) => (r.ok ? r.json() : null)).then((x) => (x && x.episodes ? x.episodes.length : null)).catch(() => null));
      Promise.all(lists).then((ns) => { if (ns.some((n) => n == null)) return; const c = $('#ep-count'); if (c) c.textContent = 'All ' + (d.episodes.length + ns.reduce((a, b) => a + b, 0)) + ' recordings'; });
      const feat = d.episodes.filter((e) => e.featured);
      if (!feat.length) return;
      envs.forEach((e) => (e.tasks || []).forEach((t) => { tasks[e.id + '/' + t.id] = t.title; }));
      const rank = (e) => { const k = order.indexOf(e.env); return k < 0 ? 99 : k; };
      const fixed = $$('.ep', grid), pandemic = fixed.find((a) => /env=pandemic/.test(a.getAttribute('href'))), all = fixed.find((a) => a.classList.contains('all'));
      const cards = feat.slice().sort((a, b) => rank(a) - rank(b)).map((e) => {
        const env = ENV[e.env] || ['Recorded episode', '#17766b'], task = tasks[e.env + '/' + e.task];
        const src = FRAMES.indexOf(e.id) >= 0 ? 'media/home/' + e.id + '.jpg' : (e.poster || '');
        const pic = src ? `<span class="ep-img"><img loading="lazy" src="${esc(src)}" alt="" width="960" height="600"></span>` : '<span class="ep-img tile"></span>';
        // a card carries the picture, the test bed and the first part of the episode's name; the rest is in the Explorer
        const short = String(e.name || '').split(':')[0];
        return { env: e.env, html: `<a class="ep" href="viewer.html?ep=${encodeURIComponent(e.id)}" style="--c:${env[1]}" title="${esc(e.name + (task ? ' (' + task.toLowerCase() + ')' : ''))}">${pic}<span class="ep-env">${esc(env[0])}</span><b>${esc(short)}</b></a>` };
      });
      // PandemicEnv has its own list; its card keeps its place after RescueEnv
      const out = []; let placed = false;
      cards.forEach((c) => { if (!placed && pandemic && c.env !== 'rescue') { out.push(pandemic.outerHTML); placed = true; } out.push(c.html); });
      if (pandemic && !placed) out.push(pandemic.outerHTML);
      if (all) out.push(all.outerHTML);
      const label = $('#ep-count') ? $('#ep-count').textContent : '';
      grid.innerHTML = out.join('');
      if (label && $('#ep-count')) $('#ep-count').textContent = label;
      $$('img', grid).forEach((im) => im.addEventListener('error', () => { const s = im.parentElement; s.classList.add('tile'); im.remove(); }));
    }).catch(() => { /* the default cards stay */ });
  })();
})();
