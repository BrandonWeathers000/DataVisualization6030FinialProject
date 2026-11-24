d3.csv("name-data.csv").then(
    function(dataset){
        var dimensions = {
                    width: 1000,
                    height: 600,
                    margin:{
                        top: 10,
                        bottom: 50,
                        right: 10,
                        left: 50
                    }
                }

        console.log(dataset)

        var name = "Amanda"

        var xAccessor = d => +d.position_x_t
        var yAccessor = d => +d.position_y_t

        var svg = d3.select("#barchart")
                    .style("width", dimensions.width)
                    .style("height", dimensions.height)


        var xScale = d3.scaleLinear()
                       .domain(d3.extent(dataset, xAccessor))
                       .range([dimensions.margin.left ,dimensions.width - dimensions.margin.right])

        var yScale = d3.scaleLinear()
                    .domain([0,d3.max(dataset, yAccessor)])
                    .range([dimensions.height-dimensions.margin.bottom, dimensions.margin.top])

        svg.selectAll("circle")
          .data(dataset[frame_t], d => d.id) // key function to track points across time
          .join(
            enter => enter.append("circle")
              .attr("cx", d => x(d.xValue))
              .attr("cy", d => y(d.yValue))
              .attr("r", 5),
            update => update
              .transition()
              .duration(1000)
              .attr("cx", d => x(d.xValue))
              .attr("cy", d => y(d.yValue)),
            exit => exit.remove()
          );

        var xAxisGen = d3.axisBottom().scale(xScale).ticks(30).tickFormat(d3.format("d"));
        var xAxis = svg.append("g")
                       .call(xAxisGen)
                       .style("transform", `translateY(${dimensions.height-dimensions.margin.bottom}px)`)

        xAxis.selectAll("text")
            .style("text-anchor", "end")
            .attr("transform", "rotate(-45)")

        var yAxisGen = d3.axisLeft().scale(yScale)
        var yAxis = svg.append("g")
                        .call(yAxisGen)
                        .style("transform", `translateX(${dimensions.margin.left}px)`)
    }
)