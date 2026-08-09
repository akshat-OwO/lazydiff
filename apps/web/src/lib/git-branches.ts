import type { GitBranch } from "@lazydiff/protocol";

export const branchDeletionAvailability = (branch: GitBranch | undefined) => {
  const local = branch?.localName !== undefined && branch.current === false;
  const remote = branch?.remoteName !== undefined;

  return { both: local && remote, local, remote };
};

export const filterGitBranches = (
  branches: readonly GitBranch[],
  query: string
) => {
  const normalizedQuery = query.trim().toLocaleLowerCase();

  return normalizedQuery.length === 0
    ? branches
    : branches.filter(({ name }) =>
        name.toLocaleLowerCase().includes(normalizedQuery)
      );
};

export const branchNameToCreate = (
  branches: readonly GitBranch[],
  query: string
) => {
  const name = query.trim();

  return name.length > 0 && !branches.some((branch) => branch.name === name)
    ? name
    : undefined;
};
