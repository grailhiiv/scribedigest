// Keep ordinary PDF filenames intact while preventing object-key paths and
// cross-platform unsafe names. The byte limit leaves room for a UUID suffix.
export function safePdfName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const basename = value.split(/[\\/]/).pop() || '';
  const cleaned = basename.normalize('NFC').replace(/[\u0000-\u001f\u007f<>:"|?*]/g, '_').trim();
  if (!/\.pdf$/i.test(cleaned)) return null;
  let stem = cleaned.slice(0, -4).replace(/[. ]+$/g, '').trim();
  if (!stem || /^\.+$/.test(stem)) return null;
  while (new TextEncoder().encode(stem).length > 160) stem = Array.from(stem).slice(0, -1).join('');
  return `${stem}.pdf`;
}

export function validR2PdfName(value: unknown): value is string {
  return typeof value === 'string' && value === safePdfName(value);
}

export function suffixedPdfName(filename: string, suffix: string): string {
  let stem = filename.slice(0, -4);
  const maxBytes = 160 - new TextEncoder().encode(`-${suffix}`).length;
  while (new TextEncoder().encode(stem).length > maxBytes) stem = Array.from(stem).slice(0, -1).join('');
  return `${stem}-${suffix}.pdf`;
}
