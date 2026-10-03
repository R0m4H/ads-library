"use client";

import { useEffect, useRef } from "react";
import { Chart, type ChartConfiguration } from "chart.js/auto";

export const BRAND_COLORS = ["#111827", "#2563eb", "#dc2626", "#16a34a", "#d97706", "#7c3aed", "#0891b2", "#db2777"];

export function ThemeComparisonChart({
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

    const config: ChartConfiguration<"bar"> = {
      type: "bar",
      data: {
        labels,
        datasets: series.map((s) => ({
          label: s.name,
          data: s.data,
          backgroundColor: s.color,
          borderRadius: 4,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: reduceMotion ? false : undefined,
        plugins: { legend: { position: "top" } },
        scales: { y: { beginAtZero: true, title: { display: true, text: "Ads" } } },
      },
    };

    chartRef.current = new Chart(canvasRef.current, config);
    return () => chartRef.current?.destroy();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  return (
    <div style={{ position: "relative", height: 360 }}>
      <canvas ref={canvasRef} />
    </div>
  );
}
