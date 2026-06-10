import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/cron/mark-absentees")({
  server: {
    handlers: {
      POST: async () => {
        const { data, error } = await supabaseAdmin.rpc("mark_absentees");
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
        return Response.json({ ok: true, marked: data });
      },
    },
  },
});
