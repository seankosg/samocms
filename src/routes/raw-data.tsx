import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/raw-data")({
  beforeLoad: () => {
    throw redirect({ to: "/schedule" });
  },
});
