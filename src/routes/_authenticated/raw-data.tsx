import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/raw-data")({
  beforeLoad: () => {
    throw redirect({ to: "/schedule" });
  },
});
