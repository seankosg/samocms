import { createFileRoute } from "@tanstack/react-router";
import { bootstrapUsers } from "@/lib/auth.functions";

// 일회성 초기 계정 생성 엔드포인트 (계정이 하나라도 있으면 거부됨)
export const Route = createFileRoute("/api/public/bootstrap-users")({
  server: {
    handlers: {
      POST: async () => {
        try {
          const res = await bootstrapUsers();
          return new Response(JSON.stringify(res), { headers: { "content-type": "application/json" } });
        } catch (e) {
          return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "failed" }), {
            status: 400,
            headers: { "content-type": "application/json" },
          });
        }
      },
    },
  },
});
