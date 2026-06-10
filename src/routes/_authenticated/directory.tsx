import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { DEPARTMENTS, genderLabel } from "@/lib/cairo";

export const Route = createFileRoute("/_authenticated/directory")({
  component: DirectoryPage,
});

type Emp = {
  id: string;
  employee_code: string;
  full_name: string;
  gender: number;
  department_id: string;
};

function DirectoryPage() {
  const [q, setQ] = useState("");
  const { data: employees = [] } = useQuery({
    queryKey: ["employees-with-dept"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, employee_code, full_name, gender, department_id, departments(code, name)")
        .order("employee_code");
      if (error) throw error;
      return data as (Emp & { departments: { code: number; name: string } })[];
    },
  });

  const filtered = q
    ? employees.filter(
        (e) =>
          e.full_name.toLowerCase().includes(q.toLowerCase()) ||
          e.employee_code.includes(q),
      )
    : employees;

  const byDept = DEPARTMENTS.map((d) => ({
    ...d,
    items: filtered.filter((e) => e.departments?.code === d.code),
  }));

  return (
    <div className="flex flex-col gap-4 p-4">
      <Input placeholder="Search name or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
      <Accordion type="multiple" className="w-full">
        {byDept.map((d) => (
          <AccordionItem value={String(d.code)} key={d.code}>
            <AccordionTrigger>
              <span className="flex w-full items-center justify-between pr-2">
                <span>{d.name}</span>
                <span className="text-xs text-muted-foreground">{d.items.length}</span>
              </span>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="divide-y">
                {d.items.map((e) => (
                  <li key={e.id}>
                    <Link
                      to="/directory/$id"
                      params={{ id: e.id }}
                      className="flex items-center justify-between py-2 hover:bg-accent rounded px-2"
                    >
                      <span>
                        <span className="font-medium">{e.full_name}</span>
                        <span className="ml-2 text-xs text-muted-foreground">{genderLabel(e.gender)}</span>
                      </span>
                      <span className="font-mono text-sm">{e.employee_code}</span>
                    </Link>
                  </li>
                ))}
                {d.items.length === 0 && (
                  <li className="py-3 text-sm text-muted-foreground">No employees.</li>
                )}
              </ul>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
