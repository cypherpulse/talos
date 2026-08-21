import { createFileRoute } from "@tanstack/react-router";

import { ActionPage, MergeForm } from "@/components/talos/action-forms";

export const Route = createFileRoute("/app/merge")({
  component: () => (
    <ActionPage
      title="Merge"
      description="Combine two private notes into one — a single zero-knowledge proof consolidates your balance."
    >
      <MergeForm />
    </ActionPage>
  ),
});
