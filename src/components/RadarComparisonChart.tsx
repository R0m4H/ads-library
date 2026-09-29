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

  useEffect(() => {
    if (!canvasRef.current) return;
    chartRef.current?.destroy();

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
        scales: { r: { beginAtZero: true, max: 100, ticks: { display: false } } },
        plugins: { legend: { position: "top" } },
      },
    };

    chartRef.current = new Chart(canvasRef.current, config);
    return () => chartRef.current?.destroy();
  }, [labels, series]);

  return (
    <div style={{ position: "relative", height: 400 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
