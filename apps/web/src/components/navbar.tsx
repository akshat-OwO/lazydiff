import {
  useAtom,
  useAtomMount,
  useAtomSet,
  useAtomValue,
} from "@effect/atom-react";
import type { GitChangeScope } from "@lazydiff/protocol";
import { Link } from "@tanstack/react-router";
import {
  CirclePlayIcon,
  GitBranchIcon,
  MessageSquareTextIcon,
  SquareIcon,
} from "lucide-react";
import { useEffect } from "react";

import { GitBranchPicker } from "@/components/git-branch-picker";
import { ModeToggle } from "@/components/mode-toggle";
import { PrReviewSessionSync } from "@/components/pr-review-session-sync";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Skeleton } from "@/components/ui/skeleton";
import {
  annotationDraftAtom,
  annotationsAtom,
  annotationsForScope,
  annotationsSidebarOpenAtom,
  sentAnnotationIdsAtom,
} from "@/lib/annotations";
import { formatLazydiffTitle } from "@/lib/app-title";
import {
  clearPrReviewSession,
  prReviewSessionActiveAtom,
  writePrReviewSession,
} from "@/lib/pr-review-session";
import {
  gitBranchChangesAtom,
  gitChangeScopeAtom,
  gitChangeScopeAutoSelectAtom,
  gitRepositoryAtom,
} from "@/lib/rpc";

const changeScopeOptions: readonly {
  readonly label: string;
  readonly value: GitChangeScope;
}[] = [
  { label: "Unstaged", value: "unstaged" },
  { label: "Staged", value: "staged" },
  { label: "Committed", value: "committed" },
];

function GitBranchButton() {
  const branchChanges = useAtomValue(gitBranchChangesAtom);
  const repository = useAtomValue(gitRepositoryAtom);

  if (branchChanges._tag === "Initial" || repository._tag === "Initial") {
    return (
      <output aria-label="Connecting to Git">
        <Skeleton className="h-6 w-20" />
      </output>
    );
  }

  if (branchChanges._tag === "Failure") {
    return (
      <Button disabled size="xs" variant="outline">
        Unavailable
      </Button>
    );
  }

  const { head } = branchChanges.value.data;
  const label =
    head._tag === "Branch" ? head.name : `Detached @ ${head.commit}`;

  if (
    repository._tag === "Success" &&
    repository.value.data.source === "pull-request"
  ) {
    return (
      <Button
        aria-label={`Pull request branch: ${label}`}
        className="max-w-56"
        disabled
        size="xs"
        title="Branch switching is unavailable while reviewing a pull request"
        variant="outline"
      >
        <GitBranchIcon data-icon="inline-start" />
        <span className="truncate">{label}</span>
      </Button>
    );
  }

  return <GitBranchPicker head={head} />;
}

function GitChangeScopeSelect() {
  const repository = useAtomValue(gitRepositoryAtom);
  const [scope, setScope] = useAtom(gitChangeScopeAtom);
  const setDraft = useAtomSet(annotationDraftAtom);

  if (repository._tag === "Initial") {
    return (
      <output aria-label="Loading change scope">
        <Skeleton className="h-6 w-24" />
      </output>
    );
  }

  if (
    repository._tag === "Success" &&
    repository.value.data.source === "pull-request"
  ) {
    return null;
  }

  return (
    <Select
      items={changeScopeOptions}
      onValueChange={(value) => {
        if (value !== null) {
          setDraft(null);
          setScope(value);
        }
      }}
      value={scope}
    >
      <SelectTrigger
        aria-label="Change scope"
        className="border-border bg-background dark:border-input dark:bg-input/30 h-6! rounded-[min(var(--radius-md),10px)] py-0 pr-1.5 pl-2 text-xs [&_svg:not([class*='size-'])]:size-3"
        size="sm"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent align="end">
        {changeScopeOptions.map(({ label, value }) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function AnnotationsToggle() {
  const scope = useAtomValue(gitChangeScopeAtom);
  const annotations = useAtomValue(annotationsAtom);
  const scopedCount = annotationsForScope(annotations, scope).length;
  const [open, setOpen] = useAtom(annotationsSidebarOpenAtom);

  return (
    <Button
      aria-label={open ? "Hide annotations" : "Show annotations"}
      aria-pressed={open}
      onClick={() => setOpen(!open)}
      size="xs"
      type="button"
      variant={open ? "secondary" : "outline"}
    >
      <MessageSquareTextIcon data-icon="inline-start" />
      Annotations
      {scopedCount > 0 ? ` (${scopedCount})` : null}
    </Button>
  );
}

function PrReviewSessionToggle() {
  const repository = useAtomValue(gitRepositoryAtom);
  const annotations = useAtomValue(annotationsAtom);
  const sentAnnotationIds = useAtomValue(sentAnnotationIdsAtom);
  const setAnnotations = useAtomSet(annotationsAtom);
  const setSentAnnotationIds = useAtomSet(sentAnnotationIdsAtom);
  const [sessionActive, setSessionActive] = useAtom(prReviewSessionActiveAtom);

  if (
    repository._tag !== "Success" ||
    repository.value.data.source !== "pull-request" ||
    repository.value.data.pullRequest === undefined
  ) {
    return null;
  }

  const { pullRequest } = repository.value.data;

  if (sessionActive) {
    return (
      <Button
        aria-label="End review"
        onClick={() => {
          clearPrReviewSession(pullRequest);
          setSessionActive(false);
          setAnnotations([]);
          setSentAnnotationIds(new Set());
        }}
        size="xs"
        title="Stop persisting annotations for this pull request"
        type="button"
      >
        <SquareIcon data-icon="inline-start" />
        End review
      </Button>
    );
  }

  return (
    <Button
      aria-label="Start review"
      onClick={() => {
        writePrReviewSession(pullRequest, annotations, sentAnnotationIds);
        setSessionActive(true);
      }}
      size="xs"
      title="Persist annotations locally across reloads for this pull request"
      type="button"
      variant="outline"
    >
      <CirclePlayIcon data-icon="inline-start" />
      Start review
    </Button>
  );
}

function BrandTitle() {
  const repository = useAtomValue(gitRepositoryAtom);
  const repositoryName =
    repository._tag === "Success" ? repository.value.data.name : undefined;
  const title = formatLazydiffTitle(repositoryName);

  useEffect(() => {
    document.title = title;
  }, [title]);

  if (repository._tag === "Initial") {
    return (
      <output aria-label="Loading repository name">
        <Skeleton className="h-6 w-36" />
      </output>
    );
  }

  return (
    <Link
      className="text-lg font-semibold tracking-tight transition-opacity hover:opacity-80"
      to="/"
    >
      {title}
    </Link>
  );
}

function GitChangeScopeAutoSelect() {
  useAtomMount(gitChangeScopeAutoSelectAtom);
  return null;
}

function Navbar() {
  return (
    <header className="bg-sidebar text-sidebar-foreground border-sidebar-border sticky top-0 z-40 border-b">
      <GitChangeScopeAutoSelect />
      <PrReviewSessionSync />
      <nav
        aria-label="Primary navigation"
        className="flex h-14 w-full items-center justify-between px-4 sm:px-6"
      >
        <div className="flex items-center gap-2">
          <SidebarTrigger />
          <BrandTitle />
        </div>
        <div className="flex items-center gap-2">
          <GitBranchButton />
          <GitChangeScopeSelect />
          <PrReviewSessionToggle />
          <AnnotationsToggle />
          <ModeToggle />
        </div>
      </nav>
    </header>
  );
}

export { Navbar };
