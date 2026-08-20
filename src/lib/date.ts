export function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function formatDate(date: string | null | undefined) {
  if (!date) return "Sem data";
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(
    new Date(`${date}T12:00:00`),
  );
}

export function daysUntil(date: string) {
  const today = new Date();
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const target = new Date(`${date}T12:00:00`).getTime();
  return Math.ceil((target - start) / 86_400_000);
}

export function weekDays(reference = new Date()) {
  const day = reference.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return Array.from({ length: 5 }, (_, index) => {
    const date = new Date(reference);
    date.setDate(reference.getDate() + mondayOffset + index);
    return date;
  });
}
