/* Turns a packed rescue trace (written by scripts/viz/trace_pack.py) back into the full natureswarm.trace/1 form
 * the player reads. A trace that is not packed is returned unchanged. Nothing is approximated: the packed form holds
 * the same numbers as flat lists.
 *
 *   const trace = NatureSwarmTrace.unpack(await (await fetch(url)).json());
 */
(function (global) {
  'use strict';
  function unpack(p) {
    if (!p || !p.packed) return p;
    const meta = Object.assign({}, p.meta), pk = meta.pack; delete meta.pack;
    const st = Object.assign({}, meta.static), fire = Object.assign({}, st.fire);
    const rle = fire.ign_rle, ign = []; delete fire.ign_rle;
    for (let k = 0; k < rle.length; k += 2) for (let n = rle[k + 1]; n > 0; n--) ign.push(rle[k]);
    fire.ign = ign;
    const h = fire.h, rubble = []; let q = 0, on = false;
    st.rubble_rle.forEach((n) => { if (on) for (let c = q; c < q + n; c++) rubble.push([fire.x0 + Math.floor(c / h), fire.y0 + (c % h)]); q += n; on = !on; });
    delete st.rubble_rle; st.rubble = rubble; st.fire = fire; meta.static = st;
    const frames = p.frames.map((g) => {
      const lost = new Set(g.l), agents = [], sites = [], links = [], orders = [];
      for (let i = 0; 2 * i < g.a.length; i++) agents.push({ id: i, x: g.a[2 * i], y: g.a[2 * i + 1], state: lost.has(i) ? 'lost' : 'ok', target: null });
      pk.sites.forEach((s, j) => {
        const c = g.s[j]; if (c < 0) return;
        sites.push({ id: s[0], x: s[1], y: s[2], kind: 'victims', waiting: c % 64, trapped: Math.floor(c / 64) % 64, found: Math.floor(c / 4096) % 2 === 1, state: pk.states[Math.floor(c / 8192)], value: s[3] });
      });
      let a = null;
      g.k.forEach((v) => { if (v < 0) a = -v - 1; else links.push([a, a + v]); });
      for (let k = 0; k < g.o.length; k += 4) orders.push({ agent: g.o[k], to: [g.o[k + 1], g.o[k + 2]], class: pk.classes[g.o[k + 3]] });
      return { t: g.t, agents, sites, fire: [], marks: [], links, orders, score: g.score, events: g.events || [] };
    });
    return { schema: p.schema, meta, frames };
  }
  const api = { unpack };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  global.NatureSwarmTrace = api;
})(typeof window !== 'undefined' ? window : globalThis);
