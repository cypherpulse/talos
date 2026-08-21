import { createFileRoute } from "@tanstack/react-router";

import { ActionPage, SplitForm } from "@/components/talos/action-forms";

export const Route = createFileRoute("/app/split")({
  component: () => (
    <ActionPage
      title="Split"
      description="Divide one private note into two — proven in zero-knowledge, value conserved."
    >
      <SplitForm />
    </ActionPage>
  ),
});
