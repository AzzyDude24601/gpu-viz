import React from 'react';
import { useState, useEffect, useRef } from 'react';
import Highcharts from 'highcharts/highstock';
import HighchartsReact from 'highcharts-react-official';
import '../styles/Chart.css';

class Chart extends React.Component {

    constructor(props) {
        super(props);
        this.state = {
            options: {
                title: {
                    style: {
                        fontWeight: 'bold'
                    }
                },
                exporting: {
                    buttons: {
                        contextButton: {
                            align: 'left',
                            x: 0,
                            y: -5,
                            verticalAlign: 'top',
                            menuItems: ["viewFullscreen", "printChart", "separator", "downloadPNG", "downloadJPEG", "separator", "downloadCSV", "downloadXLS"]
                        }
                    },
                    scale: 3,
                    sourceWidth: 1200,
                    sourceHeight: 800,
                    chartOptions: {
                        navigator: {
                            enabled: false
                        },
                    },
                    fallbackToExportServer: false
                },
                chart: {
                    type: "line",
                    zoomType: 'x',
                },
                legend: {
                    enabled: true
                },
                xAxis: {
                    events: {
                        setExtremes: function (event) {
                            if (!this.zoomButton) {
                                const chart = this.chart;
                                this.zoomButton = chart.renderer.button('Reset Zoom', null, null, function () {
                                    chart.xAxis[0].setExtremes(null, null);
                                }, {
                                    zIndex: 20
                                }).attr({
                                    id: 'resetZoom',
                                    align: 'left'
                                }).add().align({
                                    align: 'left',
                                    x: 50,
                                    y: 0
                                }, false, null);
                            }
                            if (!event.min && !event.max) {
                                if (this.zoomButton != null) {
                                    this.zoomButton.destroy();
                                    this.zoomButton = null;
                                }
                            }
                        },
                        afterSetExtremes: this.handleAfterSetExtremes.bind(this)
                    },
                    ordinal: false,
                    type: "datetime",
                    title: {
                        text: "Time Elapsed",
                        style: {
                            fontWeight: 'bold'
                        }
                    },
                    labels: {
                        formatter: function () {
                            return (milliToMinsSecs(this.value))
                        },
                    },
                },
                yAxis: {
                    opposite: false,
                    title: {
                        text: "Value",
                        style: {
                            fontWeight: 'bold'
                        }
                    },
                },
                credits: {
                    enabled: false
                },
                accessibility: {
                    enabled: false
                },
                tooltip: {
                    crosshairs: {
                        color: 'black',
                        dashStyle: '5'
                    },
                    shared: false,
                    split: false
                },
                navigator: {
                    xAxis: {
                        labels: {
                            enabled: false
                        }
                    },
                    height: 75,
                    enabled: true,
                    boostThreshold: 1,
                    series: {
                        dataGrouping: {
                            enabled: false
                        }
                    }
                },
                rangeSelector: {
                    enabled: false
                },
                scrollbar: {
                    enabled: false
                },
                plotOptions: {
                    series: {
                        lineWidth: 1,
                        boostThreshold: 1,
                        marker: {
                            radius: 1
                        },
                        states: {
                            hover: {
                                enabled: false,
                                halo: {
                                    size: 0
                                }
                            },
                            inactive: {
                                opacity: 1
                            }
                        },
                        dataGrouping: {
                            enabled: false,
                            units: [[
                                'millisecond',
                                [1]
                            ]]
                        },
                        events: {
                            legendItemClick: this.toggleSeriesVisibility.bind(this)
                        }
                    },
                },
            },
            loading: true,
            id: null,
            data: [],
            workloads: [],
            shownRuns: [],
            hiddenSeries: [],
            smoothing: 0,
            range: { min: 0, max: 0 },
            showDetailedTooltip: false,
            monochromeMode: false,
            startAtFirst: false,
            useStep: "Time",
            boostMode: true,
            chartLineWidth: 1.0
        };

        this.chartRef = React.createRef();
        this.handleShowRunsSwitch = (workloadId) => (event) => this.toggleShownRuns(workloadId, event);
    }

