import JSZip from 'jszip';

export const COMMON_INSTANCE_PATHS = [
  'config', 'mods', 'resourcepacks', 'shaderpacks',
  'saves', 'options.txt', 'servers.dat',
];

export async function extractZipInstancePaths(zipFile: File): Promise<string[]> {
  const zip = await JSZip.loadAsync(zipFile);
  const paths = new Set<string>();

  for (const zipPath of Object.keys(zip.files)) {
    let relative = '';
    if (zipPath.startsWith('overrides/')) relative = zipPath.slice('overrides/'.length);
    else if (zipPath.startsWith('client-overrides/')) relative = zipPath.slice('client-overrides/'.length);
    else continue;

    relative = relative.replace(/\/$/, '');
    if (!relative) continue;

    paths.add(relative);
    const parts = relative.split('/');
    for (let i = 1; i < parts.length; i++) {
      paths.add(parts.slice(0, i).join('/'));
    }
  }

  return Array.from(paths).sort();
}
