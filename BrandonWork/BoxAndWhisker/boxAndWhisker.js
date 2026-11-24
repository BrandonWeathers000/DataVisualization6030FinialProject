// Box and whisker plots
d3.csv("summary.csv", d => ({
    cell_line: d.cell_line,
    fld: d.fld,
    all_cells: +d.all_cells
})).then(data => {
    // Part 1
    const grouped = d3.group(data, d => d.cell_line);

    const statistics = Array.from(grouped, ([cell_line, rows]) => {
        const values = rows.map(d => d.all_cells).sort(d3.ascending);

        const q1 = d3.quantile(values, 0.25);
        const mean = d3.mean(values);
        const median = d3.quantile(values, 0.50);
        const q3 = d3.quantile(values, 0.75);

        const iqr = q3 - q1;

        // Bounds
        const lowerBound = q1 - 1.5 * iqr;
        const upperBound = q3 + 1.5 * iqr;
        const lowerWhisker = d3.min(values.filter(v => v >= lowerBound));
        const upperWhisker = d3.max(values.filter(v => v <= upperBound));

        return {
            cell_line,
            values,
            q1,
            mean,
            median,
            q3,
            lowerWhisker,
            upperWhisker
        };
    });

    console.log(statistics);

    // Part 2
    const width = 1800;
    const height = 800;

    const margin = { top: 30, right: 30, bottom: 60, left: 80 };

    const svg = d3.select("#box-chart")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const x = d3.scaleBand()
        .domain(statistics.map(d => d.cell_line))
        .range([margin.left, width - margin.right])
        .padding(0.4);

    const y = d3.scaleLinear()
        .domain([0, d3.max(data, d => d.all_cells) * 1.1])
        .range([height - margin.bottom, margin.top]);

    // Axes
    svg.append("g")
        .attr("transform", `translate(0,${height - margin.bottom})`)
        .call(d3.axisBottom(x));

    svg.append("g")
        .attr("transform", `translate(${margin.left},0)`)
        .call(d3.axisLeft(y));

    // Part 3
    const boxes = svg.selectAll(".box")
    .data(statistics)
    .join("g")
    .attr("class", "box")
    .attr("transform", d => `translate(${x(d.cell_line) + x.bandwidth()/2},0)`);

    // Whiskers
    boxes.append("line")
        .attr("y1", d => y(d.lowerWhisker))
        .attr("y2", d => y(d.upperWhisker))
        .attr("stroke", "white");

    // Upper whisker cap
    boxes.append("line")
        .attr("x1", -x.bandwidth() / 8)
        .attr("x2", x.bandwidth() / 8)
        .attr("y1", d => y(d.upperWhisker))
        .attr("y2", d => y(d.upperWhisker))
        .attr("stroke", "white")
        .attr("stroke-width", 2);

    // Box
    boxes.append("rect")
        .attr("x", -x.bandwidth()/2)
        .attr("width", x.bandwidth())
        .attr("y", d => y(d.q3))
        .attr("height", d => y(d.q1) - y(d.q3))
        .attr("fill", "white")
        .attr("stroke", "white");

    // Median
    boxes.append("line")
        .attr("x1", -x.bandwidth()/2)
        .attr("x2", x.bandwidth()/2)
        .attr("y1", d => y(d.median))
        .attr("y2", d => y(d.median))
        .attr("stroke", "black")
        .attr("stroke-width", 2);

    // Mean
    boxes.append("circle")
        .attr("cx", 0)
        .attr("cy", d => y(d.mean))
        .attr("r", 5)
        .attr("fill", "black")
        .attr("stroke", "black")
        .attr("stroke-width", 1);

    // Lower whisker cap
    boxes.append("line")
        .attr("x1", -x.bandwidth() / 8)
        .attr("x2", x.bandwidth() / 8)
        .attr("y1", d => y(d.lowerWhisker))
        .attr("y2", d => y(d.lowerWhisker))
        .attr("stroke", "white")
        .attr("stroke-width", 2);

    svg.selectAll(".tick text")
        .style("font-size", "18px");
});
