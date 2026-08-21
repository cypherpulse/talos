import { createFileRoute } from "@tanstack/react-router";

import { ActionPage, TransferForm } from "@/components/talos/action-forms";

export const Route = createFileRoute("/app/transfer")({
  component: () => (
    <ActionPage
      title="Transfer"
      description="Privately send value to a recipient's Talos owner key. Your change returns as a new private note."
    >
      <TransferForm />
    </ActionPage>
  ),
});
