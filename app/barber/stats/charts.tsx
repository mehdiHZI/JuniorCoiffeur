"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type DailyChartRow = {
  label: string;
  booked: number;
  cancelled: number;
  arrived: number;
  noShow: number;
  pointsAdded: number;
  pointsRemoved: number;
};

export type NamedCount = { name: string; value: number };
export type PointBucket = { points: number; count: number };

const C = {
  booked: "#0d9488",
  cancelled: "#dc2626",
  arrived: "#15803d",
  noShow: "#c2410c",
  pointsAdd: "#2563eb",
  pointsRem: "#b45309",
  accent: "#b9932f",
  muted: "#9ca3af",
};

const cardShell: CSSProperties = {
  borderRadius: "16px",
  border: "1px solid rgba(185, 147, 47, 0.22)",
  background: "linear-gradient(145deg, #fffdf9 0%, #ffffff 55%, #f8f5ee 100%)",
  boxShadow: "0 12px 32px rgba(17, 24, 39, 0.06)",
  padding: "18px 16px 12px",
};

const titleStyle: CSSProperties = {
  fontSize: "14px",
  fontWeight: 700,
  color: "#1f2937",
  margin: "0 0 4px",
  letterSpacing: "-0.02em",
};

const subtitleStyle: CSSProperties = {
  fontSize: "12px",
  color: "#6b7280",
  margin: "0 0 14px",
};

function ChartCard({
  title,
  subtitle,
  children,
  minHeight,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
  minHeight: number;
}) {
  return (
    <div style={cardShell}>
      <h3 style={titleStyle}>{title}</h3>
      {subtitle ? <p style={subtitleStyle}>{subtitle}</p> : null}
      <div style={{ width: "100%", height: minHeight }}>{children}</div>
    </div>
  );
}

const tooltipStyle = {
  borderRadius: "10px",
  border: "1px solid #e5e7eb",
  boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
};