    componentDidMount() {

        // only show workload ID's which contain more than 1 run in Toggle Run section
        const workloads = this.props.chartData.data.map(run => run.workload);
        const nonUnique = [...new Set(workloads.filter((item, i) => workloads.includes(item, i + 1)))];
        this.setState({ workloads: nonUnique });

        // generate series
        if (this.props.chartData.context) {
            // with local uploaded settings 
            this.generateSeries(this.props.chartData, this.props.chartData.context.smoothing, this.props.chartData.context.shownRuns, this.props.chartData.context.hiddenSeries, this.props.chartData.context.range, this.state.monochromeMode, this.state.startAtFirst, this.state.useStep);
        }
        else {
            // with default settings (e.g. no smoothing and combined as workloads)
            this.generateSeries(this.props.chartData, 0, [], [], { min: 0, max: 0 }, false, false, "Time");
        }
    }

    componentDidUpdate(prevProps, prevState) {
        if (prevState.smoothing !== this.state.smoothing || prevState.shownRuns.length !== this.state.shownRuns.length || prevState.hiddenSeries.length !== this.state.hiddenSeries.length || prevState.range.min !== this.state.range.min || prevState.range.max !== this.state.range.max) {
            this.props.pullChartExtras(this.state.id, this.state.smoothing, this.state.shownRuns, this.state.hiddenSeries, this.state.range);
        }
    }

    // format detailed tooltip if it is enabled
    static formatTooltip(tooltip, toShow) {

        const xAxisTitle = tooltip.series.xAxis.axisTitle.textStr;
        const yAxisTitle = tooltip.series.yAxis.axisTitle.textStr;

        // handle multiple x-axis options
        let xAxisTooltip = ((xAxisTitle === "Time Elapsed") ? milliToMinsSecs(tooltip.x) : tooltip.x);
        let tooltipData = "<div class='tooltipStyle' style='color:" + tooltip.color + ";'>" + tooltip.series.name + "</div><br /><br/><b>" + yAxisTitle + ":</b> " + tooltip.y + "<br/><b>" + xAxisTitle + ":</b> " + xAxisTooltip + "<br /><br />";

        if (toShow) {
            const letters = new Set();
            const models = new Set();
            const sources = new Set();
            const params = new Set();
            tooltip.series.userOptions.custom.runs.forEach(run => {
                letters.add(run.letter);
                models.add(run.model);
                sources.add(run.source);
                params.add(run.params);
            });

            let lettersString = "";
            if (tooltip.series.userOptions.custom.runs.length > 1) {
                lettersString = "<b>Run(s): </b><br />" + [...letters].join("<br />") + "<br /><br />";
            }

            const modelsString = "<b>Model(s): </b><br />" + [...models].join("<br />") + "<br /><br />";
            const sourcesString = "<b>Source(s): </b><br />" + [...sources].join("<br />") + "<br /><br />";
            const paramsString = "<b>Param(s): </b><br />" + [...params].join("<br />") + "<br /><br />";

            tooltipData = tooltipData + modelsString + sourcesString + paramsString + lettersString;
        }

        return tooltipData;
    }

