/* NatureSwarm episode player.
 *
 * Plays a trace (schema natureswarm.trace/1, written by scripts/viz/trace_record.py) on a canvas. One renderer serves
 * the project page, the episode viewer and the export of GIF and MP4 files, so that what is shown is always the
 * recorded episode: positions, orders, fire, trail strength and scores are read from the trace and nothing is staged.
 * Decorative elements (grass, clouds, the resting part of a swarm) are drawn from a fixed seed.
 *
 *   const p = NatureSwarmPlayer.mount(canvas, trace);          // one episode
 *   const p = NatureSwarmPlayer.mount(canvas, [traceA, traceB]); // two (or three) episodes of the same world, side by side
 *   p.play(); p.pause(); p.seek(0.5); p.render(seconds); p.duration
 *
 * Author: Kunlun Zhu. MIT licence.
 */
(function (global) {
  'use strict';

  const W = 960, H = 600;
  const FONT = '"Inter", "Helvetica Neue", Helvetica, Arial, sans-serif';
  const INK = '#18222d';
  // While a scene draws into one panel of a comparison, its text is enlarged (FS) and its HUD is captured (SINK).
  let SINK = null, FS = 1;
  const DESIGN_NAME = { bee: 'Bee design', ant: 'Ant design', flock: 'Flock design', broadcast: 'Broadcast', hierarchy: 'Coordinator', solitary: 'Solitary agents', 'roost-v3': 'Team-wide NatureSwarm' };

  // ------------------------------------------------------------------ helpers
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const lerp = (a, b, u) => a + (b - a) * u;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = (u) => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  const hash = (i, j) => { let h = (i * 374761393 + j * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r); ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h); ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r); ctx.quadraticCurveTo(x, y, x + r, y); ctx.closePath();
  }
  function text(ctx, s, x, y, size, color, weight, align) {
    ctx.font = `${weight || 500} ${size * FS}px ${FONT}`; ctx.fillStyle = color || '#fff'; ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle'; ctx.fillText(s, x, y);
  }
  function chip(ctx, x, y, w, h, fill) {
    ctx.save(); ctx.shadowColor = 'rgba(10,20,30,0.25)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 3;
    rr(ctx, x, y, w, h, 10); ctx.fillStyle = fill || 'rgba(18,28,40,0.78)'; ctx.fill(); ctx.restore();
  }
  /** index i and fraction u with frames[i].t <= T < frames[i+1].t */
  function locate(frames, T) {
    const n = frames.length;
    if (T <= frames[0].t) return [0, 0];
    if (T >= frames[n - 1].t) return [n - 2, 1];
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (frames[m].t <= T) lo = m; else hi = m; }
    return [lo, (T - frames[lo].t) / Math.max(1e-9, frames[hi].t - frames[lo].t)];
  }
  function caption(frames, i) {
    for (let k = Math.min(i, frames.length - 1); k >= 0; k--) if (frames[k].events && frames[k].events.length) return frames[k].events[frames[k].events.length - 1];
    return '';
  }
  function hud(ctx, o) {
    if (SINK) { SINK.o = o; return; }
    // title block
    ctx.font = `700 17px ${FONT}`; const tw = ctx.measureText(o.title).width;
    ctx.font = `500 12px ${FONT}`; const sw = ctx.measureText(o.subtitle || '').width;
    chip(ctx, 16, 14, Math.max(tw, sw) + 28, o.subtitle ? 52 : 34);
    text(ctx, o.title, 30, o.subtitle ? 31 : 31, 17, '#fff', 700);
    if (o.subtitle) text(ctx, o.subtitle, 30, 51, 12, 'rgba(255,255,255,0.78)', 500);
    // right counters
    if (o.right && o.right.length) {
      let x = W - 16;
      for (let k = o.right.length - 1; k >= 0; k--) {
        const it = o.right[k];
        ctx.font = `700 20px ${FONT}`; const vw = ctx.measureText(it.value).width;
        ctx.font = `500 11px ${FONT}`; const lw = ctx.measureText(it.label).width;
        const w = Math.max(vw, lw) + 26;
        chip(ctx, x - w, 14, w, 52);
        text(ctx, it.value, x - w / 2, 32, 20, it.color || '#fff', 700, 'center');
        text(ctx, it.label, x - w / 2, 52, 11, 'rgba(255,255,255,0.75)', 500, 'center');
        x -= w + 8;
      }
    }
    // caption and progress
    if (o.caption) {
      ctx.font = `600 15px ${FONT}`; const cw = Math.min(W - 60, ctx.measureText(o.caption).width + 36);
      chip(ctx, (W - cw) / 2, H - 58, cw, 34);
      text(ctx, o.caption, W / 2, H - 41, 15, '#fff', 600, 'center');
    }
    ctx.fillStyle = 'rgba(18,28,40,0.25)'; ctx.fillRect(0, H - 6, W, 6);
    ctx.fillStyle = o.accent || '#f2b33d'; ctx.fillRect(0, H - 6, W * clamp(o.progress, 0, 1), 6);
  }
  function offscreen(w, h, dpr) {
    const c = document.createElement('canvas'); c.width = Math.round(w * dpr); c.height = Math.round(h * dpr);
    const x = c.getContext('2d'); x.setTransform(dpr, 0, 0, dpr, 0, 0); return [c, x];
  }

  // ------------------------------------------------------------------ sprites
  function bee(ctx, x, y, ang, size, flap, glow) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    if (glow) { ctx.beginPath(); ctx.arc(0, 0, size * 1.5, 0, 6.3); ctx.fillStyle = glow; ctx.fill(); }
    const w = Math.sin(flap) * 0.5;
    ctx.fillStyle = 'rgba(255,255,255,0.72)'; ctx.strokeStyle = 'rgba(60,70,80,0.35)'; ctx.lineWidth = 0.5;
    for (const s of [-1, 1]) {
      ctx.save(); ctx.rotate(s * (0.9 + w)); ctx.beginPath(); ctx.ellipse(-size * 0.1, s * size * 0.75, size * 0.36, size * 0.72, 0, 0, 6.3);
      ctx.fill(); ctx.stroke(); ctx.restore();
    }
    ctx.beginPath(); ctx.ellipse(0, 0, size, size * 0.56, 0, 0, 6.3); ctx.fillStyle = '#f4b41a'; ctx.fill();
    ctx.save(); ctx.clip(); ctx.fillStyle = '#2b2118';
    ctx.fillRect(-size * 0.55, -size, size * 0.3, size * 2); ctx.fillRect(size * 0.0, -size, size * 0.28, size * 2); ctx.restore();
    ctx.beginPath(); ctx.arc(size * 0.9, 0, size * 0.42, 0, 6.3); ctx.fillStyle = '#2b2118'; ctx.fill();
    ctx.restore();
  }
  function ant(ctx, x, y, ang, size, phase, carrying) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    ctx.strokeStyle = '#2a1a12'; ctx.lineWidth = Math.max(0.7, size * 0.11); ctx.lineCap = 'round';
    for (let k = -1; k <= 1; k++) {
      const sw = Math.sin(phase + k * 2.1) * size * 0.22;
      for (const s of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(k * size * 0.28, 0);
        ctx.lineTo(k * size * 0.42 + s * sw, s * size * 0.62); ctx.stroke();
      }
    }
    ctx.fillStyle = '#3a2418';
    ctx.beginPath(); ctx.ellipse(-size * 0.62, 0, size * 0.44, size * 0.3, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, 0, size * 0.3, size * 0.2, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.arc(size * 0.5, 0, size * 0.24, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(size * 0.66, -size * 0.1); ctx.lineTo(size * 0.98, -size * 0.34);
    ctx.moveTo(size * 0.66, size * 0.1); ctx.lineTo(size * 0.98, size * 0.34); ctx.stroke();
    if (carrying) { ctx.beginPath(); ctx.arc(size * 0.92, 0, size * 0.3, 0, 6.3); ctx.fillStyle = '#fff3c4'; ctx.fill(); ctx.strokeStyle = '#c9a23c'; ctx.lineWidth = 0.7; ctx.stroke(); }
    ctx.restore();
  }
  function bird(ctx, x, y, ang, size, flap, body, accent, perched) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(ang);
    const span = perched ? 0.42 : 1.0 - 0.36 * (0.5 + 0.5 * Math.sin(flap));
    ctx.fillStyle = body;
    for (const s of [-1, 1]) {            // wings: crescents swept back
      ctx.beginPath(); ctx.moveTo(size * 0.32, s * size * 0.08);
      ctx.quadraticCurveTo(size * 0.46, s * size * 0.9 * span, -size * 0.34, s * size * 1.6 * span);
      ctx.quadraticCurveTo(-size * 0.02, s * size * 0.78 * span, -size * 0.3, s * size * 0.1); ctx.closePath(); ctx.fill();
    }
    ctx.beginPath(); ctx.ellipse(size * 0.04, 0, size * 0.62, size * 0.2, 0, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-size * 0.45, 0); ctx.lineTo(-size * 1.04, size * 0.27); ctx.quadraticCurveTo(-size * 0.84, 0, -size * 1.04, -size * 0.27); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.arc(size * 0.62, 0, size * 0.2, 0, 6.3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(size * 0.78, -size * 0.08); ctx.lineTo(size * 1.06, 0); ctx.lineTo(size * 0.78, size * 0.08); ctx.closePath(); ctx.fillStyle = '#f0b03a'; ctx.fill();
    if (accent) { ctx.beginPath(); ctx.ellipse(size * 0.1, 0, size * 0.34, size * 0.11, 0, 0, 6.3); ctx.fillStyle = accent; ctx.fill(); }
    ctx.restore();
  }

  // ================================================================== scene: honeybees choosing a nest site
  const SITE_COLORS = ['#2f7fc1', '#e2702d', '#2f9d6b', '#c2478a', '#7d62c4', '#b39420', '#39a9bd', '#8a8f98'];
  const bees = {
    single: true,
    init(traces, dpr) {
      const tr = traces[0], fr = tr.frames, wb = tr.meta.world;
      const cx = W / 2, cy = 312;
      const sc = Math.min((W - 120) / (wb.xmax - wb.xmin), (H - 150) / (wb.ymax - wb.ymin));
      const P = (x, y) => [cx + x * sc, cy - y * sc];
      const R = rng(4242);
      const [bg, b] = offscreen(W, H, dpr);
      const g = b.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#b9d58a'); g.addColorStop(0.55, '#a5c877'); g.addColorStop(1, '#93bb69');
      b.fillStyle = g; b.fillRect(0, 0, W, H);
      for (let k = 0; k < 26; k++) {       // soft patches of light and shade
        const x = R() * W, y = R() * H, r = 60 + R() * 120; const q = b.createRadialGradient(x, y, 0, x, y, r);
        const dark = R() < 0.5; q.addColorStop(0, dark ? 'rgba(70,120,60,0.16)' : 'rgba(235,245,170,0.20)'); q.addColorStop(1, 'rgba(0,0,0,0)');
        b.fillStyle = q; b.fillRect(x - r, y - r, 2 * r, 2 * r);
      }
      b.lineCap = 'round';
      for (let k = 0; k < 1500; k++) {     // grass blades
        const x = R() * W, y = R() * H, l = 3 + R() * 6, a = -1.57 + (R() - 0.5) * 0.9;
        b.strokeStyle = R() < 0.5 ? 'rgba(74,128,62,0.33)' : 'rgba(214,232,150,0.36)'; b.lineWidth = 1;
        b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); b.stroke();
      }
      for (let k = 0; k < 46; k++) {       // flowers
        const x = R() * W, y = R() * H; if (Math.hypot(x - cx, y - cy) < 70) continue;
        const col = ['#ffffff', '#ffe37a', '#f6b6cf', '#d9c8ff'][Math.floor(R() * 4)], r = 2 + R() * 1.6;
        b.fillStyle = col; for (let p = 0; p < 5; p++) { const a = p * 1.2566 + R(); b.beginPath(); b.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.75, 0, 6.3); b.fill(); }
        b.fillStyle = '#e9a514'; b.beginPath(); b.arc(x, y, r * 0.55, 0, 6.3); b.fill();
      }
      // the branch the swarm hangs on
      b.strokeStyle = '#6f5238'; b.lineWidth = 11; b.beginPath(); b.moveTo(cx - 118, cy + 34); b.quadraticCurveTo(cx - 30, cy + 4, cx + 96, cy - 30); b.stroke();
      b.lineWidth = 5; b.beginPath(); b.moveTo(cx + 40, cy - 14); b.lineTo(cx + 74, cy + 16); b.moveTo(cx - 62, cy + 16); b.lineTo(cx - 88, cy - 6); b.stroke();
      b.strokeStyle = 'rgba(255,255,255,0.18)'; b.lineWidth = 2; b.beginPath(); b.moveTo(cx - 112, cy + 29); b.quadraticCurveTo(cx - 30, cy, cx + 92, cy - 34); b.stroke();
      const decor = []; for (let k = 0; k < 170; k++) { const a = R() * 6.283, d = Math.sqrt(R()) * 25; decor.push({ a, d, ph: R() * 6.283, lag: R() * 0.45, sp: 0.6 + R() }); }
      const sids = []; fr.forEach(f => f.sites.forEach(s => { if (sids.indexOf(s.id) < 0) sids.push(s.id); })); sids.sort((p, q) => p - q);
      const site = {}; fr.forEach(f => f.sites.forEach(s => { site[s.id] = P(s.x, s.y); }));
      const arcSign = {}; fr[0].agents.forEach(a => { arcSign[a.id] = R() < 0.5 ? -1 : 1; });
      const o = tr.meta.outcome || {};
      // labels: above or below the cavity, on the side where they meet no other label and no other cavity
      const side = {}, placed = [], ids = Object.keys(site).map(Number).sort((p, q) => site[p][1] - site[q][1]);
      ids.forEach((id) => {
        const [x, y] = site[id]; let sd = y > cy ? 1 : -1;
        const hit = (v) => { const ly = y + v * 42; return ly < 84 || ly > H - 74 || placed.some(q => Math.abs(q[0] - x) < 116 && Math.abs(q[1] - ly) < 36) || ids.some(k => k !== id && Math.abs(site[k][0] - x) < 74 && Math.abs(site[k][1] - ly) < 36); };
        if (hit(sd) && !hit(-sd)) sd = -sd;
        side[id] = sd; placed.push([x, y + sd * 42]);
      });
      const xs = ids.map(k => site[k][0]), ys = ids.map(k => site[k][1]);
      const x0 = Math.min(cx - 130, Math.min(...xs) - 78), x1 = Math.max(cx + 130, Math.max(...xs) + 78), y0 = Math.min(cy - 70, Math.min(...ys) - 70), y1 = Math.max(cy + 70, Math.max(...ys) + 70);
      const st = tr.meta.static || {};
      return { side, crop: [x0, y0, x1 - x0, y1 - y0], led: tr.meta.design === 'hierarchy', liarTarget: st.liar_target, twins: st.twins || null, tr, fr, P, sc, bg, decor, sids, site, arcSign, cx, cy, secPerT: 3.1, duration: fr[fr.length - 1].t * 3.1 + 1.2, best: o.best, chosen: o.chosen, quorum: o.quorum || fr[0].score.total };
    },
    draw(ctx, S, time) {
      const fr = S.fr, T = Math.min(time / S.secPerT, fr[fr.length - 1].t), [i, u0] = locate(fr, T), u = ease(u0);
      const A = fr[i], B = fr[i + 1];
      ctx.drawImage(S.bg, 0, 0, W, H);
      const col = (sid) => SITE_COLORS[S.sids.indexOf(sid) % SITE_COLORS.length];
      // cavities
      const moved = (f) => f.agents.length && f.agents[0].state === 'moved';
      const sitesB = {}; B.sites.forEach(s => { sitesB[s.id] = s; });
      A.sites.forEach((s) => {
        const [x, y] = S.site[s.id], sb = sitesB[s.id] || s, c = col(s.id);
        const sup = lerp(s.waiting, sb.waiting, u);
        ctx.save(); ctx.shadowColor = 'rgba(30,40,20,0.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
        ctx.beginPath(); ctx.arc(x, y, 21, 0, 6.3); ctx.fillStyle = '#7a5a3c'; ctx.fill(); ctx.restore();
        ctx.beginPath(); ctx.arc(x, y, 17, 0, 6.3); ctx.fillStyle = '#cfae7c'; ctx.fill();
        ctx.strokeStyle = 'rgba(122,90,60,0.5)'; ctx.lineWidth = 1; for (const r of [13, 9.5]) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.stroke(); }
        ctx.beginPath(); ctx.arc(x + 1, y + 1, 6.5, 0, 6.3); ctx.fillStyle = '#2a1d12'; ctx.fill();
        ctx.beginPath(); ctx.arc(x, y, 26, 0, 6.3); ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 4; ctx.stroke();
        if (sup > 0.01) { ctx.beginPath(); ctx.arc(x, y, 26, -1.5708, -1.5708 + 6.2832 * clamp(sup / S.quorum, 0, 1)); ctx.strokeStyle = c; ctx.lineWidth = 4; ctx.lineCap = 'round'; ctx.stroke(); }
        // label
        const lab = 'Cavity ' + String.fromCharCode(65 + S.sids.indexOf(s.id));
        ctx.font = `700 ${11.5 * FS}px ${FONT}`; const top = s.id === S.best || (S.twins && S.twins.indexOf(s.id) >= 0), lw = ctx.measureText(lab).width + (top ? 44 * FS : 0) + 16;
        const dn = S.side[s.id] > 0, ly = y + (dn ? 42 : -42);
        rr(ctx, x - lw / 2, ly - 10, lw, 20, 10); ctx.fillStyle = c; ctx.fill();
        text(ctx, lab + (top ? '  ★ best' : ''), x, ly + 0.5, 11.5, '#fff', 700, 'center');
        const rating = sb.rating != null ? sb.rating : s.rating;
        const liar = s.id === S.liarTarget, note = liar ? 'the lying scouts praise it' : (rating != null ? 'scouts rate it ' + rating.toFixed(1) + ' / 10' : '');
        if (note) text(ctx, note, x, ly + (dn ? 17 : -17), 10.5, liar ? 'rgba(165,38,28,0.98)' : 'rgba(24,34,45,0.85)', liar ? 700 : 600, 'center');
      });
      // dances: one arrow per advertised cavity, as wide as the dancing for it is strong
      const drawDances = (f, alpha) => {
        if (alpha <= 0.01 || !f.marks.length) return; const by = {};
        f.marks.forEach(m => { (by[m.site] = by[m.site] || { n: 0, s: 0 }).n++; by[m.site].s += m.level; });
        Object.keys(by).forEach((sid) => {
          const [x, y] = S.site[sid], a = Math.atan2(y - S.cy, x - S.cx), d = by[sid];
          const r0 = 40, r1 = 40 + 16 + Math.min(70, d.s * 2.2), wd = 2.5 + Math.min(7, d.s / 7);
          ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = col(+sid); ctx.fillStyle = col(+sid); ctx.lineWidth = wd; ctx.lineCap = 'round';
          if (f.marks[0].kind === 'order') ctx.setLineDash([7, 7]);
          ctx.beginPath(); ctx.moveTo(S.cx + Math.cos(a) * r0, S.cy + Math.sin(a) * r0); ctx.lineTo(S.cx + Math.cos(a) * r1, S.cy + Math.sin(a) * r1); ctx.stroke();
          const hx = S.cx + Math.cos(a) * (r1 + wd + 4), hy = S.cy + Math.sin(a) * (r1 + wd + 4), hw = wd + 4;
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.cos(a - 0.5) * hw * 1.8, hy - Math.sin(a - 0.5) * hw * 1.8);
          ctx.lineTo(hx - Math.cos(a + 0.5) * hw * 1.8, hy - Math.sin(a + 0.5) * hw * 1.8); ctx.closePath(); ctx.fill();
          ctx.restore();
        });
      };
      drawDances(A, clamp(1 - 2.2 * u0, 0, 1)); drawDances(B, clamp((u0 - 0.55) / 0.45, 0, 1));
      if (S.led && !moved(A)) {      // the coordinator: every report goes to it, every order comes from it
        ctx.save(); ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(S.cx, S.cy, 37, 0, 6.3); ctx.strokeStyle = 'rgba(31,95,174,0.9)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
        ctx.font = `800 ${10.5 * FS}px ${FONT}`; const cw = ctx.measureText('COORDINATOR').width + 14; rr(ctx, S.cx - cw / 2, S.cy - 58, cw, 17, 8); ctx.fillStyle = '#1f5fae'; ctx.fill();
        text(ctx, 'COORDINATOR', S.cx, S.cy - 49, 10.5, '#fff', 800, 'center');
      }
      // the resting swarm
      const centre = (f) => { if (!moved(f)) return [S.cx, S.cy]; let x = 0, y = 0; f.agents.forEach(a => { const p = S.P(a.x, a.y); x += p[0]; y += p[1]; }); return [x / f.agents.length, y / f.agents.length]; };
      const spread = (f) => { const s = f.agents.length ? f.agents[0].state : 'rest'; return s === 'liftoff' ? 2.7 : (s === 'moved' ? 1.15 : 1); };
      const cA = centre(A), cB = centre(B), rA = spread(A), rB = spread(B);
      S.decor.forEach((d, k) => {
        const uu = ease(clamp((u0 - d.lag) / (1 - 0.45), 0, 1));
        const r = d.d * lerp(rA, rB, uu) + (rA > 1.5 || rB > 1.5 ? Math.sin(time * 5 * d.sp + d.ph) * 4 : 0);
        const a = d.a + Math.sin(time * 1.3 * d.sp + d.ph) * 0.25 + (rA > 1.5 || rB > 1.5 ? time * 0.8 * (k % 2 ? 1 : -1) : 0);
        const x = lerp(cA[0], cB[0], uu) + Math.cos(a) * r, y = lerp(cA[1], cB[1], uu) + Math.sin(a) * r * 0.9;
        ctx.beginPath(); ctx.ellipse(x, y, 2.3, 1.5, d.a, 0, 6.3); ctx.fillStyle = k % 3 ? '#d99a1a' : '#4a3520'; ctx.fill();
      });
      // scouts
      const posB = {}; B.agents.forEach(a => { posB[a.id] = a; });
      A.agents.forEach((a) => {
        const b = posB[a.id] || a, p0 = S.P(a.x, a.y), p1 = S.P(b.x, b.y);
        const at = (v) => { const e = ease(v), dx = p1[0] - p0[0], dy = p1[1] - p0[1], L = Math.hypot(dx, dy) || 1, bow = Math.sin(Math.PI * e) * Math.min(26, L * 0.16) * S.arcSign[a.id]; return [lerp(p0[0], p1[0], e) - dy / L * bow, lerp(p0[1], p1[1], e) + dx / L * bow]; };
        let [x, y] = at(u0); const q = at(Math.min(1, u0 + 0.02)); let ang = Math.atan2(q[1] - y, q[0] - x);
        const still = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 1.5;
        if (still) {
          const dancing = (u0 < 0.5 ? a.state : b.state) === 'dance';
          if (dancing) { ang = Math.sin(time * 9 + a.id) * 0.9 + a.id; x += Math.cos(time * 7 + a.id * 1.7) * 3.2; y += Math.sin(time * 9 + a.id * 0.6) * 2.2; }
          else if (a.state === 'scout' || a.state === 'recruit' || a.state === 'search') { ang = time * 2.2 * (a.id % 2 ? 1 : -1) + a.id; x += Math.cos(ang) * 5; y += Math.sin(ang) * 5; ang += 1.57 * (a.id % 2 ? 1 : -1); }
          else { ang = a.id * 2.4 + Math.sin(time * 2 + a.id) * 0.4; }
        }
        const st = b.state === 'rest' || b.state === 'dance' ? a.state : b.state;
        const glow = st === 'recruit' ? 'rgba(255,255,255,0.0)' : null;
        ctx.save(); ctx.beginPath(); ctx.ellipse(x + 3, y + 5, 5, 2.4, 0, 0, 6.3); ctx.fillStyle = 'rgba(30,50,20,0.16)'; ctx.fill(); ctx.restore();
        bee(ctx, x, y, ang, 5.6, time * 46 + a.id, glow);
        if (a.liar) { ctx.beginPath(); ctx.arc(x, y, 9, 0, 6.3); ctx.strokeStyle = '#c0392b'; ctx.lineWidth = 2; ctx.stroke(); }
      });
      const lead = Math.round(lerp(A.score.done, B.score.done, u));
      const round = Math.min(Math.floor(T) + 1, Math.max(1, Math.ceil(fr[fr.length - 1].t - 1.8)));
      const sub = { bee: 'no leader, no vote count', hierarchy: 'one agent reads every report and sends every scout', solitary: 'nothing is shared', broadcast: 'every scout tells all the others' }[S.tr.meta.design] || '';
      hud(ctx, { title: S.title || (S.led ? 'A coordinator chooses the new home' : 'Honeybees choose a new home'), subtitle: `${DESIGN_NAME[S.tr.meta.design] || S.tr.meta.design} · ${S.tr.meta.n_agents} scout agents · ${sub}`,
        right: [{ label: 'round', value: String(round) }, { label: `scouts at one cavity (quorum ${S.quorum})`, value: String(lead) }],
        caption: caption(fr, u0 > 0.5 ? i + 1 : i), progress: time / S.duration, accent: '#f2b33d' });
    },
  };

  // ================================================================== scene: ants and their trails
  const ROUTE_COLORS = ['#d6336c', '#2f7fc1', '#2f9d6b', '#8e6bbf'];
  function archPath(x0, y0, x1, y1, target, side, wide) {
    // a cubic arch between two points whose length is `target` pixels; bulges to `side` (+1 down, -1 up)
    const L = Math.hypot(x1 - x0, y1 - y0), ux = (x1 - x0) / L, uy = (y1 - y0) / L, nx = -uy * side, ny = ux * side;
    const sample = (h) => {
      const w = h * (wide || 0.42), c1 = [x0 - ux * w + nx * h, y0 - uy * w + ny * h], c2 = [x1 + ux * w + nx * h, y1 + uy * w + ny * h];
      const pts = []; let len = 0, px = x0, py = y0;
      for (let k = 0; k <= 240; k++) {
        const t = k / 240, m = 1 - t;
        const x = m * m * m * x0 + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * x1;
        const y = m * m * m * y0 + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * y1;
        len += Math.hypot(x - px, y - py); pts.push([x, y, len]); px = x; py = y;
      }
      return [pts, len];
    };
    let lo = 0, hi = 900;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (sample(mid)[1] < target) lo = mid; else hi = mid; }
    const [pts, len] = sample((lo + hi) / 2);
    return { pts, len, at(s) { const d = clamp(s, 0, 1) * len; let a = 0, b = pts.length - 1; while (b - a > 1) { const m = (a + b) >> 1; if (pts[m][2] <= d) a = m; else b = m; } const f = (d - pts[a][2]) / Math.max(1e-9, pts[b][2] - pts[a][2]); return [lerp(pts[a][0], pts[b][0], f), lerp(pts[a][1], pts[b][1], f), Math.atan2(pts[b][1] - pts[a][1], pts[b][0] - pts[a][0])]; } };
  }
  const ants = {
    single: true,
    init(traces, dpr) {
      const tr = traces[0], fr = tr.frames, routes = tr.meta.static.routes.slice().sort((a, b) => a.length - b.length);
      // a fourth, shorter path (the gap that opens in the wall) needs the nest and the food closer together
      const four = routes.length > 3, nest = four ? [392, 298] : [318, 298], food = four ? [568, 298] : [642, 298], unit = four ? 18.4 : 18.6, R = rng(977);
      const slots = four ? [+1, +1, -1, +1] : [+1, -1, +1, -1], paths = {};
      routes.forEach((r, k) => { paths[r.id] = archPath(nest[0], nest[1], food[0], food[1], Math.max(Math.hypot(food[0] - nest[0], food[1] - nest[1]) + 1, r.length * unit), slots[k % 4], (four ? [0.42, 0.42, 0.7, 1.2] : [0.42, 0.55, 0.95, 0.95])[k % 4]); paths[r.id].rank = k; paths[r.id].route = r; });
      const [bg, b] = offscreen(W, H, dpr);
      routes.forEach((r) => { paths[r.id].late = r.appears > 0; });
      const g = b.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#e6d5ad'); g.addColorStop(1, '#d3bf93'); b.fillStyle = g; b.fillRect(0, 0, W, H);
      for (let k = 0; k < 22; k++) { const x = R() * W, y = R() * H, r = 70 + R() * 130, q = b.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, R() < 0.5 ? 'rgba(140,110,60,0.14)' : 'rgba(255,246,214,0.22)'); q.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = q; b.fillRect(x - r, y - r, 2 * r, 2 * r); }
      for (let k = 0; k < 2600; k++) { b.fillStyle = R() < 0.5 ? 'rgba(120,92,50,0.20)' : 'rgba(255,250,228,0.30)'; b.fillRect(R() * W, R() * H, 1 + R() * 1.4, 1 + R() * 1.4); }
      // beaten tracks
      b.lineCap = 'round'; b.lineJoin = 'round';
      Object.values(paths).forEach((p) => { if (p.late) return; b.beginPath(); p.pts.forEach((q, k) => (k ? b.lineTo(q[0], q[1]) : b.moveTo(q[0], q[1]))); b.strokeStyle = 'rgba(126,98,56,0.22)'; b.lineWidth = 24; b.stroke(); b.strokeStyle = 'rgba(250,240,208,0.55)'; b.lineWidth = 17; b.stroke(); });
      const far = (x, y) => Object.values(paths).every(p => p.pts.every((q, k) => k % 6 || Math.hypot(q[0] - x, q[1] - y) > 22)) && Math.hypot(x - nest[0], y - nest[1]) > 52 && Math.hypot(x - food[0], y - food[1]) > 52;
      for (let k = 0; k < 70; k++) {          // pebbles
        const x = R() * W, y = R() * H; if (!far(x, y)) continue; const r = 3 + R() * 7;
        b.save(); b.translate(x, y); b.rotate(R() * 3.14); b.beginPath(); b.ellipse(1.5, 2.5, r, r * 0.7, 0, 0, 6.3); b.fillStyle = 'rgba(70,52,30,0.22)'; b.fill();
        b.beginPath(); b.ellipse(0, 0, r, r * 0.7, 0, 0, 6.3); b.fillStyle = ['#a8a195', '#b9b2a4', '#8f897e'][k % 3]; b.fill();
        b.beginPath(); b.ellipse(-r * 0.25, -r * 0.2, r * 0.45, r * 0.25, 0, 0, 6.3); b.fillStyle = 'rgba(255,255,255,0.28)'; b.fill(); b.restore();
      }
      for (let k = 0; k < 36; k++) {          // fallen leaves
        const x = R() * W, y = R() * H; if (!far(x, y)) continue; const l = 9 + R() * 10;
        b.save(); b.translate(x, y); b.rotate(R() * 6.28); b.beginPath(); b.moveTo(-l, 0); b.quadraticCurveTo(0, -l * 0.62, l, 0); b.quadraticCurveTo(0, l * 0.62, -l, 0);
        b.fillStyle = ['#7fa650', '#b98a3a', '#96b862', '#c9713a', '#6f9a4a'][k % 5]; b.globalAlpha = 0.85; b.fill(); b.globalAlpha = 1;
        b.strokeStyle = 'rgba(60,50,20,0.35)'; b.lineWidth = 0.8; b.beginPath(); b.moveTo(-l, 0); b.lineTo(l, 0); b.stroke(); b.restore();
      }
      for (let k = 0; k < 150; k++) {         // grass along the edges
        const top = k % 2, x = R() * W, y = top ? R() * 40 : H - R() * 46, l = 10 + R() * 18, a = (top ? 1.57 : -1.57) + (R() - 0.5) * 0.9;
        b.strokeStyle = ['#6b9a48', '#86b25a', '#5a8a3e'][k % 3]; b.lineWidth = 2; b.beginPath(); b.moveTo(x, top ? 0 : H); b.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + 4, (top ? 0 : H) + Math.sin(a) * l * 0.5, x + Math.cos(a) * l, (top ? 0 : H) + Math.sin(a) * l); b.stroke();
      }
      // nest mound and food
      const mound = b.createRadialGradient(nest[0] - 8, nest[1] - 10, 4, nest[0], nest[1], 44); mound.addColorStop(0, '#b08a58'); mound.addColorStop(1, '#8a6a42');
      b.beginPath(); b.ellipse(nest[0] + 3, nest[1] + 6, 46, 40, 0, 0, 6.3); b.fillStyle = 'rgba(70,50,25,0.25)'; b.fill();
      b.beginPath(); b.ellipse(nest[0], nest[1], 44, 38, 0, 0, 6.3); b.fillStyle = mound; b.fill();
      for (let k = 0; k < 90; k++) { const a = R() * 6.28, d = Math.sqrt(R()) * 40; b.fillStyle = R() < 0.5 ? 'rgba(60,40,20,0.3)' : 'rgba(230,200,150,0.4)'; b.fillRect(nest[0] + Math.cos(a) * d, nest[1] + Math.sin(a) * d * 0.86, 1.6, 1.6); }
      b.beginPath(); b.ellipse(nest[0], nest[1], 11, 9, 0, 0, 6.3); b.fillStyle = '#231509'; b.fill();
      b.beginPath(); b.arc(food[0] + 3, food[1] + 6, 33, 0, 6.3); b.fillStyle = 'rgba(70,50,25,0.25)'; b.fill();
      b.beginPath(); b.arc(food[0], food[1], 32, 0, 6.3); b.fillStyle = '#f08a24'; b.fill();
      b.beginPath(); b.arc(food[0], food[1], 27, 0, 6.3); b.fillStyle = '#ffd08a'; b.fill();
      b.beginPath(); b.arc(food[0], food[1], 24, 0, 6.3); b.fillStyle = '#f7a233'; b.fill();
      b.strokeStyle = 'rgba(255,235,190,0.9)'; b.lineWidth = 1.6; for (let k = 0; k < 8; k++) { b.beginPath(); b.moveTo(food[0], food[1]); b.lineTo(food[0] + Math.cos(k * 0.785) * 24, food[1] + Math.sin(k * 0.785) * 24); b.stroke(); }
      const jit = {}; fr[0].agents.forEach(a => { jit[a.id] = [R() * 2 - 1, R() * 6.28, R()]; });
      const byId = {}; fr.forEach((f, k) => f.agents.forEach((a) => { (byId[a.id] = byId[a.id] || [])[k] = a; }));
      const ax = [], ay = []; Object.values(paths).forEach(q => q.pts.forEach((v, k) => { if (k % 8 === 0) { ax.push(v[0]); ay.push(v[1]); } }));
      const cx0 = Math.min(nest[0] - 66, Math.min(...ax) - 30), cx1 = Math.max(food[0] + 60, Math.max(...ax) + 30), cy0 = Math.max(0, Math.min(...ay) - 62), cy1 = Math.min(H, Math.max(...ay) + 40);
      return { crop: [cx0, cy0, cx1 - cx0, cy1 - cy0], design: tr.meta.design, tr, fr, paths, nest, food, bg, jit, byId, secPerT: 0.34, duration: fr.length * 0.34 + 1.0, trips: (tr.meta.outcome || {}).trips || [], shortest: routes[0].id };
    },
    draw(ctx, S, time) {
      const fr = S.fr, T = clamp(time / S.secPerT, 0, fr.length - 1), i = Math.min(fr.length - 2, Math.floor(T)), u = T - i, A = fr[i], B = fr[i + 1];
      ctx.drawImage(S.bg, 0, 0, W, H);
      // a path that opens during the episode: the gap in a stone wall
      Object.values(S.paths).forEach((p) => {
        if (!p.late) return;
        const site = A.sites.find(q => q.id === p.route.id), open = !!(site && site.open), [mx, my] = p.at(0.5);
        if (open) { ctx.save(); ctx.lineCap = 'round'; ctx.beginPath(); p.pts.forEach((q, n) => (n ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1]))); ctx.strokeStyle = 'rgba(126,98,56,0.22)'; ctx.lineWidth = 24; ctx.stroke(); ctx.strokeStyle = 'rgba(250,240,208,0.6)'; ctx.lineWidth = 18; ctx.stroke(); ctx.restore(); }
        for (let k = -3; k <= 3; k++) {
          if (open && k === 0) continue;
          const y = my + k * 17, x = mx + (k % 2 ? 2.5 : -1.5);
          ctx.beginPath(); ctx.ellipse(x + 2, y + 3, 10, 9, 0, 0, 6.3); ctx.fillStyle = 'rgba(60,45,25,0.22)'; ctx.fill();
          ctx.beginPath(); ctx.ellipse(x, y, 10, 9, 0, 0, 6.3); ctx.fillStyle = ['#9a948a', '#aca598', '#8b857b'][(k + 3) % 3]; ctx.fill(); ctx.strokeStyle = 'rgba(60,50,40,0.4)'; ctx.lineWidth = 1; ctx.stroke();
          ctx.beginPath(); ctx.ellipse(x - 3, y - 3, 4, 2.4, 0, 0, 6.3); ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.fill();
        }
        if (!open) text(ctx, 'stone wall', mx, my - 66, 10.5, 'rgba(40,30,15,0.75)', 600, 'center');
      });
      // pheromone on each path
      const lv = (f, id) => { const m = f.marks.find(q => q.route === id); return m ? m.level : 0; };
      const onRoute = {};
      Object.keys(S.paths).forEach((id) => {
        const p = S.paths[id], level = lerp(lv(A, +id), lv(B, +id), u), k = level / (level + 5), c = ROUTE_COLORS[p.rank % 4];
        if (k > 0.004) {
          ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); p.pts.forEach((q, n) => (n ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])));
          ctx.globalAlpha = 0.10 + 0.55 * k; ctx.strokeStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 16; ctx.lineWidth = 5 + 13 * k; ctx.stroke(); ctx.restore();
        }
        onRoute[id] = 0;
      });
      // ants
      // Ants decide at whole time steps; within a step each leaves a moment after the one before it, as ants do in a
      // file. The delay is below one time step, the resolution of the recording.
      let inNest = 0;
      const drawAnt = (id, route, s, back, moving) => {
        const p = S.paths[route]; if (!p) return; const [x, y, ang] = p.at(s), j = S.jit[id], off = (back ? -4.6 : 4.6) + j[0] * 1.8;
        ant(ctx, x - Math.sin(ang) * off, y + Math.cos(ang) * off, back ? ang + Math.PI : ang, 7.6, moving ? time * 26 + j[1] : j[1], back);
        onRoute[route]++;
      };
      Object.keys(S.byId).forEach((key) => {
        const id = +key, rec = S.byId[id], Ta = Math.max(0, T - S.jit[id][2] * 0.9), ia = Math.min(fr.length - 2, Math.floor(Ta)), v = Ta - ia, a = rec[ia], b = rec[ia + 1] || a;
        if (a.route >= 0 && b.route === a.route) drawAnt(id, a.route, lerp(a.s, b.s, v), b.state === 'back' && !(a.state === 'out' && v < 0.5), true);
        else if (a.route < 0 && b.route >= 0) drawAnt(id, b.route, lerp(0, b.s, v), b.state === 'back' && v > 0.5, true);
        else if (a.route >= 0 && b.route < 0) drawAnt(id, a.route, lerp(a.s, 0, v), true, true);
        else if (a.route >= 0 && b.route >= 0) { if (v < 0.5) drawAnt(id, a.route, lerp(a.s, 0, v * 2), true, true); else drawAnt(id, b.route, lerp(0, b.s, v * 2 - 1), false, true); }
        else { inNest++; const j = S.jit[id], aa = j[1] + time * (0.5 + j[2]) * (id % 2 ? 1 : -1), d = 17 + j[2] * 16; ant(ctx, S.nest[0] + Math.cos(aa) * d, S.nest[1] + Math.sin(aa) * d * 0.85, aa + 1.57 * (id % 2 ? 1 : -1), 6.4, time * 14 + j[1], false); }
      });
      // obstacle on a blocked path, labels
      A.sites.forEach((s) => {
        const p = S.paths[s.id]; if (!p || (p.late && !s.open)) return; const [mx, my] = p.at(0.5), c = ROUTE_COLORS[p.rank % 4];
        if (s.blocked) {
          const [x, y, ang] = p.at(0.62); ctx.save(); ctx.translate(x, y); ctx.rotate(ang + 1.57);
          ctx.beginPath(); ctx.ellipse(2, 4, 21, 9, 0, 0, 6.3); ctx.fillStyle = 'rgba(60,40,20,0.3)'; ctx.fill();
          rr(ctx, -21, -7, 42, 14, 7); ctx.fillStyle = '#8a6a48'; ctx.fill(); ctx.strokeStyle = '#5f4630'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.beginPath(); ctx.moveTo(-15, -3); ctx.lineTo(13, -3); ctx.stroke(); ctx.restore();
        }
        const lab = `${s.value} steps` + (s.blocked ? ' · blocked, three times slower' : ''), dy = my - S.nest[1];
        // short path: label above it; upper loop: label above the line; lower loop: label inside the loop
        const ly = Math.abs(dy) <= 60 ? my - 30 : my - 24, sy = Math.abs(dy) <= 60 ? ly - 19 : ly - 18;
        ctx.font = `700 ${12 * FS}px ${FONT}`; const lw = ctx.measureText(lab).width + 20;
        rr(ctx, mx - lw / 2, ly - 11, lw, 22, 11); ctx.fillStyle = c; ctx.fill(); text(ctx, lab, mx, ly + 0.5, 12, '#fff', 700, 'center');
        text(ctx, `${onRoute[s.id] || 0} ants on this path`, mx, sy, 11, 'rgba(40,30,15,0.85)', 600, 'center');
      });
      text(ctx, 'NEST', S.nest[0], S.nest[1] + 54, 11, 'rgba(40,30,15,0.8)', 700, 'center');
      text(ctx, 'FOOD', S.food[0], S.food[1] + 48, 11, 'rgba(40,30,15,0.8)', 700, 'center');
      // share of recent trips on each path
      const t1 = A.t, win = 12, cnt = {}; let tot = 0;
      S.trips.forEach(([t, pid]) => { if (t <= t1 && t > t1 - win) { cnt[pid] = (cnt[pid] || 0) + 1; tot++; } });
      if (!SINK) {      // share of recent trips on each path (not in a panel of a comparison)
        const bx = W - 262, by = 82, bw = 246; chip(ctx, bx, by, bw, 58);
        text(ctx, 'Trips started in the last 12 steps', bx + 12, by + 15, 11, 'rgba(255,255,255,0.8)', 600);
        let x = bx + 12; const full = bw - 24;
        Object.values(S.paths).sort((p, q) => p.rank - q.rank).forEach((p) => { const w = tot ? full * (cnt[p.route.id] || 0) / tot : 0; if (w > 0) { ctx.fillStyle = ROUTE_COLORS[p.rank % 4]; rr(ctx, x, by + 28, Math.max(2, w - 1.5), 12, 3); ctx.fill(); x += w; } });
        const share = tot ? Math.round(100 * (cnt[S.shortest] || 0) / tot) : 0;
        text(ctx, tot ? `${share}% on the shortest path` : 'no trips yet', bx + 12, by + 49, 10.5, 'rgba(255,255,255,0.8)', 500);
      }
      if (S.design === 'hierarchy') {
        ctx.save(); ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.ellipse(S.nest[0], S.nest[1], 52, 46, 0, 0, 6.3); ctx.strokeStyle = 'rgba(31,95,174,0.9)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
        ctx.font = `800 ${10.5 * FS}px ${FONT}`; const cw = ctx.measureText('COORDINATOR').width + 14; rr(ctx, S.nest[0] - cw / 2, S.nest[1] - 72, cw, 17, 8); ctx.fillStyle = '#1f5fae'; ctx.fill();
        text(ctx, 'COORDINATOR', S.nest[0], S.nest[1] - 63, 10.5, '#fff', 800, 'center');
      }
      const how = { ant: 'each lays and follows a trail that fades', hierarchy: 'one agent reads every report and sends every forager', solitary: 'nothing is shared', bee: 'foragers advertise a path at the nest', flock: 'each forager watches a few neighbours', broadcast: 'every forager tells all the others' }[S.design] || '';
      const ownCap = { ant: 'A stronger trail draws more ants; a shorter path is renewed more often', hierarchy: 'The coordinator assigns every trip from the reports it has read' }[S.design] || '';
      hud(ctx, { title: S.title || (S.design === 'ant' ? 'Ants find the shortest path' : 'Foragers and their paths'), subtitle: `${DESIGN_NAME[S.design] || S.design} · ${S.tr.meta.n_agents} forager agents · ${how}`,
        right: [{ label: 'time step', value: `${Math.min(fr.length, i + 1)}` }, { label: 'food brought home', value: String(Math.round(lerp(A.score.done, B.score.done, u))) }],
        caption: caption(fr, i) || ownCap, progress: time / S.duration, accent: '#d6336c' });
    },
  };

  // ================================================================== scene: a path network with a blocked stretch
  // Eight routes from the nest to one food source, each a first stretch (three of them) and a second stretch. A fallen
  // branch blocks one first stretch during the episode and a gap opens in a stone wall later. An ant's place on its
  // route follows from the start and the length of its trip.
  const FIRST_COLORS = ['#2f7fc1', '#2f9d6b', '#8e6bbf'];
  function polyPath(raw) {
    const pts = []; let len = 0;
    raw.forEach((q, k) => { if (k) len += Math.hypot(q[0] - raw[k - 1][0], q[1] - raw[k - 1][1]); pts.push([q[0], q[1], len]); });
    return { pts, len, at(s) { const d = clamp(s, 0, 1) * len; let a = 0, b = pts.length - 1; while (b - a > 1) { const m = (a + b) >> 1; if (pts[m][2] <= d) a = m; else b = m; } const f = (d - pts[a][2]) / Math.max(1e-9, pts[b][2] - pts[a][2]); return [lerp(pts[a][0], pts[b][0], f), lerp(pts[a][1], pts[b][1], f), Math.atan2(pts[b][1] - pts[a][1], pts[b][0] - pts[a][0])]; } };
  }
  function bez(p0, c1, c2, p1, n) {
    const out = [];
    for (let k = 0; k <= n; k++) { const t = k / n, m = 1 - t; out.push([m * m * m * p0[0] + 3 * m * m * t * c1[0] + 3 * m * t * t * c2[0] + t * t * t * p1[0], m * m * m * p0[1] + 3 * m * m * t * c1[1] + 3 * m * t * t * c2[1] + t * t * t * p1[1]]); }
    return out;
  }
  const maze = {
    single: true,
    init(traces, dpr) {
      const tr = traces[0], fr = tr.frames, st = tr.meta.static, R = rng(4242);
      const nest = [236, 316], food = [730, 316];
      // junctions: the two first stretches with three continuations lie above and below, the one with two in between
      const JUNC = [[432, 118], [432, 508], [412, 236]];
      const FIRST = [bez(nest, [246, 205], [340, 120], JUNC[0], 40), bez(nest, [246, 427], [340, 506], JUNC[1], 40), bez(nest, [286, 268], [350, 238], JUNC[2], 40)];
      const SECOND = [
        [bez(JUNC[0], [565, 34], [770, 108], food, 60), bez(JUNC[0], [545, 118], [696, 150], food, 60), bez(JUNC[0], [505, 186], [622, 214], food, 60)],
        [bez(JUNC[1], [565, 592], [770, 518], food, 60), bez(JUNC[1], [545, 508], [696, 476], food, 60), bez(JUNC[1], [505, 440], [622, 412], food, 60)],
        [bez(JUNC[2], [505, 232], [612, 252], food, 60), bez(JUNC[2], [486, 274], [600, 290], food, 60)]];
      const used = [0, 0, 0], paths = {}, gapRoute = st.routes.find(r => r.appears > 0);
      st.routes.slice().sort((a, b) => a.length - b.length).forEach((r) => {
        if (r.appears > 0) { paths[r.id] = polyPath([nest, food]); paths[r.id].gap = true; paths[r.id].route = r; return; }
        // within a branch the shortest route takes the innermost curve
        const order = r.first === 2 ? [1, 0] : [2, 1, 0], k = order[used[r.first]++ % order.length];
        const p = polyPath(FIRST[r.first].concat(SECOND[r.first][k].slice(1)));
        p.route = r; p.first = r.first; p.split = FIRST[r.first].length; p.second = SECOND[r.first][k]; paths[r.id] = p;
      });
      const [bg, b] = offscreen(W, H, dpr);
      const g = b.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#d9dcb0'); g.addColorStop(1, '#bcc592'); b.fillStyle = g; b.fillRect(0, 0, W, H);   // a forest floor
      for (let k = 0; k < 26; k++) { const x = R() * W, y = R() * H, r = 60 + R() * 130, q = b.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, R() < 0.55 ? 'rgba(70,100,50,0.16)' : 'rgba(250,244,190,0.22)'); q.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = q; b.fillRect(x - r, y - r, 2 * r, 2 * r); }
      for (let k = 0; k < 2400; k++) { b.fillStyle = R() < 0.5 ? 'rgba(80,100,50,0.20)' : 'rgba(250,246,210,0.28)'; b.fillRect(R() * W, R() * H, 1 + R() * 1.4, 1 + R() * 1.4); }
      b.lineCap = 'round'; b.lineJoin = 'round';
      const stroke = (c, pts, style, width) => { c.beginPath(); pts.forEach((q, n) => (n ? c.lineTo(q[0], q[1]) : c.moveTo(q[0], q[1]))); c.strokeStyle = style; c.lineWidth = width; c.stroke(); };
      Object.values(paths).forEach((p) => { if (!p.gap) { stroke(b, p.pts, 'rgba(96,84,48,0.20)', 19); } });
      Object.values(paths).forEach((p) => { if (!p.gap) { stroke(b, p.pts, 'rgba(244,236,204,0.72)', 12); } });
      const far = (x, y) => Object.values(paths).every(p => p.pts.every((q, k) => k % 5 || Math.hypot(q[0] - x, q[1] - y) > 24)) && Math.hypot(x - nest[0], y - nest[1]) > 56 && Math.hypot(x - food[0], y - food[1]) > 52;
      for (let k = 0; k < 60; k++) {          // ferns and leaf litter between the paths
        const x = 150 + R() * 660, y = 20 + R() * 570; if (!far(x, y)) continue; const l = 8 + R() * 10;
        b.save(); b.translate(x, y); b.rotate(R() * 6.28); b.beginPath(); b.moveTo(-l, 0); b.quadraticCurveTo(0, -l * 0.6, l, 0); b.quadraticCurveTo(0, l * 0.6, -l, 0);
        b.fillStyle = ['#6d9648', '#a8873c', '#86ab58', '#b96f3a', '#5f8a44'][k % 5]; b.globalAlpha = 0.8; b.fill(); b.restore();
      }
      for (let k = 0; k < 12; k++) {          // tree trunks seen from above
        const x = 150 + R() * 660, y = 20 + R() * 570; if (!far(x, y) || Object.values(paths).some(p => p.pts.some((q, n) => n % 5 === 0 && Math.hypot(q[0] - x, q[1] - y) < 40))) continue;
        b.beginPath(); b.arc(x + 3, y + 4, 15, 0, 6.3); b.fillStyle = 'rgba(40,50,25,0.22)'; b.fill();
        b.beginPath(); b.arc(x, y, 14, 0, 6.3); b.fillStyle = '#7b5d3c'; b.fill(); b.beginPath(); b.arc(x, y, 9, 0, 6.3); b.strokeStyle = 'rgba(50,35,20,0.5)'; b.lineWidth = 1.2; b.stroke();
        b.beginPath(); b.arc(x, y, 4.5, 0, 6.3); b.stroke();
      }
      // nest mound and food
      const mound = b.createRadialGradient(nest[0] - 8, nest[1] - 10, 4, nest[0], nest[1], 42); mound.addColorStop(0, '#b08a58'); mound.addColorStop(1, '#8a6a42');
      b.beginPath(); b.ellipse(nest[0] + 3, nest[1] + 6, 44, 38, 0, 0, 6.3); b.fillStyle = 'rgba(60,50,25,0.25)'; b.fill();
      b.beginPath(); b.ellipse(nest[0], nest[1], 42, 36, 0, 0, 6.3); b.fillStyle = mound; b.fill();
      for (let k = 0; k < 80; k++) { const a = R() * 6.28, d = Math.sqrt(R()) * 38; b.fillStyle = R() < 0.5 ? 'rgba(60,40,20,0.3)' : 'rgba(230,200,150,0.4)'; b.fillRect(nest[0] + Math.cos(a) * d, nest[1] + Math.sin(a) * d * 0.86, 1.6, 1.6); }
      b.beginPath(); b.ellipse(nest[0], nest[1], 11, 9, 0, 0, 6.3); b.fillStyle = '#231509'; b.fill();
      b.beginPath(); b.arc(food[0] + 3, food[1] + 6, 31, 0, 6.3); b.fillStyle = 'rgba(60,50,25,0.25)'; b.fill();
      b.beginPath(); b.arc(food[0], food[1], 30, 0, 6.3); b.fillStyle = '#f08a24'; b.fill(); b.beginPath(); b.arc(food[0], food[1], 25, 0, 6.3); b.fillStyle = '#ffd08a'; b.fill();
      b.beginPath(); b.arc(food[0], food[1], 22, 0, 6.3); b.fillStyle = '#f7a233'; b.fill();
      b.strokeStyle = 'rgba(255,235,190,0.9)'; b.lineWidth = 1.6; for (let k = 0; k < 8; k++) { b.beginPath(); b.moveTo(food[0], food[1]); b.lineTo(food[0] + Math.cos(k * 0.785) * 22, food[1] + Math.sin(k * 0.785) * 22); b.stroke(); }
      const jit = {}; fr[0].agents.forEach(a => { jit[a.id] = [R() * 2 - 1, R() * 6.28, R()]; });
      const byId = {}; fr.forEach((f, k) => f.agents.forEach((a) => { (byId[a.id] = byId[a.id] || [])[k] = a; }));
      const blockedIds = st.routes.filter(r => r.blocked_from != null).map(r => r.id);
      return { crop: [150, 14, 660, 580], design: tr.meta.design, kind: st.kind, tr, fr, st, paths, nest, food, bg, jit, byId, FIRST, JUNC, blockedIds, gapRoute, stroke,
        secPerT: 0.28, duration: fr.length * 0.28 + 1.0, trips: (tr.meta.outcome || {}).trips || [] };
    },
    draw(ctx, S, time) {
      const fr = S.fr, st = S.st, T = clamp(time / S.secPerT, 0, fr.length - 1), i = Math.min(fr.length - 2, Math.floor(T)), u = T - i, A = fr[i], B = fr[i + 1];
      ctx.drawImage(S.bg, 0, 0, W, H);
      const blocked = A.t >= st.block_at, open = A.t >= st.gap_at, gp = S.gapRoute && S.paths[S.gapRoute.id];
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      // the gap in the stone wall
      if (gp) {
        const wx = 590;
        if (open) { S.stroke(ctx, gp.pts, 'rgba(96,84,48,0.20)', 19); S.stroke(ctx, gp.pts, 'rgba(244,236,204,0.72)', 12); }
        for (let k = -2; k <= 2; k++) {
          if (open && k === 0) continue;
          const y = S.nest[1] + k * 17, x = wx + (k % 2 ? 2.5 : -1.5);
          ctx.beginPath(); ctx.ellipse(x + 2, y + 3, 10, 9, 0, 0, 6.3); ctx.fillStyle = 'rgba(50,45,25,0.22)'; ctx.fill();
          ctx.beginPath(); ctx.ellipse(x, y, 10, 9, 0, 0, 6.3); ctx.fillStyle = ['#9a948a', '#aca598', '#8b857b'][(k + 2) % 3]; ctx.fill(); ctx.strokeStyle = 'rgba(60,50,40,0.4)'; ctx.lineWidth = 1; ctx.stroke();
        }
        text(ctx, open ? 'gap · ' + S.gapRoute.length + ' steps' : 'stone wall', wx, S.nest[1] + 56, 10.5, 'rgba(40,35,15,0.85)', 700, 'center');
      }
      // marks on each route (designs that lay them)
      const lv = (f, id) => { const m = f.marks.find(q => q.route === id); return m ? m.level : 0; };
      Object.keys(S.paths).forEach((id) => {
        const p = S.paths[id], level = lerp(lv(A, +id), lv(B, +id), u), k = level / (level + 5);
        if (k > 0.004 && (!p.gap || open)) { ctx.save(); ctx.globalAlpha = 0.10 + 0.5 * k; ctx.shadowColor = '#d6336c'; ctx.shadowBlur = 14; S.stroke(ctx, p.pts, '#d6336c', 4 + 11 * k); ctx.restore(); }
      });
      // the fallen branch on the blocked first stretch
      const bf = S.FIRST[st.blocked_first], bq = bf[Math.round(bf.length * 0.62)], bq2 = bf[Math.round(bf.length * 0.62) + 1], bang = Math.atan2(bq2[1] - bq[1], bq2[0] - bq[0]);
      if (blocked) {
        ctx.save(); ctx.translate(bq[0], bq[1]); ctx.rotate(bang + 1.57);
        ctx.beginPath(); ctx.ellipse(2, 4, 25, 9, 0, 0, 6.3); ctx.fillStyle = 'rgba(50,40,20,0.3)'; ctx.fill();
        rr(ctx, -25, -7, 50, 14, 7); ctx.fillStyle = '#7d5c3a'; ctx.fill(); ctx.strokeStyle = '#523c26'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.strokeStyle = '#523c26'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(8, -6); ctx.lineTo(17, -17); ctx.moveTo(-9, 6); ctx.lineTo(-18, 16); ctx.stroke(); ctx.restore();
      }
      // ants
      const onRoute = {}; let onBlocked = 0;
      const drawAnt = (id, route, s, back, moving) => {
        const p = S.paths[route]; if (!p) return; const [x, y, ang] = p.at(s), j = S.jit[id], off = (back ? -4.2 : 4.2) + j[0] * 1.6;
        ant(ctx, x - Math.sin(ang) * off, y + Math.cos(ang) * off, back ? ang + Math.PI : ang, 7.2, moving ? time * 26 + j[1] : j[1], back);
        onRoute[route] = (onRoute[route] || 0) + 1; if (S.blockedIds.indexOf(+route) >= 0) onBlocked++;
      };
      Object.keys(S.byId).forEach((key) => {
        const id = +key, rec = S.byId[id], Ta = Math.max(0, T - S.jit[id][2] * 0.9), ia = Math.min(fr.length - 2, Math.floor(Ta)), v = Ta - ia, a = rec[ia], b = rec[ia + 1] || a;
        if (a.route >= 0 && b.route === a.route) drawAnt(id, a.route, lerp(a.s, b.s, v), b.state === 'back' && !(a.state === 'out' && v < 0.5), true);
        else if (a.route < 0 && b.route >= 0) drawAnt(id, b.route, lerp(0, b.s, v), b.state === 'back' && v > 0.5, true);
        else if (a.route >= 0 && b.route < 0) drawAnt(id, a.route, lerp(a.s, 0, v), true, true);
        else if (a.route >= 0 && b.route >= 0) { if (v < 0.5) drawAnt(id, a.route, lerp(a.s, 0, v * 2), true, true); else drawAnt(id, b.route, lerp(0, b.s, v * 2 - 1), false, true); }
        else { const j = S.jit[id], aa = j[1] + time * (0.5 + j[2]) * (id % 2 ? 1 : -1), d = 17 + j[2] * 15; ant(ctx, S.nest[0] + Math.cos(aa) * d, S.nest[1] + Math.sin(aa) * d * 0.85, aa + 1.57 * (id % 2 ? 1 : -1), 6.2, time * 14 + j[1], false); }
      });
      // route lengths, on the second stretch of every route
      Object.values(S.paths).forEach((p) => {
        if (p.gap) return;
        const q = p.second[Math.round(p.second.length * (p.first === 2 ? 0.5 : 0.56))], isB = S.blockedIds.indexOf(p.route.id) >= 0 && blocked, lab = String(p.route.length) + (isB ? ' ×3' : '');
        ctx.font = `700 ${11 * FS}px ${FONT}`; const lw = ctx.measureText(lab).width + 14;
        rr(ctx, q[0] - lw / 2, q[1] - 9.5, lw, 19, 9.5); ctx.fillStyle = isB ? '#b23a2a' : FIRST_COLORS[p.first]; ctx.fill(); text(ctx, lab, q[0], q[1] + 0.5, 11, '#fff', 700, 'center');
      });
      // names of the first stretches
      st.firsts.forEach((name, k) => {
        const f = S.FIRST[k], q = f[Math.round(f.length * (k === 2 ? 0.6 : 0.42))], dy = k === 0 ? -17 : (k === 1 ? 19 : 21), dx = k === 2 ? 2 : -8;
        text(ctx, name + (k === st.blocked_first && blocked ? ' · blocked' : ''), q[0] + dx, q[1] + dy, 10.5, k === st.blocked_first && blocked ? 'rgba(160,40,30,0.98)' : 'rgba(40,40,15,0.85)', 700, 'center');
      });
      text(ctx, 'NEST', S.nest[0], S.nest[1] + 52, 11, 'rgba(40,35,15,0.8)', 700, 'center');
      text(ctx, 'FOOD', S.food[0], S.food[1] + 46, 11, 'rgba(40,35,15,0.8)', 700, 'center');
      text(ctx, 'steps to the food by each route', 742, 40, 10.5, 'rgba(40,35,15,0.7)', 600, 'right');
      // trips since the block: how many still go through the blocked stretch
      if (blocked) {
        let all = 0, thr = 0; S.trips.forEach(([t, pid]) => { if (t >= st.block_at && t <= A.t) { all++; if (S.blockedIds.indexOf(pid) >= 0) thr++; } });
        const s1 = `${thr} of ${all} trips since the block`, s2 = 'go through the blocked stretch';
        ctx.font = `700 ${11.5 * FS}px ${FONT}`; const bw = Math.max(ctx.measureText(s1).width, ctx.measureText(s2).width) + 22, bx = 166, by = 548 - 20 * FS;
        rr(ctx, bx, by, bw, 38 * FS, 9); ctx.fillStyle = 'rgba(18,28,40,0.8)'; ctx.fill();
        text(ctx, s1, bx + 11, by + 12 * FS, 11.5, '#fff', 700); text(ctx, s2, bx + 11, by + 27 * FS, 10.5, 'rgba(255,255,255,0.8)', 500);
      }
      if (S.kind === 'hierarchy') {
        ctx.save(); ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.ellipse(S.nest[0], S.nest[1], 50, 44, 0, 0, 6.3); ctx.strokeStyle = 'rgba(31,95,174,0.9)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore();
        ctx.font = `800 ${10.5 * FS}px ${FONT}`; const cw = ctx.measureText('COORDINATOR').width + 14; rr(ctx, S.nest[0] - cw / 2, S.nest[1] - 70, cw, 17 * FS, 8); ctx.fillStyle = '#1f5fae'; ctx.fill();
        text(ctx, 'COORDINATOR', S.nest[0], S.nest[1] - 70 + 8.5 * FS, 10.5, '#fff', 800, 'center');
      }
      const how = { ant: 'each lays and follows a trail that fades', hierarchy: 'one agent reads every report and sends every forager', solitary: 'nothing is shared', bee: 'foragers advertise a route at the nest', flock: 'each forager watches a few neighbours', broadcast: 'every forager tells all the others', swarm: 'every forager reads all reports and decides for itself' }[S.kind] || '';
      const ownCap = { ant: 'A stronger trail draws more ants', hierarchy: 'The coordinator assigns every trip from the reports it has read' }[S.kind] || '';
      hud(ctx, { title: S.title || 'A path network with a blocked stretch', subtitle: `${DESIGN_NAME[S.design] || S.design} · ${S.tr.meta.n_agents} forager agents · ${how}`,
        right: [{ label: 'time step', value: `${Math.min(fr.length, i + 1)}` }, { label: 'food brought home', value: String(Math.round(lerp(A.score.done, B.score.done, u))) }],
        caption: caption(fr, i) || ownCap, progress: time / S.duration, accent: '#d6336c' });
    },
  };

  // ================================================================== scene: a flock on migration
  const birds = {
    init(traces, dpr, opts) {
      const st0 = traces[0].meta.static || {}, ground = st0.ground || 'sea';
      // a ridge with its passes needs room across the route: the episodes then stand side by side and the route runs upward
      const n = traces.length, stacked = n > 1, gap = 8, cols = !!(st0.ridge || st0.wind) && stacked, pw = cols ? (W - gap * (n - 1)) / n : W, ph = cols ? H - 6 : (stacked ? (H - 6 - gap * (n - 1)) / n : H), R = rng(31337);
      const goal = traces[0].frames[0].sites.find(s => s.kind === 'goal'), D = Math.hypot(goal.x, goal.y), th = Math.atan2(goal.y, goal.x);
      const cph = Math.cos(-th), sph = Math.sin(-th), m0 = 14, m1 = goal.value + 8;
      // side by side: the view is as wide as the birds, the hawk zones and the passes ever spread across the route
      let ylo = -18, yhi = 18;
      if (cols) {
        const lat = (x, y) => x * sph + y * cph;
        traces.forEach(tr => tr.frames.forEach((f) => { f.agents.forEach((a) => { const v = lat(a.x, a.y); if (v < ylo) ylo = v; if (v > yhi) yhi = v; }); f.sites.forEach((q) => { const v = lat(q.x, q.y), r = q.kind === 'goal' ? q.value : q.value * 0.7; if (v - r < ylo) ylo = v - r; if (v + r > yhi) yhi = v + r; }); }));
        if (st0.ridge) st0.ridge.passes.forEach((q) => { const v = lat(q.x, q.y); ylo = Math.min(ylo, v - 9); yhi = Math.max(yhi, v + 9); });
        ylo = Math.max(ylo, -78); yhi = Math.min(yhi, 78);
      }
      // the route fills the height; birds that drift farther than the view is wide leave it
      const scRoute = (ph - 96) / (D + m0 + m1), wide = (pw - 16) / scRoute;
      const yc = (yhi - ylo + 6) > wide ? clamp((ylo + yhi) / 2, -(wide / 2 - 22), wide / 2 - 22) : (ylo + yhi) / 2;
      const sc = cols ? Math.min(scRoute, (pw - 16) / (yhi - ylo + 6) < scRoute * 0.999 ? scRoute : (pw - 16) / (yhi - ylo + 6)) : Math.min((pw - 70) / (D + m0 + m1), ph / (stacked ? (n > 2 ? 37 : 46) : 78)), mid = stacked ? ph / 2 : ph / 2 + 12;
      const P = cols ? (x, y) => { const xr = x * cph - y * sph, yr = x * sph + y * cph; return [pw / 2 - (yr - yc) * sc, ph - 34 - (xr + m0) * sc]; }
        : (x, y) => { const xr = x * cph - y * sph, yr = x * sph + y * cph; return [34 + (xr + m0) * sc, mid - yr * sc]; };
      const [bg, b] = offscreen(pw, ph, dpr);
      const pal = { sea: ['#d2e9f4', '#abd3e9'], storm: ['#c3d0d8', '#8aa7ba'], mountain: ['#e6e8c6', '#cbd6a6'] }[ground] || ['#d2e9f4', '#abd3e9'];
      const g = b.createLinearGradient(0, 0, pw, ph); g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]); b.fillStyle = g; b.fillRect(0, 0, pw, ph);
      if (ground === 'mountain') {      // a valley floor: meadow, light and shade
        for (let k = 0; k < 18; k++) { const x = R() * pw, y = R() * ph, r = 50 + R() * 110, q = b.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, R() < 0.5 ? 'rgba(96,136,70,0.16)' : 'rgba(250,246,196,0.26)'); q.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = q; b.fillRect(x - r, y - r, 2 * r, 2 * r); }
        for (let k = 0; k < 700; k++) { const x = R() * pw, y = R() * ph, l = 3 + R() * 5; b.strokeStyle = R() < 0.5 ? 'rgba(84,130,66,0.28)' : 'rgba(232,238,170,0.34)'; b.lineWidth = 1; b.beginPath(); b.moveTo(x, y); b.lineTo(x + 1, y - l); b.stroke(); }
      }
      for (let k = 0; k < (ground === 'mountain' ? 0 : (ground === 'storm' ? 300 : 150)); k++) { const x = R() * pw, y = R() * ph, l = 8 + R() * 16; b.strokeStyle = ground === 'storm' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.38)'; b.lineWidth = 1.2; b.beginPath(); b.moveTo(x, y); b.quadraticCurveTo(x + l / 2, y - 3, x + l, y); b.stroke(); }
      const blob = (x, y, r, fill, jag, seed) => { const q = rng(seed); b.beginPath(); for (let k = 0; k <= 14; k++) { const a = k / 14 * 6.2832, rad = r * (1 + (q() - 0.5) * jag), px = x + Math.cos(a) * rad * 1.2, py = y + Math.sin(a) * rad; if (k) b.lineTo(px, py); else b.moveTo(px, py); } b.closePath(); b.fillStyle = fill; b.fill(); };
      const gp = P(goal.x, goal.y), sp = P(0, 0);
      const land = (x, y, r, seed) => { blob(x, y, r * 1.12, 'rgba(255,255,255,0.6)', 0.3, seed); blob(x, y, r * 1.03, '#efe4bf', 0.3, seed); blob(x, y, r * 0.9, '#c3dca4', 0.3, seed); blob(x - r * 0.15, y - r * 0.1, r * 0.5, '#a3c98d', 0.5, seed + 1); };
      if ((traces[0].meta.mission || '').indexOf('heavy') >= 0) for (let k = 0; k < 8; k++) { land(k * pw / 7, ph + 58 - (k % 3) * 8, 92, 300 + k); land(k * pw / 7 + 60, -60 + (k % 2) * 9, 88, 340 + k); }   // a strait between two coasts
      const tree = (x, y, r) => { b.beginPath(); b.ellipse(x + 3, y + 4, r * 0.62, r * 0.5, 0, 0, 6.3); b.fillStyle = 'rgba(40,60,30,0.2)'; b.fill(); b.beginPath(); b.arc(x, y, r * 0.52, 0, 6.3); b.fillStyle = '#5f8f48'; b.fill(); b.beginPath(); b.arc(x - r * 0.14, y - r * 0.16, r * 0.3, 0, 6.3); b.fillStyle = '#79a85c'; b.fill(); };
      if (ground === 'mountain') {      // start on a meadow, winter by a lake
        blob(sp[0], sp[1], 34, 'rgba(250,246,200,0.5)', 0.3, 11);
        blob(gp[0], gp[1], goal.value * sc * 1.02, 'rgba(255,255,255,0.55)', 0.25, 23); blob(gp[0], gp[1], goal.value * sc * 0.93, '#bfe0ec', 0.25, 23); blob(gp[0] - 4, gp[1] - 3, goal.value * sc * 0.55, '#a5d2e4', 0.4, 24);
      } else { land(sp[0], sp[1], 40, 11); land(gp[0], gp[1], goal.value * sc * 1.12, 23); }
      const hawks = traces[0].frames[0].sites.filter(s => s.kind === 'hawk').map(s => P(s.x, s.y).concat([s.value * sc]));
      if (!cols) for (let k = 0; k < 9; k++) { const x = 120 + R() * (pw - 240), y = R() * ph, r = 12 + R() * 16; if (Math.abs(y - mid) > 46 && hawks.every(h => Math.hypot(h[0] - x, h[1] - y) > h[2] + r + 14) && Math.hypot(x - gp[0], y - gp[1]) > goal.value * sc + 50) land(x, y, r, 40 + k); }
      let ridge = null;
      if (st0.ridge) {                  // the ridge: a chain of peaks with two passes
        const ra = P(st0.ridge.a[0], st0.ridge.a[1]), rb = P(st0.ridge.b[0], st0.ridge.b[1]), L = Math.hypot(rb[0] - ra[0], rb[1] - ra[1]), ux = (rb[0] - ra[0]) / L, uy = (rb[1] - ra[1]) / L;
        const passes = st0.ridge.passes.map(q => ({ name: q.name, hawk: q.hawk, p: P(q.x, q.y) })), half = st0.ridge.pass_half * sc;
        for (let k = 0; k < 46; k++) { const x = R() * pw, y = R() * ph, r = 10 + R() * 12, d = Math.abs((x - ra[0]) * uy - (y - ra[1]) * ux); if (d > 30 && Math.abs(x - pw / 2) > 34 && hawks.every(h => Math.hypot(h[0] - x, h[1] - y) > h[2] + 8) && Math.hypot(x - gp[0], y - gp[1]) > goal.value * sc + 16 && Math.hypot(x - sp[0], y - sp[1]) > 44) tree(x, y, r); }
        b.lineCap = 'round'; b.beginPath(); b.moveTo(ra[0], ra[1]); b.lineTo(rb[0], rb[1]); b.strokeStyle = 'rgba(126,118,100,0.7)'; b.lineWidth = 24; b.stroke();
        passes.forEach((q) => { b.beginPath(); b.moveTo(q.p[0] - ux * half, q.p[1] - uy * half); b.lineTo(q.p[0] + ux * half, q.p[1] + uy * half); b.strokeStyle = '#dde2ba'; b.lineWidth = 28; b.lineCap = 'butt'; b.stroke(); b.lineCap = 'round'; });
        const peaks = []; for (let d = 0; d <= L; d += 13) { const x = ra[0] + ux * d, y = ra[1] + uy * d; if (!passes.some(q => Math.hypot(q.p[0] - x, q.p[1] - y) < half + 9)) peaks.push([x, y, d]); }
        peaks.sort((u2, v2) => u2[1] - v2[1]).forEach(([x, y, d]) => {
          const hgt = 21 + hash(d | 0, 5) * 13, w = 13 + hash(d | 0, 9) * 6;
          b.beginPath(); b.moveTo(x - w, y + 6); b.lineTo(x, y - hgt); b.lineTo(x + w, y + 6); b.closePath(); b.fillStyle = '#8f8b80'; b.fill();
          b.beginPath(); b.moveTo(x, y - hgt); b.lineTo(x + w, y + 6); b.lineTo(x + w * 0.2, y + 6); b.closePath(); b.fillStyle = 'rgba(58,54,46,0.34)'; b.fill();
          b.beginPath(); b.moveTo(x - w * 0.36, y - hgt * 0.56); b.lineTo(x, y - hgt); b.lineTo(x + w * 0.36, y - hgt * 0.56); b.lineTo(x + w * 0.1, y - hgt * 0.48); b.lineTo(x - w * 0.12, y - hgt * 0.6); b.closePath(); b.fillStyle = '#f8f8f3'; b.fill();
        });
        ridge = { passes, half, nx: -uy, ny: ux };
      }
      const nfAll = Math.max(...traces.map(t => t.frames.length));
      const clouds = []; for (let k = 0; k < (stacked ? 3 : 5); k++) clouds.push({ x: R() * pw, y: 30 + R() * (ph - 60), r: 20 + R() * 22, v: 4 + R() * 6, puffs: [0, 1, 2, 3].map(() => [R() * 50 - 25, R() * 16 - 8, 0.6 + R() * 0.6]) });
      const panels = traces.map((tr) => { const pos = {}, arrivedAt = {}; tr.frames.forEach((f, k) => f.agents.forEach((a) => { (pos[a.id] = pos[a.id] || [])[k] = a; if (a.state === 'arrived' && arrivedAt[a.id] == null) arrivedAt[a.id] = k; })); for (const id in pos) { const a = pos[id]; for (let k = 1; k < nfAll; k++) if (!a[k]) a[k] = a[k - 1]; } return { tr, fr: tr.frames, pos, arrivedAt }; });
      const nf = nfAll;
      const wind = st0.wind ? (() => { const o = P(0, 0), q = P(st0.wind.dx, st0.wind.dy), l = Math.hypot(q[0] - o[0], q[1] - o[1]) || 1; return { ux: (q[0] - o[0]) / l, uy: (q[1] - o[1]) / l, share: st0.wind.speed / st0.wind.flight }; })() : null;
      return { panels, P, sc, bg, pw, ph, gap, stacked, cols, ridge, wind, ground, clouds, gp, sp, goalR: goal.value * sc, secPerT: 0.33, duration: (nf - 1) * 0.33 + 1.6, nf,
        titles: (opts && opts.titles) || null, title: (opts && opts.title) || 'A flock finds its way', subtitle: opts && opts.subtitle };
    },
    draw(ctx, S, time) {
      if (S.stacked) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); }
      S.panels.forEach((p, k) => { ctx.save(); ctx.translate(S.cols ? k * (S.pw + S.gap) : 0, S.cols ? 0 : k * (S.ph + S.gap)); ctx.beginPath(); ctx.rect(0, 0, S.pw, S.ph); ctx.clip(); birds.panel(ctx, S, p, time, k); ctx.restore(); });
      const T = clamp(time / S.secPerT, 0, S.nf - 1);
      if (!S.stacked) {
        const p0 = S.panels[0], i = Math.min(p0.fr.length - 1, Math.floor(T)), f = p0.fr[i], lost = f.agents.filter(a => a.state === 'lost').length;
        hud(ctx, { title: S.title, subtitle: S.subtitle || `${p0.tr.meta.n_agents} birds · each aligns with its ${p0.tr.meta.outcome.neighbours} nearest neighbours and stays close to them`,
          right: [{ label: 'arrived', value: `${f.score.done} / ${f.score.total}` }, { label: 'taken by hawks', value: String(lost) }], caption: caption(p0.fr, i), progress: time / S.duration, accent: '#2f7fc1' });
      } else {
        ctx.fillStyle = 'rgba(18,28,40,0.25)'; ctx.fillRect(0, H - 6, W, 6); ctx.fillStyle = '#2f7fc1'; ctx.fillRect(0, H - 6, W * clamp(time / S.duration, 0, 1), 6);
      }
    },
    panel(ctx, S, p, time, pk) {
      const fr = p.fr, Tall = clamp(time / S.secPerT, 0, S.nf - 1), T = Math.min(Tall, fr.length - 1), i = Math.min(fr.length - 2, Math.floor(T)), F = fr[Math.min(fr.length - 1, Math.round(T))];
      ctx.drawImage(S.bg, 0, 0, S.pw, S.ph);
      ctx.save(); ctx.setLineDash([6, 5]); ctx.strokeStyle = 'rgba(30,110,70,0.8)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.arc(S.gp[0], S.gp[1], S.goalR, 0, 6.3); ctx.stroke(); ctx.restore();
      text(ctx, 'wintering ground', S.gp[0], Math.min(S.ph - 12, S.gp[1] + S.goalR + 13), 11, 'rgba(20,70,50,0.95)', 700, 'center');
      text(ctx, 'start', S.sp[0], S.sp[1] + 30, 11, 'rgba(20,50,70,0.85)', 700, 'center');
      if (S.wind) {                     // a steady crosswind: streaks drift with it
        ctx.save(); ctx.lineCap = 'round'; ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
        for (let k = 0; k < 34; k++) { const span = S.pw + S.ph, d = (hash(k, 3) * span + time * (52 + hash(k, 5) * 30)) % span, bx = hash(k, 7) * S.pw, by = hash(k, 11) * S.ph, x = ((bx + S.wind.ux * d) % S.pw + S.pw) % S.pw, y = ((by + S.wind.uy * d) % S.ph + S.ph) % S.ph, l = 16 + hash(k, 13) * 20; ctx.globalAlpha = 0.35 + 0.4 * hash(k, 17); ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + S.wind.ux * l, y + S.wind.uy * l); ctx.stroke(); }
        ctx.restore();
      }
      if (S.ridge) S.ridge.passes.forEach((q) => {
        const lab = 'pass by the ' + q.name, sub = q.hawk ? ' · a hawk watches it' : ' · safe';
        const dxs = S.sp[0] - q.p[0], dys = S.sp[1] - q.p[1], sgn = (dxs * S.ridge.nx + dys * S.ridge.ny) >= 0 ? 1 : -1, off = q.hawk ? 58 : 44;
        ctx.font = `700 10.5px ${FONT}`; const w1 = ctx.measureText(lab).width, lw = w1 + ctx.measureText(sub).width + 14, lx = clamp(q.p[0] + sgn * S.ridge.nx * off, lw / 2 + 4, S.pw - lw / 2 - 4), ly = q.p[1] + sgn * S.ridge.ny * off;
        ctx.strokeStyle = 'rgba(24,34,45,0.55)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(q.p[0] + sgn * S.ridge.nx * 12, q.p[1] + sgn * S.ridge.ny * 12); ctx.lineTo(lx, ly - 8); ctx.stroke();
        rr(ctx, lx - lw / 2, ly - 9, lw, 19, 8); ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fill();
        text(ctx, lab, lx - lw / 2 + 7, ly + 1, 10.5, INK, 700); text(ctx, sub, lx - lw / 2 + 7 + w1, ly + 1, 10.5, q.hawk ? 'rgba(150,45,35,0.98)' : 'rgba(30,110,70,0.98)', 700);
      });
      F.sites.filter(s => s.kind === 'hawk').forEach((s, k) => {
        const [x, y] = S.P(s.x, s.y), r = s.value * S.sc;
        ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fillStyle = 'rgba(200,62,50,0.13)'; ctx.fill();
        ctx.save(); ctx.setLineDash([4, 5]); ctx.strokeStyle = 'rgba(190,60,50,0.65)'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.restore();
        const a = time * 0.9 * (k % 2 ? -1 : 1) + k * 2, hx = x + Math.cos(a) * r * 0.5, hy = y + Math.sin(a) * r * 0.5;
        ctx.beginPath(); ctx.ellipse(hx + 7, hy + 10, 12, 4, 0, 0, 6.3); ctx.fillStyle = 'rgba(40,40,60,0.14)'; ctx.fill();
        bird(ctx, hx, hy, a + 1.57 * (k % 2 ? -1 : 1), 15, time * 3, '#7a2e22', '#e9c9a0', false);
        if (!(S.ridge && S.ridge.passes.some(q => Math.hypot(q.p[0] - x, q.p[1] - y) < 4))) { const ly = clamp(y < S.ph / 2 ? y + r - 13 : y - r + 13, 54, S.ph - 12); text(ctx, 'hawk territory', x, ly, 10.5, 'rgba(150,45,35,0.95)', 700, 'center'); }
      });
      const at = (id, tt) => {       // Catmull-Rom through the recorded positions
        const a = p.pos[id], n = fr.length - 1, k = clamp(Math.floor(tt), 0, n - 1), v = clamp(tt - k, 0, 1);
        const q0 = a[Math.max(0, k - 1)], q1 = a[k], q2 = a[Math.min(n, k + 1)], q3 = a[Math.min(n, k + 2)];
        const c = (m) => 0.5 * ((2 * q1[m]) + (-q0[m] + q2[m]) * v + (2 * q0[m] - 5 * q1[m] + 4 * q2[m] - q3[m]) * v * v + (-q0[m] + 3 * q1[m] - 3 * q2[m] + q3[m]) * v * v * v);
        return S.P(c('x'), c('y'));
      };
      const now = {}; F.agents.forEach((a) => { now[a.id] = a; });
      const A = fr[i], xy = {};
      A.agents.forEach((a) => {
        let q = at(a.id, T); const arr = p.arrivedAt[a.id];
        if (arr != null && Tall > arr) {         // after arriving, a bird glides in and settles on the island
          const v = ease(clamp((Tall - arr) / 7, 0, 1)), h1 = hash(a.id * 7 + 3, 11), h2 = hash(a.id * 13 + 5, 29), rad = S.goalR * (0.15 + 0.6 * h1), an = h2 * 6.2832;
          q = [lerp(q[0], S.gp[0] + Math.cos(an) * rad, v), lerp(q[1], S.gp[1] + Math.sin(an) * rad * 0.8, v)];
        }
        xy[a.id] = q;
      });
      ctx.strokeStyle = 'rgba(24,60,100,0.16)'; ctx.lineWidth = 1;
      (A.links || []).forEach(([a, b]) => { if (xy[a] && xy[b] && now[a].state !== 'lost' && now[b].state !== 'lost' && now[a].state !== 'arrived' && now[b].state !== 'arrived') { ctx.beginPath(); ctx.moveTo(xy[a][0], xy[a][1]); ctx.lineTo(xy[b][0], xy[b][1]); ctx.stroke(); } });
      if (p.tr.meta.static && p.tr.meta.static.hub) {      // a coordinator: one bird reads all reports and sets one heading for all
        const act = A.agents.filter(a => xy[a.id] && now[a.id].state !== 'lost' && now[a.id].state !== 'arrived');
        if (act.length > 1) {
          const hx = act.reduce((v, a) => v + xy[a.id][0], 0) / act.length, hy = act.reduce((v, a) => v + xy[a.id][1], 0) / act.length;
          ctx.save(); ctx.setLineDash([4, 4]); ctx.strokeStyle = 'rgba(31,95,174,0.55)'; ctx.lineWidth = 1.1; act.forEach((a) => { ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(xy[a.id][0], xy[a.id][1]); ctx.stroke(); });
          ctx.beginPath(); ctx.arc(hx, hy, 26, 0, 6.3); ctx.strokeStyle = 'rgba(31,95,174,0.9)'; ctx.lineWidth = 1.8; ctx.stroke(); ctx.restore();
          text(ctx, 'one heading for all', hx, hy - 36, 10.5, 'rgba(31,95,174,1)', 700, 'center');
        }
      }
      A.agents.forEach((a) => {
        const st = now[a.id].state, informed = p.pos[a.id][0].state === 'informed' || p.pos[a.id][0].informed === true, [x, y] = xy[a.id];
        ctx.lineCap = 'round';
        for (let k = 1; k <= 10; k++) { if (T - k * 0.5 < 0) break; const q0 = at(a.id, T - (k - 1) * 0.5), q1 = at(a.id, T - k * 0.5); ctx.strokeStyle = informed ? `rgba(226,146,20,${0.32 * (1 - k / 10)})` : `rgba(30,50,80,${0.2 * (1 - k / 10)})`; ctx.lineWidth = 2.2 * (1 - k / 11); ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke(); }
        if (st === 'lost') { ctx.strokeStyle = 'rgba(190,50,40,0.9)'; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(x - 5, y - 5); ctx.lineTo(x + 5, y + 5); ctx.moveTo(x + 5, y - 5); ctx.lineTo(x - 5, y + 5); ctx.stroke(); return; }
        const arr = p.arrivedAt[a.id], settled = arr != null && Tall > arr + 7;
        let ang;
        if (arr != null && Tall > arr) { const an = hash(a.id * 13 + 5, 29) * 6.2832, rad = S.goalR * (0.15 + 0.6 * hash(a.id * 7 + 3, 11)), tx = S.gp[0] + Math.cos(an) * rad, ty = S.gp[1] + Math.sin(an) * rad * 0.8; ang = settled ? a.id * 1.3 : Math.atan2(ty - y, tx - x); }
        else { const q = at(a.id, Math.min(fr.length - 1, T + 0.15)); ang = Math.hypot(q[0] - x, q[1] - y) > 0.05 ? Math.atan2(q[1] - y, q[0] - x) : a.id * 1.3; }
        ctx.beginPath(); ctx.ellipse(x + 5, y + 8, 7, 2.6, 0, 0, 6.3); ctx.fillStyle = 'rgba(30,50,80,0.13)'; ctx.fill();
        bird(ctx, x, y, ang, settled ? 7 : 8.2, time * 13 + a.id * 1.9, informed ? '#c2740a' : '#243b53', informed ? '#ffd766' : null, settled);
      });
      if (!S.cols) S.clouds.forEach((c) => { const x = ((c.x + time * c.v) % (S.pw + 160)) - 80; ctx.fillStyle = 'rgba(255,255,255,0.30)'; c.puffs.forEach(([dx, dy, s]) => { ctx.beginPath(); ctx.ellipse(x + dx, c.y + dy, c.r * s, c.r * s * 0.55, 0, 0, 6.3); ctx.fill(); }); });
      if (S.stacked) {
        const title = S.titles ? S.titles[pk] : p.tr.meta.design, tf = S.cols ? 13 : 15; ctx.font = `700 ${tf}px ${FONT}`; const tw = ctx.measureText(title).width + 26;
        chip(ctx, S.cols ? 8 : 14, 12, tw, 32); text(ctx, title, S.cols ? 21 : 27, 28.5, tf, '#fff', 700);
        const lost = F.agents.filter(a => a.state === 'lost').length, s = `arrived ${F.score.done} / ${F.score.total}   ·   taken by hawks ${lost}`;
        ctx.font = `600 13px ${FONT}`; const sw = ctx.measureText(s).width + 26;
        if (S.cols) { chip(ctx, 8, 50, sw, 30); text(ctx, s, 21, 65.5, 13, '#fff', 600); } else { chip(ctx, S.pw - sw - 14, 12, sw, 32); text(ctx, s, S.pw - sw - 1, 28.5, 13, '#fff', 600); }
        if (S.wind && (S.cols || pk === 0)) {       // the wind's direction, and how strong it is against a bird's own speed
          const wx = S.cols ? 8 : S.pw - 150, wy = S.cols ? 86 : S.ph - 44; chip(ctx, wx, wy, 136, 32, 'rgba(255,255,255,0.86)');
          ctx.save(); ctx.translate(wx + 22, wy + 16); ctx.rotate(Math.atan2(S.wind.uy, S.wind.ux)); ctx.strokeStyle = INK; ctx.fillStyle = INK; ctx.lineWidth = 2; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(-10, 0); ctx.lineTo(7, 0); ctx.stroke(); ctx.beginPath(); ctx.moveTo(12, 0); ctx.lineTo(5, -4.5); ctx.lineTo(5, 4.5); ctx.closePath(); ctx.fill(); ctx.restore();
          text(ctx, 'crosswind', wx + 42, wy + 16.5, 11, INK, 700);
        }
      }
      if (!S.stacked || pk === 0) {
        const lx = 14, ly = S.stacked ? S.ph - 44 : H - 104; chip(ctx, lx, ly, 214, 32, 'rgba(255,255,255,0.86)');
        bird(ctx, lx + 20, ly + 16, 0, 7, 1, '#c2740a', '#ffd766', false); text(ctx, 'knows the way', lx + 34, ly + 16.5, 11, INK, 600);
        bird(ctx, lx + 132, ly + 16, 0, 7, 1, '#243b53', null, false); text(ctx, 'does not', lx + 146, ly + 16.5, 11, INK, 600);
      }
    },
  };

  // ================================================================== scene: drones in a wildfire rescue
  const CLASS_COLORS = { useful: '#1f9d6b', duplicate: '#e8891c', stale: '#d13b3b' };
  const rescue = {
    init(traces, dpr, opts) {
      const n = traces.length, size = n === 1 ? 470 : 438, gap = 28, top = 92;
      const x0s = n === 1 ? [40] : [(W - 2 * size - gap) / 2, (W - 2 * size - gap) / 2 + size + gap];
      const panels = traces.map((tr, k) => {
        const wb = tr.meta.world, nx = wb.xmax - wb.xmin + 1, ny = wb.ymax - wb.ymin + 1, cell = size / Math.max(nx, ny);
        const P = (x, y) => [(x - wb.xmin + 0.5) * cell, (wb.ymax - y + 0.5) * cell];
        const [bg, b] = offscreen(size, size, dpr), st = tr.meta.static;
        b.fillStyle = '#e3e8d8'; b.fillRect(0, 0, size, size);
        (st.districts || []).forEach((d, q) => { const a = P(d.x0, d.y1), c = P(d.x1, d.y0); b.fillStyle = (q + Math.floor(q / Math.max(1, Math.round(Math.sqrt(st.districts.length))))) % 2 ? 'rgba(120,150,95,0.10)' : 'rgba(255,255,255,0.16)'; b.fillRect(a[0] - cell / 2, a[1] - cell / 2, c[0] - a[0] + cell, c[1] - a[1] + cell); });
        const R = rng(5 + k);
        for (let q = 0; q < 900; q++) { b.fillStyle = R() < 0.5 ? 'rgba(96,128,78,0.16)' : 'rgba(255,255,255,0.25)'; b.fillRect(R() * size, R() * size, 2, 2); }
        b.fillStyle = 'rgba(150,142,124,0.34)'; (st.rubble || []).forEach(([x, y]) => { const p = P(x, y); b.fillRect(p[0] - cell / 2, p[1] - cell / 2, cell, cell); });
        b.strokeStyle = 'rgba(255,255,255,0.9)'; b.lineWidth = 1.4;
        (st.districts || []).forEach((d) => { const a = P(d.x0, d.y1), c = P(d.x1, d.y0); b.strokeRect(a[0] - cell / 2, a[1] - cell / 2, c[0] - a[0] + cell, c[1] - a[1] + cell); });
        (st.bases || []).forEach((q) => { const p = P(q.x, q.y), r = Math.max(4, cell * 1.6); rr(b, p[0] - r, p[1] - r, 2 * r, 2 * r, 2.5); b.fillStyle = '#fff'; b.fill(); b.strokeStyle = '#2b4a78'; b.lineWidth = 1.2; b.stroke(); b.fillStyle = '#2b4a78'; b.fillRect(p[0] - 0.8, p[1] - r * 0.55, 1.6, r * 1.1); b.fillRect(p[0] - r * 0.55, p[1] - 0.8, r * 1.1, 1.6); });
        const pos = {}; tr.frames.forEach((f, q) => f.agents.forEach((a) => { (pos[a.id] = pos[a.id] || [])[q] = a; }));
        const fire = st.fire; let cells = null;
        if (fire) { cells = []; for (let q = 0; q < fire.ign.length; q++) if (fire.ign[q] >= 0) cells.push([fire.x0 + Math.floor(q / fire.h), fire.y0 + (q % fire.h), fire.ign[q]]); }
        return { tr, fr: tr.frames, P, cell, bg, pos, cells, burn: fire ? fire.burn : 0, x0: x0s[k], y0: top, size, color: (opts && opts.colors && opts.colors[k]) || ['#1f5fae', '#b5367a'][k % 2], title: (opts && opts.titles && opts.titles[k]) || tr.meta.design, sub: (opts && opts.subs && opts.subs[k]) || '' };
      });
      const last = Math.max(...traces.map(t => t.frames[t.frames.length - 1].t));
      return { panels, secPerT: 0.30, duration: last * 0.30 + 2.2, last, headline: (opts && opts.headline) || 'Wildfire rescue', subline: (opts && opts.subline) || '' };
    },
    draw(ctx, S, time) {
      ctx.fillStyle = '#f4f2ec'; ctx.fillRect(0, 0, W, H);
      text(ctx, S.headline, W / 2, 24, 19, INK, 700, 'center');
      if (S.subline) text(ctx, S.subline, W / 2, 46, 12.5, 'rgba(24,34,45,0.72)', 500, 'center');
      const T = clamp(time / S.secPerT, 0, S.last);
      S.panels.forEach((p) => rescue.panel(ctx, S, p, T, time));
      // shared key
      const ky = H - 24; let x = 0;
      const items = [['#f0a81c', 'victims waiting'], ['#27a36f', 'all rescued'], ['#5a5a5a', 'lost to the fire'], ['#f4511e', 'fire'], ['#34302c', 'burnt'], ['#3d4a5c', 'drone'], [null, 'lost drone'], ['line', 'radio link between neighbours'], ['dash', 'drone sent to a site']];
      ctx.font = `500 11px ${FONT}`; const widths = items.map(it => 22 + ctx.measureText(it[1]).width); x = (W - widths.reduce((a, b) => a + b, 0)) / 2 + 4;
      items.forEach((it, k) => {
        if (it[0] === 'line') { ctx.strokeStyle = 'rgba(181,54,122,0.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 6, ky); ctx.lineTo(x + 6, ky); ctx.stroke(); }
        else if (it[0] === 'dash') { ctx.strokeStyle = 'rgba(40,50,70,0.8)'; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(x - 6, ky); ctx.lineTo(x + 6, ky); ctx.stroke(); ctx.setLineDash([]); }
        else if (it[0] === null) { ctx.strokeStyle = 'rgba(30,30,30,0.7)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.moveTo(x - 3, ky - 3); ctx.lineTo(x + 3, ky + 3); ctx.moveTo(x + 3, ky - 3); ctx.lineTo(x - 3, ky + 3); ctx.stroke(); }
        else { ctx.beginPath(); ctx.arc(x, ky, 4, 0, 6.3); ctx.fillStyle = it[0]; ctx.fill(); }
        text(ctx, it[1], x + 9, ky + 0.5, 11, 'rgba(24,34,45,0.8)', 500); x += widths[k];
      });
      ctx.fillStyle = 'rgba(18,28,40,0.15)'; ctx.fillRect(0, H - 6, W, 6); ctx.fillStyle = '#e8891c'; ctx.fillRect(0, H - 6, W * clamp(time / S.duration, 0, 1), 6);
    },
    panel(ctx, S, p, T, time) {
      const fr = p.fr, [i, u] = locate(fr, T), A = fr[i], B = fr[i + 1], tick = lerp(A.t, B.t, u);
      ctx.save(); ctx.translate(p.x0, p.y0);
      ctx.save(); ctx.shadowColor = 'rgba(20,30,40,0.22)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 4; rr(ctx, 0, 0, p.size, p.size, 8); ctx.fillStyle = '#e3e8d8'; ctx.fill(); ctx.restore();
      ctx.save(); rr(ctx, 0, 0, p.size, p.size, 8); ctx.clip();
      ctx.drawImage(p.bg, 0, 0, p.size, p.size);
      const c = p.cell, flick = Math.floor(time * 9);
      if (p.cells) p.cells.forEach(([x, y, ig]) => {
        if (ig > tick) return; const q = p.P(x, y), age = tick - ig;
        if (age >= p.burn) { ctx.fillStyle = 'rgba(52,48,44,0.74)'; ctx.fillRect(q[0] - c / 2, q[1] - c / 2, c + 0.4, c + 0.4); }
        else { const h = hash(x * 131 + flick, y * 17 + flick); ctx.fillStyle = age < 1.5 ? (h < 0.5 ? '#ffd23f' : '#ffa51f') : (h < 0.33 ? '#ff7a1a' : (h < 0.66 ? '#f4511e' : '#e23a1a')); ctx.fillRect(q[0] - c / 2 - 0.4, q[1] - c / 2 - 0.4, c + 0.8, c + 0.8); }
      });
      // victim sites
      const sB = {}; B.sites.forEach((s) => { sB[s.id] = s; });
      A.sites.forEach((s) => {
        const b = sB[s.id] || s, q = p.P(s.x, s.y), st = u < 0.5 ? s : b;
        if (st.state === 'dead') { ctx.beginPath(); ctx.arc(q[0], q[1], 3.2, 0, 6.3); ctx.fillStyle = '#5a5a5a'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 0.9; ctx.stroke(); return; }
        if (st.waiting <= 0) { ctx.beginPath(); ctx.arc(q[0], q[1], 3.4, 0, 6.3); ctx.fillStyle = '#27a36f'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); return; }
        const r = 2.6 + 0.75 * Math.min(6, st.waiting);
        if (st.found) { const pu = (time * 1.4 + (s.id % 7) / 7) % 1; ctx.beginPath(); ctx.arc(q[0], q[1], r + pu * 6, 0, 6.3); ctx.strokeStyle = `rgba(240,168,28,${0.6 * (1 - pu)})`; ctx.lineWidth = 1.2; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 6.3); ctx.fillStyle = st.found ? '#f0a81c' : 'rgba(240,168,28,0.45)'; ctx.fill(); ctx.strokeStyle = 'rgba(120,70,0,0.8)'; ctx.lineWidth = 0.8; ctx.stroke();
      });
      const at = (id) => { const a = p.pos[id][i], b = p.pos[id][i + 1] || a; return [p.P(lerp(a.x, b.x, u), lerp(a.y, b.y, u)), u < 0.5 ? a : b, a, b]; };
      // radio links between neighbours
      if (A.links && A.links.length) { ctx.strokeStyle = 'rgba(181,54,122,0.20)'; ctx.lineWidth = 0.8; ctx.beginPath(); A.links.forEach(([a, b]) => { const q0 = at(a)[0], q1 = at(b)[0]; ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); }); ctx.stroke(); }
      // orders issued in this step
      const al = Math.sin(Math.PI * clamp(u, 0, 1));
      ctx.strokeStyle = p.color; ctx.lineWidth = 1; ctx.setLineDash([3, 3]); (B.orders || []).forEach((o) => { if (!o.to || !p.pos[o.agent]) return; const q0 = at(o.agent)[0], q1 = p.P(o.to[0], o.to[1]); ctx.globalAlpha = 0.55 * al; ctx.beginPath(); ctx.moveTo(q0[0], q0[1]); ctx.lineTo(q1[0], q1[1]); ctx.stroke(); }); ctx.setLineDash([]);
      ctx.globalAlpha = 1;
      // drones
      A.agents.forEach((a) => {
        const [q, st] = at(a.id);
        if (st.state === 'lost') { ctx.strokeStyle = 'rgba(30,30,30,0.6)'; ctx.lineWidth = 1.1; ctx.beginPath(); ctx.moveTo(q[0] - 2, q[1] - 2); ctx.lineTo(q[0] + 2, q[1] + 2); ctx.moveTo(q[0] + 2, q[1] - 2); ctx.lineTo(q[0] - 2, q[1] + 2); ctx.stroke(); return; }
        const r = Math.max(3.1, c * 0.95);
        ctx.beginPath(); ctx.arc(q[0], q[1], r + 1.1, 0, 6.3); ctx.fillStyle = 'rgba(255,255,255,0.95)'; ctx.fill();
        ctx.beginPath(); ctx.arc(q[0], q[1], r, 0, 6.3); ctx.fillStyle = p.color; ctx.fill();
      });
      ctx.restore();
      // header and score
      text(ctx, p.title, 0, -22, 14.5, p.color, 700);
      if (p.sub) text(ctx, p.sub, 0, -6, 11, 'rgba(24,34,45,0.7)', 500);
      const done = lerp(A.score.done, B.score.done, u), pct = Math.round(100 * done / A.score.total);
      text(ctx, `${pct}%`, p.size, -17, 24, p.color, 700, 'right');
      ctx.font = `700 24px ${FONT}`; const pw = ctx.measureText(`${pct}%`).width;
      text(ctx, 'victims rescued', p.size - pw - 8, -14, 11, 'rgba(24,34,45,0.7)', 500, 'right');
      ctx.fillStyle = 'rgba(24,34,45,0.12)'; rr(ctx, 0, p.size + 8, p.size, 7, 3.5); ctx.fill();
      ctx.fillStyle = p.color; rr(ctx, 0, p.size + 8, Math.max(7, p.size * done / A.score.total), 7, 3.5); ctx.fill();
      const lost = (u < 0.5 ? A : B).agents.filter(a => a.state === 'lost').length, w = (u < 0.5 ? A : B).score;
      text(ctx, `time step ${Math.round(tick)} of ${Math.round(S.last)}   ·   drones lost ${lost} of ${A.agents.length}`, 0, p.size + 28, 11.5, 'rgba(24,34,45,0.8)', 500);
      ctx.restore();
    },
  };

  // ================================================================== scene: foraging in a landscape that changes
  const COLONY = [['#b5367a', 'rgba(181,54,122,'], ['#1f5fae', 'rgba(31,95,174,']];
  const SHARES = { bee: 'foragers advertise good patches at the nest', ant: 'foragers mark the way to a patch; marks fade', flock: 'each forager watches a few neighbours',
    broadcast: 'every forager tells all the others', hierarchy: 'one agent reads every report and sends every forager', solitary: 'nothing is shared',
    'roost-v3': 'every forager reads all reports and decides for itself' };
  const forage = {
    single: true,
    init(traces, dpr) {
      const tr = traces[0], fr = tr.frames, wb = tr.meta.world, st = tr.meta.static, R = rng(2718);
      const mx = (wb.xmin + wb.xmax) / 2, my = (wb.ymin + wb.ymax) / 2, cx = W / 2, cy = 322;
      const sc = Math.min(9.2, (W - 170) / (wb.xmax - wb.xmin), (H - 196) / (wb.ymax - wb.ymin));
      const P = (x, y) => [cx + (x - mx) * sc, cy - (y - my) * sc];
      const [bg, b] = offscreen(W, H, dpr);
      const g = b.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#d6e6a6'); g.addColorStop(0.5, '#c2da8f'); g.addColorStop(1, '#aecd7e'); b.fillStyle = g; b.fillRect(0, 0, W, H);
      for (let k = 0; k < 30; k++) { const x = R() * W, y = R() * H, r = 70 + R() * 140, q = b.createRadialGradient(x, y, 0, x, y, r); q.addColorStop(0, R() < 0.5 ? 'rgba(96,140,70,0.16)' : 'rgba(246,244,176,0.24)'); q.addColorStop(1, 'rgba(0,0,0,0)'); b.fillStyle = q; b.fillRect(x - r, y - r, 2 * r, 2 * r); }
      // a brook across the heath
      const brook = []; for (let k = 0; k <= 24; k++) brook.push([-20 + k * (W + 40) / 24, H * 0.83 + Math.sin(k * 0.7) * 26 - k * 5.2]);
      b.lineCap = 'round'; b.lineJoin = 'round';
      for (const [wd, col] of [[26, 'rgba(120,150,90,0.35)'], [18, '#9ccbe0'], [9, 'rgba(210,236,246,0.8)']]) { b.beginPath(); brook.forEach((q, k) => (k ? b.lineTo(q[0], q[1]) : b.moveTo(q[0], q[1]))); b.strokeStyle = col; b.lineWidth = wd; b.stroke(); }
      for (let k = 0; k < 1100; k++) { const x = R() * W, y = R() * H, l = 3 + R() * 6, a = -1.57 + (R() - 0.5); b.strokeStyle = R() < 0.5 ? 'rgba(84,130,66,0.3)' : 'rgba(226,236,160,0.34)'; b.lineWidth = 1; b.beginPath(); b.moveTo(x, y); b.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); b.stroke(); }
      for (let k = 0; k < 16; k++) { const top = k % 2, x = R() * W, y = top ? R() * 26 - 6 : H - R() * 26 + 6, r = 26 + R() * 30; b.beginPath(); b.ellipse(x, y, r * 1.5, r, 0, 0, 6.3); b.fillStyle = ['#5f8f48', '#6b9a50', '#55843f'][k % 3]; b.fill(); }   // hedges
      const nests = st.bases.map((q) => P(q.x, q.y)), two = nests.length > 1;
      const px = [], py = []; fr.forEach(f => f.sites.forEach(s => { const q = P(s.x, s.y); px.push(q[0]); py.push(q[1]); })); nests.forEach(q => { px.push(q[0]); py.push(q[1]); });
      const x0 = Math.min(...px) - 62, x1 = Math.max(...px) + 62, y0 = Math.min(...py) - 52, y1 = Math.max(...py) + 62;
      const pos = {}; fr.forEach((f, k) => f.agents.forEach((a) => { (pos[a.id] = pos[a.id] || [])[k] = a; }));
      const spot = {}; fr.forEach(f => f.sites.forEach(s => { spot[s.id] = P(s.x, s.y); }));
      const side = {}, taken = []; Object.keys(spot).map(Number).sort((p, q) => spot[p][1] - spot[q][1]).forEach((id) => {
        const [x, y] = spot[id], hit = (v) => { const ly = y + v * 32; return ly < 86 || ly > H - 70 || taken.some(q => Math.abs(q[0] - x) < 120 && Math.abs(q[1] - ly) < 19) || Object.keys(spot).some(k => +k !== id && Math.abs(spot[k][0] - x) < 70 && Math.abs(spot[k][1] - ly) < 24) || nests.some(q => Math.abs(q[0] - x) < 110 && (Math.abs(q[1] - ly) < 30 || Math.abs(q[1] + 40 - ly) < 20)); };
        let sd = -1; if (hit(-1) && !hit(1)) sd = 1; side[id] = sd; taken.push([x, y + sd * 32]);
      });
      return { side, tr, fr, P, bg, nests, two, pos, crop: [x0, y0, x1 - x0, y1 - y0], variant: st.variant, designs: st.designs || [tr.meta.design], secPerT: 0.3, duration: fr.length * 0.3 + 1.0 };
    },
    draw(ctx, S, time) {
      const fr = S.fr, T = clamp(time / S.secPerT, 0, fr.length - 1), i = Math.min(fr.length - 2, Math.floor(T)), u = T - i, A = fr[i], B = fr[i + 1];
      ctx.drawImage(S.bg, 0, 0, W, H);
      const at = {}; A.sites.forEach(s => { at[s.id] = S.P(s.x, s.y); });
      // what a colony shares: trails that fade, advertisements at the nest, messages to all
      A.marks.forEach((m) => {
        const nest = S.nests[m.colony || 0], c = COLONY[S.two ? (m.colony || 0) : 0], q = at[m.site];
        if (m.kind === 'messages') { if (m.level > 0) { const r = 30 + ((time * 20 + (m.colony || 0) * 9) % 26); ctx.beginPath(); ctx.arc(nest[0], nest[1], r, 0, 6.3); ctx.strokeStyle = c[1] + (0.55 * (1 - (r - 30) / 26)).toFixed(3) + ')'; ctx.lineWidth = 2; ctx.stroke(); } return; }
        if (!q) return;
        const a = Math.atan2(q[1] - nest[1], q[0] - nest[0]);
        if (m.kind === 'trail') {
          const k = m.level / (m.level + 4);
          ctx.save(); ctx.lineCap = 'round'; ctx.globalAlpha = 0.14 + 0.5 * k; ctx.strokeStyle = c[0]; ctx.shadowColor = c[0]; ctx.shadowBlur = 12; ctx.lineWidth = 3 + 11 * k;
          ctx.beginPath(); ctx.moveTo(nest[0] + Math.cos(a) * 26, nest[1] + Math.sin(a) * 26); ctx.lineTo(q[0] - Math.cos(a) * 26, q[1] - Math.sin(a) * 26); ctx.stroke(); ctx.restore();
        } else if (m.kind === 'dance') {
          const r0 = 30, r1 = 30 + 14 + Math.min(58, m.level * 2.4), wd = 2.5 + Math.min(6, m.level / 6);
          ctx.save(); ctx.globalAlpha = 0.9; ctx.strokeStyle = c[0]; ctx.fillStyle = c[0]; ctx.lineWidth = wd; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(nest[0] + Math.cos(a) * r0, nest[1] + Math.sin(a) * r0); ctx.lineTo(nest[0] + Math.cos(a) * r1, nest[1] + Math.sin(a) * r1); ctx.stroke();
          const hx = nest[0] + Math.cos(a) * (r1 + wd + 4), hy = nest[1] + Math.sin(a) * (r1 + wd + 4), hw = wd + 4;
          ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx - Math.cos(a - 0.5) * hw * 1.8, hy - Math.sin(a - 0.5) * hw * 1.8); ctx.lineTo(hx - Math.cos(a + 0.5) * hw * 1.8, hy - Math.sin(a + 0.5) * hw * 1.8); ctx.closePath(); ctx.fill(); ctx.restore();
        }
      });
      // patches: as many flowers as loads are left; richer patches have deeper colours
      A.sites.forEach((s) => {
        const [x, y] = at[s.id], q = s.value, left = s.left, n = left > 0 ? 3 + Math.round(11 * left / Math.max(1, s.of)) : 0;
        const col = q >= 0.8 ? '#8a55cf' : q >= 0.6 ? '#e2619b' : q >= 0.4 ? '#f1c232' : '#ffffff';
        ctx.save(); if (!s.found) ctx.globalAlpha = 0.5;
        ctx.beginPath(); ctx.ellipse(x, y + 2, 27, 21, 0, 0, 6.3); ctx.fillStyle = left > 0 ? 'rgba(74,128,62,0.42)' : 'rgba(150,130,90,0.4)'; ctx.fill();
        for (let k = 0; k < 14; k++) {
          const a = hash(s.id * 31 + k, 7) * 6.283, d = Math.sqrt(hash(s.id * 17 + k, 3)) * 20, fx = x + Math.cos(a) * d, fy = y + Math.sin(a) * d * 0.78;
          if (k < n) { ctx.fillStyle = col; for (let p = 0; p < 5; p++) { const b2 = p * 1.2566 + k; ctx.beginPath(); ctx.arc(fx + Math.cos(b2) * 3, fy + Math.sin(b2) * 3, 2.3, 0, 6.3); ctx.fill(); } ctx.fillStyle = '#e9a514'; ctx.beginPath(); ctx.arc(fx, fy, 1.7, 0, 6.3); ctx.fill(); }
          else { ctx.fillStyle = 'rgba(120,100,60,0.55)'; ctx.beginPath(); ctx.arc(fx, fy, 1.3, 0, 6.3); ctx.fill(); }
        }
        ctx.restore();
        const word = q >= 0.8 ? 'rich' : q >= 0.6 ? 'good' : q >= 0.4 ? 'fair' : 'poor';
        if (s.risky) {                  // a crab spider hunts on these flowers
          ctx.save(); ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.ellipse(x, y + 2, 31, 25, 0, 0, 6.3); ctx.strokeStyle = 'rgba(178,44,34,0.9)'; ctx.lineWidth = 1.8; ctx.stroke(); ctx.restore();
          const hx = x + 21, hy = y - 15; ctx.strokeStyle = '#3a1d16'; ctx.lineWidth = 1.3; ctx.lineCap = 'round';
          for (let k = 0; k < 4; k++) { const a = -0.9 + k * 0.6; for (const sd of [-1, 1]) { ctx.beginPath(); ctx.moveTo(hx, hy); ctx.quadraticCurveTo(hx + sd * 6 * Math.cos(a), hy + 7 * Math.sin(a) - 3, hx + sd * 10 * Math.cos(a * 0.8), hy + 10 * Math.sin(a) + 1); ctx.stroke(); } }
          ctx.beginPath(); ctx.ellipse(hx, hy + 1.5, 5, 5.6, 0, 0, 6.3); ctx.fillStyle = '#f4efe2'; ctx.fill(); ctx.strokeStyle = '#8a2b20'; ctx.lineWidth = 1.2; ctx.stroke();
          ctx.beginPath(); ctx.arc(hx, hy - 4.2, 2.8, 0, 6.3); ctx.fillStyle = '#e3d9c4'; ctx.fill(); ctx.stroke();
        }
        if (!s.found) { text(ctx, '?', x, y + 1, 15, 'rgba(24,34,45,0.6)', 800, 'center'); return; }
        const nl = Math.round(left), lab = left > 0 ? `${word} · ${nl} load${nl === 1 ? '' : 's'} left` : `${word} · empty`, ly = y + S.side[s.id] * 32;
        ctx.font = `600 ${10.5 * FS}px ${FONT}`; const lw = ctx.measureText(lab).width + 14;
        rr(ctx, x - lw / 2, ly - 8.5, lw, 17, 8.5); ctx.fillStyle = 'rgba(24,34,45,0.72)'; ctx.fill(); text(ctx, lab, x, ly + 0.5, 10.5, '#fff', 600, 'center');
        if (s.risky) text(ctx, `hunter · ${s.fails || 0} failed trip${s.fails === 1 ? '' : 's'}`, x, ly + S.side[s.id] * 15, 10.5, 'rgba(165,38,28,0.98)', 700, 'center');
      });
      // nests
      S.nests.forEach(([x, y], k) => {
        ctx.beginPath(); ctx.ellipse(x + 3, y + 14, 24, 8, 0, 0, 6.3); ctx.fillStyle = 'rgba(40,60,30,0.25)'; ctx.fill();
        rr(ctx, x - 17, y - 14, 34, 28, 6); ctx.fillStyle = '#c98d3f'; ctx.fill(); ctx.strokeStyle = '#8a5f28'; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.fillStyle = 'rgba(120,80,30,0.45)'; ctx.fillRect(x - 17, y - 6, 34, 2.4); ctx.fillRect(x - 17, y + 3, 34, 2.4);
        rr(ctx, x - 20, y - 19, 40, 8, 4); ctx.fillStyle = S.two ? COLONY[k][0] : '#8a5f28'; ctx.fill();
        ctx.beginPath(); ctx.ellipse(x, y + 9, 5, 3, 0, 0, 6.3); ctx.fillStyle = '#2a1d12'; ctx.fill();
        if (S.designs[k] === 'hierarchy') { ctx.save(); ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(x, y, 30, 0, 6.3); ctx.strokeStyle = 'rgba(31,95,174,0.9)'; ctx.lineWidth = 2; ctx.stroke(); ctx.restore(); }
        const lab = S.two ? `Colony ${'AB'[k]} · ${(DESIGN_NAME[S.designs[k]] || S.designs[k]).toLowerCase()}` : (S.designs[0] === 'hierarchy' ? 'NEST · COORDINATOR' : 'NEST');
        if (S.two) text(ctx, lab, x + (k ? -20 : 20), y + 40, 10.5, COLONY[k][0], 700, k ? 'left' : 'right'); else text(ctx, lab, x, y + 40, 10.5, 'rgba(30,40,20,0.85)', 700, 'center');
      });
      // foragers
      A.agents.forEach((a) => {
        const b = (S.pos[a.id] || [])[i + 1] || a, p0 = S.P(a.x, a.y), p1 = S.P(b.x, b.y), nest = S.nests[a.colony || 0];
        let x = lerp(p0[0], p1[0], u), y = lerp(p0[1], p1[1], u), ang = Math.atan2(p1[1] - p0[1], p1[0] - p0[0]);
        if (Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < 0.6) {
          if (Math.hypot(x - nest[0], y - nest[1]) < 3) { const h = hash(a.id, 5), aa = h * 6.283 + time * (0.7 + h) * (a.id % 2 ? 1 : -1), d = 19 + (a.id % 4) * 3.2; x = nest[0] + Math.cos(aa) * d; y = nest[1] + Math.sin(aa) * d * 0.8; ang = aa + 1.57 * (a.id % 2 ? 1 : -1); }
          else { ang = time * 2 + a.id; x += Math.cos(ang) * 4; y += Math.sin(ang) * 4; ang += 1.57; }
        }
        ctx.beginPath(); ctx.ellipse(x + 3, y + 5, 5, 2.3, 0, 0, 6.3); ctx.fillStyle = 'rgba(30,50,20,0.16)'; ctx.fill();
        bee(ctx, x, y, ang, 6, time * 46 + a.id, S.two ? COLONY[a.colony || 0][1] + '0.42)' : null);
        if (a.state === 'fled') text(ctx, '!', x + 7, y - 9, 13, 'rgba(178,44,34,1)', 800, 'center');
      });
      text(ctx, 'N', 34, H - 96, 11, 'rgba(30,40,20,0.75)', 800, 'center'); ctx.strokeStyle = 'rgba(30,40,20,0.7)'; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(34, H - 66); ctx.lineTo(34, H - 88); ctx.lineTo(30, H - 82); ctx.moveTo(34, H - 88); ctx.lineTo(38, H - 82); ctx.stroke();
      const food = A.score.food.map((v, k) => lerp(v, B.score.food[k], u)), size = A.score.size, d = S.designs;
      const title = { patchy: 'Foraging where patches run out', renew: 'New patches come into flower', growth: 'A colony that grows with its harvest', flux: 'Patches that flower only briefly', compete: 'Two colonies on one landscape', risk: 'A hunter on the rich flowers' }[S.variant] || 'Foraging';
      const subtitle = S.two ? `Colony A: ${(DESIGN_NAME[d[0]] || d[0]).toLowerCase()} · Colony B: ${(DESIGN_NAME[d[1]] || d[1]).toLowerCase()} · ${size[0]} and ${size[1]} foragers`
        : `${DESIGN_NAME[d[0]] || d[0]} · ${size[0]} forager agents · ${SHARES[d[0]] || ''}`;
      const right = [{ label: 'time step', value: String(Math.min(fr.length, i + 1)) }].concat(S.two
        ? food.map((v, k) => ({ label: `food, colony ${'AB'[k]}`, value: v.toFixed(1), color: k ? '#9cc4f5' : '#f3a6cf' })) : [{ label: 'food brought home', value: food[0].toFixed(1) }]);
      hud(ctx, { title: S.title || title, subtitle, right, caption: caption(fr, i) || (SHARES[d[0]] ? SHARES[d[0]][0].toUpperCase() + SHARES[d[0]].slice(1) : ''), progress: time / S.duration, accent: '#b5367a' });
    },
  };

  // ================================================================== two or three episodes of one scene, side by side
  // Each episode is drawn by its own scene into a canvas of its own; a panel shows the part of it that holds the world.
  const compare = {
    init(traces, dpr, opts) {
      const scene = SCENES[traces[0].meta.scene], n = traces.length, o = opts || {}, top = 96, bot = 34, gap = 12, pw = (W - 24 - gap * (n - 1)) / n, ph = H - top - bot;
      const subs = traces.map((tr, k) => {
        const S = scene.init([tr], dpr, o), [cv, cx] = offscreen(W, H, dpr);
        let [x, y, w, h] = S.crop || [0, 0, W, H];
        const capH = 42, sc = Math.min(pw / w, (ph - capH) / h, 1.15), cw = pw / sc, ch = ph / sc;      // the caption sits in the lowest strip of a panel
        x -= (cw - w) / 2; y -= Math.max(0, (ch - h - capH / sc) / 2);
        if (cw <= W) x = clamp(x, 0, W - cw); if (ch <= H) y = clamp(y, 0, H - ch);
        return { S, cv, cx, crop: [x, y, cw, ch], fs: clamp(1 / sc, 1, 1.4), x0: 12 + k * (pw + gap), color: (o.colors && o.colors[k]) || ['#1f5fae', '#b5367a', '#17766b'][k % 3],
          title: (o.titles && o.titles[k]) || DESIGN_NAME[tr.meta.design] || tr.meta.design, sub: o.subs && o.subs[k] };
      });
      return { scene, subs, pw, ph, top, dpr, duration: Math.max(...subs.map(q => q.S.duration)), headline: o.headline || '', subline: o.subline || '' };
    },
    draw(ctx, S, time) {
      ctx.fillStyle = '#f3f0e8'; ctx.fillRect(0, 0, W, H);
      text(ctx, S.headline, W / 2, 22, 19, INK, 700, 'center'); text(ctx, S.subline, W / 2, 45, 12, 'rgba(24,34,45,0.72)', 500, 'center');
      let first = null, hidden = '';
      S.subs.forEach((p) => {
        SINK = {}; FS = p.fs;
        p.cx.setTransform(S.dpr, 0, 0, S.dpr, 0, 0); p.cx.clearRect(0, 0, W, H);
        try { S.scene.draw(p.cx, p.S, Math.min(time, p.S.duration)); } finally { FS = 1; }
        const h = SINK.o || {}; SINK = null; first = first || h;
        text(ctx, p.title, p.x0, 68, 14.5, p.color, 700); if (p.sub) text(ctx, p.sub, p.x0, 85, 11, 'rgba(24,34,45,0.72)', 500);
        const r = h.right && h.right[h.right.length - 1];
        if (r) {
          text(ctx, r.value, p.x0 + S.pw, 71, 23, p.color, 700, 'right'); ctx.font = `700 23px ${FONT}`; const vw = ctx.measureText(r.value).width;
          ctx.font = `700 14.5px ${FONT}`; const tw = ctx.measureText(p.title).width; ctx.font = `500 10.5px ${FONT}`; const lw = ctx.measureText(r.label).width;
          if (tw + lw + vw + 26 <= S.pw) text(ctx, r.label, p.x0 + S.pw - vw - 8, 62, 10.5, 'rgba(24,34,45,0.7)', 500, 'right'); else hidden = r.label;
        }
        ctx.save(); rr(ctx, p.x0, S.top, S.pw, S.ph, 12); ctx.clip();
        ctx.fillStyle = '#d9d4c6'; ctx.fillRect(p.x0, S.top, S.pw, S.ph);
        ctx.drawImage(p.cv, p.crop[0] * S.dpr, p.crop[1] * S.dpr, p.crop[2] * S.dpr, p.crop[3] * S.dpr, p.x0, S.top, S.pw, S.ph);
        if (h.caption) {
          let fsz = 12.5; ctx.font = `600 ${fsz}px ${FONT}`; let cw = ctx.measureText(h.caption).width;
          if (cw > S.pw - 40) { fsz = Math.max(9.5, fsz * (S.pw - 40) / cw); ctx.font = `600 ${fsz}px ${FONT}`; cw = ctx.measureText(h.caption).width; }
          rr(ctx, p.x0 + (S.pw - cw - 24) / 2, S.top + S.ph - 36, cw + 24, 26, 9); ctx.fillStyle = 'rgba(18,28,40,0.78)'; ctx.fill();
          text(ctx, h.caption, p.x0 + S.pw / 2, S.top + S.ph - 22.5, fsz, '#fff', 600, 'center');
        }
        ctx.restore();
        ctx.save(); rr(ctx, p.x0, S.top, S.pw, S.ph, 12); ctx.strokeStyle = 'rgba(24,34,45,0.14)'; ctx.lineWidth = 1; ctx.stroke(); ctx.restore();
      });
      const r0 = first && first.right && first.right[0];
      if (r0) text(ctx, `${r0.label} ${r0.value}` + (hidden ? `   ·   number at the top right of each panel: ${hidden}` : ''), 14, H - 18, 11.5, 'rgba(24,34,45,0.8)', 600);
      ctx.fillStyle = 'rgba(18,28,40,0.22)'; ctx.fillRect(0, H - 6, W, 6); ctx.fillStyle = (first && first.accent) || '#f2b33d'; ctx.fillRect(0, H - 6, W * clamp(time / S.duration, 0, 1), 6);
    },
  };

  const SCENES = { bees, ants, birds, rescue, forage, maze };

  // ------------------------------------------------------------------ player
  class Player {
    constructor(canvas, traces, opts) {
      this.canvas = canvas; this.opts = opts || {};
      this.traces = Array.isArray(traces) ? traces : [traces];
      this.dpr = this.opts.dpr || Math.min(2, global.devicePixelRatio || 1);
      canvas.width = Math.round(W * this.dpr); canvas.height = Math.round(H * this.dpr);
      this.ctx = canvas.getContext('2d');
      const name = this.opts.scene || this.traces[0].meta.scene || (this.traces[0].meta.env === 'rescueenv' ? 'rescue' : 'bees');
      this.scene = SCENES[name]; if (!this.scene) throw new Error('unknown scene ' + name);
      if (this.traces.length > 1 && this.scene.single) this.scene = compare;
      this.state = this.scene.init(this.traces, this.dpr, this.opts);
      if (this.opts.title && !this.state.title) this.state.title = this.opts.title;
      this.duration = this.state.duration; this.time = 0; this.playing = false; this.speed = this.opts.speed || 1;
      this.loop = this.opts.loop !== false; this.onframe = null; this.render(0);
    }
    render(t) {
      this.time = clamp(t, 0, this.duration);
      const c = this.ctx; c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); c.clearRect(0, 0, W, H);
      this.scene.draw(c, this.state, this.time);
      if (this.onframe) this.onframe(this.time, this.duration);
    }
    play() {
      if (this.playing) return; this.playing = true; let last = null;
      const step = (now) => {
        if (!this.playing) return;
        if (last != null) { let t = this.time + (now - last) / 1000 * this.speed; if (t >= this.duration) { if (this.loop) t = 0; else { t = this.duration; this.playing = false; } } this.render(t); }
        last = now; global.requestAnimationFrame(step);
      };
      global.requestAnimationFrame(step);
    }
    pause() { this.playing = false; }
    toggle() { if (this.playing) this.pause(); else this.play(); }
    seek(u) { this.render(clamp(u, 0, 1) * this.duration); }
  }

  global.NatureSwarmPlayer = {
    WIDTH: W, HEIGHT: H, Player,
    mount(canvas, traces, opts) { return new Player(canvas, traces, opts); },
    async load(urls) { const one = !Array.isArray(urls); const out = await Promise.all((one ? [urls] : urls).map(u => fetch(u).then(r => r.json()))); return one ? out[0] : out; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
