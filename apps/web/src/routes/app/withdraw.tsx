import { createFileRoute } from "@tanstack/react-router";

import { ActionPage, WithdrawForm } from "@/components/talos/action-forms";

export const Route = createFileRoute("/app/withdraw")({
  component: () => (
    <ActionPage
      title="Withdraw"
      description="Exit a private note to a public X Layer address. The recipient is bound into the proof."
    >
      <WithdrawForm />
    </ActionPage>
  ),
});
