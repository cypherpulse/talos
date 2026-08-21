import { createFileRoute } from "@tanstack/react-router";

import { ActionPage, ShieldForm } from "@/components/talos/action-forms";

export const Route = createFileRoute("/app/shield")({
  component: () => (
    <ActionPage
      title="Shield"
      description="Move the test asset into a private note. The Core Server creates the commitment, proves it, and settles on X Layer."
    >
      <ShieldForm />
    </ActionPage>
  ),
});
