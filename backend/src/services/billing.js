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
  if (status === 'paid') return false;
  return todayPKString > dueDateString;
}

export function isPeriodBeforeAdmission(admissionDateString, billingYear, billingMonth) {
  if (!admissionDateString) return false;
  const [admYear, admMonth] = admissionDateString.split('-').map(Number);
  if (billingYear < admYear) return true;
  if (billingYear === admYear && billingMonth < admMonth) return true;
  return false;
}
