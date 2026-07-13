import { EthDateTime } from 'ethiopian-calendar-date-converter';

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

export function getWeeklyBounds(periodStart: string): { start: string; end: string } {
  const startDate = new Date(`${periodStart}T00:00:00.000Z`);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error("Invalid weekly payroll start date");
  }

  const endDate = new Date(startDate);
  endDate.setUTCDate(startDate.getUTCDate() + 6);

  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}

export function getEthiopianMonthlyBounds(ethYear: number, ethMonth: number): { start: string; end: string } {
  const startEth = new EthDateTime(ethYear, ethMonth, 1);
  const startDate = startEth.toEuropeanDate();

  // Ethiopian months 1-12 have 30 days. Month 13 (Pagume) has 5 or 6.
  let daysInMonth = 30;
  if (ethMonth === 13) {
    // Ethiopian leap year: year % 4 === 3 (years 3, 7, 11, …)
    daysInMonth = (ethYear % 4 === 3) ? 6 : 5;
  }

  const endEth = new EthDateTime(ethYear, ethMonth, daysInMonth);
  const endDate = endEth.toEuropeanDate();

  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}

export function getEthiopianWeeklyBounds(ethYear: number, ethMonth: number, ethDate: number): { start: string; end: string } {
  const startEth = new EthDateTime(ethYear, ethMonth, ethDate);
  const startDate = startEth.toEuropeanDate();

  const endDate = new Date(startDate);
  endDate.setUTCDate(startDate.getUTCDate() + 6);

  return {
    start: startDate.toISOString().slice(0, 10),
    end: endDate.toISOString().slice(0, 10),
  };
}
