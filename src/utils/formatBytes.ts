export function formatBytes(bytes: number | undefined | null, decimals: number = 2): string {
  if (bytes === undefined || bytes === null || isNaN(bytes) || bytes === 0) return '0 Bytes';

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  // Handle edge cases where i might be out of bounds or NaN
  if (i < 0 || i >= sizes.length || isNaN(i)) return '0 Bytes';

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
} 