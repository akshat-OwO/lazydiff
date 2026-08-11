import { useAtomRefresh, useAtomSet, useAtomValue } from "@effect/atom-react";
import type {
  GitBranch,
  GitBranchDeleteTarget,
  GitHead,
} from "@lazydiff/protocol";
import {
  GitBranchIcon,
  LoaderCircleIcon,
  PlusIcon,
  Trash2Icon,
} from "lucide-react";
import { useMemo, useState } from "react";
import type { KeyboardEvent } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Combobox,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxInput,
  ComboboxItem,
  ComboboxList,
  ComboboxTrigger,
} from "@/components/ui/combobox";
import {
  branchDeletionAvailability,
  branchNameToCreate,
  filterGitBranches,
} from "@/lib/git-branches";
import {
  gitBranchCreateMutation,
  gitBranchDeleteMutation,
  gitBranchesAtom,
  gitBranchSwitchMutation,
} from "@/lib/rpc";

const createItemPrefix = "__create_branch__:";
const noBranches: readonly GitBranch[] = [];

const toErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unable to update the Git branch";

interface GitBranchPickerProps {
  readonly head: GitHead;
}

interface GitBranchDeleteDialogProps {
  readonly branch: GitBranch | undefined;
  readonly error: string | undefined;
  readonly onCancel: () => void;
  readonly onDelete: (target: GitBranchDeleteTarget) => Promise<void>;
  readonly pending: boolean;
}

