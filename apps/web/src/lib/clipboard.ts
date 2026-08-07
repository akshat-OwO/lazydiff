/**
 * Copies text to the clipboard. Prefers the async Clipboard API and falls
 * back to a temporary textarea for environments that block it.
 */
export async function copyTextToClipboard(text: string): Promise<void> {
  if (globalThis.navigator?.clipboard?.writeText !== undefined) {
    try {
      await globalThis.navigator.clipboard.writeText(text);
      return;
    } catch {
      // Fall through to the legacy path when permission is denied.
    }
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  document.body.append(textarea);
  textarea.select();

  try {
    const copied = document.execCommand("copy");

    if (!copied) {
      throw new Error("document.execCommand('copy') returned false");
    }
  } finally {
    textarea.remove();
  }
}
