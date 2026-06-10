import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cairoTime, genderLabel } from "@/lib/cairo";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/master")({
  component: MasterPage,
});

function MasterPage() {
  const now = new Date();
  const [month, setMonth] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-with-dept"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, employee_code, full_name, gender, departments(name, code)")
        .order("employee_code");
      if (error) throw error;
      return data;
    },
  });

  const { data: records = [] } = useQuery({
    queryKey: ["master-attendance", month.y, month.m],
    queryFn: async () => {
      const start = `${month.y}-${String(month.m + 1).padStart(2, "0")}-01`;
      const endDate = new Date(month.y, month.m + 1, 1);
      const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, "0")}-01`;
      const { data, error } = await supabase
        .from("attendance")
        .select("*")
        .gte("date", start)
        .lt("date", end);
      if (error) throw error;
      return data;
    },
  });

  const daysInMonth = new Date(month.y, month.m + 1, 0).getDate();
  const monthName = new Date(month.y, month.m, 1).toLocaleString("en-US", { month: "long", year: "numeric" });

  const map = useMemo(() => {
    const m = new Map<string, (typeof records)[number]>();
    records.forEach((r) => m.set(`${r.employee_id}|${r.date}`, r));
    return m;
  }, [records]);

  const exportXlsx = () => {
    const rows: Record<string, string>[] = [];
    employees.forEach((e) => {
      for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${month.y}-${String(month.m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const r = map.get(`${e.id}|${dateStr}`);
        rows.push({
          ID: e.employee_code,
          Name: e.full_name,
          Department: (e.departments as { name: string } | null)?.name ?? "",
          Gender: genderLabel(e.gender),
          Date: dateStr,
          Status: r?.status ?? "",
          "Check-in": r?.check_in ? cairoTime(r.check_in) : "",
          "Check-out": r?.check_out ? cairoTime(r.check_out) : "",
        });
      }
    });
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Attendance ${month.y}-${month.m + 1}`);
    XLSX.writeFile(wb, `attendance-${month.y}-${String(month.m + 1).padStart(2, "0")}.xlsx`);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card className="flex items-center justify-between p-3">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setMonth((p) => p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 })}>‹</Button>
          <div className="font-medium">{monthName}</div>
          <Button variant="ghost" size="sm" onClick={() => setMonth((p) => p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 })}>›</Button>
        </div>
        <Button onClick={exportXlsx}><Download className="h-4 w-4 mr-1" />Export</Button>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full text-xs">
          <thead className="bg-muted sticky top-0">
            <tr>
              <th className="sticky left-0 z-10 bg-muted px-2 py-2 text-left">Employee</th>
              {Array.from({ length: daysInMonth }).map((_, i) => (
                <th key={i} className="px-1 py-2 text-center">{i + 1}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => (
              <tr key={e.id} className="border-t">
                <td className="sticky left-0 z-10 bg-background px-2 py-1.5">
                  <div className="font-medium">{e.full_name}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">{e.employee_code}</div>
                </td>
                {Array.from({ length: daysInMonth }).map((_, i) => {
                  const dateStr = `${month.y}-${String(month.m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
                  const r = map.get(`${e.id}|${dateStr}`);
                  let cls = "px-1 py-1 text-center ";
                  let label = "–";
                  if (r?.status === "present") { cls += "bg-green-500/20"; label = "P"; }
                  else if (r?.status === "absent") { cls += "bg-red-500/20"; label = "A"; }
                  return <td key={i} className={cls} title={r?.check_in ? `In ${cairoTime(r.check_in)}${r.check_out ? ` / Out ${cairoTime(r.check_out)}` : ""}` : ""}>{label}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
