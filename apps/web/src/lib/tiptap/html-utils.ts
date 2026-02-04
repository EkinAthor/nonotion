/**
 * Strip the outer <p>...</p> wrapper that TipTap's getHTML() adds.
 * For headings, strips <h1>...<h3> as well.
 * Returns the inner HTML content.
 */
export function stripOuterPTag(html: string): string {
  // Match <p>, <h1>, <h2>, <h3> wrappers
  const match = html.match(/^<(?:p|h[1-3])>(.*)<\/(?:p|h[1-3])>$/s);
  if (match) {
    return match[1];
  }
  return html;
}

/**
 * Get the plain text length from an HTML string.
 * Used for cursor positioning when merging blocks with formatted content.
 */
export function getPlainTextLength(html: string): number {
  // Create a temporary element to extract text content
  const temp = document.createElement('div');
  temp.innerHTML = html;
  return temp.textContent?.length ?? 0;
}
