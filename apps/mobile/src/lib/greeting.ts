/** "Good morning", "Good afternoon" or "Good evening"; nothing in the small hours. As the desktop app greets (apps/desktop/static/chooser.html). Pure. */
export function partOfDay(hour: number): string | null {
  if (hour < 5) return null;
  return hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}
