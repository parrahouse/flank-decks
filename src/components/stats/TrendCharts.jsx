import { useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { formatShortDate, formatClockMs, formatDuration, capped } from '@/lib/statsUtils';

const AXIS = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };
const GRID = 'hsl(var(--border))';

function ChartCard({ title, children, note }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-sm font-medium mb-1">{title}</div>
      {note && <div className="text-[10px] text-muted-foreground mb-2">{note}</div>}
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">{children}</ResponsiveContainer>
      </div>
    </div>
  );
}

export default function TrendCharts({ sessionsAsc }) {
  const scoreData = useMemo(() => {
    const arr = sessionsAsc.map((s, i) => {
      const window = sessionsAsc.slice(Math.max(0, i - 4), i + 1);
      const ma = window.reduce((a, b) => a + (b.score_pct || 0), 0) / window.length;
      return { label: formatShortDate(s.created_date), score: Math.round(s.score_pct || 0), ma: Math.round(ma) };
    });
    return arr;
  }, [sessionsAsc]);

  const paceData = useMemo(() => {
    const arr = [];
    sessionsAsc.forEach((s) => {
      const times = (s.card_results || []).map((r) => capped(r.time_to_answer_ms)).filter((t) => t != null);
      if (times.length) {
        const avg = times.reduce((a, b) => a + b, 0) / times.length;
        arr.push({ label: formatShortDate(s.created_date), pace: Math.round(avg), raw: Math.round(avg) });
      }
    });
    return arr;
  }, [sessionsAsc]);

  const studyTimeData = useMemo(() => {
    const map = {};
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      map[key] = 0;
    }
    sessionsAsc.forEach((s) => {
      if (s.duration_ms == null) return;
      const key = new Date(s.created_date).toISOString().slice(0, 10);
      if (key in map) map[key] += s.duration_ms;
    });
    return Object.entries(map).map(([key, ms]) => ({
      label: new Date(key).toLocaleDateString(undefined, { month: 'numeric', day: 'numeric' }),
      minutes: Math.round(ms / 60000),
    }));
  }, [sessionsAsc]);

  const timedSessions = paceData.length;
  const totalSessions = sessionsAsc.length;

  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <ChartCard title="Score trend" note="5-session moving average">
          <LineChart data={scoreData} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
            <YAxis domain={[0, 100]} tick={AXIS} tickLine={false} axisLine={false} width={28} />
            <Tooltip />
            <Line type="monotone" dataKey="score" stroke="#1d4ed8" strokeWidth={2} dot={false} name="Score %" />
            <Line type="monotone" dataKey="ma" stroke="#f59e0b" strokeWidth={1.5} strokeDasharray="4 3" dot={false} name="5-sess avg" />
          </LineChart>
        </ChartCard>

        <ChartCard title="Pace trend" note={timedSessions < totalSessions ? `timed sessions only · ${timedSessions} of ${totalSessions}` : 'avg answer time per session'}>
          {paceData.length ? (
            <LineChart data={paceData} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
              <YAxis tickFormatter={(v) => `${Math.round(v / 1000)}s`} tick={AXIS} tickLine={false} axisLine={false} width={28} />
              <Tooltip formatter={(v) => formatClockMs(v)} />
              <Line type="monotone" dataKey="pace" stroke="#1d4ed8" strokeWidth={2} dot={false} name="Avg time" />
            </LineChart>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No timed sessions yet</div>
          )}
        </ChartCard>
      </div>

      <ChartCard title="Study time by day" note="last 30 days · minutes">
        <BarChart data={studyTimeData} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
          <YAxis tickFormatter={(v) => formatDuration(v * 60000)} tick={AXIS} tickLine={false} axisLine={false} width={28} />
          <Tooltip formatter={(v) => formatDuration(v * 60000)} />
          <Bar dataKey="minutes" fill="#60a5fa" radius={[2, 2, 0, 0]} />
        </BarChart>
      </ChartCard>
    </div>
  );
}