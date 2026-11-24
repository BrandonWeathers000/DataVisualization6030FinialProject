// Multi-cell-type track explorer.
// Add one entry per CSV below (name = label shown in the toggle list).
// You can also add CSVs at runtime with the file picker in the side panel.
// Note: loading by path needs the page served over http (`python3 -m http.server`).

const CELL_TYPES = [
  { name: "HEK239T", file: "GT_FLD_5.csv" },
  { name: "MCF10A", file: "GT_FLD_102.csv" },
  { name: "U87", file: "GT_FLD_3.csv" },
];

const parseRow = d => ({
  frame: +d.frame_t,
  cellId: +d.cell_id,
  track: +d.track_id,
  x: +d.position_x_t,
  y: +d.position_y_t,
});

// Per-type look: color family + marker shape (so types differ even without color)
const FAMILIES = [d3.interpolateBlues, d3.interpolateOranges, d3.interpolateGreens,
  d3.interpolatePurples, d3.interpolateReds, d3.interpolateGreys];
const SHAPES = [d3.symbolCircle, d3.symbolSquare, d3.symbolTriangle,
  d3.symbolDiamond, d3.symbolCross, d3.symbolStar];

let loaded = [];   // [{name, rows}]
let timer = null;

Promise.allSettled(CELL_TYPES.map(t =>
  d3.csv(t.file, parseRow).then(rows => ({ name: t.name, rows }))
)).then(results => {
  const errs = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") loaded.push(r.value);
    else errs.push(`${CELL_TYPES[i].file} (${r.reason.message})`);
  });
  if (errs.length) {
    d3.select("#error").text("Could not load: " + errs.join(", ") +
      ". Serve this folder over http (python3 -m http.server) or use the file picker.");
  }
  init();
});

d3.select("#fileInput").on("change", async e => {
  for (const f of e.target.files) {
    let name = f.name.replace(/\.csv$/i, "");
    while (loaded.some(t => t.name === name)) name += " (2)";
    loaded.push({ name, rows: d3.csvParse(await f.text(), parseRow) });
  }
  e.target.value = "";
  init();
});

