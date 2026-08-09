import colors from "picocolors";

export interface StartupOutputOptions {
  readonly color?: boolean;
  readonly elapsedMs: number;
  readonly url: string;
  readonly version: string;
}

export const shouldShowHttpLogs = (isProd: boolean, debug?: string): boolean =>
  !isProd || debug === "1";

const rgb = (
  palette: ReturnType<typeof colors.createColors>,
  red: number,
  green: number,
  blue: number,
  value: string
): string =>
  palette.isColorSupported
    ? `\u001B[38;2;${red};${green};${blue}m${value}\u001B[39m`
    : value;

export const formatStartupOutput = ({
  color,
  elapsedMs,
  url,
  version,
}: StartupOutputOptions): string => {
  const palette = colors.createColors(color);
  const name = `${palette.bold(rgb(palette, 255, 134, 151, "LAZY"))}${palette.bold(
    rgb(palette, 134, 239, 172, "DIFF")
  )}`;
  const readyTime = `${(elapsedMs / 1000).toFixed(2)}s`;

  return [
    "",
    `  ${name} ${palette.dim(`v${version}`)}  ${palette.dim(
      `ready in ${readyTime}`
    )}`,
    "",
    `  ${palette.greenBright("➜")}  ${palette.bold(
      palette.gray("Local:")
    )}   ${palette.underline(palette.cyan(url))}`,
    "",
  ].join("\n");
};
