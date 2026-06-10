import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { DEPARTMENTS, genderLabel } from "@/lib/cairo";
import { downloadQrPdf, qrDataUrl } from "@/lib/qr-pdf";
import { Pencil, Trash2, Plus, Download } from "lucide-react";

export const Route = createFileRoute("/_authenticated/manage")({
  component: ManagePage,
});

type Emp = {
  id: string;
  employee_code: string;
  full_name: string;
  gender: number;
  department_id: string;
  departments?: { code: number; name: string } | null;
};

function ManagePage() {
  const qc = useQueryClient();
  const [q, setQ] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editEmp, setEditEmp] = useState<Emp | null>(null);
  const [newEmpResult, setNewEmpResult] = useState<{ code: string; name: string; qr: string } | null>(null);

  const { data: employees = [] } = useQuery({
    queryKey: ["employees-with-dept"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("employees")
        .select("id, employee_code, full_name, gender, department_id, departments(code, name)")
        .order("employee_code");
      if (error) throw error;
      return data as Emp[];
    },
  });

  const filtered = q
    ? employees.filter((e) => e.full_name.toLowerCase().includes(q.toLowerCase()) || e.employee_code.includes(q))
    : employees;

  const refresh = () => qc.invalidateQueries({ queryKey: ["employees-with-dept"] });

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("Employee deleted");
    refresh();
  };

  return (
    <div className="flex flex-col gap-4 p-4">
      <div className="flex gap-2">
        <Input placeholder="Search name or ID…" value={q} onChange={(e) => setQ(e.target.value)} />
        <Button onClick={() => setAddOpen(true)}><Plus className="h-4 w-4 mr-1" />Add</Button>
      </div>

      <ul className="divide-y rounded-md border">
        {filtered.map((e) => (
          <li key={e.id} className="flex items-center justify-between p-3">
            <div>
              <div className="font-medium">{e.full_name}</div>
              <div className="text-xs text-muted-foreground">
                <span className="font-mono">{e.employee_code}</span> · {e.departments?.name} · {genderLabel(e.gender)}
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={async () => {
                const qr = await qrDataUrl(e.employee_code);
                setNewEmpResult({ code: e.employee_code, name: e.full_name, qr });
              }}>
                <Download className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => setEditEmp(e)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="icon" variant="ghost"><Trash2 className="h-4 w-4 text-destructive" /></Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {e.full_name}?</AlertDialogTitle>
                    <AlertDialogDescription>This permanently removes the employee and all their attendance records.</AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleDelete(e.id)}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </li>
        ))}
        {filtered.length === 0 && <li className="p-4 text-sm text-muted-foreground">No employees.</li>}
      </ul>

      <AddDialog open={addOpen} onOpenChange={setAddOpen} onCreated={(r) => { setNewEmpResult(r); refresh(); }} />
      {editEmp && <EditDialog emp={editEmp} onClose={() => setEditEmp(null)} onSaved={refresh} />}
      {newEmpResult && <QrResultDialog data={newEmpResult} onClose={() => setNewEmpResult(null)} />}
    </div>
  );
}

function AddDialog({ open, onOpenChange, onCreated }: {
  open: boolean; onOpenChange: (v: boolean) => void;
  onCreated: (r: { code: string; name: string; qr: string }) => void;
}) {
  const [name, setName] = useState("");
  const [gender, setGender] = useState("1");
  const [dept, setDept] = useState("1");
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("create_employee", {
        p_full_name: name.trim(),
        p_gender: Number(gender),
        p_department_code: Number(dept),
      });
      if (error) throw error;
      const row = data as { employee_code: string; full_name: string };
      const qr = await qrDataUrl(row.employee_code);
      toast.success(`Created ${row.employee_code}`);
      onCreated({ code: row.employee_code, name: row.full_name, qr });
      onOpenChange(false);
      setName("");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>Add employee</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>Gender</Label>
            <Select value={gender} onValueChange={setGender}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Male</SelectItem>
                <SelectItem value="2">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Department</Label>
            <Select value={dept} onValueChange={setDept}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => <SelectItem key={d.code} value={String(d.code)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading || !name.trim()}>{loading ? "Creating…" : "Create"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ emp, onClose, onSaved }: { emp: Emp; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(emp.full_name);
  const [deptCode, setDeptCode] = useState(String(emp.departments?.code ?? 1));
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data: deptRow, error: dErr } = await supabase.from("departments").select("id").eq("code", Number(deptCode)).single();
      if (dErr) throw dErr;
      const { error } = await supabase.from("employees").update({
        full_name: name.trim(),
        department_id: deptRow.id,
      }).eq("id", emp.id);
      if (error) throw error;
      toast.success("Saved");
      onSaved();
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Edit {emp.employee_code}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div>
            <Label>Full name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <Label>Department</Label>
            <Select value={deptCode} onValueChange={setDeptCode}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {DEPARTMENTS.map((d) => <SelectItem key={d.code} value={String(d.code)}>{d.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={loading}>{loading ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function QrResultDialog({ data, onClose }: { data: { code: string; name: string; qr: string }; onClose: () => void }) {
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>{data.name}</DialogTitle></DialogHeader>
        <Card className="flex flex-col items-center gap-3 p-4">
          <img src={data.qr} alt="QR" className="h-56 w-56" />
          <div className="font-mono text-lg">{data.code}</div>
          <Button onClick={() => downloadQrPdf(data.code, data.name)}>
            <Download className="h-4 w-4 mr-1" />Download QR as PDF
          </Button>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