    // takes the run data, parses it to an object Highcharts can render, and applies it to state (which will auto-update the chart)
    generateSeries(newChartData, newSmoothing, newShownRuns, newHiddenSeries, newRange, monoMode, startAtFirst, useStep) {

        //console.log("Generating..."); // debugging
        const data = newChartData.data;

        // format data into series for highcharts
        const experimentList = new Set();
        const allSeries = [];
        data.forEach(run => {
            if (run.data !== undefined) {

                // prepare for chart title    
                experimentList.add(run.experimentName);

                // check for ungrouped workloads or unsorted workloads
                let workloadId = run.workload;
                if (workloadId.substring(workloadId.indexOf("-") + 1) === "null" || newShownRuns.indexOf(workloadId) > -1) {
                    // if (run.runname != null) {
                    //     workloadId = run.runname;
                    // }
                    // else {
                    if (run.letter === null) {
                        const removeNull = workloadId.substring(0, workloadId.indexOf("-"));
                        workloadId = removeNull + " (" + run.name.substring(0, 5) + ")";
                    }
                    else {
                        if (run.letter.length > 1) {
                            workloadId = workloadId + " " + run.letter;
                        }
                        else {
                            workloadId = workloadId + " " + run.letter + " (" + run.name.substring(0, 5) + ")";
                        }
                    }
                    // }
                }

                // add all runs to one series per workload, unless they are unsorted runs
                const seriesIndex = allSeries.findIndex(series => series.id === workloadId);
                if (seriesIndex === -1) {

                    let newSeries = {
                        id: workloadId,
                        startTime: run.startTime,
                        data: [],
                        custom: {
                            runs: []
                        }
                    };

                    // add series (runs) metadata to HC api for tooltip
                    const metadata = { ...run };
                    delete metadata.data;
                    newSeries.custom.runs.push(metadata);

                    // add data points, time or epoch
                    if (useStep !== "Time") {
                        run.data.forEach(data => {
                            let foundIndex = newSeries.data.findIndex(function (a) {
                                return a[0] === data.step;
                            });

                            if (foundIndex < 0) {
                                newSeries.data.push([data.step, [data.value]]);
                            } else {
                                newSeries.data[foundIndex][1].push(data.value);
                            }
                        })
                    } else {
                        run.data.forEach(data => {
                            newSeries.data.push([data.timestamp, data.value]);
                        })
                    }
                    allSeries.push(newSeries);
                }
                else {

                    // add data points, time or epoch
                    if (useStep !== "Time") {
                        run.data.forEach(data => {
                            let foundIndex = allSeries[seriesIndex].data.findIndex(function (a) {
                                return a[0] === data.step;
                            });

                            if (foundIndex < 0) {
                                allSeries[seriesIndex].data.push([data.step, [data.value]]);
                            } else {
                                allSeries[seriesIndex].data[foundIndex][1].push(data.value);
                            }
                        })
                    } else {
                        run.data.forEach(data => {
                            allSeries[seriesIndex].data.push([data.timestamp, data.value]);
                        })
                    }

                    // add series (runs) metadata to HC api for tooltip
                    const metadata = { ...run };
                    delete metadata.data;
                    allSeries[seriesIndex].custom.runs.push(metadata);
                }
            }
        });

        allSeries.forEach(series => {
            // sort all series by unix timestamp
            series.data.sort((a, b) => a[0] - b[0]);

            // apply run naming if singular
            if (series.custom.runs.length === 1) {
                series.id = series.custom.runs[0].runname;
            }
        });

        // convert epoch lists into singular data points
        if (useStep !== "Time") {
            //#Source https://bit.ly/2neWfJ2 
            const median = arr => {
                const mid = Math.floor(arr.length / 2),
                    nums = [...arr].sort((a, b) => a - b);
                return arr.length % 2 !== 0 ? nums[mid] : (nums[mid - 1] + nums[mid]) / 2;
            };

            allSeries.forEach(series => {
                series.data.forEach(dataPoint => {
                    if (useStep === "Epoch Min") {
                        dataPoint[1] = Math.min(...dataPoint[1]);
                    } else if (useStep === "Epoch Max") {
                        dataPoint[1] = Math.max(...dataPoint[1]);
                    } else if (useStep === "Epoch Mean") {
                        const sum = dataPoint[1].reduce((a, b) => a + b, 0);
                        const avg = (sum / dataPoint[1].length) || 0;
                        dataPoint[1] = avg;
                    } else if (useStep === "Epoch Median") {
                        dataPoint[1] = median(dataPoint[1]);
                    }
                });
            });
        }

        // styling for monochrome mode
        let monoSeriesCounter = 0;
        const dashStyles = ["Solid", "Solid", "Solid ", "Dot", "LongDash"];
        const monoColors = ["#000000", "#cccccc", "#7f7f7f ", "#999999", "#666666"];

        allSeries.forEach(series => {
            // subtract earliest time from all timestamps to get ms passed

            if (useStep === "Time") {
                let earliestTime = 0
                if (startAtFirst) {
                    earliestTime = series.data[0][0];
                } else {
                    earliestTime = series.startTime;
                }

                series.data.forEach(timeAndValue => {
                    timeAndValue[0] = timeAndValue[0] - earliestTime;
                });
            }

            // add name
            series.name = series.id;

            // prevent duplicate ids in highcharts api
            delete series.id;

            // hide any series which are supposed to be invisible
            series.visible = true;

            newHiddenSeries.forEach(seriesToHide => {
                if (series.name === seriesToHide) {
                    series.visible = false;
                }
            })

            // update series styles/colors for for monochrome mode
            if (monoMode) {
                series.dashStyle = dashStyles[monoSeriesCounter];
                series.color = monoColors[monoSeriesCounter];
            }
            else {
                series.dashStyle = "solid";
                series.color = null;
                series.colorIndex = monoSeriesCounter;
            }
            monoSeriesCounter++;

        });

        // apply smoothing to each series if over zero
        if (newSmoothing > 0) {
            allSeries.forEach(series => {
                series.data = calcEMA(series.data, newSmoothing);
            });
        }

        // get chart title based on number of experiments
        let chartTitle = "Loading..."
        if (experimentList.size === 1) {
            [chartTitle] = experimentList;
        }
        else {
            chartTitle = "Multiple Experiments (" + experimentList.size + ")";
        }

        // check if should be detailed tooltip
        const showDetailedTooltip = this.state.showDetailedTooltip;

        // if range is the default range, don't specify it for Highcharts API
        let minRange = newRange.min;
        let maxRange = newRange.max;
        if (minRange < 1) {
            minRange = null;
        }
        if (maxRange < 1) {
            maxRange = null;
        }

        // allow for toggling x axis
        let xAxisTitle = "Time Elapsed";
        let xAxisType = "datetime"
        let xAxisFormatter = function () {
            return (milliToMinsSecs(this.value))
        };
        if (useStep !== "Time") {
            xAxisTitle = "Epoch";
            xAxisType = "linear";
            xAxisFormatter = function () {
                return (this.value)
            };
        }

        // update state which will update render of chart
        this.setState({
            id: newChartData.id,
            data: newChartData.data,
            options: {
                title: {
                    text: chartTitle
                },
                xAxis: {
                    title: {
                        text: xAxisTitle,
                    },
                    type: xAxisType,
                    min: minRange,
                    max: maxRange,
                    labels: {
                        formatter: xAxisFormatter,
                    },
                },
                yAxis: {
                    title: {
                        text: newChartData.metric,
                    },
                },
                series: allSeries,
                navigator: {
                    series: allSeries,
                    //enabled: !monoMode,
                },
                tooltip: {
                    formatter() {
                        return Chart.formatTooltip(this, showDetailedTooltip);
                    }
                }
            },
            shownRuns: newShownRuns,
            hiddenSeries: newHiddenSeries,
            smoothing: newSmoothing,
            monochromeMode: monoMode,
            startAtFirst: startAtFirst,
            useStep: useStep,
            loading: false
        });

    }

