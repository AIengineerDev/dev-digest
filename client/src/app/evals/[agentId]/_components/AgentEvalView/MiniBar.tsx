import { s } from "./styles";

/** Bar + number, as in design-mocks/src/14-screen_skills.jsx (`MiniBar`).
 *  A bare percentage in a table of six numbers is unreadable; the bar is what
 *  makes one run's shape comparable to the row above it at a glance. */
export function MiniBar({ value, color }: { value: number | null; color: string }) {
  const v = value ?? 0;
  return (
    <span style={s.bar}>
      <span style={s.barTrack}>
        <span style={s.barFill(v, color)} />
      </span>
      <span className="tnum" style={s.barNum}>
        {Math.round(v * 100)}%
      </span>
    </span>
  );
}
