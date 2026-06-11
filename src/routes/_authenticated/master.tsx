import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/master")({
  component: MasterPage,
});

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const DAY_ABBR = ["Su", "M", "Tu", "W", "Th", "F", "Sa"];

function MasterPage() {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [monthIdx, setMonthIdx] = useState(now.getMonth());

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
    queryKey: ["master-attendance", year, monthIdx],
    queryFn: async () => {
      const start = `${year}-${String(monthIdx + 1).padStart(2, "0")}-01`;
      const endDate = new Date(year, monthIdx + 1, 1);
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

  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();

  const map = useMemo(() => {
    const m = new Map<string, (typeof records)[number]>();
    records.forEach((r) => m.set(`${r.employee_id}|${r.date}`, r));
    return m;
  }, [records]);

  const getStatus = (empId: string, day: number): "P" | "A" | "" => {
    const dateStr = `${year}-${String(monthIdx + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const r = map.get(`${empId}|${dateStr}`);
    if (!r) return "";
    if (r.status === "present") return "P";
    if (r.status === "absent") return "A";
    return "";
  };

  const totals = useMemo(() => {
    const t = new Map<string, { p: number; a: number }>();
    employees.forEach((e) => {
      let p = 0, a = 0;
      for (let d = 1; d <= daysInMonth; d++) {
        const s = getStatus(e.id, d);
        if (s === "P") p++;
        else if (s === "A") a++;
      }
      t.set(e.id, { p, a });
    });
    return t;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees, map, daysInMonth, year, monthIdx]);

  const yearOptions = useMemo(() => {
    const arr: number[] = [];
    for (let y = now.getFullYear() - 3; y <= now.getFullYear() + 1; y++) arr.push(y);
    return arr;
  }, [now]);

  const exportXlsx = () => {
    const header: (string | number)[] = ["ID", "Name"];
    for (let d = 1; d <= daysInMonth; d++) {
      const dow = new Date(year, monthIdx, d).getDay();
      header.push(`${d} ${DAY_ABBR[dow]}`);
    }
    header.push("Present", "Absent");

    const rows: (string | number)[][] = [header];
    employees.forEach((e) => {
      const row: (string | number)[] = [e.employee_code, e.full_name];
      for (let d = 1; d <= daysInMonth; d++) row.push(getStatus(e.id, d));
      const t = totals.get(e.id) ?? { p: 0, a: 0 };
      row.push(t.p, t.a);
      rows.push(row);
    });

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [
      { wch: 10 }, { wch: 24 },
      ...Array.from({ length: daysInMonth }, () => ({ wch: 5 })),
      { wch: 8 }, { wch: 8 },
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${MONTHS[monthIdx]} ${year}`);
    XLSX.writeFile(wb, `attendance-${year}-${String(monthIdx + 1).padStart(2, "0")}.xlsx`);
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex items-center gap-2">
          <Select value={String(monthIdx)} onValueChange={(v) => setMonthIdx(Number(v))}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {MONTHS.map((m, i) => <SelectItem key={i} value={String(i)}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
            <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {yearOptions.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={exportXlsx}><Download className="h-4 w-4 mr-1" />Export to Excel</Button>
      </Card>

      <div className="overflow-x-auto rounded-md border">
        <table className="min-w-full border-collapse text-xs">
          <thead className="bg-muted">
            <tr>
              <th className="sticky left-0 z-20 border bg-muted px-2 py-2 text-left">ID</th>
              <th className="sticky left-[70px] z-20 border bg-muted px-2 py-2 text-left">Name</th>
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const dow = new Date(year, monthIdx, i + 1).getDay();
                const weekend = dow === 5 || dow === 6;
                return (
                  <th key={i} className={`border px-1 py-1 text-center font-medium ${weekend ? "bg-muted-foreground/10" : ""}`}>
                    <div>{i + 1}</div>
                    <div className="text-[9px] text-muted-foreground">{DAY_ABBR[dow]}</div>
                  </th>
                );
              })}
              <th className="border bg-green-500/15 px-2 py-2 text-center">P</th>
              <th className="border bg-red-500/15 px-2 py-2 text-center">A</th>
            </tr>
          </thead>
          <tbody>
            {employees.map((e) => {
              const t = totals.get(e.id) ?? { p: 0, a: 0 };
              return (
                <tr key={e.id}>
                  <td className="sticky left-0 z-10 border bg-background px-2 py-1.5 font-mono text-[11px]">{e.employee_code}</td>
                  <td className="sticky left-[70px] z-10 border bg-background px-2 py-1.5 font-medium whitespace-nowrap">{e.full_name}</td>
                  {Array.from({ length: daysInMonth }).map((_, i) => {
                    const s = getStatus(e.id, i + 1);
                    let cls = "border px-1 py-1 text-center font-semibold ";
                    if (s === "P") cls += "bg-green-500/15 text-green-700 dark:text-green-400";
                    else if (s === "A") cls += "bg-red-500/15 text-red-700 dark:text-red-400";
                    else cls += "text-muted-foreground";
                    return <td key={i} className={cls}>{s || "·"}</td>;
                  })}
                  <td className="border bg-green-500/10 px-2 py-1.5 text-center font-bold text-green-700 dark:text-green-400">{t.p}</td>
                  <td className="border bg-red-500/10 px-2 py-1.5 text-center font-bold text-red-700 dark:text-red-400">{t.a}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