    // updates smoothness state 
    handleSetSmoothness(smoothing) {
        if (smoothing !== this.state.smoothing) {
            this.generateSeries(this.props.chartData, smoothing, this.state.shownRuns, this.state.hiddenSeries, this.state.range, this.state.monochromeMode, this.state.startAtFirst, this.state.useStep);
        }
    }

    // controls which workloads show their runs
    toggleShownRuns(workloadId, event) {
        const toAdd = event.target.checked;
        const shownRuns = [...this.state.shownRuns];
        const workloadIdIndex = shownRuns.indexOf(workloadId);
        if (toAdd) {
            if (workloadIdIndex === -1) {
                shownRuns.push(workloadId);
            }
        }
        else {
            if (workloadIdIndex > -1) {
                shownRuns.splice(workloadIdIndex, 1);
            }
        }
        this.generateSeries(this.props.chartData, this.state.smoothing, shownRuns, this.state.hiddenSeries, this.state.range, false, false, "Time");
    }

    // controls the series visibility after the legend item is clicked
    toggleSeriesVisibility(event) {
        // prevent default highcharts behaviour
        event.preventDefault();

        // add/remove series name from an array
        const newHiddenSeries = [...this.state.hiddenSeries];
        if (event.target.visible === true) {
            // will be set to invisible
            const seriesName = event.target.legendItem.textStr;

            if (newHiddenSeries.indexOf(seriesName) === -1) {
                newHiddenSeries.push(seriesName);
            }
        }
        else {
            // will be set to visible
            const seriesName = event.target.legendItem.textStr;
            if (newHiddenSeries.indexOf(seriesName) > -1) {
                newHiddenSeries.splice(newHiddenSeries.indexOf(seriesName), 1);
            }
        }

        // update chart and state
        this.generateSeries(this.props.chartData, this.state.smoothing, this.state.shownRuns, newHiddenSeries, this.state.range, this.state.monochromeMode, this.state.startAtFirst, this.state.useStep);
    }

