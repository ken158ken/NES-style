// human filter wrapper for CT.current.bot
window.__humInstall = function (o) {
  var g = CT.current, orig = g.bot.bind(g);
  var H = window.__hum = { t: 0, pb: 0, eps: [], lastGrp: -1, lastT: -999, lastS: -999, o: o, seed: o.seed || 7, n: 0, sw: 0 };
  function rnd() { H.seed = (H.seed * 1103515245 + 12345) & 0x7fffffff; return H.seed / 0x7fffffff; }
  function gauss() { var u = rnd() || 1e-9, v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2832 * v); }
  function grp(bit) { var G = o.groups; for (var k in G) if (G[k] & bit) return +k; return 0; }
  g.bot = function (nes) {
    H.t++;
    var m = orig(nes) | 0;
    if (!H.o.on()) { H.pb = m; return m; }
    for (var b = 1; b < 256; b <<= 1) {
      if ((m & b) && !(H.pb & b)) {
        var gr = grp(b), d = Math.max(0, o.mj + o.sj * gauss());
        if (gr !== H.lastGrp && H.t - H.lastT < o.swWin) { d += o.sw0 + rnd() * (o.sw1 - o.sw0); H.sw++; }
        if (o.lapse && rnd() < o.lapse) d += o.lapseF;
        var s = Math.max(H.t + d, H.lastS + o.refr);
        H.lastS = s; H.lastGrp = gr; H.lastT = H.t; H.n++;
        H.eps.push({ b: b, s: Math.round(s), dur: -1, st: H.t });
      }
      if (!(m & b) && (H.pb & b)) {
        for (var i = 0; i < H.eps.length; i++) if (H.eps[i].b === b && H.eps[i].dur < 0) { H.eps[i].dur = Math.max(1, H.t - H.eps[i].st); break; }
      }
    }
    H.pb = m;
    var out = 0, keep = [];
    for (var j = 0; j < H.eps.length; j++) {
      var e = H.eps[j];
      if (H.t >= e.s && (e.dur < 0 || H.t < e.s + e.dur)) out |= e.b;
      if (e.dur < 0 || H.t < e.s + e.dur) keep.push(e);
    }
    H.eps = keep;
    return out;
  };
};
