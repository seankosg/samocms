import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/_authenticated/raw-data")({
  beforeLoad: () => {
    throw redirect({ to: "/schedule" });
  },
});
