import type { GitPullRequestMeta } from "@lazydiff/protocol";
import { Atom } from "effect/unstable/reactivity";

import type { DiffAnnotation } from "@/lib/annotations";

export interface PersistedPrReviewSession {
  readonly annotations: readonly DiffAnnotation[];
  readonly headSha: string;
  readonly number: number;
  readonly owner: string;
  readonly repo: string;
  readonly sentAnnotationIds: readonly string[];
  readonly startedAt: string;
}

export const prReviewSessionActiveAtom = Atom.make(false);

/**
 * Head commit SHA the active local review session was started against. Send to
 * remote is only safe while this matches the opened pull request head.
 */
export const prReviewSessionHeadShaAtom = Atom.make<string | null>(null);

const storageKeyFor = (
  pullRequest: Pick<GitPullRequestMeta, "owner" | "repo" | "number">
) =>
  `lazydiff-pr-review:${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`;

/**
 * Saved annotation coordinates are only sendable against the same PR head they
 * were captured on.
 */
export const prReviewSessionMatchesHead = (
  session: Pick<PersistedPrReviewSession, "headSha">,
  headSha: string
): boolean => session.headSha === headSha;

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
    record.annotations.every(isDiffAnnotation) &&
    Array.isArray(record.sentAnnotationIds) &&
    record.sentAnnotationIds.every((id) => typeof id === "string")
  );
};

export const readPrReviewSession = (
  pullRequest: Pick<GitPullRequestMeta, "owner" | "repo" | "number">
): PersistedPrReviewSession | null => {
  try {
    const raw = window.localStorage.getItem(storageKeyFor(pullRequest));

    if (raw === null) {
      return null;
    }

    const parsed: unknown = JSON.parse(raw);

    if (isPersistedPrReviewSession(parsed)) {
      return parsed;
    }

    // Older sessions omitted sentAnnotationIds; accept them as unsynced.
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      Array.isArray((parsed as { annotations?: unknown }).annotations) &&
      typeof (parsed as { headSha?: unknown }).headSha === "string" &&
      typeof (parsed as { number?: unknown }).number === "number" &&
      typeof (parsed as { owner?: unknown }).owner === "string" &&
      typeof (parsed as { repo?: unknown }).repo === "string" &&
      typeof (parsed as { startedAt?: unknown }).startedAt === "string" &&
      (parsed as { annotations: unknown[] }).annotations.every(isDiffAnnotation)
    ) {
      const legacy = parsed as {
        annotations: readonly DiffAnnotation[];
        headSha: string;
        number: number;
        owner: string;
        repo: string;
        startedAt: string;
      };

      return {
        ...legacy,
        sentAnnotationIds: [],
      };
    }

    return null;
  } catch {
    return null;
  }
};

export const writePrReviewSession = (
  pullRequest: GitPullRequestMeta,
  annotations: readonly DiffAnnotation[],
  sentAnnotationIds: ReadonlySet<string>,
  sessionHeadSha: string = pullRequest.headSha
): void => {
  const existing = readPrReviewSession(pullRequest);
  const session: PersistedPrReviewSession = {
    annotations,
    headSha: sessionHeadSha,
    number: pullRequest.number,
    owner: pullRequest.owner,
    repo: pullRequest.repo,
    sentAnnotationIds: [...sentAnnotationIds],
    startedAt: existing?.startedAt ?? new Date().toISOString(),
  };

  try {
    window.localStorage.setItem(
      storageKeyFor(pullRequest),
      JSON.stringify(session)
    );
  } catch {
    // Annotation editing still works when browser storage is unavailable.
  }
};

export const clearPrReviewSession = (
  pullRequest: Pick<GitPullRequestMeta, "owner" | "repo" | "number">
): void => {
  try {
    window.localStorage.removeItem(storageKeyFor(pullRequest));
  } catch {
    // Clearing is best-effort when browser storage is unavailable.
  }
};
