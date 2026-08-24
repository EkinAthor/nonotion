/** RFC 5987 Content-Disposition with a plain-ASCII fallback. */
export function contentDisposition(disposition: 'attachment' | 'inline', filename: string): string {
  const fallback = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  return `${disposition}; filename="${fallback}"; filename*=UTF-8''${encodeURIComponent(filename)}`;
}
