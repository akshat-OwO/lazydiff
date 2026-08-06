import { createFileRoute } from "@tanstack/react-router";

import { ChangedFilesDiffs } from "@/components/changed-files-diffs";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <ChangedFilesDiffs />;
}
