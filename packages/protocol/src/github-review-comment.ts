/**
 * Maps Pierre diff sides onto GitHub pull-request review comment sides.
 *
 * Pierre `additions` is the new/head file (RIGHT). Pierre `deletions` is the
 * old/base file (LEFT).
 */
export type GithubReviewCommentSide = "LEFT" | "RIGHT";
export type PierreAnnotationSide = "additions" | "deletions";

export const pierreSideToGithub = (
  side: PierreAnnotationSide
): GithubReviewCommentSide => (side === "additions" ? "RIGHT" : "LEFT");

export const githubSideToPierre = (
  side: GithubReviewCommentSide
): PierreAnnotationSide => (side === "RIGHT" ? "additions" : "deletions");

export interface AnnotationRangeForReview {
  readonly end: number;
  readonly endSide?: PierreAnnotationSide;
  readonly side?: PierreAnnotationSide;
  readonly start: number;
}

export interface GithubReviewCommentInput {
  readonly body: string;
  readonly line: number;
  readonly path: string;
  readonly side: GithubReviewCommentSide;
  readonly startLine?: number;
  readonly startSide?: GithubReviewCommentSide;
}

/**
 * Builds the GitHub review-comment coordinates for a local annotation range.
 *
 * Multi-line selections include `start_line` / `start_side`. Single-line
 * selections omit them so GitHub treats the comment as a one-line highlight.
 */
export const annotationRangeToGithubReviewComment = (input: {
  readonly body: string;
  readonly filePath: string;
  readonly range: AnnotationRangeForReview;
}): GithubReviewCommentInput => {
  const endSide = input.range.endSide ?? input.range.side ?? "additions";
  const startSide = input.range.side ?? endSide;
  const side = pierreSideToGithub(endSide);
  const mappedStartSide = pierreSideToGithub(startSide);
  const isMultiLine =
    input.range.start !== input.range.end || mappedStartSide !== side;

  return {
    body: input.body,
    line: input.range.end,
    path: input.filePath,
    side,
    ...(isMultiLine
      ? {
          startLine: input.range.start,
          startSide: mappedStartSide,
        }
      : {}),
  };
};
