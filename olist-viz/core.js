/* Olist 看板 · 纯计算层（浏览器与 node 共用，无 DOM 依赖） */
(function (root) {
  function prep(data) {
    var orders = data.orders;
    var items = data.items;
    var orderCats = new Uint32Array(orders.length);
    for (var k = 0; k < items.length; k++) {
      orderCats[items[k][0]] |= (1 << items[k][1]);
    }
    return {
      data: data,
      orders: orders,
      items: items,
      orderCats: orderCats,
      nM: data.months.length,
      nC: data.cats.length,
      nS: data.states.length
    };
  }

  function maskOf(set) {
    var m = 0;
    set.forEach(function (i) { m |= (1 << i); });
    return m;
  }

  /* f = {from, to, cats:Set<number>, sts:Set<number>} */
  function aggregate(ctx, f) {
    var orders = ctx.orders, items = ctx.items, nM = ctx.nM;
    var mask = maskOf(f.cats);
    var from = f.from, to = f.to;

    var pass = new Uint8Array(orders.length);
    var monthOrders = new Float64Array(nM);
    var monthAmt = new Float64Array(nM);
    var monthFrt = new Float64Array(nM);
    var i, o;

    for (i = 0; i < orders.length; i++) {
      o = orders[i];
      if (f.sts.size && !f.sts.has(o[1])) continue;
      if (mask && !(ctx.orderCats[i] & mask)) continue;
      pass[i] = 1;
      monthOrders[o[0]] += 1;
      monthAmt[o[0]] += o[4] / 100;
      monthFrt[o[0]] += o[5] / 100;
    }

    var monthGmv = new Float64Array(nM);
    var catGmv = new Float64Array(ctx.nC);
    var catRows = new Float64Array(ctx.nC);
    var stGmv = new Float64Array(ctx.nS);
    var rating = new Float64Array(6);

    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      var oi = it[0];
      if (!pass[oi]) continue;
      if (mask && !(mask & (1 << it[1]))) continue;
      var p = it[3] / 100;
      monthGmv[orders[oi][0]] += p;
      catGmv[it[1]] += p;
      catRows[it[1]] += 1;
      stGmv[orders[oi][1]] += p;
      if (it[2] > 0) rating[it[2]] += 1;
    }

    /* 区间内 KPI */
    var gmv = 0, ord = 0, amt = 0, frt = 0;
    for (i = from; i <= to; i++) {
      gmv += monthGmv[i];
      ord += monthOrders[i];
      amt += monthAmt[i];
      frt += monthFrt[i];
    }

    /* 区间内买家人数与复购 */
    var seen = new Map();
    for (i = 0; i < orders.length; i++) {
      if (!pass[i]) continue;
      var m = orders[i][0];
      if (m < from || m > to) continue;
      var u = orders[i][2];
      seen.set(u, (seen.get(u) || 0) + 1);
    }
    var buyers = seen.size, rep = 0;
    seen.forEach(function (v) { if (v > 1) rep += 1; });

    /* 同比：同长度上一年区间 */
    var yoyGmv = null, yoyOrd = null;
    if (from - 12 >= 0 && to - 12 >= 0) {
      var pg = 0, po = 0;
      for (i = from - 12; i <= to - 12; i++) { pg += monthGmv[i]; po += monthOrders[i]; }
      if (pg > 0) yoyGmv = gmv / pg - 1;
      if (po > 0) yoyOrd = ord / po - 1;
    }

    /* 趋势序列 */
    var labels = [], series = [], yoy = [], mom = [];
    for (i = from; i <= to; i++) {
      labels.push(ctx.data.months[i]);
      series.push(monthGmv[i]);
      yoy.push(i >= 12 && monthGmv[i - 12] > 0 ? (monthGmv[i] / monthGmv[i - 12] - 1) * 100 : null);
      mom.push(i >= 1 && monthGmv[i - 1] > 0 ? (monthGmv[i] / monthGmv[i - 1] - 1) * 100 : null);
    }

    var cats = [], states = [], ci, si;
    for (ci = 0; ci < ctx.nC; ci++) cats.push({ i: ci, name: ctx.data.cats[ci], v: catGmv[ci], rows: catRows[ci] });
    cats.sort(function (a, b) { return b.v - a.v; });
    for (si = 0; si < ctx.nS; si++) states.push({ i: si, name: ctx.data.states[si], v: stGmv[si] });
    states.sort(function (a, b) { return b.v - a.v; });

    var validRating = 0;
    for (i = 1; i <= 5; i++) validRating += rating[i];
    var rates = [];
    for (i = 1; i <= 5; i++) rates.push({ star: i, n: rating[i], pct: validRating ? rating[i] / validRating * 100 : 0 });

    return {
      gmv: gmv, orders: ord, amt: amt, freight: frt,
      buyers: buyers, repeatUsers: rep,
      repeatRate: buyers ? rep / buyers : 0,
      aov: ord ? amt / ord : 0,
      yoyGmv: yoyGmv, yoyOrd: yoyOrd,
      labels: labels, series: series, yoy: yoy, mom: mom,
      cats: cats, states: states, rates: rates,
      ratingTotal: validRating,
      catTotal: catGmv.reduce(function (a, b) { return a + b; }, 0),
      stateTotal: stGmv.reduce(function (a, b) { return a + b; }, 0)
    };
  }

  root.OlistCore = { prep: prep, aggregate: aggregate };
})(typeof window !== 'undefined' ? window : globalThis);
