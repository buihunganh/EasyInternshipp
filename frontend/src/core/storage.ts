export function read<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(`internships:${key}`) || 'null') ?? fallback; }
  catch { return fallback; }
}
export function write(key: string, value: unknown) {
  localStorage.setItem(`internships:${key}`, JSON.stringify(value));
}
