// Direction and distance tracker
d3.csv("GT_FLD_102.csv", d => ({
    frame_t: +d.frame_t,
    frame_t_plus_1: +d.frame_t_plus_1,
    cell_id: +d.cell_id,
    track_id: +d.track_id,
    target_spot_id: +d.target_spot_id,
    displacement: +d.DISPLACEMENT,
    angle: +d.ANGLE_DEG,
    direction: d.DIRECTION_NAME
})).then(data => {

    // Chart dimensions
    const width = 1000;
    const height = 1000;

    const centerX = width / 2;
    const centerY = height / 2;

    const maxRadius = 150;

    // Container
    const container = d3.select("#direction-chart");
    container.selectAll("*").remove();

    // Controls
    const controls = container.append("div")
        .style("margin-bottom", "15px");

    // SVG
    const svg = container.append("svg")
        .attr("viewBox", `0 0 ${width} ${height}`)
        .attr("width", "100%");

    // Compass directions
    const compassDirections = [
        "N", "NNE", "NE", "ENE",
        "E", "ESE", "SE", "SSE",
        "S", "SSW", "SW", "WSW",
        "W", "WNW", "NW", "NNW"
    ];

    // Distance scale
    const scale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.displacement)])
        .range([0, maxRadius]);

    // Draw distance rings
    [0.25, 0.5, 0.75, 1].forEach(p => {
        svg.append("circle")
            .attr("cx", centerX)
            .attr("cy", centerY)
            .attr("r", maxRadius * p)
            .attr("fill", "none")
            .attr("stroke", "currentColor")
            .attr("stroke-opacity", 0.25);
    });

    // Draw compass labels
    compassDirections.forEach((direction, i) => {
        const angle = i * Math.PI / 8;

        const x = centerX + (maxRadius + 25) * Math.sin(angle);
        const y = centerY - (maxRadius + 25) * Math.cos(angle);

        svg.append("text")
            .attr("x", x)
            .attr("y", y)
            .attr("text-anchor", "middle")
            .attr("dominant-baseline", "middle")
            .text(direction);
    });

    // Arrow marker
    const defs = svg.append("defs");

    defs.append("marker")
        .attr("id", "arrow")
        .attr("viewBox", "0 0 10 10")
        .attr("refX", 9)
        .attr("refY", 5)
        .attr("markerWidth", 6)
        .attr("markerHeight", 6)
        .attr("orient", "auto")
        .append("path")
        .attr("d", "M 0 0 L 10 5 L 0 10 z")
        .attr("fill", "white");

    // Movement arrow
    function drawMovement(d) {
        const angle = d.angle * Math.PI / 180;
        const radius = scale(d.displacement);

        const x = centerX + radius * Math.cos(angle);
        const y = centerY - radius * Math.sin(angle);

        // Remove previous movement
        svg.selectAll(".movement").remove();

        // Draw arrow
        svg.append("line")
            .attr("class", "movement")
            .attr("x1", centerX)
            .attr("y1", centerY)
            .attr("x2", x)
            .attr("y2", y)
            .attr("stroke", "white")
            .attr("stroke-width", 3)
            .attr("marker-end", "url(#arrow)");

        // Center point
        svg.append("circle")
            .attr("class", "movement")
            .attr("cx", centerX)
            .attr("cy", centerY)
            .attr("r", 4)
            .attr("fill", "white");
    }

    // Available tracks
    const trackIds = [...new Set(data.map(d => d.track_id))]
        .sort((a, b) => a - b);

    // Track selector
    let selectedTrack = trackIds.includes(1592)
        ? 1592
        : trackIds[0];

    const trackSelect = controls.append("select")
        .on("change", function() {
            selectedTrack = +this.value;
            currentIndex = 0;
            updateFrames();
        });

    trackSelect.selectAll("option")
        .data(trackIds)
        .join("option")
        .attr("value", d => d)
        .text(d => d);

    trackSelect.property("value", selectedTrack);

    // Frame information
    const info = controls.append("div")
        .style("margin", "12px 0");

    // Previous button
    const previous = controls.append("button")
        .text("Previous")
        .on("click", () => {
            currentIndex = Math.max(0, currentIndex - 1);
            render();
        });

    // Frame slider
    const slider = controls.append("input")
        .attr("type", "range")
        .attr("min", 0)
        .attr("style", "margin: 0 12px; vertical-align: middle;")
        .on("input", function() {
            currentIndex = +this.value;
            render();
        });

    // Next button
    const next = controls.append("button")
        .text("Next")
        .on("click", () => {
            currentIndex = Math.min(
                frames.length - 1,
                currentIndex + 1
            );
            render();
        });

    // Current track observations
    let frames = [];
    let currentIndex = 0;

    function updateFrames() {
        frames = data
            .filter(d => d.track_id === selectedTrack)
            .sort((a, b) => a.frame_t - b.frame_t);

        currentIndex = 0;

        slider
            .attr("max", frames.length - 1)
            .property("value", currentIndex)
            .property("disabled", frames.length <= 1);

        render();
    }

    // Update chart
    function render() {
        if (!frames.length) {
            info.text("No observations available.");
            drawMovement({
                angle: 0,
                displacement: 0
            });
            return;
        }

        const d = frames[currentIndex];

        // Update cell information
        info.text(
            `Track ID: ${d.track_id} | ` +
            `Cell ID: ${d.cell_id} | ` +
            `Frame: ${d.frame_t} → ${d.frame_t_plus_1} | ` +
            `Direction: ${d.direction} | ` +
            `Angle: ${d.angle.toFixed(2)}° | ` +
            `Distance: ${d.displacement.toFixed(2)}`
        );

        // Update slider
        slider.property("value", currentIndex);

        // Update navigation buttons
        previous.property("disabled", currentIndex === 0);
        next.property("disabled", currentIndex === frames.length - 1);

        // Draw selected movement
        drawMovement(d);
    }

    // Initialize
    updateFrames();

});
