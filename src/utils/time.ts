/**
 * Formats a Unix timestamp (milliseconds) as a relative time string.
 *
 * @param timestamp - Unix timestamp in milliseconds
 * @returns Relative time string like "4s ago", "2m ago", "1h ago", "3d ago"
 *
 * @example
 * formatRelativeTime(Date.now() - 5000) // "5s ago"
 * formatRelativeTime(Date.now() - 120000) // "2m ago"
 * formatRelativeTime(Date.now() - 3600000) // "1h ago"
 */
export function formatRelativeTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;

  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  // Handle sub-second events
  if (seconds < 1) {
    return 'just now';
  }

  if (seconds < 60) {
    return `${seconds}s ago`;
  }

  if (minutes < 60) {
    return `${minutes}m ago`;
  }

  if (hours < 24) {
    return `${hours}h ago`;
  }

  return `${days}d ago`;
}
