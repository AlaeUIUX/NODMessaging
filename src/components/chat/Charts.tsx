"use client";

import type { ReactNode } from "react";
import {
  Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, LabelList, Line, Pie, PieChart, ReferenceDot, ReferenceLine,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import c from "./charts.module.css";

/**
 * The dashboard's charts, drawn at their real size (never stretched) and
 * alive under the finger: a crosshair and a readout on lines and areas, a
 * readout per mark on bars and donuts. One look everywhere: 2px lines, a 10%
 * wash under an area, columns at most 22px wide with 4px rounded tops, a 2px
 * gap between touching pieces, hairline grid, labels in ink (never the
 * series colour). Every chart stops its taps here, so exploring one doesn't
 * also open the widget's sheet.
 */

export type Trend = "line" | "area" | "bars";
/** One step along a series: its place on the axis, what the readout calls it, its value (and last period's). */
export interface Point { x: string; label: string; value?: number; compare?: number; color?: string }
export interface Part { key: string; label: string; value: number; color: string }

const ACCENT = "var(--accent)";
const TICK = { fill: "var(--ink-3)", fontSize: 10 };

/* ---- the readout ---- */

interface TipItem { dataKey?: string | number; value?: number | string; color?: string; payload?: Point & Partial<Part> }
/** A tooltip's entries, read as what the readout needs. */
const items = (payload: unknown) => (payload ?? []) as readonly TipItem[];

/** Values lead, names follow; each row keyed by a short line of its colour. */
function Readout({ active, payload, format, names, title }: {
  active?: boolean;
  payload?: readonly TipItem[];
  format: (n: number) => string;
  names: Record<string, string>;
  title?: (p: TipItem) => string;
}) {
  if (!active || !payload?.length) return null;
  const rows = payload.filter((p) => typeof p.value === "number");
  if (!rows.length) return null;
  const head = title ? title(rows[0]) : rows[0].payload?.label;
  return (
    <div className={c.tip}>
      {head && <b>{head}</b>}
      {rows.map((p) => {
        const key = String(p.dataKey ?? "");
        return (
          <span key={key} className={c.tipRow}>
            <i style={{ background: p.payload?.color && key === "value" && !names.value ? p.payload.color : p.color }} />
            <strong>{format(p.value as number)}</strong>
            {names[key] && <em>{names[key]}</em>}
          </span>
        );
      })}
    </div>
  );
}

/** Current series first in a readout, then the comparison. */
const currentFirst = (item: { dataKey?: unknown }) => (item.dataKey === "value" ? 0 : 1);

/**
 * Axis labels in ink-3; on a line or an area the first and last sit inside
 * the chart (anchored at their edge) instead of being cut in half.
 */
function tickAt(ticks: string[], format: ((x: string) => string) | undefined, edges: boolean) {
  function AxisTick(props: { x?: number | string; y?: number | string; payload?: { value: string } }) {
    const v = String(props.payload?.value ?? "");
    const i = ticks.indexOf(v);
    const anchor = edges && i === 0 ? "start" : edges && i === ticks.length - 1 ? "end" : "middle";
    return <text x={Number(props.x)} y={Number(props.y)} dy={10} textAnchor={anchor} fill="var(--ink-3)" fontSize={10}>{format ? format(v) : v}</text>;
  }
  return AxisTick;
}

/** Taps on a chart explore it; they don't open the widget. */
const keep = (e: React.MouseEvent) => e.stopPropagation();

/* ---- a series over time ---- */

/**
 * A line, an area or columns over time, with a faint comparison series
 * (last month, last week) when there is one. `mini` drops the axes and the
 * readout: a sparkline for a small widget.
 */
export function TrendChart({ data, kind, format, axisFormat, xFormat, names, mini, xTicks, yAxis, average, endDot = true }: {
  data: Point[];
  kind: Trend;
  format: (n: number) => string;
  /** Shorter figures for the y axis ("€200"). */
  axisFormat?: (n: number) => string;
  /** What an x value reads as under the chart. */
  xFormat?: (x: string) => string;
  /** What each series is called in the readout: { value: "This month", compare: "Last month" }. */
  names: Record<string, string>;
  mini?: boolean;
  /** Which x values get a label under the chart; none hides the axis. */
  xTicks?: string[];
  yAxis?: boolean;
  /** A hairline at the average, labelled. */
  average?: number;
  /** A dot where the current series ends (today). */
  endDot?: boolean;
}) {
  const hasCompare = data.some((p) => typeof p.compare === "number");
  const last = [...data].reverse().find((p) => typeof p.value === "number");
  const area = kind === "area";
  return (
    <div className={c.box} onClick={mini ? undefined : keep}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: mini ? 3 : 10, right: yAxis ? 2 : 6, bottom: 0, left: 6 }} barCategoryGap="22%">
          {!mini && <CartesianGrid vertical={false} stroke="var(--line)" />}
          <XAxis
            dataKey="x"
            hide={!xTicks}
            ticks={xTicks}
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={xTicks ? tickAt(xTicks, xFormat, kind !== "bars") : TICK}
            tickMargin={4}
            height={xTicks ? 22 : 0}
          />
          <YAxis
            hide={!yAxis}
            orientation="right"
            width={44}
            tickCount={3}
            tickLine={false}
            axisLine={false}
            tick={TICK}
            tickFormatter={(n: number) => (axisFormat ?? format)(n)}
          />
          {!mini && (
            <Tooltip
              cursor={kind === "bars" ? { fill: "color-mix(in srgb, var(--ink) 5%, transparent)", radius: 6 } : { stroke: "var(--ink-3)", strokeWidth: 1 }}
              content={(p) => <Readout active={p.active} payload={items(p.payload)} format={format} names={names} />}
              itemSorter={currentFirst}
              isAnimationActive={false}
              offset={12}
            />
          )}
          {average !== undefined && !mini && (
            <ReferenceLine y={average} stroke="var(--ink-3)" strokeOpacity={0.45} label={{ value: `avg ${format(Math.round(average * 10) / 10)}`, position: "insideTopLeft", fill: "var(--ink-3)", fontSize: 10 }} />
          )}
          {hasCompare && kind !== "bars" && (
            <Line
              dataKey="compare"
              type="monotone"
              stroke="var(--ink-3)"
              strokeOpacity={0.55}
              strokeWidth={1.5}
              dot={false}
              activeDot={mini ? false : { r: 3.5, fill: "var(--ink-3)", stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={!mini}
              connectNulls
            />
          )}
          {kind === "bars" ? (
            <Bar dataKey="value" fill={ACCENT} radius={[4, 4, 0, 0]} maxBarSize={mini ? 8 : 22} isAnimationActive={!mini}>
              {data.map((p) => <Cell key={p.x} fill={p.color ?? ACCENT} />)}
            </Bar>
          ) : area ? (
            <Area
              dataKey="value"
              type="monotone"
              stroke={ACCENT}
              strokeWidth={2}
              fill={ACCENT}
              fillOpacity={0.1}
              dot={false}
              activeDot={mini ? false : { r: 4.5, fill: ACCENT, stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={!mini}
            />
          ) : (
            <Line
              dataKey="value"
              type="monotone"
              stroke={ACCENT}
              strokeWidth={2}
              dot={false}
              activeDot={mini ? false : { r: 4.5, fill: ACCENT, stroke: "var(--surface)", strokeWidth: 2 }}
              isAnimationActive={!mini}
            />
          )}
          {endDot && kind !== "bars" && last && (
            <ReferenceDot x={last.x} y={last.value} r={mini ? 3 : 4.5} fill={ACCENT} stroke="var(--surface)" strokeWidth={2} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

/* ---- parts of a whole ---- */

/** A ring of parts, its total (or anything) in the middle; each piece has its readout. */
export function DonutChart({ parts, center, format, mini }: { parts: Part[]; center?: ReactNode; format: (n: number) => string; mini?: boolean }) {
  const shown = parts.filter((p) => p.value > 0);
  const data = shown.length ? shown : [{ key: "none", label: "Nothing yet", value: 1, color: "var(--fill-2)" }];
  return (
    <div className={c.donut} onClick={mini ? undefined : keep}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="label"
            innerRadius="70%"
            outerRadius="100%"
            paddingAngle={shown.length > 1 ? 3 : 0}
            cornerRadius={4}
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={!mini}
          >
            {data.map((p) => <Cell key={p.key} fill={p.color} />)}
          </Pie>
          {!mini && shown.length > 0 && (
            <Tooltip
              content={(p) => <Readout active={p.active} payload={items(p.payload)} format={format} names={{}} title={(t) => t.payload?.label ?? ""} />}
              isAnimationActive={false}
            />
          )}
        </PieChart>
      </ResponsiveContainer>
      {center && <div className={c.center}>{center}</div>}
    </div>
  );
}

/** Columns, one per part, each with its figure on the cap. */
export function PartBars({ parts, format, mini }: { parts: Part[]; format: (n: number) => string; mini?: boolean }) {
  return (
    <div className={c.box} onClick={mini ? undefined : keep}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={parts} margin={{ top: mini ? 2 : 16, right: 4, bottom: 0, left: 4 }} barCategoryGap="24%">
          {!mini && <CartesianGrid vertical={false} stroke="var(--line)" />}
          <XAxis dataKey="label" hide={mini} interval={0} tickLine={false} axisLine={false} tick={TICK} tickMargin={6} height={mini ? 0 : 22} />
          <YAxis hide domain={[0, "dataMax"]} />
          {!mini && (
            <Tooltip
              cursor={{ fill: "color-mix(in srgb, var(--ink) 5%, transparent)", radius: 6 }}
              content={(p) => <Readout active={p.active} payload={items(p.payload)} format={format} names={{}} />}
              isAnimationActive={false}
            />
          )}
          <Bar dataKey="value" radius={[4, 4, 0, 0]} maxBarSize={mini ? 10 : 22} minPointSize={2} isAnimationActive={!mini}>
            {parts.map((p) => <Cell key={p.key} fill={p.color} />)}
            {!mini && <LabelList dataKey="value" position="top" offset={6} fill="var(--ink-2)" fontSize={11} formatter={(v) => (typeof v === "number" ? format(v) : "")} />}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** One bar split into its parts (2px gaps between them), with a readout for every part. */
export function StackedBar({ parts, format, height = 12 }: { parts: Part[]; format: (n: number) => string; height?: number }) {
  const shown = parts.filter((p) => p.value > 0);
  const row = Object.fromEntries([["row", "all"], ...shown.map((p) => [p.key, p.value])]);
  return (
    <div className={c.stacked} style={{ height: height + 4 }} onClick={keep}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={[row]} layout="vertical" margin={{ top: 2, right: 0, bottom: 2, left: 0 }} barCategoryGap={0}>
          <XAxis type="number" hide domain={[0, "dataMax"]} />
          <YAxis type="category" dataKey="row" hide />
          <Tooltip
            cursor={false}
            content={(p) => {
              const payload = items(p.payload);
              const names = Object.fromEntries(shown.map((x) => [x.key, x.label]));
              return <Readout active={p.active} payload={payload} format={format} names={names} title={() => `${format(shown.reduce((n, x) => n + x.value, 0))} in all`} />;
            }}
            isAnimationActive={false}
          />
          {shown.map((p, i) => (
            <Bar
              key={p.key}
              dataKey={p.key}
              stackId="all"
              fill={p.color}
              stroke="var(--surface)"
              strokeWidth={2}
              barSize={height}
              radius={shown.length === 1 ? 6 : i === 0 ? [6, 0, 0, 6] : i === shown.length - 1 ? [0, 6, 6, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
