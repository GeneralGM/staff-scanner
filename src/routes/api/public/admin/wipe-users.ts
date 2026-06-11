import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/admin/wipe-users")({
  server: {
    handlers: {
      POST: async () => {
        const deleted: string[] = [];
        let page = 1;
        while (true) {
          const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 });
          if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
          if (!data.users.length) break;
          for (const u of data.users) {
            const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(u.id);
            if (!delErr) deleted.push(u.id);
          }
          if (data.users.length < 200) break;
          page += 1;
        }
        return Response.json({ ok: true, deleted: deleted.length });
      },
    },
  },
});
