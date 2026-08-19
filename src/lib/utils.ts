export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function yesterdayKey(date = new Date()) {
  return addDays(date, -1).toISOString().slice(0, 10);
}

export function weekStartKey(date = new Date()) {
  const copy = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = copy.getUTCDay();
  const offset = day === 0 ? 6 : day - 1;
  copy.setUTCDate(copy.getUTCDate() - offset);
  return copy.toISOString().slice(0, 10);
}

export function weekKeys(date = new Date()) {
  const start = weekStartKey(date);
  const base = new Date(`${start}T00:00:00.000Z`);
  return Array.from({ length: 7 }, (_, index) => addDays(base, index).toISOString().slice(0, 10));
}

export function normalizeAnswer(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[!.?,，。！？'"`~]/g, "")
    .replace(/\s+/g, " ");
}

export function answersMatch(expected: string | string[], given: string) {
  const normalized = normalizeAnswer(given);
  const list = Array.isArray(expected) ? expected : [expected];
  return list.some((item) => normalizeAnswer(item) === normalized);
}

export function shuffle<T>(items: T[]) {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[swap]] = [copy[swap], copy[index]];
  }
  return copy;
}

export function pickDistractors(pool: string[], answer: string, count: number) {
  const unique = Array.from(new Set(pool.filter((item) => item !== answer)));
  return shuffle(unique).slice(0, count);
}

export function levelFromXp(xp: number) {
  return Math.floor(xp / 100) + 1;
}

export function xpIntoLevel(xp: number) {
  return xp % 100;
}

export function leagueFromWeeklyXp(xp: number) {
  if (xp >= 500) return { name: "Sakura", emoji: "🌸", color: "#ff4b8b" };
  if (xp >= 300) return { name: "Gold", emoji: "🥇", color: "#ffc800" };
  if (xp >= 150) return { name: "Silver", emoji: "🥈", color: "#9aa4b2" };
  if (xp >= 50) return { name: "Bronze", emoji: "🥉", color: "#cd7f32" };
  return { name: "Seedling", emoji: "🌱", color: "#58cc02" };
}

export function uid(prefix = "id") {
  return `${prefix}_${crypto.randomUUID()}`;
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
