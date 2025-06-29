export function formatPlayTime(minutes: number): string {
  if (!minutes) return '0h';
  
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
} 