export type DeadlineState = 'SAFE' | 'AT_RISK_6D' | 'CRITICAL' | 'OVERDUE';
export interface DeadlineInfo { state: DeadlineState; explanation: string; dueAt: string; synthetic: boolean; }
function parseIso(value: string, label: string): number {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) throw new Error(`${label} must be a valid ISO date/time.`);
  return ms;
}
export function getDeadlineInfo(nowIso: string, dueIso: string, bufferHours = 48, synthetic = true): DeadlineInfo {
  if (!Number.isFinite(bufferHours) || bufferHours < 0) throw new Error('bufferHours must be finite and non-negative.');
  const now = parseIso(nowIso, 'nowIso'); const due = parseIso(dueIso, 'dueIso');
  const remaining = due - now; const days = Math.round((remaining / 86400000) * 10) / 10;
  let state: DeadlineState;
  if (remaining < 0) state = 'OVERDUE';
  else if (remaining <= bufferHours * 3600000) state = 'CRITICAL';
  else if (remaining <= 6 * 86400000) state = 'AT_RISK_6D';
  else state = 'SAFE';
  const explanation = state === 'OVERDUE' ? `The configured due date passed ${Math.abs(days)} day(s) ago.` : `${days} day(s) remain until the configured due date.`;
  return { state, explanation: `${explanation}${synthetic ? ' This is a synthetic demo deadline, not official tax guidance.' : ''}`, dueAt: dueIso, synthetic };
}
