/* NatureSwarm project page: interactive result charts.
   Data: data/results.js (window.NS_RESULTS), the plotted values of Figs 2 to 4 of the manuscript, written by
   scripts/viz/export_results.py. Nothing is computed here except pixel positions.
   One small SVG chart component (lines, points, intervals, bands, hover read-out, legend, table view) and the
   chart definitions of the Findings section. No dependencies. */
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
  function Chart(host, spec) {
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
    this.tableBox = h('details', 'ct-data', null, host);
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
      h('span', null, s.name, b);
      b.addEventListener('click', function () {
        var left = self.visible().filter(function (t) { return t.name && t.legend !== false; }).length;
        if (!self.hidden[s.id] && left <= 1) return;
        self.hidden[s.id] = !self.hidden[s.id];
        b.setAttribute('aria-pressed', self.hidden[s.id] ? 'false' : 'true');
        self.render(false);
      });
      b.addEventListener('pointerenter', function () { self.emphasize(s.id); });
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
    h('summary', null, 'Data table', box);
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
      var g = el('g', { 'data-series': s.id }, plot);
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
  function card(id, o) {
    var host = document.getElementById(id);
    if (!host) return null;
    host.textContent = '';
    var head = h('div', 'cc-head', null, host);
    var tt = h('div', 'cc-title', null, head);
    var title = h('b', null, o.title, tt), sub = h('span', null, o.sub || '', tt);
    var ctl = h('div', 'cc-controls', null, head);
    var body = h('div', 'cc-body', null, host);
    var foot = h('div', 'cc-foot', null, host);
    var note = h('span', 'cc-note', o.note || '', foot);
    h('span', 'cc-src', o.source || '', foot);
    return { host: host, head: head, controls: ctl, body: body, title: title, sub: sub, note: note };
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

  function scalingSpec(m) {
    var argon = m.model === 'Gemini 4 Argon';
    var series = [{ id: 'c', name: 'Coordinator', label: 'Coordinator', color: C.coordinator, marker: 'circle', width: 2.6, points: zip(m.sizes, m.coordinator) }];
    if (m.matched) series.push({ id: 'm', name: 'Matched control', label: 'Matched control', color: C.coordinator, dash: '5 5', marker: 'circle', open: true, width: 1.8, points: zip(m.sizes, m.matched) });
    series.push({ id: 't', name: argon ? 'Response-threshold drones of the three smaller models' : 'Response-threshold drones', label: argon ? 'Response-threshold drones\n(three smaller models)' : 'Response-threshold\ndrones', tipName: 'Response-threshold drones', color: C.threshold, marker: 'triangle', dash: argon ? '5 5' : null, points: zip(m.sizes, m.threshold) });
    series.push({ id: 'n', name: 'Neighbour-only NatureSwarm', label: 'Neighbour-only\nNatureSwarm', color: C.swarm, marker: 'diamond', points: zip(m.natureswarm.sizes, m.natureswarm.y) });
    var dots = [];
    m.sizes.forEach(function (n) { (m.episodes[String(n)] || []).forEach(function (v, i) { dots.push({ x: n, y: v, jx: (i - 2.5) * 3.4, color: C.coordinator, series: 'c' }); }); });
    return { aria: 'Victims rescued against team size, ' + m.model, x: SIZE_AXIS([8, 16, 32, 64, 128], 6.6, 150), y: PCT(0, 100, [0, 25, 50, 75, 100]), series: series, dots: dots };
  }

  function build(R) {
    // 01 scaling, one tab per model
    var c1 = card('chart-scaling', { title: 'Victims rescued against team size', sub: 'Drone search and rescue; open dots, the coordinator’s six episodes at each size', source: 'Fig. 2d of the manuscript' });
    if (c1) {
      var models = R.scaling.models, start = 2;
      var noteOf = function (m) { return 'Coordinator minus response-threshold drones at 128 drones: ' + signed(m.gap128) + ' points (' + m.note + ').' + (m.model === 'Gemini 4 Argon' ? ' Argon’s coordinator is compared with the drones of the three smaller models; its own NatureSwarm ran from 32 drones.' : ''); };
      var ch1 = new Chart(c1.body, scalingSpec(models[start]));
      c1.note.textContent = noteOf(models[start]);
      var seg = segmented(c1.controls, 'Language model', models.map(function (m) { return m.model; }), function (i) { ch1.update(scalingSpec(models[i])); c1.note.textContent = noteOf(models[i]); });
      seg.children[0].setAttribute('aria-selected', 'false'); seg.children[start].setAttribute('aria-selected', 'true');
    }

    // 02 prompt length: the padding test and the prompt length by design
    var c2 = card('chart-prompt', { title: 'Victims rescued against prompt length', sub: 'Mean of the three smaller models', source: 'Fig. 4d of the manuscript' });
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
            { id: 'w', name: 'Team-wide NatureSwarm', label: 'Team-wide NatureSwarm', color: C.swarm, dash: '5 5', marker: 'diamond', open: true, width: 1.8, points: zip(T.sizes, T.teamwide) },
            { id: 'n', name: 'Neighbour-only NatureSwarm', label: 'Neighbour-only NatureSwarm', color: C.swarm, marker: 'diamond', points: zip(T.sizes, T.natureswarm) },
            { id: 't', name: 'Response-threshold drones', label: 'Response-threshold drones', color: C.threshold, marker: 'triangle', points: zip(T.sizes, T.threshold) }
          ] };
      };
      var views2 = [
        { spec: padSpec, title: 'Victims rescued against prompt length', src: 'Fig. 4d of the manuscript', note: 'At about 13,800 prompt tokens, the padded eight-drone coordinator rescued ' + num(P.foreign.rescued[3], 1) + '% and the real team of 128 drones ' + num(P.real.rescued[4], 1) + '%.' },
        { spec: tokSpec, title: 'Prompt tokens per call against team size', src: 'Fig. 2f of the manuscript', note: 'With 128 drones a call of the coordinator held ' + num(T.coordinator[4]) + ' prompt tokens, a call of a neighbour-only NatureSwarm drone ' + num(T.natureswarm[4]) + '.' }
      ];
      var ch2 = new Chart(c2.body, views2[0].spec());
      c2.note.textContent = views2[0].note;
      segmented(c2.controls, 'View', ['Padding test', 'Prompt length by design'], function (i) {
        ch2.update(views2[i].spec()); c2.title.textContent = views2[i].title; c2.note.textContent = views2[i].note;
        c2.host.querySelector('.cc-src').textContent = views2[i].src;
      });
    }

    // 03 the span-of-control law
    var c3 = card('chart-law', { title: 'Coordinator advantage against team size', sub: 'Lines: law fitted on 8 to 32 drones, dashed where it predicts', source: 'Fig. 4a,b of the manuscript' });
    if (c3) {
      var L = R.law, pick = 5, view = 0;
      var lawSpec = function () {
        var series = [], errors = [];
        L.models.forEach(function (m, k) {
          var on = k === pick, col = on ? C.coordinator : C.pale, f = function (n) { return m.intercept + m.slope * Math.log2(n); };
          series.push({ id: 'fit' + k, color: col, width: on ? 2.4 : 1.4, hover: false, table: false, points: [[8, f(8)], [32, f(32)]] });
          series.push({ id: 'pre' + k, color: col, width: on ? 1.8 : 1.2, dash: '5 5', hover: false, table: false, points: [[32, f(32)], [m.last, f(m.last)]], label: on ? m.model : null });
          series.push({ id: 'obs' + k, name: m.model, color: on ? C.coordinator : C.grey, opacity: on ? 1 : 0.55, line: false, marker: 'circle', size: on ? 4.6 : 3.4,
            points: m.points.map(function (p) {
              var tip = [['observed', signed(p.observed) + ' points']];
              if (!p.fitted) { tip.push(['predicted by the law', signed(p.predicted) + ' points']); tip.push(['95% prediction interval', signed(p.predicted - p.half) + ' to ' + signed(p.predicted + p.half)]); tip.push(['', p.inside ? 'inside the interval' : 'outside the interval']); if (p.late) tip.push(['', 'run after the law was written']); }
              else tip.push(['', 'used to fit the law']);
              return [p.n, p.observed, { open: !p.fitted && !p.inside, ring: on && p.late, title: m.model + ', ' + num(p.n) + ' drones', tip: tip, label: num(p.n) + ' drones' }];
            }) });
          if (on) m.points.forEach(function (p) { if (!p.fitted) errors.push({ x: p.n, lo: p.predicted - p.half, hi: p.predicted + p.half, color: C.coordinator, width: 7, opacity: 0.13 }); });
        });
        var order = series.filter(function (s) { return s.color === C.pale || s.color === C.grey; }).concat(series.filter(function (s) { return s.color === C.coordinator; }));
        return { aria: 'Coordinator advantage against team size for seven models with the fitted law', hover: 'point', legend: false, tableSeries: 'Model',
          x: SIZE_AXIS([8, 16, 32, 64, 128, 256, 512, 1024], 6.6, 1250), y: { type: 'linear', domain: [-70, 20], ticks: [-60, -40, -20, 0, 20], label: 'Coordinator advantage (percentage points)', fmt: function (v) { return signed(v); }, tick: function (v) { return num(v); } },
          refs: [{ x: 32 }], notes: [{ px: 0.99, py: 0.06, anchor: 'end', text: 'Coordinator ahead' }, { px: 0.99, py: 0.97, anchor: 'end', text: 'Decentralized ahead' }, { x: 32, dx: 8, py: 0.97, text: 'predicted, not fitted', wide: true }],
          series: order, errors: errors };
      };
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
        return { aria: 'Predicted against observed coordinator advantage for 17 larger teams', hover: 'point', legend: false, tableSeries: 'Model',
          x: ax('Predicted advantage (points)'), y: ax('Observed advantage (points)'), refs: [{ diag: [-70, 20] }],
          notes: [{ px: 0.985, py: 0.95, anchor: 'end', text: L.inside + ' of ' + L.predicted_teams + ' inside the interval' }], series: series, errors: errors };
      };
      var ch3 = new Chart(c3.body, lawSpec());
      var redraw = function () {
        ch3.update(view ? paritySpec() : lawSpec());
        c3.title.textContent = view ? 'Predicted against observed advantage' : 'Coordinator advantage against team size';
        c3.sub.textContent = view ? L.predicted_teams + ' larger teams; bars, 95% prediction intervals; open markers, outside' : 'Lines: law fitted on 8 to 32 drones, dashed where it predicts';
      };
      segmented(c3.controls, 'View', ['Against team size', 'Predicted against observed'], function (i) { view = i; redraw(); });
      var chips = h('div', 'chips', null, c3.host.insertBefore(document.createElement('div'), c3.body));
      chips.parentNode.className = 'cc-chips';
      h('span', 'chips-label', 'Model', chips);
      var cb = L.models.map(function (m, k) {
        var b = h('button', null, m.model, chips);
        b.type = 'button'; b.setAttribute('aria-pressed', k === pick ? 'true' : 'false');
        b.addEventListener('click', function () { pick = k; cb.forEach(function (x, j) { x.setAttribute('aria-pressed', j === k ? 'true' : 'false'); }); redraw(); });
        return b;
      });
      c3.note.textContent = 'Shaded bars and open markers refer to the 95% prediction interval; a ring marks a team run after the law was written.';
    }

    // 04 128 to 1,024 drones: rescued and price side by side
    var F = R.frontier;
    var c4a = card('chart-frontier-rescued', { title: 'Victims rescued', sub: '128 to 1,024 drones, mean of both worlds; the axis starts at 60%', source: 'Fig. 2g of the manuscript', note: 'Gemini 4 Argon ran the coordinator, Gemini 2.5 Flash-Lite the drones.' });
    var c4b = card('chart-frontier-price', { title: 'List price of an episode', sub: 'US$, mean of both worlds', source: 'Fig. 2g of the manuscript', note: 'The response-threshold drones were priced from 256 drones.' });
    var fs = function (key, yOf, labels) {
      var defs = [['coordinator', 'Coordinator (Gemini 4 Argon)', 'Coordinator,\nGemini 4 Argon', C.coordinator, 'circle'], ['natureswarm', 'Neighbour-only NatureSwarm (Gemini 2.5 Flash-Lite)', 'NatureSwarm,\nGemini 2.5 Flash-Lite', C.swarm, 'diamond'], ['threshold', 'Response-threshold drones (Gemini 2.5 Flash-Lite)', 'Response-threshold\ndrones', C.threshold, 'triangle']];
      return defs.map(function (d) { return { id: d[0], name: d[1], label: labels ? d[2] : null, color: d[3], marker: d[4], width: d[0] === 'coordinator' ? 2.6 : 2.25, points: yOf(F[d[0]]) }; });
    };
    if (c4a) new Chart(c4a.body, { aria: 'Victims rescued with 128 to 1,024 drones', height: 300, x: SIZE_AXIS(F.sizes, 105, 1250), y: PCT(60, 100, [60, 70, 80, 90, 100]),
      series: fs('rescued', function (d) { return zip(F.sizes, d.rescued); }, false) });
    if (c4b) new Chart(c4b.body, { aria: 'List price of an episode with 128 to 1,024 drones', height: 300, x: SIZE_AXIS(F.sizes, 105, 1250),
      y: { type: 'linear', domain: [0, 8], ticks: [0, 2, 4, 6, 8], label: 'US$ per episode', fmt: function (v) { return 'US$' + num(v, 2); } },
      series: fs('price', function (d) { return F.sizes.filter(function (n) { return d.price[String(n)] !== undefined; }).map(function (n) { return [n, d.price[String(n)]]; }); }, true) });

    // 05 slow calls and a silent base
    var c5 = card('chart-robust', { title: 'Victims rescued in simulated real time', sub: 'Model calls take time; dotted, the span law’s prediction with its 95% interval', source: 'Fig. 3e of the manuscript' });
    if (c5) {
      var RT = R.realtime, SB = R.silent;
      var rtSpec = function (p) {
        var s = RT.sizes;
        return { aria: 'Victims rescued in simulated real time against team size, ' + p.name, x: SIZE_AXIS(s, 12.5, 330), y: PCT(0, 100, [0, 25, 50, 75, 100]),
          areas: [{ x: s, lo: p.band.lo, hi: p.band.hi, color: C.coordinator, opacity: 0.09, series: 'pred' }],
          errors: s.map(function (n, i) { return { x: n, lo: p.interval[i][0], hi: p.interval[i][1], color: C.coordinator, series: 'obs' }; })
            .concat(p.argon_natureswarm.map(function (a) { return { x: a.n, dx: 9, lo: a.iv[0], hi: a.iv[1], color: C.swarm, series: 'own' }; })),
          series: [
            { id: 'pred', name: 'Predicted by the span law', color: C.coordinator, dash: '2 5', width: 1.8, points: zip(s, p.predicted) },
            { id: 't', name: 'Response-threshold drones, Gemini 2.5 Flash-Lite', label: 'Response-threshold drones', tipName: 'Response-threshold drones', color: C.threshold, marker: 'triangle', points: zip(s, p.threshold) },
            { id: 'n', name: 'Neighbour-only NatureSwarm, Gemini 2.5 Flash-Lite', label: 'Neighbour-only NatureSwarm', tipName: 'Neighbour-only NatureSwarm', color: C.swarm, marker: 'diamond', points: zip(s, p.natureswarm) },
            { id: 'own', name: 'Neighbour-only NatureSwarm, Gemini 4 Argon (32 and 64 drones)', tipName: 'Neighbour-only NatureSwarm, Gemini 4 Argon', color: C.swarm, line: false, marker: 'diamond', open: true, points: p.argon_natureswarm.map(function (a) { return [a.n, a.y, { dx: 9 }]; }) },
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
            mk('c', 'Coordinator', 'coordinator', C.coordinator, { width: 2.6 }), mk('n', 'Team-wide NatureSwarm', 'teamwide', C.swarm, { width: 2.6 })
          ] };
      };
      var views5 = [
        { spec: function () { return rtSpec(RT.panels[0]); }, title: 'Victims rescued in simulated real time', sub: 'Model calls take time; dotted, the span law’s prediction with its 95% interval', src: 'Fig. 3e of the manuscript', note: 'With 256 drones Argon’s coordinator rescued ' + num(RT.panels[0].observed[4], 1) + '%; the law predicted ' + num(RT.panels[0].predicted[4], 1) + '%. Magenta bars at 32 and 64 drones: Argon’s own neighbour-only NatureSwarm.' },
        { spec: function () { return rtSpec(RT.panels[1]); }, title: 'Victims rescued in simulated real time', sub: 'Two-level coordinator; dotted, the span law’s prediction with its 95% interval', src: 'Fig. 3e of the manuscript', note: 'With 256 drones Argon’s two-level coordinator rescued ' + num(RT.panels[1].observed[4], 1) + '%.' },
        { spec: sbSpec, title: 'Victims rescued while the base was silent', sub: 'Time steps 15 to 44 without the base; two models, 20 episodes per design', src: 'Fig. 3b of the manuscript', note: 'After 60 time steps: team-wide NatureSwarm ' + num(SB.teamwide[59], 1) + '%, coordinator ' + num(SB.coordinator[59], 1) + '%, coordinator with a working base ' + num(SB.working[59], 1) + '%.' }
      ];
      var ch5 = new Chart(c5.body, views5[0].spec());
      c5.note.textContent = views5[0].note;
      var replay = h('button', 'cc-replay', 'Replay', c5.controls);
      replay.type = 'button'; replay.hidden = true;
      replay.addEventListener('click', function () { ch5.replay(2600); });
      var seg5 = segmented(c5.controls, 'View', ['Slow calls: coordinator', 'Slow calls: two-level', 'Silent base'], function (i) {
        var v = views5[i];
        ch5.update(v.spec()); c5.title.textContent = v.title; c5.sub.textContent = v.sub; c5.note.textContent = v.note;
        c5.host.querySelector('.cc-src').textContent = v.src; replay.hidden = i !== 2;
        if (i === 2) ch5.replay(2600);
      });
      c5.controls.insertBefore(seg5, replay);
    }
  }

  function start() { if (window.NS_RESULTS) build(window.NS_RESULTS); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
