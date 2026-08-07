export function formatLazydiffTitle(repositoryName?: string) {
  return repositoryName === undefined || repositoryName.length === 0
    ? "Lazydiff"
    : `Lazydiff | ${repositoryName}`;
}
