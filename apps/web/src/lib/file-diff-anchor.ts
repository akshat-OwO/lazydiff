/**
 * The reviewed file lives in the location hash, which scrolls the matching
 * diff into view instead of swapping the rendered route.
 */
export function fileDiffAnchorId(path: string) {
  return `file-diff:${path}`;
}

export function toLocationHash(path: string) {
  return encodeURIComponent(path);
}

export function fromLocationHash(hash: string) {
  const trimmed = hash.replace(/^#/u, "");

  if (trimmed.length === 0) {
    return null;
  }

  try {
    return decodeURIComponent(trimmed);
  } catch {
    // A hash that is not valid percent encoding cannot name a file.
    return null;
  }
}