export function DailyFlowChart({ data }: { data: DailyChartRow[] }) {
  const gid = useId().replace(/:/g, "");
  if (data.length === 0) return null;
  return (
    <ChartCard
      title="Flux quotidien"
      subtitle="RDV pris, annulations et passages (venu / absent)"
      minHeight={320}
    >
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <defs>
            <linearGradient id={`gBooked-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.booked} stopOpacity={0.35} />
              <stop offset="100%" stopColor={C.booked} stopOpacity={0.02} />
            </linearGradient>
            <linearGradient id={`gArrived-${gid}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={C.arrived} stopOpacity={0.32} />
              <stop offset="100%" stopColor={C.arrived} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 6" stroke="#ece8df" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={{ stroke: "#e7e2d6" }} />
          <YAxis tick={{ fontSize: 11, fill: C.muted }} width={32} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} labelStyle={{ fontWeight: 600, color: "#111" }} />
          <Legend wrapperStyle={{ fontSize: "12px", paddingTop: 8 }} />
          <Area type="monotone" dataKey="booked" name="RDV pris" stroke={C.booked} strokeWidth={2} fill={`url(#gBooked-${gid})`} />
          <Line type="monotone" dataKey="cancelled" name="Annulés" stroke={C.cancelled} strokeWidth={2} dot={false} />
          <Area type="monotone" dataKey="arrived" name="Venus" stroke={C.arrived} strokeWidth={2} fill={`url(#gArrived-${gid})`} />
          <Line type="monotone" dataKey="noShow" name="Absents" stroke={C.noShow} strokeWidth={2} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function PointsFlowChart({ data }: { data: DailyChartRow[] }) {
  if (data.length === 0) return null;
  return (
    <ChartCard title="Points fidélité" subtitle="Volume ajouté vs retiré par jour (transactions coiffeur)" minHeight={280}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }} barGap={2}>
          <CartesianGrid strokeDasharray="3 6" stroke="#ece8df" vertical={false} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: C.muted }} tickLine={false} axisLine={{ stroke: "#e7e2d6" }} />
          <YAxis tick={{ fontSize: 11, fill: C.muted }} width={36} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} />
          <Legend wrapperStyle={{ fontSize: "12px", paddingTop: 8 }} />
          <Bar dataKey="pointsAdded" name="Points +" fill={C.pointsAdd} radius={[6, 6, 0, 0]} maxBarSize={28} />
          <Bar dataKey="pointsRemoved" name="Points −" fill={C.pointsRem} radius={[6, 6, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function WeekdayBookingsChart({ data }: { data: NamedCount[] }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <ChartCard title="RDV par jour de la semaine" subtitle="Répartition des réservations sur la période" minHeight={260}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 12, left: 4, bottom: 4 }} barSize={14}>
          <CartesianGrid strokeDasharray="3 6" stroke="#ece8df" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: C.muted }} allowDecimals={false} domain={[0, max]} />
          <YAxis type="category" dataKey="name" width={72} tick={{ fontSize: 11, fill: "#374151" }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => [v, "RDV"]} />
          <Bar dataKey="value" fill="#b9932f" radius={[0, 8, 8, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function HourlyPeakChart({ data }: { data: NamedCount[] }) {
  return (
    <ChartCard title="Heures de créneau réservées" subtitle="Basé sur l’heure de début du créneau" minHeight={260}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: data.length > 10 ? 52 : 8 }}>
          <CartesianGrid strokeDasharray="3 6" stroke="#ece8df" vertical={false} />
          <XAxis
            dataKey="name"
            tick={{ fontSize: 10, fill: C.muted }}
            tickLine={false}
            axisLine={{ stroke: "#e7e2d6" }}
            interval={0}
            angle={data.length > 8 ? -30 : 0}
            textAnchor={data.length > 8 ? "end" : "middle"}
            height={data.length > 8 ? 48 : 28}
          />
          <YAxis tick={{ fontSize: 11, fill: C.muted }} width={28} tickLine={false} axisLine={false} allowDecimals={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => [v, "RDV"]} />
          <Bar dataKey="value" fill={C.accent} radius={[8, 8, 0, 0]} maxBarSize={40} />
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

const PIE_COLORS = [C.arrived, C.noShow];

export function OutcomesDonutChart({ arrived, noShow }: { arrived: number; noShow: number }) {
  const data = [
    { name: "Venus", value: arrived },
    { name: "Absents", value: noShow },
  ].filter((d) => d.value > 0);
  const total = arrived + noShow;
  if (total === 0) {
    return (
      <ChartCard title="Issues RDV" subtitle="Venus vs absents (RDV clôturés)" minHeight={240}>
        <p style={{ fontSize: "13px", color: "#6b7280", margin: "40px 0 0", textAlign: "center" }}>Pas encore de passages enregistrés sur la période.</p>
      </ChartCard>
    );
  }
  return (
    <ChartCard title="Issues RDV" subtitle="Part des clients venus vs absents" minHeight={260}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={58}
            outerRadius={82}
            paddingAngle={3}
            dataKey="value"
            stroke="#fff"
            strokeWidth={2}
          >
            {data.map((_, i) => (
              <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string, n: string) => [v, n]} />
          <Legend wrapperStyle={{ fontSize: "12px" }} verticalAlign="bottom" />
        </PieChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}

export function PrestationPointsChart({ buckets }: { buckets: PointBucket[] }) {
  if (buckets.length === 0) {
    return (
      <ChartCard title="RDV par volume de points" subtitle="Prestations classées par montant de points" minHeight={200}>
        <p style={{ fontSize: "13px", color: "#6b7280", margin: "32px 0 0", textAlign: "center" }}>Aucune donnée sur la période.</p>
      </ChartCard>
    );
  }
  const rows = buckets.map((b) => ({ name: `${b.points} pts`, value: b.count }));
  return (
    <ChartCard title="RDV par volume de points" subtitle="Nombre de passages par tarif en points" minHeight={240}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }} barSize={18}>
          <CartesianGrid strokeDasharray="3 6" stroke="#ece8df" horizontal={false} />
          <XAxis type="number" tick={{ fontSize: 11, fill: C.muted }} allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={56} tick={{ fontSize: 11, fill: "#374151" }} tickLine={false} axisLine={false} />
          <Tooltip contentStyle={tooltipStyle} formatter={(v: number | string) => [v, "RDV"]} />
          <Bar dataKey="value" radius={[0, 10, 10, 0]}>
            {rows.map((_, i) => (
              <Cell key={i} fill={i === 0 ? "#b9932f" : i === 1 ? "#0f766e" : "#64748b"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </ChartCard>
  );
}
