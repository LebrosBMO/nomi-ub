/**
 * Opening hours as the owner sets them, day by day (the business page), and the one line the app shows on a card. Typed-in
 * hours came back as anything at all — "өглөө 10-оос", a Facebook bio, a phone number — so the page asks the way Google and
 * Facebook do, and this turns the answer into the same shape the catalog already holds (`hoursClaim`).
 */
export const DAYS = ['Да', 'Мя', 'Лх', 'Пү', 'Ба', 'Бя', 'Ня'] as const;
export type Day = (typeof DAYS)[number];
export type DayHours = { closed: boolean; allDay: boolean; open: string; close: string };
export type Week = DayHours[];

export const CLOSED_LABEL = 'амарна';
export const ALL_DAY_LABEL = '24 цаг';
/** Half-hour steps, which is as fine as any shop states its hours. */
export const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

/** Monday to Friday nine to six, Saturday short, Sunday shut: the most common week, there to be corrected. */
export const defaultWeek = (): Week =>
  DAYS.map((_, index) => ({
    closed: index === 6,
    allDay: false,
    open: index === 5 ? '10:00' : '09:00',
    close: index === 5 ? '16:00' : '18:00',
  }));

/** What one day says on a card: "09:00-18:00", "24 цаг" or "амарна". */
export const dayText = (day: DayHours) => (day.closed ? CLOSED_LABEL : day.allDay ? ALL_DAY_LABEL : `${day.open}-${day.close}`);

/**
 * The week as one line, with consecutive days that agree joined: "Да-Ба 09:00-18:00, Бя 10:00-16:00, Ня амарна".
 * A week that is open around the clock throughout is just "24 цаг"; a week with nothing open at all is empty, since a
 * business that is never open has nothing to publish.
 */
export function formatHours(week: Week): string {
  if (week.length !== DAYS.length) return '';
  if (week.every((day) => day.closed)) return '';
  if (week.every((day) => !day.closed && day.allDay)) return ALL_DAY_LABEL;
  const groups: { from: number; to: number; text: string }[] = [];
  week.forEach((day, index) => {
    const text = dayText(day);
    const last = groups[groups.length - 1];
    if (last && last.text === text && last.to === index - 1) last.to = index;
    else groups.push({ from: index, to: index, text });
  });
  return groups.map((g) => `${g.from === g.to ? DAYS[g.from] : `${DAYS[g.from]}-${DAYS[g.to]}`} ${g.text}`).join(', ');
}
