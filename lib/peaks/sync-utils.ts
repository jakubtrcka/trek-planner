export function peakIdFromUrl(url: string | null): string | null {
  if (!url) return null;
  const m = url.match(/\/mountain\/(\d+)-/);
  return m ? m[1] : null;
}

export function areaSlugFromSource(source: string | undefined): string | null {
  if (!source) return null;
  try {
    const pathname = new URL(source).pathname;
    const match = pathname.match(/^\/area\/([^/]+)/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}
