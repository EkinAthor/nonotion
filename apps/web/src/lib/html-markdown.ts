/**
 * Convert HTML with formatting marks to inline markdown notation.
 * Used when copying formatted text to plain text clipboard.
 */
export function htmlToInlineMarkdown(html: string): string {
  let result = html;

  // Bold: <strong> or <b> -> **text**
  result = result.replace(/<(?:strong|b)>(.*?)<\/(?:strong|b)>/gi, '**$1**');

  // Italic: <em> or <i> -> *text*
  result = result.replace(/<(?:em|i)>(.*?)<\/(?:em|i)>/gi, '*$1*');

  // Inline code: <code> -> `text`
  result = result.replace(/<code>(.*?)<\/code>/gi, '`$1`');

  // Links: <a href="url">text</a> -> [text](url)
  result = result.replace(/<a\s[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '[$2]($1)');

  // Strip remaining HTML tags (underline, mark, span styles have no markdown equivalent)
  result = result.replace(/<[^>]+>/g, '');

  return result;
}

/**
 * Convert inline markdown notation to HTML.
 * Used when pasting text that contains markdown formatting.
 */
export function inlineMarkdownToHtml(text: string): string {
  let result = text;

  // Inline code: `text` -> <code>text</code> (process first to avoid conflicts)
  result = result.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Bold: **text** -> <strong>text</strong> (process before italic)
  result = result.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

  // Italic: *text* -> <em>text</em>
  result = result.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');

  // Links: [text](url) -> <a href="url">text</a>
  result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

  return result;
}
