export function getMonthlyBounds(year: number, month: number): { start: string; end: string } {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0));
  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}

export function getHalfMonthBounds(year: number, month: number, isSecondHalf: boolean): { start: string; end: string } {
  if (!isSecondHalf) {
    const startDate = new Date(Date.UTC(year, month - 1, 1));
    const endDate = new Date(Date.UTC(year, month - 1, 15));
    return {
      start: startDate.toISOString().slice(0, 10),
      end: endDate.toISOString().slice(0, 10),
    };
  } else {
    const startDate = new Date(Date.UTC(year, month - 1, 16));
    const endDate = new Date(Date.UTC(year, month, 0));
    return {
      start: startDate.toISOString().slice(0, 10),
      end: endDate.toISOString().slice(0, 10),
    };
  }
}