function GitBranchDeleteDialog({
  branch,
  error,
  onCancel,
  onDelete,
  pending,
}: GitBranchDeleteDialogProps) {
  const availability = branchDeletionAvailability(branch);

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open && !pending) {
          onCancel();
        }
      }}
      open={branch !== undefined}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete branch “{branch?.name}”?</AlertDialogTitle>
          <AlertDialogDescription>
            Choose which Git reference to delete. Local deletion is safe and
            will be refused by Git if the branch is not fully merged.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2">
          <AlertDialogAction
            disabled={!availability.local || pending}
            onClick={async () => {
              await onDelete("local");
            }}
            variant="destructive"
          >
            <Trash2Icon data-icon="inline-start" />
            Delete local branch{branch?.current === true ? " (current)" : ""}
          </AlertDialogAction>
          <AlertDialogAction
            disabled={!availability.remote || pending}
            onClick={async () => {
              await onDelete("remote");
            }}
            variant="destructive"
          >
            <Trash2Icon data-icon="inline-start" />
            Delete remote branch
          </AlertDialogAction>
          <AlertDialogAction
            disabled={!availability.both || pending}
            onClick={async () => {
              await onDelete("both");
            }}
            variant="destructive"
          >
            <Trash2Icon data-icon="inline-start" />
            Delete both
          </AlertDialogAction>
        </div>
        {pending ? (
          <div className="text-muted-foreground flex items-center gap-2 text-xs">
            <LoaderCircleIcon className="size-3 animate-spin" />
            Deleting branch...
          </div>
        ) : null}
        {error === undefined ? null : (
          <p className="text-destructive text-xs" role="alert">
            {error}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function GitBranchPicker({ head }: GitBranchPickerProps) {
  const branchesResult = useAtomValue(gitBranchesAtom);
  const refreshBranches = useAtomRefresh(gitBranchesAtom);
  const createBranch = useAtomSet(gitBranchCreateMutation, {
    mode: "promise",
  });
  const deleteBranch = useAtomSet(gitBranchDeleteMutation, {
    mode: "promise",
  });
  const switchBranch = useAtomSet(gitBranchSwitchMutation, {
    mode: "promise",
  });
  const [error, setError] = useState<string>();
  const [deleteCandidate, setDeleteCandidate] = useState<GitBranch>();
  const [deleteError, setDeleteError] = useState<string>();
  const [deletePending, setDeletePending] = useState(false);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [query, setQuery] = useState("");
  const branches =
    branchesResult._tag === "Success"
      ? branchesResult.value.data.branches
      : noBranches;
  const visibleBranches = useMemo(
    () => filterGitBranches(branches, query),
    [branches, query]
  );
  const createName = branchNameToCreate(branches, query);
  const createItemValue =
    createName === undefined ? undefined : `${createItemPrefix}${createName}`;
  const items = useMemo(
    () => [
      ...branches.map(({ name }) => name),
      ...(createItemValue === undefined ? [] : [createItemValue]),
    ],
    [branches, createItemValue]
  );
  const filteredItems = useMemo(
    () => [
      ...visibleBranches.map(({ name }) => name),
      ...(createItemValue === undefined ? [] : [createItemValue]),
    ],
    [createItemValue, visibleBranches]
  );
  const currentName = head._tag === "Branch" ? head.name : null;
  const label =
    head._tag === "Branch" ? head.name : `Detached @ ${head.commit}`;
  const loading = branchesResult._tag === "Initial" || branchesResult.waiting;

  const completeAction = () => {
    setOpen(false);
    setQuery("");
    refreshBranches();
  };

  const runBranchAction = async (
    branch: GitBranch | undefined,
    name: string,
    create: boolean
  ) => {
    if (pending || (!create && branch?.current === true)) {
      setOpen(false);
      return;
    }

    setError(undefined);
    setPending(true);

    try {
      await (create
        ? createBranch({
            payload: { data: { name }, type: "git.branch.create" },
          })
        : switchBranch({
            payload: { data: { name }, type: "git.branch.switch" },
          }));

      completeAction();
    } catch (actionError) {
      setError(toErrorMessage(actionError));
    } finally {
      setPending(false);
    }
  };

  const handleBranchSelection = async (nextValue: string | null) => {
    if (nextValue === null || pending) {
      return;
    }

    if (nextValue === createItemValue && createName !== undefined) {
      await runBranchAction(undefined, createName, true);
      return;
    }

    const branch = branches.find(({ name }) => name === nextValue);

    if (branch !== undefined) {
      await runBranchAction(branch, branch.name, false);
    }
  };

  const handleSearchKeyDown = async (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== "Enter" || createName === undefined || pending) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();
    await runBranchAction(undefined, createName, true);
  };

  const openDeleteDialog = (branch: GitBranch) => {
    setOpen(false);
    setDeleteError(undefined);
    setDeleteCandidate(branch);
  };

  const runDeleteAction = async (target: GitBranchDeleteTarget) => {
    if (deleteCandidate === undefined || deletePending) {
      return;
    }

    setDeleteError(undefined);
    setDeletePending(true);

    try {
      await deleteBranch({
        payload: {
          data: {
            ...(deleteCandidate.localName === undefined
              ? {}
              : { localName: deleteCandidate.localName }),
            ...(deleteCandidate.remoteName === undefined
              ? {}
              : { remoteName: deleteCandidate.remoteName }),
            target,
          },
          type: "git.branch.delete",
        },
      });
      setDeleteCandidate(undefined);
    } catch (actionError) {
      setDeleteError(toErrorMessage(actionError));
    } finally {
      setDeletePending(false);
    }

    refreshBranches();
  };

  return (
    <>
      <Combobox
        filteredItems={filteredItems}
        items={items}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          setError(undefined);

          if (nextOpen) {
            refreshBranches();
          } else {
            setQuery("");
          }
        }}
        onValueChange={handleBranchSelection}
        open={open}
        value={currentName}
      >
        <ComboboxTrigger
          aria-label={`Current Git branch: ${label}`}
          className="max-w-56"
          disabled={pending}
          render={<Button size="xs" variant="outline" />}
        >
          <GitBranchIcon data-icon="inline-start" />
          <span className="truncate">{label}</span>
        </ComboboxTrigger>
        <ComboboxContent align="end" className="w-72">
          <div className="contents" onKeyDownCapture={handleSearchKeyDown}>
            <ComboboxInput
              autoFocus
              className="border-input/30 bg-input/30 m-1 mb-0 h-8 shadow-none"
              disabled={pending}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search branches..."
              showTrigger={false}
              value={query}
            />
          </div>
          <ComboboxList>
            {loading ? (
              <div className="text-muted-foreground flex items-center gap-2 px-2 py-3 text-sm">
                <LoaderCircleIcon className="size-4 animate-spin" />
                Loading branches...
              </div>
            ) : null}
            {loading || branchesResult._tag !== "Failure" ? null : (
              <div className="text-destructive px-2 py-3 text-sm">
                Unable to load Git branches.
              </div>
            )}
            {loading ? null : <ComboboxEmpty>No branches found.</ComboboxEmpty>}
            {loading || createName === undefined ? null : (
              <ComboboxItem disabled={pending} value={createItemValue}>
                <PlusIcon />
                <span className="truncate">Create branch “{createName}”</span>
              </ComboboxItem>
            )}
            {loading
              ? null
              : visibleBranches.map((branch) => (
                  <ComboboxItem
                    className="group/branch pr-1.5"
                    disabled={pending}
                    key={branch.name}
                    value={branch.name}
                  >
                    <GitBranchIcon />
                    <span className="min-w-0 flex-1 truncate">
                      {branch.name}
                    </span>
                    {branch.isRemote ? (
                      <span className="text-muted-foreground text-xs">
                        remote
                      </span>
                    ) : null}
                    <Button
                      aria-label={`Delete branch ${branch.name}`}
                      className="ml-1 size-5 shrink-0 opacity-0 group-hover/branch:opacity-100 group-data-highlighted/branch:opacity-100 focus-visible:opacity-100"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        openDeleteDialog(branch);
                      }}
                      onPointerDown={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                      }}
                      size="icon-xs"
                      type="button"
                      variant="ghost"
                    >
                      <Trash2Icon className="size-3" />
                    </Button>
                  </ComboboxItem>
                ))}
          </ComboboxList>
          {pending ? (
            <div className="text-muted-foreground flex items-center gap-2 border-t px-2 py-2 text-xs">
              <LoaderCircleIcon className="size-3 animate-spin" />
              Updating branch...
            </div>
          ) : null}
          {error === undefined ? null : (
            <p
              className="text-destructive border-t px-2 py-2 text-xs"
              role="alert"
            >
              {error}
            </p>
          )}
        </ComboboxContent>
      </Combobox>
      <GitBranchDeleteDialog
        branch={deleteCandidate}
        error={deleteError}
        onCancel={() => {
          setDeleteCandidate(undefined);
          setDeleteError(undefined);
        }}
        onDelete={runDeleteAction}
        pending={deletePending}
      />
    </>
  );
}
