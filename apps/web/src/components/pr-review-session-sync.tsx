import { useAtom, useAtomSet, useAtomValue } from "@effect/atom-react";
import { useEffect, useRef } from "react";

import { annotationsAtom } from "@/lib/annotations";
import {
  prReviewSessionActiveAtom,
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
  const setAnnotations = useAtomSet(annotationsAtom);
  const [sessionActive, setSessionActive] = useAtom(prReviewSessionActiveAtom);
  const restoredKeyRef = useRef<string | null>(null);

  const pullRequest =
    repository._tag === "Success"
      ? repository.value.data.pullRequest
      : undefined;

  useEffect(() => {
    if (pullRequest === undefined) {
      setSessionActive(false);
      restoredKeyRef.current = null;
      return;
    }

    const key = `${pullRequest.owner}/${pullRequest.repo}#${pullRequest.number}`;

    if (restoredKeyRef.current === key) {
      return;
    }

    restoredKeyRef.current = key;
    const stored = readPrReviewSession(pullRequest);

    if (stored === null) {
      setSessionActive(false);
      return;
    }

    setSessionActive(true);
    setAnnotations(stored.annotations);
  }, [pullRequest, setAnnotations, setSessionActive]);

  useEffect(() => {
    if (!sessionActive || pullRequest === undefined) {
      return;
    }

    writePrReviewSession(pullRequest, annotations);
  }, [annotations, pullRequest, sessionActive]);

  return null;
}

export { PrReviewSessionSync };