function init() {
  if (timer) { timer.stop(); timer = null; }
  d3.select("#play").text("▶ Play");
  d3.select("#field").selectAll("*").remove();
  d3.select("#trackList").selectAll("*").remove();
  if (!loaded.length) return;

  // ---- Build model: types -> tracks. Keys are "type|track" so IDs can repeat across types ----
  const types = loaded.map((t, ti) => {
    const byTrack = d3.group(t.rows, d => d.track);
    const ids = Array.from(byTrack.keys()).sort((a, b) => a - b);
    const n = ids.length;
    const used = new Set();
    const idx = d3.range(n).map(i => { let k = (i * 7) % n; while (used.has(k)) k = (k + 1) % n; used.add(k); return k; });
    const fam = FAMILIES[ti % FAMILIES.length];
    const tracks = ids.map((id, i) => ({
      key: `${t.name}|${id}`, id, type: t.name,
      pts: byTrack.get(id).sort((a, b) => a.frame - b.frame),
      color: fam(0.4 + 0.55 * (n > 1 ? idx[i] / (n - 1) : 1)),
    }));
    return { name: t.name, symbol: SHAPES[ti % SHAPES.length], base: fam(0.75), tracks };
  });
  const allTracks = types.flatMap(t => t.tracks);
  const trackByKey = new Map(allTracks.map(t => [t.key, t]));
  const allRows = loaded.flatMap(t => t.rows);
  const [fMin, fMax] = d3.extent(allRows, d => d.frame);

  const state = { frame: fMin, enabled: new Set(allTracks.map(t => t.key)), trails: d3.select("#trailToggle").property("checked"), hover: null };

  // ---- Scales / SVG ----
  const W = 1000, pad = { l: 46, r: 16, t: 14, b: 34 };
  const xExt = d3.extent(allRows, d => d.x), yExt = d3.extent(allRows, d => d.y);
  const m = 30;
  const xDom = [Math.floor(xExt[0] - m), Math.ceil(xExt[1] + m)];
  const yDom = [Math.floor(yExt[0] - m), Math.ceil(yExt[1] + m)];
  const innerW = W - pad.l - pad.r;
  const innerH = innerW * (yDom[1] - yDom[0]) / (xDom[1] - xDom[0]);
  const H = innerH + pad.t + pad.b;
  const x = d3.scaleLinear(xDom, [0, innerW]);
  const y = d3.scaleLinear(yDom, [0, innerH]);

  const svg = d3.select("#field").attr("viewBox", `0 0 ${W} ${H}`);
  const g = svg.append("g").attr("transform", `translate(${pad.l},${pad.t})`);
  const grid = g.append("g").attr("class", "grid");
  grid.selectAll("line.v").data(x.ticks(10)).join("line")
    .attr("x1", d => x(d)).attr("x2", d => x(d)).attr("y1", 0).attr("y2", innerH);
  grid.selectAll("line.h").data(y.ticks(6)).join("line")
    .attr("y1", d => y(d)).attr("y2", d => y(d)).attr("x1", 0).attr("x2", innerW);
  g.append("g").attr("class", "axis").attr("transform", `translate(0,${innerH})`).call(d3.axisBottom(x).ticks(10));
  g.append("g").attr("class", "axis").call(d3.axisLeft(y).ticks(6));
  const trailLayer = g.append("g");
  const cellLayer = g.append("g");
  const tip = d3.select("#tip");
  const line = d3.line().x(d => x(d.x)).y(d => y(d.y));
  const typeSymbol = new Map(types.map(t => [t.name, t.symbol]));

  // ---- Toggle list: type groups containing track entries ----
  const list = d3.select("#trackList");
  const groups = list.selectAll("details.group").data(types).join("details").attr("class", "group").attr("open", true);
  const head = groups.append("summary");
  head.append("input").attr("type", "checkbox").attr("class", "typeCb")
    .on("click", e => e.stopPropagation())
    .on("change", (e, t) => {
      t.tracks.forEach(k => e.target.checked ? state.enabled.add(k.key) : state.enabled.delete(k.key));
      render();
    });
  head.append("svg").attr("class", "typesw").attr("width", 14).attr("height", 14)
    .append("path").attr("transform", "translate(7,7)").attr("fill", t => t.base)
    .attr("d", t => d3.symbol(t.symbol, 90)());
  head.append("span").text(t => t.name);
  head.append("span").attr("class", "count").text(t => `${t.tracks.length} tracks`);

  const items = groups.append("div").attr("class", "tracks")
    .selectAll("div.track").data(t => t.tracks).join("div").attr("class", "track")
    .on("mouseenter", (e, d) => setHover(d.key))
    .on("mouseleave", () => setHover(null))
    .on("click", (e, d) => {
      state.enabled.has(d.key) ? state.enabled.delete(d.key) : state.enabled.add(d.key);
      render();
    });
  items.append("input").attr("type", "checkbox").attr("class", "trackCb")
    .on("click", e => e.stopPropagation())
    .on("change", (e, d) => { e.target.checked ? state.enabled.add(d.key) : state.enabled.delete(d.key); render(); });
  items.append("span").attr("class", "sw").style("background", d => d.color);
  items.append("span").attr("class", "name").text(d => "Track " + d.id);
  items.append("span").attr("class", "meta").text(d => `f${d.pts[0].frame}–${d.pts[d.pts.length - 1].frame}`);

  d3.select("#allOn").on("click", () => { allTracks.forEach(t => state.enabled.add(t.key)); render(); });
  d3.select("#allOff").on("click", () => { state.enabled.clear(); render(); });
  d3.select("#trailToggle").on("change", e => { state.trails = e.target.checked; render(); });

  // ---- Slider / play ----
  const slider = d3.select("#slider").attr("min", fMin).attr("max", fMax).property("value", fMin)
    .on("input", e => { state.frame = +e.target.value; render(); });
  const playBtn = d3.select("#play").on("click", () => {
    if (timer) return stop();
    if (state.frame >= fMax) setFrame(fMin);
    playBtn.text("⏸ Pause");
    timer = d3.interval(() => state.frame >= fMax ? stop() : setFrame(state.frame + 1), 700);
  });
  function stop() { if (timer) timer.stop(); timer = null; playBtn.text("▶ Play"); }
  function setFrame(f) { state.frame = f; slider.property("value", f); render(); }
  function setHover(k) { state.hover = k; render(); }

  // ---- Render ----
  function render() {
    const f = state.frame;
    d3.select("#frameLabel").text(`Frame ${f} / ${fMax}`);

    const visible = allTracks.filter(t => state.enabled.has(t.key)).map(t => {
      const pts = t.pts.filter(d => d.frame <= f);
      return { t, pts, current: pts.find(d => d.frame === f) || null };
    }).filter(v => v.pts.length);

    const dim = k => state.hover !== null && state.hover !== k;

    trailLayer.selectAll("g.trail").data(state.trails ? visible : [], v => v.t.key).join(
      enter => {
        const s = enter.append("g").attr("class", "trail");
        s.append("path").attr("fill", "none").attr("stroke-width", 2).attr("stroke-linejoin", "round");
        return s;
      }
    ).each(function (v) {
      const gt = d3.select(this);
      gt.select("path").attr("d", line(v.pts)).attr("stroke", v.t.color).attr("stroke-opacity", dim(v.t.key) ? 0.12 : 0.75);
      gt.selectAll("circle").data(v.pts.filter(p => p.frame < f), p => p.frame).join("circle")
        .attr("cx", p => x(p.x)).attr("cy", p => y(p.y)).attr("r", 2.5)
        .attr("fill", v.t.color).attr("fill-opacity", dim(v.t.key) ? 0.12 : 0.85);
    });

    const cells = visible.filter(v => v.current);
    cellLayer.selectAll("g.cell").data(cells, v => v.t.key).join(
      enter => {
        const s = enter.append("g").attr("class", "cell");
        s.append("path").attr("class", "mark").attr("stroke-width", 1.5);
        s.append("text").attr("class", "cell-label").attr("dy", -14).attr("text-anchor", "middle");
        return s;
      }
    ).attr("transform", v => `translate(${x(v.current.x)},${y(v.current.y)})`)
      .attr("opacity", v => dim(v.t.key) ? 0.25 : 1)
      .on("mouseenter", (e, v) => {
        setHover(v.t.key);
        tip.style("opacity", 1).html(`${v.t.type} · track ${v.t.id} · cell ${v.current.cellId}<br>(${v.current.x.toFixed(1)}, ${v.current.y.toFixed(1)})`);
      })
      .on("mousemove", e => tip.style("left", e.clientX + 12 + "px").style("top", e.clientY + 12 + "px"))
      .on("mouseleave", () => { tip.style("opacity", 0); setHover(null); })
      .each(function (v) {
        const s = d3.select(this);
        s.select(".mark").attr("d", d3.symbol(typeSymbol.get(v.t.type), 150)())
          .attr("fill", v.t.color).attr("stroke", "var(--fg)");
        s.select(".cell-label").attr("fill", v.t.color).text(v.t.id);
      });

    // List state
    const present = new Set(cells.map(c => c.t.key));
    items.classed("hl", d => d.key === state.hover)
      .classed("absent", d => !present.has(d.key))
      .style("opacity", d => state.enabled.has(d.key) ? 1 : 0.5);
    items.select(".trackCb").property("checked", d => state.enabled.has(d.key));
    head.select(".typeCb").each(function (t) {
      const on = t.tracks.filter(k => state.enabled.has(k.key)).length;
      this.checked = on === t.tracks.length;
      this.indeterminate = on > 0 && on < t.tracks.length;
    });
  }

  render();
}
