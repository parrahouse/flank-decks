import { useMemo } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { cardLabel } from '@/lib/utils';
import { formatShortDate, formatSpan, formatDuration } from '@/lib/statsUtils';

const AXIS = { fontSize: 10, fill: 'hsl(var(--muted-foreground))' };
const GRID = 'hsl(var(--border))';

function MasteryTile({ label, card, spanMs, attempts, studyMs }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      {card ? (
        <div className="mt-1 space-y-1">
          {card.image_url && <img src={card.image_url} alt="" className="w-8 h-8 rounded object-cover" />}
          <div className="text-sm font-semibold truncate">{cardLabel(card)}</div>
          <div className="text-sm font-bold text-success">{formatSpan(spanMs)}</div>
          <div className="text-[11px] text-muted-foreground space-y-0.5">
            <div>{attempts != null ? `${attempts} attempts` : '—'}</div>
            <div>study time {formatDuration(studyMs)}</div>
          </div>
        </div>
      ) : (
        <div className="mt-1 text-sm text-muted-foreground">—</div>
      )}
    </div>
  );
}

export default function MasteryTimelineSection({ cardStats, cards }) {
  const { chartData, fastest, slowest } = useMemo(() => {
    const cardById = Object.fromEntries(cards.map((c) => [c.id, c]));
    const mastered = cardStats
      .filter((s) => s.mastered && s.mastered_at && s.first_studied_date)
      .map((s) => {
        const span = new Date(s.mastered_at) - new Date(s.first_studied_date);
        return { stat: s, card: cardById[s.card_id], span };
      })
      .filter((x) => isFinite(x.span) && x.span >= 0)
      .sort((a, b) => new Date(a.stat.mastered_at) - new Date(b.stat.mastered_at));

    let cum = 0;
    const cd = mastered.map((m) => {
      cum += 1;
      return { label: formatShortDate(m.stat.mastered_at), count: cum };
    });

    let fastest = null, slowest = null;
    mastered.forEach((m) => {
      if (!fastest || m.span < fastest.span) fastest = m;
      if (!slowest || m.span > slowest.span) slowest = m;
    });

    return { chartData: cd, fastest, slowest };
  }, [cardStats, cards]);

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-xl p-4">
        <div className="text-sm font-medium mb-1">Mastery timeline</div>
        <div className="text-[10px] text-muted-foreground mb-2">cumulative cards mastered</div>
        <div style={{ height: 200 }}>
          {chartData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 8, bottom: 0, left: -8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis allowDecimals={false} tick={AXIS} tickLine={false} axisLine={false} width={28} />
                <Tooltip />
                <Line type="step" dataKey="count" stroke="#16a34a" strokeWidth={2} dot={false} name="Mastered" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-full flex items-center justify-center text-xs text-muted-foreground">No mastered cards yet</div>
          )}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <MasteryTile
          label="Fastest mastery"
          card={fastest?.card}
          spanMs={fastest?.span}
          attempts={fastest?.stat.attempts_to_master}
          studyMs={fastest?.stat.study_time_to_master_ms}
        />
        <MasteryTile
          label="Slowest mastery"
          card={slowest?.card}
          spanMs={slowest?.span}
          attempts={slowest?.stat.attempts_to_master}
          studyMs={slowest?.stat.study_time_to_master_ms}
        />
      </div>
    </div>
  );
}