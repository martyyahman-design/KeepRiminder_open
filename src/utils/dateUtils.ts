/**
 * Format ISO date string to readable format
 * @param dateStr ISO date string
 * @param includeTime Whether to include time (HH:mm)
 * @returns Formatted date string
 */
export function formatDate(dateStr: string, includeTime: boolean = true): string {
    if (!dateStr) return '';
    const date = new Date(dateStr);

    // Check if valid date
    if (isNaN(date.getTime())) return '';

    const y = date.getFullYear();
    const m = (date.getMonth() + 1).toString().padStart(2, '0');
    const d = date.getDate().toString().padStart(2, '0');

    if (!includeTime) {
        return `${y}/${m}/${d}`;
    }

    const hh = date.getHours().toString().padStart(2, '0');
    const mm = date.getMinutes().toString().padStart(2, '0');

    return `${y}/${m}/${d} ${hh}:${mm}`;
}
