// 범례 토글 상태 helper (QAIL useProgressLegend 이식).
import { useCallback, useMemo, useState } from "react";

export interface ProgressLegendToggles {
  hidden: Set<string>;
  hiddenMetrics: Set<string>;
  hiddenSeries: Set<string>;
  toggleMetric: (metricKey: string) => void;
  toggleSeries: (seriesKey: string) => void;
  reset: () => void;
  canReset: boolean;
}

export function useProgressLegend(opts: {
  metricKeys: string[];
  seriesKeys: string[];
  dataKey: (metricKey: string, seriesKey: string) => string;
}): ProgressLegendToggles {
  const { metricKeys, seriesKeys, dataKey } = opts;
  const [hidden, setHidden] = useState<Set<string>>(new Set());

  const flip = useCallback((keys: string[]) => {
    setHidden((prev) => {
      const next = new Set(prev);
      const allHidden = keys.length > 0 && keys.every((k) => next.has(k));
      for (const k of keys) {
        if (allHidden) next.delete(k);
        else next.add(k);
      }
      return next;
    });
  }, []);

  const toggleMetric = useCallback((m: string) => flip(seriesKeys.map((s) => dataKey(m, s))), [flip, seriesKeys, dataKey]);
  const toggleSeries = useCallback((s: string) => flip(metricKeys.map((m) => dataKey(m, s))), [flip, metricKeys, dataKey]);
  const reset = useCallback(() => setHidden(new Set()), []);

  const hiddenMetrics = useMemo(() => {
    const out = new Set<string>();
    for (const m of metricKeys) {
      const keys = seriesKeys.map((s) => dataKey(m, s));
      if (keys.length > 0 && keys.every((k) => hidden.has(k))) out.add(m);
    }
    return out;
  }, [metricKeys, seriesKeys, dataKey, hidden]);

  const hiddenSeries = useMemo(() => {
    const out = new Set<string>();
    for (const s of seriesKeys) {
      const keys = metricKeys.map((m) => dataKey(m, s));
      if (keys.length > 0 && keys.every((k) => hidden.has(k))) out.add(s);
    }
    return out;
  }, [metricKeys, seriesKeys, dataKey, hidden]);

  return { hidden, hiddenMetrics, hiddenSeries, toggleMetric, toggleSeries, reset, canReset: hidden.size > 0 };
}