    // controls the boost setting
    handleBoostSwitch(event) {
        let forceBoost;
        let menuItems;
        if (event.currentTarget.checked) {
            forceBoost = 1;
            menuItems = ["viewFullscreen", "printChart", "separator", "downloadPNG", "downloadJPEG", "separator", "downloadCSV", "downloadXLS"]
        }
        else {
            forceBoost = 0;
            menuItems = ["viewFullscreen", "printChart", "separator", "downloadPNG", "downloadJPEG", "downloadPDF", "downloadSVG", "separator", "downloadCSV", "downloadXLS"]
        }

        this.setState({
            boostMode: event.currentTarget.checked,
            options: {
                navigator: {
                    boostThreshold: forceBoost,
                },
                plotOptions: {
                    series: {
                        boostThreshold: forceBoost,
                    },
                },
                exporting: {
                    buttons: {
                        contextButton: {
                            menuItems: menuItems
                        }
                    },
                },
            }
        });
    }

    // controls the detailed tooltip setting
    handleDetailedTooltipSwitch(event) {
        const setDetailedTooltip = event.currentTarget.checked;
        this.setState({
            showDetailedTooltip: setDetailedTooltip,
            options: {
                tooltip: {
                    formatter() {
                        return Chart.formatTooltip(this, setDetailedTooltip);
                    }
                }
            },
        });
    }

    // controls the monochrome setting
    handleMonochromeModeSwitch(event) {
        let setMonochromeMode;
        if (event.currentTarget.checked) {
            setMonochromeMode = true;
        }
        else {
            setMonochromeMode = false;
        }
        const seriesCount = (this.chartRef.current.chart.series.length - 1) / 2;
        if (seriesCount <= 5) {
            this.generateSeries(this.props.chartData, this.state.smoothing, this.state.shownRuns, this.state.hiddenSeries, this.state.range, setMonochromeMode, this.state.startAtFirst, this.state.useStep);
        }
        else {
            this.setState({
                monochromeMode: false
            })
            alert("Monochrome mode incompatible with more than 5 series.")
        }
    }

    // controls the StartAtFirst setting
    handleStartAtFirstSwitch(event) {
        let setStartAtFirst;
        if (event.currentTarget.checked) {
            setStartAtFirst = true;
        }
        else {
            setStartAtFirst = false;
        }
        this.generateSeries(this.props.chartData, this.state.smoothing, this.state.shownRuns, this.state.hiddenSeries, this.state.range, this.state.monochromeMode, setStartAtFirst, this.state.useStep);
    }

