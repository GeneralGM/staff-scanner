import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cairoDate, cairoTime, genderLabel } from "@/lib/cairo";

export const Route = createFileRoute("/_authenticated/directory/$id")({
  component: EmployeeDetail,
});

function EmployeeDetail() {
  const { id } = Route.useParams();
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return { y: d.getFullYear(), m: d.getMonth() };
  });

  const { data: emp } = useQuery({
    queryKey: ["employee", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("*, departments(name, code)")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [] } = useQuery({
    queryKey: ["attendance", id, month.y, month.m],
    queryFn: async () => {
      const start = `${month.y}-${String(month.m + 1).padStart(2, "0")}-01`;
      const endDate = new Date(month.y, month.m + 1, 1);
      const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-01`;
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .eq("employee_id", id)
        .gte("date", start)
        .lt("date", end);
      if (error) throw error;
      return data;
    },
  });

  const byDate = useMemo(() => {
    const m = new Map<string, (typeof records)[number]>();
    records.forEach((r) => m.set(r.date, r));
    return m;
  }, [records]);

  const firstDay = new Date(month.y, month.m, 1);
  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const startCol = firstDay.getDay();
  const today = cairoDate();

  const attended = records.filter((r) => r.status === "present").length;
  const absent = records.filter((r) => r.status === "absent").length;

  const monthName = firstDay.toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="flex flex-col gap-4 p-4">
      <Link to="/directory" className="text-sm text-muted-foreground">← Back</Link>
      {emp && (
        <Card className="p-4">
          <div className="text-xl font-semibold">{emp.full_name}</div>
          <div className="font-mono text-sm">{emp.employee_code}</div>
          <div className="text-sm text-muted-foreground">
            {(emp.departments as { name: string } | null)?.name} · {genderLabel(emp.gender)}
          </div>
        </Card>
      )}

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => setMonth((p) => p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 })}>‹</Button>
          <div className="font-medium">{monthName}</div>
          <Button variant="ghost" size="sm" onClick={() => setMonth((p) => p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 })}>›</Button>
        </div>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {["S","M","T","W","T","F","S"].map((d, i) => <div key={i} className="font-medium text-muted-foreground">{d}</div>)}
          {Array.from({ length: startCol }).map((_, i) => <div key={`e${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${month.y}-${String(month.m + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            const rec = byDate.get(dateStr);
            const isFuture = dateStr > today;
            let cls = "rounded-md py-2 text-xs ";
            if (isFuture) cls += "text-muted-foreground/50";
            else if (rec?.status === "present") cls += "bg-green-500/20 text-green-700 dark:text-green-300 font-medium";
            else if (rec?.status === "absent") cls += "bg-red-500/20 text-red-700 dark:text-red-300 font-medium";
            else cls += "text-muted-foreground";
            return <div key={day} className={cls}>{day}</div>;
          })}
        </div>
        <div className="mt-4 flex justify-around text-sm">
          <div><span className="font-bold text-green-600">{attended}</span> attended</div>
          <div><span className="font-bold text-red-600">{absent}</span> absent</div>
        </div>
      </Card>

      <Card className="p-4">
        <div className="mb-2 font-medium">Daily log</div>
        <ul className="divide-y text-sm">
          {records.sort((a,b) => b.date.localeCompare(a.date)).map((r) => (
            <li key={r.id} className="flex justify-between py-2">
              <span>{r.date}</span>
              <span className="text-muted-foreground">
                {r.status === "absent" ? <span className="text-red-600">Absent</span> : (
                  <>
                    {r.check_in && `In ${cairoTime(r.check_in)}`}
                    {r.check_out && ` · Out ${cairoTime(r.check_out)}`}
                  </>
                )}
              </span>
            </li>
          ))}
          {records.length === 0 && <li className="py-3 text-muted-foreground">No records for this month.</li>}
        </ul>
      </Card>
    </div>
  );
}
