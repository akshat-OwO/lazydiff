import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react";
import { useEffect, useRef } from "react";

import { annotationsAtom, sentAnnotationIdsAtom } from "@/lib/annotations";
import {
  decidePrReviewSessionRestore,
  prReviewSessionActiveAtom,
  prReviewSessionHeadShaAtom,
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
    const previousKey = restoredKeyRef.current;

    if (previousKey === key) {
      return;
    }

    restoredKeyRef.current = key;
    const decision = decidePrReviewSessionRestore(
      readPrReviewSession(pullRequest),
      pullRequest.headSha
    );

    if (decision._tag === "restore") {
      setSessionActive(true);
      setSessionHeadSha(decision.session.headSha);
      setAnnotations(decision.session.annotations);
      setSentAnnotationIds(new Set(decision.session.sentAnnotationIds));
      return;
    }

    setSessionActive(false);
    setSessionHeadSha(null);

    // A head change or stale persisted session must not leave old coordinates
    // sendable against the newly opened head.
    if (decision._tag === "stale" || previousKey !== null) {
      setAnnotations([]);
      setSentAnnotationIds(new Set());
    }
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