    // controls xaxis mode
    handleUseStepSwitch(object) {
        this.generateSeries(this.props.chartData, this.state.smoothing, this.state.shownRuns, this.state.hiddenSeries, { min: 0, max: 0 }, this.state.monochromeMode, this.state.startAtFirst, object.currentTarget.value);
    }

    // records the range (zoom) setting so it is saved when you download/upload charts
    handleAfterSetExtremes = (event) => {
        const newRange = { min: event.min, max: event.max }
        this.setState({ range: newRange });
    }

    // controls the line width setting
    handleSetLineWidth(newLineWidth) {
        newLineWidth = parseFloat(newLineWidth);
        this.setState({
            lineWidth: newLineWidth,
            options: {
                plotOptions: {
                    series: {
                        lineWidth: newLineWidth
                    },
                },
            },
        });
    }

    render() {
        const { options, id, workloads, smoothing, shownRuns } = this.state;
        return (
            <div className="chartWrapper">
                <button
                    className="removeChartBtn"
                    onClick={() => this.props.removeChart(id)}
                >
                    X
                </button>
                <HighchartsReact
                    highcharts={Highcharts}
                    constructorType="stockChart"
                    containerProps={{ className: "chart" }}
                    options={options}
                    ref={this.chartRef}
                    callback={this.afterChartCreated}
                />
                <div id="workloadGroupingControlsWrapper" className={workloads.length === 0 ? "hide" : null}>
                    Toggle Runs:
                    {workloads.map(workload => (
                        <div key={workload}>
                            {workload}
                            <label className="switch" title={"Show individual runs for " + workload}>
                                <input
                                    type="checkbox"
                                    onChange={this.handleShowRunsSwitch(workload)}
                                    checked={shownRuns.includes(workload)}
                                />
                                <span className="slider round"></span>
                            </label>
                        </div>
                    ))}
                </div>
                <SmoothnessSlider
                    onSetSmoothness={this.handleSetSmoothness.bind(this)}
                    defaultValue={smoothing}
                />
                <div id="exportOptionsWrapper">
                    <div title="Enable to see more metadata when hovering (slower)">
                        Detailed Tooltip: <label className="switch">
                            <input
                                type="checkbox"
                                onChange={this.handleDetailedTooltipSwitch.bind(this)}
                                checked={this.state.showDetailedTooltip}
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>
                    <div title="Convert chart to black and white (only supports 5 series)">
                        Monochrome Mode: <label className="switch">
                            <input
                                type="checkbox"
                                onChange={this.handleMonochromeModeSwitch.bind(this)}
                                checked={this.state.monochromeMode}
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>
                    <div title="Whether to start at the first data entry instead of run start.">
                        Start on First: <label className="switch">
                            <input
                                type="checkbox"
                                onChange={this.handleStartAtFirstSwitch.bind(this)}
                                checked={this.state.startAtFirst}
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>
                    <div title="Disable boost to adjust Line Width and PDF/SVG export (slower)">
                        Boost Chart: <label className="switch">
                            <input
                                type="checkbox"
                                onChange={this.handleBoostSwitch.bind(this)}
                                checked={this.state.boostMode}
                            />
                            <span className="slider round"></span>
                        </label>
                    </div>
                    <div title="Adjust series line width (only compatible with unboosted charts)" className={this.state.boostMode ? "frozen" : null}>
                        <LineWidthSlider
                            onSetLineWidth={this.handleSetLineWidth.bind(this)}
                            defaultValue={this.state.chartLineWidth}
                        />
                    </div>
                    <div title="Whether to use timestamps or steps.">
                        x-Axis: <label className="switch">
                            <select name="steptype" id="usestep" onChange={this.handleUseStepSwitch.bind(this)} >
                                <option value="Time">Time</option>
                                <option value="Epoch Min">Epoch Min</option>
                                <option value="Epoch Max">Epoch Max</option>
                                <option value="Epoch Mean">Epoch Mean</option>
                                <option value="Epoch Median">Epoch Median</option>
                            </select>
                            {/* <input
                                type="checkbox"
                                onChange={this.handleUseStepSwitch.bind(this)}
                                checked={this.state.useStep}
                            /> */}
                            {/* <span className="slider round"></span> */}
                        </label>
                    </div>
                </div>
                {/* DEBUGGING: }
                <div id="chartMetadataWrapper">
                    {data.map(series => (
                        <div className="seriesMetadata" key={series.name}>
                            <span className="label" style={{color: "black"}}>Experiment: </span><span className="metadata">{series.experimentName}</span><br />
                            <span className="label">Workload: </span>{series.workload}<br />
                            <span className="label">Letter: </span>{series.letter}<br />
                            <span className="label">ID: </span>{series.name.substring(0, 6)}<br />
                            <span className="label">Duration: </span>{milliToMinsSecs(series.duration)}<br />
                            <span className="label">Model: </span>{series.model}<br />
                            <span className="label">Source: </span>{series.source}<br />
                            <span className="label">Params: </span>{series.params}<br />
                        </div>        
                    ))}
                </div>
                {*/}
            </div>
        );
    }
}

