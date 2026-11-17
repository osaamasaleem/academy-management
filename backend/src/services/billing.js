/**
 * Billing engine utility functions (Asia/Karachi timezone, BR-1 to BR-5)
 */

export function getLastDayOfMonth(year, month) {
  // month is 1-indexed (1 to 12)
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function clampDueDay(year, month, dueDay) {
  const lastDay = getLastDayOfMonth(year, month);
  return Math.min(Math.max(1, dueDay), lastDay);
}

export function formatDueDate(year, month, dueDay) {
  const clampedDay = clampDueDay(year, month, dueDay);
  const mm = String(month).padStart(2, '0');
  const dd = String(clampedDay).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

export function getTodayPKString() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Karachi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  return formatter.format(new Date()); // Returns YYYY-MM-DD
}

export function isPeriodOverdue(status, dueDateString, todayPKString = getTodayPKString()) {
  if (status === 'paid' || status === 'waived') return false;
  return todayPKString > dueDateString;
}

export function isPeriodBeforeAdmission(admissionDateString, billingYear, billingMonth) {
  if (!admissionDateString) return false;
  const [admYear, admMonth] = admissionDateString.split('-').map(Number);
  if (billingYear < admYear) return true;
  if (billingYear === admYear && billingMonth < admMonth) return true;
  return false;
}

export function isMonthInInterval(year, month, fromYear, fromMonth, toYear, toMonth) {
  const target = year * 12 + month;
  const start = fromYear * 12 + fromMonth;
  if (target < start) return false;
  if (toYear != null && toMonth != null) {
    const end = toYear * 12 + toMonth;
    if (target > end) return false;
  }
  return true;
}

export function isEnrolledInPeriod(enrollmentHistory, year, month) {
  if (!Array.isArray(enrollmentHistory) || enrollmentHistory.length === 0) {
    return true; // fallback
  }

  return enrollmentHistory.some(interval => {
    return isMonthInInterval(
      year,
      month,
      interval.from_year,
      interval.from_month,
      interval.to_year,
      interval.to_month
    );
  });
}
