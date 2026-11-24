// visualization.js
// Handles the page controls and D3 chart rendering.
// All CSV loading and statistical calculations are imported from data.js.

import * as d3 from "https://cdn.jsdelivr.net/npm/d3@7/+esm";
import {
  loadCellData,
  calculateTrackStats,
  calculateBoxStats
} from "./data.js";

const CSV_PATH = "GT_FLD_5.csv";
const MARGIN = { top: 14, right: 28, bottom: 42, left: 48 };
const CHART_HEIGHT = 190;
const DOT_RADIUS = 5.2;

const slider = d3.select("#frame-slider");
const frameValue = d3.select("#frame-value");
const tooltip = d3.select("#tooltip");
const errorBox = d3.select("#error-message");

const charts = [
  { id: "#duration-chart", key: "duration", label: "Duration" },
  { id: "#splits-chart", key: "splits", label: "Number of splits" },
  { id: "#position-chart", key: "positionChange", label: "Change in position" }
];

let rows = [];
let trackColor = d3.scaleOrdinal();

function showError(message) {
  errorBox.append("div").attr("class", "error").text(message);
}

function renderChart(chart, stats) {
  const svg = d3.select(chart.id);
  const width = Math.max(320, svg.node().getBoundingClientRect().width || 900);
  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = CHART_HEIGHT - MARGIN.top - MARGIN.bottom;

  svg.attr("viewBox", `0 0 ${width} ${CHART_HEIGHT}`).attr("height", CHART_HEIGHT);
  svg.selectAll("*").remove();

  const values = stats
    .map(record => ({ trackId: record.trackId, value: record[chart.key] }))
    .filter(record => Number.isFinite(record.value));

  const box = calculateBoxStats(values);
  if (!box) return 0;

  const minValue = d3.min(values, record => record.value);
  const maxValue = d3.max(values, record => record.value);
  const span = maxValue - minValue;
  const padding = span === 0 ? Math.max(1, Math.abs(maxValue) * 0.08) : span * 0.12;

  const x = d3.scaleLinear()
    .domain([Math.max(0, minValue - padding), maxValue + padding])
    .nice()
    .range([0, innerWidth]);

  const centerY = MARGIN.top + innerHeight / 2;
  const boxHeight = 38;
  const group = svg.append("g").attr("transform", `translate(${MARGIN.left},0)`);

  group.append("g")
    .attr("class", "grid")
    .attr("transform", `translate(0,${MARGIN.top + innerHeight})`)
    .call(d3.axisBottom(x).ticks(7).tickSize(-innerHeight).tickFormat(""))
    .call(axis => axis.select(".domain").remove());

  group.append("g")
    .attr("class", "axis")
    .attr("transform", `translate(0,${MARGIN.top + innerHeight})`)
    .call(d3.axisBottom(x).ticks(7));

  // Whisker and caps.
  group.append("line").attr("class", "whisker")
    .attr("x1", x(box.whiskerMin)).attr("x2", x(box.whiskerMax))
    .attr("y1", centerY).attr("y2", centerY);

  [box.whiskerMin, box.whiskerMax].forEach(value => {
    group.append("line").attr("class", "cap")
      .attr("x1", x(value)).attr("x2", x(value))
      .attr("y1", centerY - 13).attr("y2", centerY + 13);
  });

  // IQR box and median.
  group.append("rect").attr("class", "box")
    .attr("x", x(box.q1)).attr("y", centerY - boxHeight / 2)
    .attr("width", Math.max(1, x(box.q3) - x(box.q1)))
    .attr("height", boxHeight);

  group.append("line").attr("class", "median")
    .attr("x1", x(box.median)).attr("x2", x(box.median))
    .attr("y1", centerY - boxHeight / 2).attr("y2", centerY + boxHeight / 2);

  // Only values outside the 1.5 × IQR fences are displayed as colored dots.
  const overlapCounts = new Map();
  const dots = box.outliers.map(record => {
    const overlapKey = record.value;
    const count = overlapCounts.get(overlapKey) || 0;
    overlapCounts.set(overlapKey, count + 1);
    return { ...record, offset: ((count % 5) - 2) * 7 };
  });

  group.selectAll("circle.outlier")
    .data(dots, record => record.trackId)
    .join("circle")
    .attr("class", "outlier")
    .attr("cx", record => x(record.value))
    .attr("cy", record => centerY + record.offset)
    .attr("r", DOT_RADIUS)
    .attr("fill", record => trackColor(record.trackId))
    .on("mouseenter", (event, record) => {
      tooltip.style("opacity", 1)
        .html(`<strong>Track ${record.trackId}</strong><br>${chart.label}: ${record.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}`);
    })
    .on("mousemove", event => {
      tooltip.style("left", `${event.clientX + 12}px`)
        .style("top", `${event.clientY - 12}px`);
    })
    .on("mouseleave", () => tooltip.style("opacity", 0));

  group.append("text")
    .attr("x", innerWidth)
    .attr("y", MARGIN.top + 2)
    .attr("text-anchor", "end")
    .attr("fill", "#68727d")
    .attr("font-size", 10)
    .text(`${box.outliers.length} outlier${box.outliers.length === 1 ? "" : "s"} · n=${values.length}`);

  return box.outliers.length;
}

function update(frame) {
  const selectedFrame = Number(frame);
  frameValue.text(selectedFrame);
  slider.property("value", selectedFrame);

  const minFrame = Number(slider.attr("min"));
  const maxFrame = Number(slider.attr("max"));
  d3.select("#previous-frame").property("disabled", selectedFrame <= minFrame);
  d3.select("#next-frame").property("disabled", selectedFrame >= maxFrame);

  const stats = calculateTrackStats(rows, selectedFrame);
  const totalDivisions = d3.sum(stats, record => record.splits);
  const totalOutliers = charts.reduce(
    (total, chart) => total + renderChart(chart, stats),
    0
  );

  d3.select("#track-count").text(stats.length.toLocaleString());
  d3.select("#division-count").text(totalDivisions.toLocaleString());
  d3.select("#outlier-count").text(totalOutliers.toLocaleString());
}

async function initialize() {
  try {
    const dataset = await loadCellData(CSV_PATH);
    rows = dataset.rows;

    const minFrame = dataset.frames[0];
    const maxFrame = dataset.frames[dataset.frames.length - 1];

    slider.attr("min", minFrame).attr("max", maxFrame).attr("step", 1);
    trackColor = d3.scaleOrdinal()
      .domain(dataset.trackIds)
      .range(d3.quantize(d3.interpolateRainbow, dataset.trackIds.length + 1));

    slider.on("input", function () {
      update(this.value);
    });

    d3.select("#previous-frame").on("click", () => {
      update(Math.max(minFrame, Number(slider.property("value")) - 1));
    });

    d3.select("#next-frame").on("click", () => {
      update(Math.min(maxFrame, Number(slider.property("value")) + 1));
    });

    update(minFrame);

    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => update(slider.property("value")), 100);
    });
  } catch (error) {
    console.error(error);
    showError(
      `Could not load ${CSV_PATH}. Keep the CSV, index.html, data.js, and visualization.js ` +
      `in the same folder and open the page through a local web server. Details: ${error.message}`
    );
  }
}

initialize();
