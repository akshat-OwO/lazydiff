import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react";
import { useEffect, useRef } from "react";

import { annotationsAtom, sentAnnotationIdsAtom } from "@/lib/annotations";
import {
  prReviewSessionActiveAtom,
  prReviewSessionHeadShaAtom,
  prReviewSessionMatchesHead,
  readPrReviewSession,
  writePrReviewSession,
} from "@/lib/pr-review-session";
import { gitRepositoryAtom } from "@/lib/rpc";

/**
 * Restores and persists local annotations for an active PR review session.
 */
function PrReviewSessionSync() {
  const repository = useAtomValue(gitRepositoryAtom);
  const annotations = useAtomValue(annotationsAtom);
  const sentAnnotationIds = useAtomValue(sentAnnotationIdsAtom);
  const setAnnotations = useAtomSet(annotationsAtom);
  const setSentAnnotationIds = useAtomSet(sentAnnotationIdsAtom);
  const [sessionActive, setSessionActive] = useAtom(prReviewSessionActiveAtom);
  const [sessionHeadSha, setSessionHeadSha] = useAtom(
    prReviewSessionHeadShaAtom
  );
  const restoredKeyRef = useRef<string | null>(null);

  const pullRequest =
    repository._tag === "Success"
      ? repository.value.data.pullRequest
      : undefined;

  useEffect(() => {
    if (pullRequest === undefined) {
      setSessionActive(false);
      setSessionHeadSha(null);
      restoredKeyRef.current = null;
      return;
    }

    const key = `${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}@${pullRequest.headSha}`;

    if (restoredKeyRef.current === key) {
      return;
    }

    restoredKeyRef.current = key;
    const stored = readPrReviewSession(pullRequest);

    if (
      stored === null ||
      !prReviewSessionMatchesHead(stored, pullRequest.headSha)
    ) {
      // Stale coordinates from an older head must not become sendable.
      setSessionActive(false);
      setSessionHeadSha(null);
      return;
    }

    setSessionActive(true);
    setSessionHeadSha(stored.headSha);
    setAnnotations(stored.annotations);
    setSentAnnotationIds(new Set(stored.sentAnnotationIds));
  }, [
    pullRequest,
    setAnnotations,
    setSentAnnotationIds,
    setSessionActive,
    setSessionHeadSha,
  ]);

  useEffect(() => {
    if (
      !sessionActive ||
      pullRequest === undefined ||
      sessionHeadSha === null ||
      sessionHeadSha !== pullRequest.headSha
    ) {
      return;
    }

    writePrReviewSession(
      pullRequest,
      annotations,
      sentAnnotationIds,
      sessionHeadSha
    );
  }, [
    annotations,
    pullRequest,
    sentAnnotationIds,
    sessionActive,
    sessionHeadSha,
  ]);

  return null;
}

export { PrReviewSessionSync };
