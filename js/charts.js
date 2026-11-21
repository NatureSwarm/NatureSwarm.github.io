/* NatureSwarm project page: interactive result charts and the small drawings near the top of the page.
   Data: data/results.js (window.NS_RESULTS), the plotted values of the manuscript's figures and the stored results
   behind them, written by scripts/viz/export_results.py; for the chart of finding 08, data/evolution.js
   (window.NS_EVOLUTION). Nothing is computed here except pixel positions, a share shown as a percentage and, for two
   drawings of the "results at a glance" row, the mean of the stored values of several models at each size.
   One small SVG chart component (lines, points, intervals, bands, hover read-out, legend, table view) and the chart
   definitions of the Findings section. Each chart sits in a finding card of index.html: what it plots, a reading note
   and its data table go into the card's closed "Details"; the figure it comes from is a chip. No dependencies. */
(function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';
  var C = { coordinator: '#1f5fae', swarm: '#b5367a', threshold: '#1c9e6b', bee: '#b9770a', grey: '#6f807c', pale: '#b7c4c0',
    ink: '#15302b', text: '#3f5551', muted: '#5e726e', grid: '#e6eeea', axis: '#c9d6d1', surface: '#ffffff' };
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function el(name, attrs, parent) {
    var e = document.createElementNS(NS, name);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function h(name, cls, text, parent) {
    var e = document.createElement(name);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  }
  function num(v, d) {
    if (v === null || v === undefined || isNaN(v)) return '';
    var s = Math.abs(v).toLocaleString('en-US', { minimumFractionDigits: d || 0, maximumFractionDigits: d || 0 });
    return (v < 0 ? '−' : '') + s;
  }
  function signed(v, d) { return (v > 0 ? '+' : '') + num(v, d === undefined ? 1 : d); }

  function markerPath(kind, x, y, r) {
    if (kind === 'diamond') { var q = r * 1.25; return 'M' + x + ',' + (y - q) + 'L' + (x + q) + ',' + y + 'L' + x + ',' + (y + q) + 'L' + (x - q) + ',' + y + 'Z'; }
    if (kind === 'triangle') { var t = r * 1.3; return 'M' + x + ',' + (y - t) + 'L' + (x + t) + ',' + (y + t * 0.82) + 'L' + (x - t) + ',' + (y + t * 0.82) + 'Z'; }
    if (kind === 'down') { var u = r * 1.3; return 'M' + x + ',' + (y + u) + 'L' + (x + u) + ',' + (y - u * 0.82) + 'L' + (x - u) + ',' + (y - u * 0.82) + 'Z'; }
    if (kind === 'square') { var s = r * 0.95; return 'M' + (x - s) + ',' + (y - s) + 'h' + 2 * s + 'v' + 2 * s + 'h' + (-2 * s) + 'Z'; }
    return 'M' + (x - r) + ',' + y + 'a' + r + ',' + r + ' 0 1,0 ' + 2 * r + ',0a' + r + ',' + r + ' 0 1,0 ' + (-2 * r) + ',0Z';
  }
  function keySvg(s) {
    var svg = el('svg', { width: 30, height: 12, viewBox: '0 0 30 12', 'aria-hidden': 'true' });
    if (s.line !== false) el('line', { x1: 1, y1: 6, x2: 29, y2: 6, stroke: s.color, 'stroke-width': s.width || 2.25, 'stroke-dasharray': s.dash || null, 'stroke-linecap': 'round' }, svg);
    if (s.marker) el('path', { d: markerPath(s.marker, 15, 6, 3.6), fill: s.open ? C.surface : s.color, stroke: s.open ? s.color : C.surface, 'stroke-width': s.open ? 1.8 : 1 }, svg);
    return svg;
  }

  /* ------------------------------------------------------------------------------------------- the chart */
  // opts.tableHost: an element that takes the data table (the "Details" of a finding); without it the chart keeps
  // the table in a closed block of its own
  function Chart(host, spec, opts) {
    var self = this;
    this.host = host; this.spec = spec; this.hidden = {}; this.drawn = false; this.cur = -1;
    host.textContent = '';
    this.legend = h('div', 'ct-legend', null, host);
    this.frame = h('div', 'ct-frame', null, host);
    this.frame.tabIndex = 0;
    this.frame.setAttribute('role', 'img');
    this.frame.setAttribute('aria-label', spec.aria || '');
    this.tip = h('div', 'ct-tip', null, this.frame);
    this.tip.hidden = true;
    this.ownTable = !(opts && opts.tableHost);
    this.tableBox = this.ownTable ? h('details', 'ct-data', null, host) : opts.tableHost;
    this.buildLegend();
    this.buildTable();
    this.render(false);
    if (window.ResizeObserver) {
      var w0 = host.clientWidth;
      new ResizeObserver(function () { if (Math.abs(host.clientWidth - w0) > 4) { w0 = host.clientWidth; self.render(false); } }).observe(host);
    }
    this.frame.addEventListener('pointermove', function (e) { self.onMove(e); });
    this.frame.addEventListener('pointerleave', function () { self.clearHover(); });
    this.frame.addEventListener('blur', function () { self.clearHover(); });
    this.frame.addEventListener('keydown', function (e) { self.onKey(e); });
    if (window.IntersectionObserver && !reduce) {
      var io = new IntersectionObserver(function (en) {
        en.forEach(function (x) { if (x.isIntersecting && !self.drawn) { self.drawn = true; self.animate(); io.disconnect(); } });
      }, { threshold: 0.3 });
      io.observe(host);
      // a chart that the observer never reports (a print view, a host that is never 30% in view) is shown all the same
      setTimeout(function () { if (!self.drawn) { self.drawn = true; io.disconnect(); self.render(false); } }, 9000);
    } else { this.drawn = true; }
  }

  Chart.prototype.visible = function () {
    var hid = this.hidden;
    return this.spec.series.filter(function (s) { return !hid[s.id]; });
  };

  Chart.prototype.buildLegend = function () {
    var self = this, spec = this.spec;
    this.legend.textContent = '';
    var items = spec.series.filter(function (s) { return s.name && s.legend !== false; });
    if (spec.legend === false || items.length < 2) { this.legend.hidden = true; return; }
    this.legend.hidden = false;
    items.forEach(function (s) {
      var b = h('button', 'ct-key', null, self.legend);
      b.type = 'button';
      b.setAttribute('aria-pressed', self.hidden[s.id] ? 'false' : 'true');
      b.title = 'Show or hide this series';
      b.appendChild(keySvg(s));
      h('span', null, s.key || s.name, b);
      b.addEventListener('click', function () {
        var left = self.visible().filter(function (t) { return t.name && t.legend !== false; }).length;
        if (!self.hidden[s.id] && left <= 1) return;
        // a key that stands for a group of lines (one per population, say) shows and hides them together
        var off = !self.hidden[s.id];
        spec.series.forEach(function (t) { if (t.id === s.id || (s.group && t.group === s.group)) self.hidden[t.id] = off; });
        b.setAttribute('aria-pressed', off ? 'false' : 'true');
        self.render(false);
      });
      b.addEventListener('pointerenter', function () { self.emphasize(s.group || s.id); });
      b.addEventListener('pointerleave', function () { self.emphasize(null); });
    });
  };

  Chart.prototype.emphasize = function (id) {
    if (!this.svg) return;
    Array.prototype.forEach.call(this.svg.querySelectorAll('[data-series]'), function (g) {
      g.style.opacity = !id || g.getAttribute('data-series') === id ? '' : '0.18';
    });
  };

  Chart.prototype.buildTable = function () {
    var spec = this.spec, box = this.tableBox;
    box.textContent = '';
    if (this.ownTable) h('summary', null, 'Data table', box);
    var wrap = h('div', 'ct-table', null, box), table = h('table', null, null, wrap);
    var series = spec.series.filter(function (s) { return s.name && s.table !== false; });
    var xf = spec.x.fmt || num, yf = spec.y.fmt || function (v) { return num(v, 1); };
    if (spec.hover === 'point') {
      var hr = h('tr', null, null, h('thead', null, null, table));
      [spec.tableSeries || 'Series', spec.x.label, spec.y.label].forEach(function (t) { h('th', null, t, hr); });
      var tb = h('tbody', null, null, table);
      series.forEach(function (s) { s.points.forEach(function (p) {
        var tr = h('tr', null, null, tb);
        h('th', null, s.name + (p[2] && p[2].label ? ', ' + p[2].label : ''), tr); h('td', null, xf(p[0]), tr); h('td', null, yf(p[1]), tr);
      }); });
      return;
    }
    var xs = [];
    series.forEach(function (s) { s.points.forEach(function (p) { if (xs.indexOf(p[0]) < 0) xs.push(p[0]); }); });
    xs.sort(function (a, b) { return a - b; });
    if (spec.tableEvery) xs = xs.filter(function (x, i) { return i % spec.tableEvery === 0 || i === xs.length - 1; });
    var head = h('tr', null, null, h('thead', null, null, table));
    h('th', null, spec.x.label, head);
    series.forEach(function (s) { h('th', null, s.name, head); });
    var body = h('tbody', null, null, table);
    xs.forEach(function (x) {
      var tr = h('tr', null, null, body);
      h('th', null, xf(x), tr);
      series.forEach(function (s) {
        var p = s.points.filter(function (q) { return q[0] === x; })[0];
        h('td', null, p ? yf(p[1]) : '', tr);
      });
    });
  };

  Chart.prototype.render = function (animate) {
    var spec = this.spec, host = this.host, self = this;
    var W = Math.max(280, Math.round(host.clientWidth || 640));
    var small = W < 560;
    var H = spec.height || (small ? 290 : 350);
    var vis = this.visible();
    var labelled = small || spec.labels === false ? [] : vis.filter(function (s) { return s.label; });
    var gutter = labelled.length ? Math.min(210, 22 + Math.max.apply(null, labelled.map(function (s) { return String(s.label).split('\n').reduce(function (a, t) { return Math.max(a, t.length); }, 0); })) * 6.6) : 18;
    var m = { l: 46, r: gutter, t: 30, b: 44 };
    var iw = W - m.l - m.r, ih = H - m.t - m.b;
    var X = spec.x, Y = spec.y;
    var tf = function (ax) { return ax.type === 'log' ? Math.log2 : function (v) { return v; }; };
    var tx = tf(X), ty = tf(Y);
    var sx = function (v) { return m.l + (tx(v) - tx(X.domain[0])) / (tx(X.domain[1]) - tx(X.domain[0])) * iw; };
    var sy = function (v) { return m.t + ih - (ty(v) - ty(Y.domain[0])) / (ty(Y.domain[1]) - ty(Y.domain[0])) * ih; };
    this.sx = sx; this.sy = sy; this.m = m; this.W = W; this.H = H; this.iw = iw; this.ih = ih;
    if (this.svg) this.frame.removeChild(this.svg);
    var svg = this.svg = el('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, 'aria-hidden': 'true' });
    this.frame.insertBefore(svg, this.tip);
    var xf = X.tick || X.fmt || num, yf = Y.tick || function (v) { return num(v); };

    // windows (shaded spans of the x axis) and bands
    (spec.windows || []).forEach(function (w) {
      el('rect', { x: sx(w.x0), y: m.t, width: sx(w.x1) - sx(w.x0), height: ih, fill: '#eef3f1' }, svg);
      var t = el('text', { x: (sx(w.x0) + sx(w.x1)) / 2, y: m.t + 16, 'text-anchor': 'middle', class: 'ct-note' }, svg); t.textContent = w.label;
    });
    // grid and axes
    Y.ticks.forEach(function (v) {
      el('line', { x1: m.l, x2: m.l + iw, y1: sy(v), y2: sy(v), stroke: v === 0 && Y.domain[0] < 0 ? C.axis : C.grid, 'stroke-width': 1 }, svg);
      var t = el('text', { x: m.l - 8, y: sy(v) + 4, 'text-anchor': 'end', class: 'ct-tick' }, svg); t.textContent = yf(v);
    });
    el('line', { x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih, stroke: C.axis, 'stroke-width': 1 }, svg);
    X.ticks.forEach(function (v) {
      el('line', { x1: sx(v), x2: sx(v), y1: m.t + ih, y2: m.t + ih + 5, stroke: C.axis, 'stroke-width': 1 }, svg);
      var t = el('text', { x: sx(v), y: m.t + ih + 19, 'text-anchor': 'middle', class: 'ct-tick' }, svg); t.textContent = xf(v);
    });
    var yl = el('text', { x: 4, y: 14, class: 'ct-axis' }, svg); yl.textContent = Y.label;
    var xl = el('text', { x: m.l + iw, y: H - 6, 'text-anchor': 'end', class: 'ct-axis' }, svg); xl.textContent = X.label;
    (spec.refs || []).forEach(function (r) {
      if (r.diag) el('line', { x1: sx(r.diag[0]), y1: sy(r.diag[0]), x2: sx(r.diag[1]), y2: sy(r.diag[1]), stroke: C.pale, 'stroke-width': 1.25, 'stroke-dasharray': '4 4' }, svg);
      if (r.x !== undefined) el('line', { x1: sx(r.x), x2: sx(r.x), y1: m.t, y2: m.t + ih, stroke: C.axis, 'stroke-width': 1 }, svg);
    });
    (spec.areas || []).forEach(function (a) {
      if (a.series && self.hidden[a.series]) return;
      var d = a.x.map(function (x, i) { return (i ? 'L' : 'M') + sx(x) + ',' + sy(a.hi[i]); }).join('') +
        a.x.slice().reverse().map(function (x, i) { return 'L' + sx(x) + ',' + sy(a.lo[a.x.length - 1 - i]); }).join('') + 'Z';
      el('path', { d: d, fill: a.color, opacity: a.opacity || 0.12, class: 'ct-fade' }, svg);
    });
    (spec.notes || []).forEach(function (n) {
      if (small && n.wide) return;
      var t = el('text', { x: n.px !== undefined ? m.l + n.px * iw : sx(n.x) + (n.dx || 0), y: n.py !== undefined ? m.t + n.py * ih : sy(n.y) + (n.dy || 0), 'text-anchor': n.anchor || 'start', class: 'ct-note' }, svg);
      String(n.text).split('\n').forEach(function (line, i) { var ts = el('tspan', { x: t.getAttribute('x'), dy: i ? 15 : 0 }, t); ts.textContent = line; });
    });
    // faint single observations (for example the episodes behind a mean)
    (spec.dots || []).forEach(function (d) {
      if (d.series && self.hidden[d.series]) return;
      el('circle', { cx: sx(d.x) + (d.jx || 0), cy: sy(d.y), r: 2.6, fill: 'none', stroke: d.color, 'stroke-width': 1.1, opacity: 0.5, class: 'ct-fade' }, svg);
    });
    // intervals
    (spec.errors || []).forEach(function (e) {
      if (e.series && self.hidden[e.series]) return;
      var lo = Math.max(e.lo, Y.domain[0]), hi = Math.min(e.hi, Y.domain[1]);
      el('line', { x1: sx(e.x) + (e.dx || 0), x2: sx(e.x) + (e.dx || 0), y1: sy(lo), y2: sy(hi), stroke: e.color, 'stroke-width': e.width || 1.6, opacity: e.opacity || 0.55, 'stroke-linecap': 'round', class: 'ct-fade' }, svg);
    });
    // series
    var clipId = 'clip' + Math.random().toString(36).slice(2);
    var cp = el('clipPath', { id: clipId }, el('defs', {}, svg));
    this.clipRect = el('rect', { x: m.l - 8, y: 0, width: iw + 16, height: H }, cp);
    this.paths = []; this.marks = [];
    var plot = el('g', { 'clip-path': 'url(#' + clipId + ')' }, svg);
    vis.forEach(function (s) {
      var g = el('g', { 'data-series': s.group || s.id }, plot);
      var pts = s.points.filter(function (p) { return p[1] !== null && p[1] !== undefined; });
      if (s.line !== false && pts.length > 1) {
        var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1); }).join('');
        var path = el('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': s.width || 2.25, 'stroke-linejoin': 'round', 'stroke-linecap': 'round', 'stroke-dasharray': s.dash || null, opacity: s.opacity || null }, g);
        self.paths.push({ path: path, dashed: !!s.dash });
      }
      if (s.marker) pts.forEach(function (p) {
        var o = p[2] || {}, open = o.open !== undefined ? o.open : s.open, px = sx(p[0]) + (o.dx || 0), py = sy(p[1]);
        if (o.ring) self.marks.push(el('circle', { cx: px, cy: py, r: 8.5, fill: 'none', stroke: s.color, 'stroke-width': 1, opacity: 0.8 }, g));
        self.marks.push(el('path', { d: markerPath(s.marker, px, py, s.size || 4.3), fill: open ? C.surface : s.color, stroke: open ? s.color : C.surface, 'stroke-width': open ? 2 : 1.6, opacity: s.opacity || null }, g));
      });
    });
    // direct labels at the line ends, kept apart
    var ends = labelled.map(function (s) { var p = s.points[s.points.length - 1]; return { s: s, y: sy(p[1]), x: sx(p[0]) }; })
      .sort(function (a, b) { return a.y - b.y; });
    var gap = 17;
    ends.forEach(function (e, i) { e.ly = e.y; if (i && e.ly < ends[i - 1].ly + gap * String(ends[i - 1].s.label).split('\n').length) e.ly = ends[i - 1].ly + gap * String(ends[i - 1].s.label).split('\n').length; });
    var over = ends.length ? ends[ends.length - 1].ly - (m.t + ih - 2) : 0;
    if (over > 0) ends.forEach(function (e) { e.ly -= over; });
    this.labels = [];
    ends.forEach(function (e) {
      var g = el('g', { 'data-series': e.s.id, class: 'ct-fade' }, svg);
      if (Math.abs(e.ly - e.y) > 3) el('line', { x1: e.x + 8, y1: e.y, x2: e.x + 16, y2: e.ly, stroke: C.pale, 'stroke-width': 1 }, g);
      var t = el('text', { x: e.x + 19, y: e.ly + 4, class: 'ct-label' }, g);
      String(e.s.label).split('\n').forEach(function (line, i) { var ts = el('tspan', { x: e.x + 19, dy: i ? 14 : 0 }, t); ts.textContent = line; });
      self.labels.push(g);
    });
    // hover layer
    this.hair = el('line', { y1: m.t, y2: m.t + ih, stroke: C.muted, 'stroke-width': 1, 'stroke-dasharray': '3 3', visibility: 'hidden' }, svg);
    this.focus = el('g', {}, svg);
    this.index();
    if (animate && !reduce) this.animate(true);
    else if (!this.drawn && !reduce) this.prepare();
  };

  // positions the pointer can snap to
  Chart.prototype.index = function () {
    var self = this, vis = this.visible();
    this.stops = [];
    if (this.spec.hover === 'point') {
      vis.forEach(function (s) { if (s.hover === false) return; s.points.forEach(function (p) { if (p[1] !== null) self.stops.push({ x: self.sx(p[0]), y: self.sy(p[1]), s: s, p: p }); }); });
      this.stops.sort(function (a, b) { return a.x - b.x || a.y - b.y; });
    } else {
      var xs = [];
      vis.forEach(function (s) { if (s.hover === false) return; s.points.forEach(function (p) { if (xs.indexOf(p[0]) < 0) xs.push(p[0]); }); });
      xs.sort(function (a, b) { return a - b; });
      this.stops = xs.map(function (x) { return { x: self.sx(x), v: x }; });
    }
  };

  Chart.prototype.onMove = function (e) {
    var r = this.svg.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top, best = -1, bd = 1e9;
    if (px < this.m.l - 14 || px > this.m.l + this.iw + 14) { this.clearHover(); return; }
    for (var i = 0; i < this.stops.length; i++) {
      var s = this.stops[i], d = this.spec.hover === 'point' ? Math.hypot(s.x - px, s.y - py) : Math.abs(s.x - px);
      if (d < bd) { bd = d; best = i; }
    }
    if (best < 0 || (this.spec.hover === 'point' && bd > 46)) { this.clearHover(); return; }
    this.show(best);
  };

  Chart.prototype.onKey = function (e) {
    if (!this.stops.length) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      var n = this.stops.length, i = this.cur < 0 ? (e.key === 'ArrowRight' ? 0 : n - 1) : (this.cur + (e.key === 'ArrowRight' ? 1 : n - 1)) % n;
      this.show(i);
    } else if (e.key === 'Escape') { this.clearHover(); }
  };

  Chart.prototype.clearHover = function () {
    this.cur = -1; this.tip.hidden = true;
    if (this.hair) this.hair.setAttribute('visibility', 'hidden');
    if (this.focus) this.focus.textContent = '';
  };

  Chart.prototype.show = function (i) {
    var self = this, spec = this.spec, stop = this.stops[i], tip = this.tip;
    this.cur = i; this.focus.textContent = ''; tip.textContent = '';
    var yf = spec.y.fmt || function (v) { return num(v, 1); }, xf = spec.x.fmt || num;
    var rows = [], title, ax = stop.x, ay;
    if (spec.hover === 'point') {
      var o = stop.p[2] || {};
      el('circle', { cx: stop.x, cy: stop.y, r: 9, fill: 'none', stroke: stop.s.color, 'stroke-width': 2 }, this.focus);
      title = o.title || stop.s.name;
      rows = o.tip || [[spec.x.label, xf(stop.p[0])], [spec.y.label, yf(stop.p[1])]];
      rows = rows.map(function (r) { return { name: r[0], value: r[1] }; });
      ay = stop.y;
    } else {
      this.hair.setAttribute('x1', stop.x); this.hair.setAttribute('x2', stop.x); this.hair.setAttribute('visibility', 'visible');
      title = (spec.x.tip || function (v) { return spec.x.label + ' ' + xf(v); })(stop.v);
      var top = 1e9;
      this.visible().forEach(function (s) {
        if (s.hover === false) return;
        var p = s.points.filter(function (q) { return q[0] === stop.v && q[1] !== null; })[0];
        if (!p) return;
        var py = self.sy(p[1]); top = Math.min(top, py);
        el('circle', { cx: stop.x, cy: py, r: 6.5, fill: C.surface, stroke: s.color, 'stroke-width': 2.4 }, self.focus);
        rows.push({ s: s, name: s.tipName || s.name, value: (p[2] && p[2].value) || yf(p[1]), sort: p[1] });
      });
      rows.sort(function (a, b) { return b.sort - a.sort; });
      ay = top;
    }
    h('div', 'ct-tip-title', title, tip);
    rows.forEach(function (r) {
      var row = h('div', 'ct-tip-row', null, tip);
      if (r.s) row.appendChild(keySvg(r.s));
      h('b', null, r.value, row);
      h('span', null, r.name, row);
    });
    tip.hidden = false;
    var tw = tip.offsetWidth, th = tip.offsetHeight;
    var left = ax + 16; if (left + tw > this.W - 4) left = ax - tw - 16; if (left < 4) left = 4;
    var topPx = Math.max(4, Math.min(this.H - th - 4, (ay || this.m.t) - th / 2));
    tip.style.left = left + 'px'; tip.style.top = topPx + 'px';
  };

  Chart.prototype.prepare = function () {
    this.paths.forEach(function (p) { p.path.style.opacity = 0; });
    this.marks.forEach(function (m) { m.style.opacity = 0; });
    Array.prototype.forEach.call(this.svg.querySelectorAll('.ct-fade'), function (e) { e.style.opacity = 0; });
  };

  Chart.prototype.animate = function (quick) {
    var dur = quick ? 520 : 1100;
    this.paths.forEach(function (p) {
      var path = p.path, target = path.getAttribute('opacity') || 1;
      if (p.dashed) { path.style.opacity = 0; path.style.transition = 'none'; path.getBoundingClientRect(); path.style.transition = 'opacity ' + dur + 'ms ease'; path.style.opacity = target; return; }
      var len = path.getTotalLength();
      path.style.opacity = target; path.style.transition = 'none';
      path.style.strokeDasharray = len + ' ' + len; path.style.strokeDashoffset = len;
      path.getBoundingClientRect();
      path.style.transition = 'stroke-dashoffset ' + dur + 'ms cubic-bezier(.4,.1,.2,1)';
      path.style.strokeDashoffset = 0;
      setTimeout(function () { path.style.strokeDasharray = ''; path.style.strokeDashoffset = ''; }, dur + 60);
    });
    var fades = this.marks.concat(Array.prototype.slice.call(this.svg.querySelectorAll('.ct-fade')));
    fades.forEach(function (m) {
      var target = m.getAttribute('opacity') || 1;
      m.style.opacity = 0; m.style.transition = 'none'; m.getBoundingClientRect();
      m.style.transition = 'opacity 420ms ease ' + Math.round(dur * 0.55) + 'ms'; m.style.opacity = target;
    });
  };

  // sweep the plot open from the left (used by the replay button of the time series)
  Chart.prototype.replay = function (ms) {
    if (reduce) return;
    var r = this.clipRect, full = this.iw + 16, t0 = null, self = this;
    this.labels.forEach(function (g) { g.style.transition = 'none'; g.style.opacity = 0; });
    function step(t) {
      if (!t0) t0 = t;
      var k = Math.min(1, (t - t0) / ms);
      r.setAttribute('width', full * k);
      if (k < 1) requestAnimationFrame(step);
      else self.labels.forEach(function (g) { g.style.transition = 'opacity 300ms ease'; g.style.opacity = 1; });
    }
    r.setAttribute('width', 0); requestAnimationFrame(step);
  };

  Chart.prototype.update = function (spec) {
    this.spec = spec; this.hidden = {}; this.clearHover();
    this.frame.setAttribute('aria-label', spec.aria || '');
    this.buildLegend(); this.buildTable(); this.drawn = true; this.render(true);
  };

  /* ---------------------------------------------------------------------------------- the card around a chart */
  // a chip that opens the figure of the manuscript a chart comes from
  var FIGFILE = [[/^Fig\. ([1-6])/, function (m) { return 'media/paper/fig' + m[1] + '.png'; }],
    [/^Supplementary Fig\. 29/, function () { return 'media/paper/sfig29.png'; }], [/^Supplementary Fig\. 25/, function () { return 'media/ed_fig1.png'; }]];
  function figChip(label, parent) {
    var file = null;
    FIGFILE.forEach(function (f) { var m = f[0].exec(label); if (m && !file) file = f[1](m); });
    var b = h(file ? 'button' : 'span', 'figref', label, parent);
    if (file) { b.type = 'button'; b.setAttribute('data-full', file); b.setAttribute('data-alt', label + ' of the manuscript'); }
    return b;
  }
  /* A chart inside a finding card (index.html: article.fcard). The card shows the controls and the chart. What the
     chart plots, the reading note and the data table go into the card's closed "Details" (.more-data); the figure
     it comes from becomes a chip (.f-src). */
  function card(id, o) {
    var host = document.getElementById(id);
    if (!host) return null;
    host.textContent = '';
    var art = host.closest ? host.closest('.fcard') : null;
    var data = (art && art.querySelector('.more-data')) || h('div', 'more-data', null, host.parentNode);
    var srcBox = (art && art.querySelector('.f-src')) || h('span', 'f-src', null, host.parentNode);
    var ctl = h('div', 'cc-controls', null, host);
    var body = h('div', 'cc-body', null, host);
    data.textContent = '';
    var what = h('p', 'cc-what', null, data);
    var title = h('b', null, o.title, what), sub = h('span', null, o.sub || '', what);
    var note = h('p', 'cc-note', o.note || '', data);
    var table = h('div', 'cc-table', null, data);
    function setSrc(label) { srcBox.textContent = ''; if (label) figChip(label, srcBox); }
    setSrc(o.source || '');
    return { host: host, controls: ctl, body: body, title: title, sub: sub, note: note, table: table, setSrc: setSrc };
  }
  function segmented(parent, label, options, onPick) {
    var box = h('div', 'seg', null, parent);
    box.setAttribute('role', 'tablist'); box.setAttribute('aria-label', label);
    var buttons = options.map(function (opt, i) {
      var b = h('button', null, opt, box);
      b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', i === 0 ? 'true' : 'false');
      b.addEventListener('click', function () {
        buttons.forEach(function (x, j) { x.setAttribute('aria-selected', j === i ? 'true' : 'false'); });
        onPick(i);
      });
      return b;
    });
    return box;
  }

  /* ----------------------------------------------------------------------------------- the charts of the page */
  var SIZE_AXIS = function (sizes, lo, hi) {
    return { type: 'log', domain: [lo, hi], ticks: sizes, label: 'Team size (drones)', fmt: function (v) { return num(v); }, tip: function (v) { return num(v) + ' drones'; } };
  };
  var PCT = function (lo, hi, ticks, label) { return { type: 'linear', domain: [lo, hi], ticks: ticks, label: label || 'Victims rescued (%)', fmt: function (v) { return num(v, 1) + '%'; } }; };
  function zip(xs, ys) { return xs.map(function (x, i) { return [x, ys[i]]; }); }
  function meanAt(rows, i) { return rows.reduce(function (a, r) { return a + r[i]; }, 0) / rows.length; }

  function scalingSpec(m) {
    var argon = m.model === 'Gemini 4 Argon';
    var series = [{ id: 'c', name: 'Coordinator', label: 'Coordinator', color: C.coordinator, marker: 'circle', width: 2.6, points: zip(m.sizes, m.coordinator) }];
    if (m.matched) series.push({ id: 'm', name: 'Matched control', label: 'Matched control', color: C.coordinator, dash: '5 5', marker: 'circle', open: true, width: 1.8, points: zip(m.sizes, m.matched) });
    series.push({ id: 't', name: argon ? 'Response-threshold drones of the three smaller models' : 'Response-threshold drones', label: argon ? 'Response-threshold drones\n(three smaller models)' : 'Response-threshold\ndrones', tipName: 'Response-threshold drones', color: C.threshold, marker: 'triangle', dash: argon ? '5 5' : null, points: zip(m.sizes, m.threshold) });
    series.push({ id: 'n', name: 'NatureSwarm', label: 'NatureSwarm', color: C.swarm, marker: 'diamond', points: zip(m.natureswarm.sizes, m.natureswarm.y) });
    var dots = [];
    m.sizes.forEach(function (n) { (m.episodes[String(n)] || []).forEach(function (v, i) { dots.push({ x: n, y: v, jx: (i - 2.5) * 3.4, color: C.coordinator, series: 'c' }); }); });
    return { aria: 'Victims rescued against team size, ' + m.model, x: SIZE_AXIS([8, 16, 32, 64, 128], 6.6, 150), y: PCT(0, 100, [0, 25, 50, 75, 100]), series: series, dots: dots };
  }

  function build(R) {
    // the figure a part of the data file comes from, as the chip shows it
    var fig = function (key) { return R[key] && R[key].figure ? R[key].figure.split(' and ')[0] : ''; };

    // 01 NatureEnv: the score of each design by mission family, the main study and the test on new seeds
    var c0 = card('chart-natureenv', { title: 'NatureEnv score by mission family', sub: 'Six designs, eight language models; score from 0 to 100.', source: 'Fig. 3a' });
    if (c0 && R.natureenv) {
      var NE = R.natureenv;
      var LOOK = { hierarchy: [C.coordinator, 'circle', false, 6.2], 'roost-v3': [C.swarm, 'diamond', false, 5.4], bee: [C.bee, 'triangle', false, 5.2], ant: [C.grey, 'square', false, 5], broadcast: [C.grey, 'down', true, 4.6],
        solitary: [C.grey, 'circle', true, 4.6], flock: [C.grey, 'diamond', true, 4.4], board: [C.grey, 'square', true, 4.6] };
      var SHORT = { nest: 'Nest', forage: 'Forag.', compete: 'Comp.', migrate: 'Migr.', all: 'All', '24 standard missions': 'All', 'nest-k7-liars': 'Liars', 'trail-block-early': 'Block' };
      var neSpec = function (part) {
        var rows = part.rows, name = function (v, short) { var r = rows[v - 1]; return !r ? '' : (short ? SHORT[r.key] || r.name : r.name); };
        return { aria: 'NatureEnv score of each design by mission family', labels: false,
          x: { type: 'linear', domain: [0.5, rows.length + 0.5], ticks: rows.map(function (r, i) { return i + 1; }), label: 'Mission family',
            tick: function (v) { return name(v, c0.body.clientWidth < (rows.length > 5 ? 900 : 540)); }, fmt: function (v) { return name(v, false); }, tip: function (v) { return name(v, false); } },
          y: { type: 'linear', domain: [25, 100], ticks: [25, 50, 75, 100], label: 'Score (0 to 100)', fmt: function (v) { return num(v, 1); } },
          refs: rows.length > 5 ? [{ x: 5.5 }] : [],
          // the designs of one family stand side by side, so that close scores do not hide each other
          series: part.designs.map(function (d, j) { var k = LOOK[d] || [C.grey, 'circle', true, 4], dx = (j - (part.designs.length - 1) / 2) * (c0.body.clientWidth < 540 ? 6 : 11);
            return { id: d, name: NE.names[d] || d, color: k[0], line: false, marker: k[1], open: k[2], size: k[3], points: rows.map(function (r, i) { return [i + 1, r.scores[d], { dx: dx }]; }) }; }) };
      };
      var allOf = function (part) { return part.rows.filter(function (r) { return r.key === 'all' || r.key === '24 standard missions'; })[0].scores; };
      var views0 = [
        { part: NE.main, title: 'NatureEnv score by mission family', sub: 'Six designs, eight language models; score from 0 to 100.',
          note: 'All 24 missions: the coordinator scored ' + num(allOf(NE.main).hierarchy, 1) + ' and the runner-up, the bee design, ' + num(allOf(NE.main).bee, 1) + '.' },
        { part: NE.held_out, title: 'NatureEnv score on new seeds', sub: 'Two models not used in development; at the right, two missions with a disruption.',
          note: 'All 24 missions: NatureSwarm, whole-network relay, scored ' + num(allOf(NE.held_out)['roost-v3'], 1) + ' and the coordinator ' + num(allOf(NE.held_out).hierarchy, 1) + '. With lying scouts the coordinator scored ' + num(NE.held_out.rows.filter(function (r) { return r.key === 'nest-k7-liars'; })[0].scores.hierarchy, 1) + '.' }
      ];
      var ch0 = new Chart(c0.body, neSpec(views0[0].part), { tableHost: c0.table });
      c0.note.textContent = views0[0].note;
      segmented(c0.controls, 'View', ['Main study', 'New seeds'], function (i) {
        var v = views0[i]; ch0.update(neSpec(v.part)); c0.title.textContent = v.title; c0.sub.textContent = v.sub; c0.note.textContent = v.note;
        c0.setSrc(v.part.figure);
      });
    }

    // 02 scaling, one tab per model
    var c1 = card('chart-scaling', { title: 'Victims rescued against team size', sub: 'Drone search and rescue; open dots, the coordinator’s six episodes at each size.', source: fig('scaling') });
    if (c1) {
      var models = R.scaling.models, start = 2;
      var noteOf = function (m) { return 'Coordinator minus response-threshold drones at 128 drones: ' + signed(m.gap128) + ' points (' + m.note + ').' + (m.model === 'Gemini 4 Argon' ? ' Argon’s coordinator is compared with the drones of the three smaller models; its own NatureSwarm ran from 32 drones.' : ''); };
      var ch1 = new Chart(c1.body, scalingSpec(models[start]), { tableHost: c1.table });
      c1.note.textContent = noteOf(models[start]);
      var seg = segmented(c1.controls, 'Language model', models.map(function (m) { return m.model; }), function (i) { ch1.update(scalingSpec(models[i])); c1.note.textContent = noteOf(models[i]); });
      seg.children[0].setAttribute('aria-selected', 'false'); seg.children[start].setAttribute('aria-selected', 'true');
    }

    // 03 prompt length: the padding test and the prompt length by design
    var c2 = card('chart-prompt', { title: 'Victims rescued against prompt length', sub: 'Mean of the three smaller models.', source: fig('padding') });
    if (c2) {
      var P = R.padding, T = R.tokens;
      var kf = function (v) { return v >= 1000 ? num(v / 1000, v % 1000 ? 1 : 0) + 'k' : num(v); };
      var padSpec = function () {
        var tipOf = function (what, i, s) { return { title: what, tip: [['prompt tokens per call', num(s.tokens[i])], ['victims rescued', num(s.rescued[i], 1) + '%']] }; };
        return { aria: 'Victims rescued against the prompt tokens per call of the coordinator', hover: 'point', tableSeries: 'Team',
          x: { type: 'log', domain: [800, 17500], ticks: [1000, 2000, 4000, 8000, 16000], label: 'Prompt tokens per call of the coordinator', fmt: kf },
          y: PCT(0, 100, [0, 25, 50, 75, 100]),
          series: [
            { id: 'u', name: '8 drones, prompt padded with unrelated text', label: '8 drones, padded with\nunrelated text', color: C.grey, dash: '5 5', marker: 'down', open: true, width: 1.8, points: P.unrelated.tokens.map(function (t, i) { return [t, P.unrelated.rescued[i], tipOf(i ? '8 drones, padded with unrelated text' : '8 drones, no padding', i, P.unrelated)]; }) },
            { id: 'f', name: '8 drones, prompt padded with foreign reports', label: '8 drones, padded with\nforeign reports', color: C.grey, marker: 'down', width: 1.8, points: P.foreign.tokens.map(function (t, i) { return [t, P.foreign.rescued[i], tipOf(i ? '8 drones, padded with foreign reports' : '8 drones, no padding', i, P.foreign)]; }) },
            { id: 'r', name: 'Real teams of 8 to 128 drones', label: 'Real teams of\n8 to 128 drones', color: C.coordinator, marker: 'circle', width: 2.6, points: P.real.tokens.map(function (t, i) { return [t, P.real.rescued[i], Object.assign(tipOf('Real team of ' + P.sizes[i] + ' drones', i, P.real), { label: P.sizes[i] + ' drones' })]; }) }
          ] };
      };
      var tokSpec = function () {
        return { aria: 'Prompt tokens per call against team size for four designs',
          x: SIZE_AXIS(T.sizes, 6.6, 150), y: { type: 'linear', domain: [0, 15000], ticks: [0, 5000, 10000, 15000], label: 'Prompt tokens per call', tick: kf, fmt: function (v) { return num(v); } },
          series: [
            { id: 'c', name: 'Coordinator', label: 'Coordinator', color: C.coordinator, marker: 'circle', width: 2.6, points: zip(T.sizes, T.coordinator) },
            { id: 'w', name: 'NatureSwarm, whole-network relay', label: 'NatureSwarm,\nwhole-network relay', color: C.swarm, dash: '5 5', marker: 'diamond', open: true, width: 1.8, points: zip(T.sizes, T.teamwide) },
            { id: 'n', name: 'NatureSwarm', label: 'NatureSwarm', color: C.swarm, marker: 'diamond', points: zip(T.sizes, T.natureswarm) },
            { id: 't', name: 'Response-threshold drones', label: 'Response-threshold drones', color: C.threshold, marker: 'triangle', points: zip(T.sizes, T.threshold) }
          ] };
      };
      var views2 = [
        { spec: padSpec, title: 'Victims rescued against prompt length', src: fig('padding'), note: 'At about 13,800 prompt tokens, the padded eight-drone coordinator rescued ' + num(P.foreign.rescued[3], 1) + '% and the real team of 128 drones ' + num(P.real.rescued[4], 1) + '%.' },
        { spec: tokSpec, title: 'Prompt tokens per call against team size', src: fig('tokens'), note: 'With 128 drones a call of the coordinator held ' + num(T.coordinator[4]) + ' prompt tokens and a call of a response-threshold drone ' + num(T.threshold[4]) + '. ' + fig('tokens') + ' shows the coordinator and the response-threshold drones; the NatureSwarm lines are stored values of the same study.' }
      ];
      var ch2 = new Chart(c2.body, views2[0].spec(), { tableHost: c2.table });
      c2.note.textContent = views2[0].note;
      segmented(c2.controls, 'View', ['Padding test', 'Prompt length'], function (i) {
        ch2.update(views2[i].spec()); c2.title.textContent = views2[i].title; c2.note.textContent = views2[i].note; c2.setSrc(views2[i].src);
      });
    }

    // 04 128 to 1,024 drones: victims rescued and the list price of an episode
    var F = R.frontier;
    var c4 = card('chart-frontier', { title: 'Victims rescued, 128 to 1,024 drones', sub: 'Mean of both worlds; the axis starts at 60%.', source: fig('frontier') });
    if (c4 && F) {
      var fs = function (yOf) {
        var defs = [['coordinator', 'Coordinator, Gemini 4 Argon', C.coordinator, 'circle', 'Coordinator (Argon)'], ['natureswarm', 'NatureSwarm, Gemini 2.5 Flash-Lite', C.swarm, 'diamond', 'NatureSwarm (2.5 Flash-Lite)'],
          ['threshold', 'Response-threshold drones, Gemini 2.5 Flash-Lite', C.threshold, 'triangle', 'Response-threshold drones (2.5 Flash-Lite)']];
        return defs.map(function (d) { return { id: d[0], name: d[1], key: d[4], color: d[2], marker: d[3], width: d[0] === 'coordinator' ? 2.6 : 2.25, points: yOf(F[d[0]]) }; });
      };
      var views4 = [
        { title: 'Victims rescued, 128 to 1,024 drones', sub: 'Mean of both worlds; the axis starts at 60%.', note: 'Gemini 4 Argon ran the coordinator, Gemini 2.5 Flash-Lite the drones.',
          spec: function () { return { aria: 'Victims rescued with 128 to 1,024 drones', labels: false, x: SIZE_AXIS(F.sizes, 105, 1250), y: PCT(60, 100, [60, 70, 80, 90, 100]), series: fs(function (d) { return zip(F.sizes, d.rescued); }) }; } },
        { title: 'List price of an episode', sub: 'US$, mean of both worlds.', note: 'Gemini 4 Argon ran the coordinator, Gemini 2.5 Flash-Lite the drones. The response-threshold drones were priced from 256 drones.',
          spec: function () { return { aria: 'List price of an episode with 128 to 1,024 drones', labels: false, x: SIZE_AXIS(F.sizes, 105, 1250),
            y: { type: 'linear', domain: [0, 8], ticks: [0, 2, 4, 6, 8], label: 'US$ per episode', fmt: function (v) { return 'US$' + num(v, 2); } },
            series: fs(function (d) { return F.sizes.filter(function (n) { return d.price[String(n)] !== undefined; }).map(function (n) { return [n, d.price[String(n)]]; }); }) }; } }
      ];
      var ch4 = new Chart(c4.body, views4[0].spec(), { tableHost: c4.table });
      c4.note.textContent = views4[0].note;
      segmented(c4.controls, 'View', ['Victims rescued', 'List price'], function (i) { var v = views4[i]; ch4.update(v.spec()); c4.title.textContent = v.title; c4.sub.textContent = v.sub; c4.note.textContent = v.note; });
    }

    // 05 PandemicEnv: infections averted by number of counties, the registered confirmation
    var cP = card('chart-pandemic', { title: 'Infections of the variant averted', sub: 'Counties around Dallas, three seeds; against no action on the same seed.', source: fig('pandemic') });
    if (cP && R.pandemic) {
      var PD = R.pandemic, pm = 0, pall = 0;
      var pdSpec = function () {
        var m = PD.models[pm], sfx = pall ? '_all' : '';
        return { aria: 'Infections averted against the number of counties, ' + m.model,
          x: { type: 'log', domain: [12.5, 1330], ticks: PD.sizes, label: 'Counties', fmt: function (v) { return num(v); }, tip: function (v) { return num(v) + ' counties'; } },
          y: PCT(0, 100, [0, 25, 50, 75, 100], pall ? 'All infections averted (%)' : 'Infections of the variant averted (%)'),
          series: [
            { id: 'd', name: 'Detection program, no language model', label: 'Detection program', tipName: 'Detection program', color: C.grey, dash: '5 5', marker: 'down', open: true, width: 1.8, points: zip(PD.sizes, PD['detection' + sfx]) },
            { id: 'c', name: 'State coordinator', label: 'State coordinator', color: C.coordinator, marker: 'circle', width: 2.6, points: zip(PD.sizes, m['coordinator' + sfx]) },
            { id: 'n', name: 'NatureSwarm', label: 'NatureSwarm', color: C.swarm, marker: 'diamond', width: 2.6, points: zip(PD.sizes, m['natureswarm' + sfx]) }
          ] };
      };
      var ci = function (t) { return ' (CI ' + num(Math.min(Math.abs(t.lo), Math.abs(t.hi)), 1) + ' to ' + num(Math.max(Math.abs(t.lo), Math.abs(t.hi)), 1) + ')'; };
      var pdNote = function () {
        var a = PD.natureswarm_minus_coordinator, b = PD.natureswarm_minus_coordinator_all;
        return pall ? 'The secondary outcome. On all infections NatureSwarm averted ' + num(Math.abs(b.mean), 1) + ' points ' + (b.mean < 0 ? 'less' : 'more') + ' than the state coordinators' + ci(b) + '.'
          : 'The primary outcome. Over both models and all sizes NatureSwarm averted ' + num(a.mean, 1) + ' points more than the state coordinators' + ci(a) + '.';
      };
      var chP = new Chart(cP.body, pdSpec(), { tableHost: cP.table });
      var pdRedraw = function () { chP.update(pdSpec()); cP.title.textContent = pall ? 'All infections averted' : 'Infections of the variant averted'; cP.note.textContent = pdNote(); };
      cP.note.textContent = pdNote();
      segmented(cP.controls, 'Language model', PD.models.map(function (m) { return m.model; }), function (i) { pm = i; pdRedraw(); });
      segmented(cP.controls, 'Outcome', ['The variant', 'All infections'], function (i) { pall = i; pdRedraw(); });
    }

    // 06 slow calls and a silent base
    var c5 = card('chart-robust', { title: 'Victims rescued in simulated real time', sub: 'Model calls take time; dotted, the span law’s prediction with its 95% interval.', source: fig('realtime') });
    if (c5) {
      var RT = R.realtime, SB = R.silent;
      var rtSpec = function (p) {
        var s = RT.sizes;
        return { aria: 'Victims rescued in simulated real time against team size, ' + p.name, x: SIZE_AXIS(s, 12.5, 330), y: PCT(0, 100, [0, 25, 50, 75, 100]),
          areas: [{ x: s, lo: p.band.lo, hi: p.band.hi, color: C.coordinator, opacity: 0.09, series: 'pred' }],
          errors: s.map(function (n, i) { return { x: n, lo: p.interval[i][0], hi: p.interval[i][1], color: C.coordinator, series: 'obs' }; })
            .concat(p.argon_natureswarm.map(function (a) { return { x: a.n, dx: 9, lo: a.iv[0], hi: a.iv[1], color: C.swarm, series: 'own' }; })),
          series: [
            { id: 'pred', name: 'Predicted by the span law', key: 'Span law’s prediction', color: C.coordinator, dash: '2 5', width: 1.8, points: zip(s, p.predicted) },
            { id: 't', name: 'Response-threshold drones, Gemini 2.5 Flash-Lite', key: 'Response-threshold drones (2.5 Flash-Lite)', label: 'Response-threshold drones', tipName: 'Response-threshold drones', color: C.threshold, marker: 'triangle', points: zip(s, p.threshold) },
            { id: 'n', name: 'NatureSwarm, Gemini 2.5 Flash-Lite', key: 'NatureSwarm (2.5 Flash-Lite)', label: 'NatureSwarm', tipName: 'NatureSwarm, Gemini 2.5 Flash-Lite', color: C.swarm, marker: 'diamond', points: zip(s, p.natureswarm) },
            { id: 'own', name: 'NatureSwarm, Gemini 4 Argon (32 and 64 drones)', key: 'NatureSwarm (Argon)', tipName: 'NatureSwarm, Gemini 4 Argon', color: C.swarm, line: false, marker: 'diamond', open: true, points: p.argon_natureswarm.map(function (a) { return [a.n, a.y, { dx: 9 }]; }) },
            { id: 'obs', name: p.name, label: p.name, color: C.coordinator, marker: 'circle', width: 2.6, points: zip(s, p.observed) }
          ] };
      };
      var sbSpec = function () {
        var st = SB.steps, mk = function (id, name, key, col, extra) { return Object.assign({ id: id, name: name, label: name, color: col, points: zip(st, SB[key]) }, extra || {}); };
        return { aria: 'Victims rescued by each time step while the base was silent', tableEvery: 5,
          x: { type: 'linear', domain: [0, 59], ticks: [0, 15, 30, 45, 59], label: 'Time steps', tip: function (v) { return 'Time step ' + v; } }, y: PCT(0, 100, [0, 25, 50, 75, 100]),
          windows: [{ x0: SB.window[0] - 0.5, x1: SB.window[1] + 0.5, label: 'base silent' }],
          series: [
            mk('w', 'Coordinator, working base', 'working', C.coordinator, { dash: '2 5', width: 1.6, label: null }),
            mk('b', 'Bee', 'bee', C.bee), mk('t', 'Response-threshold drones', 'threshold', C.threshold),
            mk('c', 'Coordinator', 'coordinator', C.coordinator, { width: 2.6 }), mk('n', 'NatureSwarm, whole-network relay', 'teamwide', C.swarm, { width: 2.6, label: 'NatureSwarm,\nwhole-network relay' })
          ] };
      };
      var views5 = [
        { spec: function () { return rtSpec(RT.panels[0]); }, title: 'Victims rescued in simulated real time', sub: 'Model calls take time; dotted, the span law’s prediction with its 95% interval.', src: fig('realtime'), note: 'With 256 drones Argon’s coordinator rescued ' + num(RT.panels[0].observed[4], 1) + '%; the law predicted ' + num(RT.panels[0].predicted[4], 1) + '%. Open diamonds at 32 and 64 drones: NatureSwarm run by Argon itself.' },
        { spec: function () { return rtSpec(RT.panels[1]); }, title: 'Victims rescued in simulated real time', sub: 'Two-level coordinator; dotted, the span law’s prediction with its 95% interval.', src: fig('realtime'), note: 'A two-level coordinator: one coordinator per district reports to a top coordinator. With 256 drones it rescued ' + num(RT.panels[1].observed[4], 1) + '%.' },
        { spec: sbSpec, title: 'Victims rescued while the base was silent', sub: 'Time steps 15 to 44 without the base; two models, 20 episodes per design.', src: fig('silent'), note: 'After 60 time steps: NatureSwarm, whole-network relay, ' + num(SB.teamwide[59], 1) + '%; coordinator ' + num(SB.coordinator[59], 1) + '%; coordinator with a working base ' + num(SB.working[59], 1) + '%.' }
      ];
      var ch5 = new Chart(c5.body, views5[0].spec(), { tableHost: c5.table });
      c5.note.textContent = views5[0].note;
      var replay = h('button', 'cc-replay', 'Replay', c5.controls);
      replay.type = 'button'; replay.hidden = true;
      replay.addEventListener('click', function () { ch5.replay(2600); });
      var seg5 = segmented(c5.controls, 'View', ['Real time', 'Real time, two-level', 'Silent base'], function (i) {
        var v = views5[i];
        ch5.update(v.spec()); c5.title.textContent = v.title; c5.sub.textContent = v.sub; c5.note.textContent = v.note;
        c5.setSrc(v.src); replay.hidden = i !== 2;
        if (i === 2) ch5.replay(2600);
      });
      c5.controls.insertBefore(seg5, replay);
    }

    // 07 the span-of-control law: predicted against observed for the larger teams (the line of each model is in the lab)
    var c3 = card('chart-law', { title: 'Predicted against observed advantage of the coordinator', sub: '', source: 'Fig. 4f' });
    if (c3) {
      var L = R.law, pick = Math.max(0, L.models.map(function (m) { return m.model; }).indexOf('Gemini 3.1 Flash-Lite'));
      var paritySpec = function () {
        var series = [], errors = [];
        L.models.forEach(function (m, k) {
          var on = k === pick, pts = m.points.filter(function (p) { return !p.fitted; });
          if (!pts.length) return;
          series.push({ id: 'p' + k, name: m.model, color: on ? C.coordinator : C.grey, opacity: on ? 1 : 0.6, line: false, marker: 'circle', size: on ? 4.8 : 3.8,
            points: pts.map(function (p) {
              return [p.predicted, p.observed, { open: !p.inside, ring: on && p.late, title: m.model + ', ' + num(p.n) + ' drones', label: num(p.n) + ' drones',
                tip: [['predicted', signed(p.predicted) + ' points'], ['observed', signed(p.observed) + ' points'], ['95% prediction interval', signed(p.predicted - p.half) + ' to ' + signed(p.predicted + p.half)], ['', p.inside ? 'inside the interval' : 'outside the interval']] }];
            }) });
          pts.forEach(function (p) { errors.push({ x: p.predicted, lo: p.predicted - p.half, hi: p.predicted + p.half, color: on ? C.coordinator : C.grey, width: on ? 2.2 : 1.4, opacity: on ? 0.5 : 0.3 }); });
        });
        series.sort(function (a, b) { return (a.color === C.coordinator) - (b.color === C.coordinator); });
        var ax = function (label) { return { type: 'linear', domain: [-70, 20], ticks: [-60, -40, -20, 0, 20], label: label, fmt: function (v) { return signed(v); }, tick: function (v) { return num(v); } }; };
        return { aria: 'Predicted against observed coordinator advantage for ' + L.predicted_teams + ' larger teams', hover: 'point', legend: false, tableSeries: 'Model',
          x: ax('Predicted advantage (points)'), y: ax('Observed advantage (points)'), refs: [{ diag: [-70, 20] }],
          notes: [{ px: 0.03, py: 0.08, text: 'on the line: predicted exactly' }], series: series, errors: errors };
      };
      c3.sub.textContent = L.predicted_teams + ' larger teams; bars, 95% prediction intervals; open markers lie outside them.';
      var ch3 = new Chart(c3.body, paritySpec(), { tableHost: c3.table });
      var chips = h('div', 'chips', null, c3.controls);
      chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Model');
      var cb = L.models.map(function (m, k) {
        var b = h('button', null, m.model, chips);
        b.type = 'button'; b.setAttribute('aria-pressed', k === pick ? 'true' : 'false');
        b.addEventListener('click', function () { pick = k; cb.forEach(function (x, j) { x.setAttribute('aria-pressed', j === k ? 'true' : 'false'); }); ch3.update(paritySpec()); });
        return b;
      });
      c3.note.textContent = 'A ring marks a team that was run after the law was written. Argon’s points reach 1,024 drones.';
    }

    // 08 evolution: the share of each population that keeps a coordinator, by generation (data/evolution.js)
    var EV = window.NS_EVOLUTION;
    var c8 = card('chart-evolution', { title: 'Organizations with a coordinator, by generation', sub: 'Ten organizations per population, one line per population; every population starts with five coordinators.', source: 'Fig. 5c' });
    if (c8 && EV && EV.lines && EV.lines.length) {
      var frontier = function (l) { return l.model === 'Gemini 4 Argon'; };
      var house = function (t) { return String(t).replace(/neighbour-only relay/g, 'neighbour relay').replace(/team-wide relay/g, 'whole-network relay'); };
      var nSmall = EV.lines.filter(function (l) { return !frontier(l); }).length, nBig = EV.lines.length - nSmall, seen = {};
      var evSeries = EV.lines.map(function (l, k) {
        var big = frontier(l), grp = big ? 'f' : 's', first = !seen[grp]; seen[grp] = true;
        var title = l.model + ', ' + l.setting + ', population ' + (l.line + 1);
        return { id: 'e' + k, group: grp, name: title, key: big ? nBig + ' populations run by Gemini 4 Argon' : nSmall + ' populations run by smaller models', legend: first,
          color: big ? C.ink : C.coordinator, opacity: big ? 1 : 0.6, width: big ? 2.8 : 1.9, marker: big ? 'square' : 'circle', size: big ? 4 : 3.2,
          points: l.share.coordinator.map(function (v, g) { return [g, 100 * v, { title: title, tip: [['generation', String(g)], ['with a coordinator', num(100 * v) + '%'], ['winner', house(l.winner && l.winner.label ? l.winner.label : l.winner)]] }]; }) };
      });
      // the frontier model's lines are drawn last, on top
      evSeries.sort(function (a, b) { return (a.group === 'f') - (b.group === 'f'); });
      var gens = EV.lines[0].share.coordinator.length;
      new Chart(c8.body, { aria: 'Share of organizations with a coordinator in each generation, for ' + EV.lines.length + ' evolving populations', hover: 'point', labels: false, tableSeries: 'Population',
        x: { type: 'linear', domain: [-0.25, gens - 0.75], ticks: EV.lines[0].share.coordinator.map(function (v, g) { return g; }), label: 'Generation', fmt: function (v) { return num(v); } },
        y: { type: 'linear', domain: [0, 100], ticks: [0, 25, 50, 75, 100], label: 'Organizations with a coordinator (%)', fmt: function (v) { return num(v) + '%'; } },
        series: evSeries }, { tableHost: c8.table });
      c8.note.textContent = 'Smaller models: Gemini 2.5 Flash-Lite and Gemini 3.1 Flash-Lite, with 8, 16 or 64 drones. Gemini 4 Argon ran with 16 drones (Supplementary Fig. 25c). Point at a line for its population and winner.';
    }
  }

  /* ------------------------------------------------------------------- small drawings near the top of the page */
  // A drawing without text for a tile of the "results at a glance" row: lines over team sizes, or two bars.
  function spark(host, o) {
    var W = 240, H = 92, l = 9, r = 231, t = 10, b = 78;
    host.textContent = '';
    var svg = el('svg', { viewBox: '0 0 ' + W + ' ' + H, focusable: 'false' }, host);
    if (o.bars) {
      o.bars.forEach(function (bar, i) {
        el('rect', { x: l, y: 16 + i * 34, width: r - l, height: 24, rx: 7, fill: '#eef3f0' }, svg);
        el('rect', { x: l, y: 16 + i * 34, width: Math.max(6, (r - l) * bar.v / o.max), height: 24, rx: 7, fill: bar.color }, svg);
      });
      return;
    }
    el('line', { x1: l, x2: r, y1: H - 6, y2: H - 6, stroke: C.axis, 'stroke-width': 1 }, svg);
    for (var k = 0; k < o.n; k++) el('line', { x1: l + (r - l) * k / (o.n - 1), x2: l + (r - l) * k / (o.n - 1), y1: H - 6, y2: H - 2, stroke: C.axis, 'stroke-width': 1 }, svg);
    var sx = function (i) { return l + (r - l) * i / (o.n - 1); }, sy = function (v) { return b - (b - t) * (v - o.lo) / (o.hi - o.lo); };
    if (o.gap) {      // the area between two lines that cover the same sizes, in the colour of the second
      var A = o.lines[o.gap[0]].pts, B = o.lines[o.gap[1]].pts;
      el('path', { d: A.map(function (p, i) { return (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1); }).join('') +
        B.slice().reverse().map(function (p) { return 'L' + sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1); }).join('') + 'Z', fill: o.lines[o.gap[1]].color, opacity: 0.1 }, svg);
    }
    o.lines.forEach(function (s) {
      var d = s.pts.map(function (p, i) { return (i ? 'L' : 'M') + sx(p[0]).toFixed(1) + ',' + sy(p[1]).toFixed(1); }).join('');
      el('path', { d: d, fill: 'none', stroke: s.color, 'stroke-width': 3.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, svg);
      (s.dots ? s.pts : [s.pts[s.pts.length - 1]]).forEach(function (p) { el('circle', { cx: sx(p[0]), cy: sy(p[1]), r: 5, fill: s.color, stroke: '#fff', 'stroke-width': 2.2 }, svg); });
    });
  }
  function glance(R) {
    var hosts = {};
    Array.prototype.forEach.call(document.querySelectorAll('.g-viz[data-g]'), function (e) { hosts[e.getAttribute('data-g')] = e; });
    var idx = function (ys) { return ys.map(function (y, i) { return [i, y]; }); };
    // victims rescued against team size, mean of the three smaller models (Fig. 3e,f)
    if (hosts.scale && R.padding && R.scaling) {
      var small = R.scaling.models.filter(function (m) { return m.model !== 'Gemini 4 Argon'; });
      spark(hosts.scale, { n: R.padding.sizes.length, lo: 0, hi: 100, gap: [1, 0], lines: [
        { color: C.threshold, pts: idx(R.padding.sizes.map(function (n, i) { return meanAt(small.map(function (m) { return m.threshold; }), i); })) },
        { color: C.coordinator, pts: idx(R.padding.real.rescued) }] });
    }
    // real time: Argon's coordinator at every size, NatureSwarm run by Argon at the two sizes it ran (Fig. 6d)
    if (hosts.time && R.realtime) {
      var p = R.realtime.panels[0], s = R.realtime.sizes;
      spark(hosts.time, { n: s.length, lo: 0, hi: 100, lines: [
        { color: C.coordinator, pts: idx(p.observed) },
        { color: C.swarm, dots: true, pts: p.argon_natureswarm.map(function (a) { return [s.indexOf(a.n), a.y]; }) }] });
    }
    // list price of an episode with 1,024 drones (Fig. 2f)
    if (hosts.cost && R.frontier) {
      var F = R.frontier, last = String(F.sizes[F.sizes.length - 1]);
      spark(hosts.cost, { max: F.coordinator.price[last], bars: [{ v: F.natureswarm.price[last], color: C.swarm }, { v: F.coordinator.price[last], color: C.coordinator }] });
    }
    // PandemicEnv: the variant's infections averted against the number of counties, mean of both models
    if (hosts.epidemic && R.pandemic) {
      var PD = R.pandemic;
      spark(hosts.epidemic, { n: PD.sizes.length, lo: 0, hi: 100, gap: [0, 1], lines: [
        { color: C.coordinator, pts: idx(PD.sizes.map(function (n, i) { return meanAt(PD.models.map(function (m) { return m.coordinator; }), i); })) },
        { color: C.swarm, pts: idx(PD.sizes.map(function (n, i) { return meanAt(PD.models.map(function (m) { return m.natureswarm; }), i); })) }] });
    }
  }
  // The question: what one call has to read as the team grows (prompt tokens per call, Fig. 3d)
  function loadPic(R) {
    var host = document.getElementById('loadpic'), T = R.tokens;
    if (!host || !T) return;
    host.textContent = '';
    h('figcaption', null, 'Prompt tokens in one call', host);
    var max = Math.max.apply(null, T.coordinator), rows = h('div', 'lp-rows', null, host);
    [8, 32, 128].forEach(function (n) {
      var k = T.sizes.indexOf(n); if (k < 0) return;
      var row = h('div', 'lp-row', null, rows);
      h('span', 'lp-n', num(n) + ' drones', row);
      var bars = h('div', 'lp-bars', null, row);
      [['co', T.coordinator[k]], ['rt', T.threshold[k]]].forEach(function (d) {
        var line = h('div', 'lp-bar ' + d[0], null, bars), bar = h('i', null, null, line);
        bar.style.width = (76 * d[1] / max).toFixed(1) + '%';
        h('b', null, num(d[1]), line);
      });
    });
    var key = h('p', 'lp-key', null, host);
    h('span', 'co', 'coordinator', key); h('span', 'rt', 'one response-threshold drone', key);
    figChip(T.figure, key);
  }

  function start() { var R = window.NS_RESULTS; if (!R) return; glance(R); loadPic(R); build(R); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
