import { createFileRoute } from "@tanstack/react-router";
import { FileDiffIcon } from "lucide-react";

import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <Empty className="min-h-[60svh] border">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileDiffIcon />
        </EmptyMedia>
        <EmptyTitle>No file selected</EmptyTitle>
        <EmptyDescription>
          Pick a changed file to review its diff. The selected file stays in the
          address bar, so diffs can be shared and reloaded.
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}
