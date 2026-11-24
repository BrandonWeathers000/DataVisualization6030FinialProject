// data.js
// Loads the CSV and calculates cumulative track measurements and box-plot statistics.
// This file contains no chart-rendering or DOM code.

const numberOrNull = value => {
  if (value === undefined || value === null || String(value).trim() === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function parseBoolean(value) {
  return value === true || String(value).trim().toLowerCase() === "true" || value === 1;
}

// Small CSV parser for this dataset. Handles quoted fields and escaped quotes.
function parseCSV(text) {
  const records = [];
  let row = [], field = "", quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      records.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length || row.length) {
    row.push(field.replace(/\r$/, ""));
    records.push(row);
  }

  if (records.length < 2) return [];
  const headers = records[0].map(header => header.trim());
  return records.slice(1)
    .filter(record => record.some(value => value.trim() !== ""))
    .map(record => Object.fromEntries(headers.map((header, index) => [header, record[index] ?? ""])));
}

/**
 * Fetch and parse the CSV.
 * Returns normalized records with frame, track ID, division flag and displacement.
 */
export async function loadCellData(csvPath = "GT_FLD_5.csv") {
  const response = await fetch(csvPath);
  if (!response.ok) {
    throw new Error(`Could not load ${csvPath} (HTTP ${response.status}).`);
  }

  const csvText = await response.text();
  const parsed = parseCSV(csvText);

  const rows = parsed.map(record => ({
    frame_t: numberOrNull(record.frame_t),
    track_id: String(record.track_id ?? "").trim(),
    isDivision: parseBoolean(record.IS_DIVISION),
    displacement: numberOrNull(record.DISPLACEMENT)
  })).filter(record =>
    record.frame_t !== null && record.track_id !== "" && record.track_id !== "undefined"
  );

  if (!rows.length) {
    throw new Error("The CSV loaded, but it did not contain usable rows.");
  }

  const frames = Array.from(new Set(rows.map(record => record.frame_t))).sort((a, b) => a - b);
  const trackIds = Array.from(new Set(rows.map(record => record.track_id))).sort((a, b) =>
    a.localeCompare(b, undefined, { numeric: true })
  );

  return { rows, frames, trackIds };
}

/**
 * Calculate each track's cumulative measurements using records through maxFrame.
 *
 * duration: number of unique frames observed for the track
 * splits: number of division records for the track
 * positionChange: sum of DISPLACEMENT values for the track
 */
export function calculateTrackStats(rows, maxFrame) {
  const byTrack = new Map();

  for (const record of rows) {
    if (record.frame_t > maxFrame) continue;

    if (!byTrack.has(record.track_id)) {
      byTrack.set(record.track_id, {
        trackId: record.track_id,
        frames: new Set(),
        splits: 0,
        positionChange: 0
      });
    }

    const track = byTrack.get(record.track_id);
    track.frames.add(record.frame_t);
    if (record.isDivision) track.splits += 1;
    track.positionChange += record.displacement ?? 0;
  }

  return Array.from(byTrack.values())
    .map(track => ({
      trackId: track.trackId,
      duration: track.frames.size,
      splits: track.splits,
      positionChange: track.positionChange
    }))
    .sort((a, b) => a.trackId.localeCompare(b.trackId, undefined, { numeric: true }));
}

/**
 * Calculate quartiles, 1.5 × IQR fences, whiskers and outliers for a metric.
 * Input shape: [{ trackId, value }, ...]
 */
export function calculateBoxStats(values) {
  const sorted = values
    .map(record => record.value)
    .filter(Number.isFinite)
    .sort((a, b) => a - b);

  if (!sorted.length) return null;

  const quantile = probability => {
    const position = (sorted.length - 1) * probability;
    const lower = Math.floor(position);
    const upper = Math.ceil(position);
    const fraction = position - lower;
    return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
  };

  const q1 = quantile(0.25);
  const median = quantile(0.5);
  const q3 = quantile(0.75);
  const iqr = q3 - q1;
  const lowerFence = q1 - 1.5 * iqr;
  const upperFence = q3 + 1.5 * iqr;

  const inliers = values.filter(record =>
    Number.isFinite(record.value) &&
    record.value >= lowerFence &&
    record.value <= upperFence
  );
  const outliers = values.filter(record =>
    Number.isFinite(record.value) &&
    (record.value < lowerFence || record.value > upperFence)
  );

  return {
    q1,
    median,
    q3,
    iqr,
    lowerFence,
    upperFence,
    whiskerMin: inliers.length ? Math.min(...inliers.map(record => record.value)) : q1,
    whiskerMax: inliers.length ? Math.max(...inliers.map(record => record.value)) : q3,
    outliers
  };
}
