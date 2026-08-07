const escapedBytes: Record<string, number> = {
  '"': 0x22,
  "\\": 0x5c,
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  n: 0x0a,
  r: 0x0d,
  t: 0x09,
  v: 0x0b,
};

const octalDigits = /^[0-7]{3}$/u;
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

/**
 * Git escapes pathnames in patch headers whenever they contain a quote,
 * a backslash, or a control character, while `-z` status output always reports
 * raw bytes. Both spellings have to collapse to the same path, otherwise a
 * diff can never be matched to the file it came from.
 *
 * Git quotes any pathname containing a backslash, so a backslash in a parsed
 * header name is always the start of an escape rather than a literal.
 */
export function unquoteGitPath(name: string) {
  const escaped =
    name.length > 1 && name.startsWith('"') && name.endsWith('"')
      ? name.slice(1, -1)
      : name;

  if (!escaped.includes("\\")) {
    return escaped;
  }

  const bytes: number[] = [];

  for (let index = 0; index < escaped.length; index += 1) {
    const character = escaped[index] ?? "";

    if (character !== "\\") {
      bytes.push(...textEncoder.encode(character));
      continue;
    }

    const octal = escaped.slice(index + 1, index + 4);

    if (octalDigits.test(octal)) {
      bytes.push(Number.parseInt(octal, 8));
      index += 3;
      continue;
    }

    const next = escaped[index + 1] ?? "";
    const byte = escapedBytes[next];

    if (byte === undefined) {
      // Not an escape Git produces; keep the backslash as written.
      bytes.push(...textEncoder.encode(character));
      continue;
    }

    bytes.push(byte);
    index += 1;
  }

  return textDecoder.decode(Uint8Array.from(bytes));
}
