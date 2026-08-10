import type { GitPullRequestMeta } from "@lazydiff/protocol";
import { Atom } from "effect/unstable/reactivity";

import type { DiffAnnotation } from "@/lib/annotations";

export interface PersistedPrReviewSession {
  readonly annotations: readonly DiffAnnotation[];
  readonly headSha: string;
  readonly number: number;
  readonly owner: string;
  readonly repo: string;
  readonly startedAt: string;
}

export const prReviewSessionActiveAtom = Atom.make(false);

const storageKeyFor = (
  pullRequest: Pick<GitPullRequestMeta, "owner" | "repo" | "number">
) =>
  `lazydiff-pr-review:${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`;

const isAnnotationSide = (value: unknown): value is "additions" | "deletions" =>
  value === "additions" || value === "deletions";

const isDiffAnnotation = (value: unknown): value is DiffAnnotation => {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  const { range } = record;

  if (range === null || typeof range !== "object") {
    return false;
  }

  const rangeRecord = range as Record<string, unknown>;

  return (
    typeof record.codeDiff === "string" &&
    typeof record.comment === "string" &&
    typeof record.filePath === "string" &&
    typeof record.id === "string" &&
    (record.scope === "unstaged" ||
      record.scope === "staged" ||
      record.scope === "committed") &&
    typeof rangeRecord.start === "number" &&
    typeof rangeRecord.end === "number" &&
    (rangeRecord.side === undefined || isAnnotationSide(rangeRecord.side)) &&
    (rangeRecord.endSide === undefined || isAnnotationSide(rangeRecord.endSide))
  );
};

const isPersistedPrReviewSession = (
  value: unknown
): value is PersistedPrReviewSession => {
  if (value === null || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;

  return (
    typeof record.headSha === "string" &&
    typeof record.number === "number" &&
    typeof record.owner === "string" &&
    typeof record.repo === "string" &&
    typeof record.startedAt === "string" &&
    Array.isArray(record.annotations) &&
    record.annotations.every(isDiffAnnotation)
  );
};

export function readPrReviewSession(
  pullRequest: Pick<GitPullRequestMeta, "owner" | "repo" | "number">
): PersistedPrReviewSession | null {
  try {
    const raw = window.localStorage.getItem(storageKeyFor(pullRequest));

    if (raw === null) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);
    return isPersistedPrReviewSession(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writePrReviewSession(
  pullRequest: GitPullRequestMeta,
  annotations: readonly DiffAnnotation[]
): void {
  const session: PersistedPrReviewSession = {
    annotations,
    headSha: pullRequest.headSha,
    number: pullRequest.number,
    owner: pullRequest.owner,
    repo: pullRequest.repo,
    startedAt: new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(
      storageKeyFor(pullRequest),
      JSON.stringify(session)
    );
  } catch {
    // Annotation editing still works when browser storage is unavailable.
  }
}

export function clearPrReviewSession(
  pullRequest: Pick<GitPullRequestMeta, "owner" | "repo" | "number">
): void {
  try {
    window.localStorage.removeItem(storageKeyFor(pullRequest));
  } catch {
    // Clearing is best-effort when browser storage is unavailable.
  }
}
