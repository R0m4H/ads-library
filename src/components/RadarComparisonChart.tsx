"use client";

import { useEffect, useRef } from "react";
import { Chart, type ChartConfiguration } from "chart.js/auto";

export function RadarComparisonChart({
  labels,
  series,
}: {
  labels: string[];
  series: { name: string; color: string; data: number[] }[];
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);

  // `labels`/`series` are rebuilt on every parent render, so depending on them directly
  // would destroy and re-animate the chart on any unrelated state change. Compare by content.
  const dataKey = JSON.stringify({ labels, series });

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const config: ChartConfiguration<"radar"> = {
      type: "radar",
      data: {
        labels,
        datasets: series.map((s) => ({
          label: s.name,
          data: s.data,
          borderColor: s.color,
          backgroundColor: `${s.color}26`, // ~15% alpha fill
          pointBackgroundColor: s.color,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reduceMotion ? false : undefined,
        scales: { r: { beginAtZero: true, max: 100, ticks: { display: false } } },
        plugins: { legend: { position: "top" } },
      },
    };

    chartRef.current = new Chart(canvasRef.current, config);
    return () => chartRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  return (
    <div style={{ position: "relative", height: 400 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