/* Chart functional components */
function SmoothnessSlider(props) {
    const smoothSlider = useRef();
    const { onSetSmoothness } = props;
    const [smoothness, setSmoothness] = useState(0);

    useEffect(() => {
        setSmoothness(props.defaultValue);
    }, [props.defaultValue]);

    useEffect(() => {
        smoothSlider.current.addEventListener('change', e => onSetSmoothness(e.target.value));
    }, [onSetSmoothness]);
    const handleShowSmoothness = e => {
        setSmoothness(e.target.value);
    };
    return (
        <div id="smootherWrapper">
            <label htmlFor="smoother">Smoothness: </label>
            <input ref={smoothSlider} onChange={handleShowSmoothness} value={smoothness} type="range" name="smoother" min="0" max="99" />
            {smoothness}%
        </div>
    );
}
function LineWidthSlider(props) {
    const lineWidthSlider = useRef();
    const { onSetLineWidth } = props;
    const [lineWidth, setLineWidth] = useState(0);

    useEffect(() => {
        setLineWidth(props.defaultValue);
    }, [props.defaultValue]);

    useEffect(() => {
        lineWidthSlider.current.addEventListener('change', e => onSetLineWidth(e.target.value));
    }, [onSetLineWidth]);
    const handleShowLineWidth = e => {
        setLineWidth(e.target.value);
    };

    return (
        <div id="lineWidthWrapper">
            <label htmlFor="lineWidthSetter">Line Width: </label>
            <input ref={lineWidthSlider} onChange={handleShowLineWidth} value={lineWidth} type="range" name="lineWidthSetter" min="0.1" max="5.0" step="0.1" />
            <span>{lineWidth.toString().length === 1 ? lineWidth + ".0" : lineWidth}</span>
        </div>
    );

}

/* Chart helper functions */
function milliToMinsSecs(ms) {
    let label;
    let numOfDays = Math.trunc(ms / 86400000);
    if (numOfDays > 0) {
        label = numOfDays + "d " + new Date(ms).toISOString().slice(11, 19);
    }
    else {
        label = new Date(ms).toISOString().slice(11, 19);
    }
    return label;
}
function calcEMA(series, smoothingWeight) {

    // calculate smoothness using the smoothingWeight divided by the max smoothness
    const smoothness = smoothingWeight / 100;

    // separate data from timestamps
    let time = series.map(a => a[0]);
    let data = series.map(a => a[1]);

    // first item is just first data item
    let emaData = [data[0]];

    // apply smoothing according to range and add to new EMA array    
    for (var i = 1; i < series.length; i++) {
        const emaResult = data[i] * (1 - smoothness) + emaData[i - 1] * (smoothness);
        emaData.push(emaResult.toFixed(4) * 1);
    }

    // recombine the new EMA array with the timestamp array
    let emaSeries = [];
    for (let i = 0; i < emaData.length; i++) {
        emaSeries.push([time[i], emaData[i]]);
    }

    // return final series for highcharts API
    return emaSeries;
}

export default Chart;
