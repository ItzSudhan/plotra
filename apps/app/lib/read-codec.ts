// JSON that keeps Dates, which server actions' wire format did for us.

const DATE = "$date";

export function encode(value: unknown): string {
  return JSON.stringify(value, function (key, v) {
    const raw = (this as Record<string, unknown>)[key];
    return raw instanceof Date ? { [DATE]: raw.toISOString() } : v;
  });
}

export function decode<T>(text: string): T {
  return JSON.parse(text, (_, v) =>
    v && typeof v === "object" && typeof v[DATE] === "string" && Object.keys(v).length === 1 ? new Date(v[DATE]) : v,
  );
}
