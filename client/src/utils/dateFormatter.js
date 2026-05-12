/**
 * Date formatting utilities for consistent Central Time display
 */

const CENTRAL_TIMEZONE = 'America/Chicago';

/**
 * Format a date/time string to Central Time locale string
 * @param {string|Date} dateValue - ISO date string or Date object
 * @returns {string} Formatted date and time in Central Time
 */
export function formatDateTimeCentral(dateValue) {
  if (!dateValue) return '';
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  return date.toLocaleString('en-US', {
    timeZone: CENTRAL_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    hour12: true
  });
}

/**
 * Format a date string to Central Time date only (no time)
 * @param {string|Date} dateValue - ISO date string or Date object
 * @returns {string} Formatted date in Central Time
 */
export function formatDateCentral(dateValue) {
  if (!dateValue) return '';
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  return date.toLocaleDateString('en-US', {
    timeZone: CENTRAL_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
  });
}

/**
 * Format a date string to Central Time with short time (e.g., "5/12/2026, 2:14 PM")
 * @param {string|Date} dateValue - ISO date string or Date object
 * @returns {string} Formatted date and short time in Central Time
 */
export function formatDateTimeShortCentral(dateValue) {
  if (!dateValue) return '';
  const date = typeof dateValue === 'string' ? new Date(dateValue) : dateValue;
  return date.toLocaleString('en-US', {
    timeZone: CENTRAL_TIMEZONE,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
}
