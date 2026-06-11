import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { LogIn, LogOut, Camera, RotateCcw } from "lucide-react";
import { cairoTime } from "@/lib/cairo";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/scanner")({
  component: ScannerPage,
});

type ScanResult = {
  ok: boolean;
  error?: string;
  action?: string;
  employee?: { full_name: string; employee_code: string };
  attendance?: { check_in: string | null; check_out: string | null };
};

type Mode = "check_in" | "check_out";

function ScannerPage() {
  const containerId = "qr-reader";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const processingRef = useRef(false);
  const [active, setActive] = useState(false);
  const [mode, setMode] = useState<Mode>("check_in");
  const [last, setLast] = useState<ScanResult | null>(null);

  const stop = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (!s) return;
    try {
      await s.stop();
      await s.clear();
    } catch {}
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    if (scannerRef.current) return;
    setLast(null);
    processingRef.current = false;
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decoded) => {
          if (processingRef.current) return;
          processingRef.current = true;
          // Freeze camera immediately on first successful decode
          await stop();
          const { data, error } = await supabase.rpc("scan_qr", { p_code: decoded });
          if (error) {
            toast.error(error.message);
            return;
          }
          const res = data as unknown as ScanResult;
          setLast(res);
          if (!res.ok) {
            toast.error(res.error || "فشل المسح");
            return;
          }
          const action = res.action;
          const name = res.employee?.full_name ?? "";
          if (action === "check_in") {
            if (mode === "check_in") toast.success(`✅ حضور: ${name}`);
            else toast.warning(`الموظف ${name} لم يسجل حضور بعد — تم تسجيل الحضور`);
          } else if (action === "check_out" || action === "check_out_update") {
            if (mode === "check_out") toast.success(`🚪 انصراف: ${name}`);
            else toast.warning(`الموظف ${name} مسجل حضور بالفعل — تم تسجيل الانصراف`);
          }
        },
        () => {},
      );
      setActive(true);
    } catch (e) {
      toast.error((e as Error).message || "تعذر تشغيل الكاميرا");
      scannerRef.current = null;
    }
  }, [mode, stop]);

  useEffect(() => {
    start();
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4" dir="rtl">
      <div className="mx-auto w-full max-w-md">
        <div className="grid grid-cols-2 gap-2 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => setMode("check_in")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition",
              mode === "check_in"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LogIn className="h-4 w-4" /> حضور
          </button>
          <button
            type="button"
            onClick={() => setMode("check_out")}
            className={cn(
              "flex items-center justify-center gap-2 rounded-md py-2 text-sm font-medium transition",
              mode === "check_out"
                ? "bg-background shadow-sm text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <LogOut className="h-4 w-4" /> انصراف
          </button>
        </div>
        <p className="mt-2 text-center text-xs text-muted-foreground">
          {mode === "check_in" ? "وضع تسجيل الحضور" : "وضع تسجيل الانصراف"}
        </p>
      </div>

      <div className="relative mx-auto aspect-square w-full max-w-md overflow-hidden rounded-lg bg-black">
        <div id={containerId} className="h-full w-full" />
        {!active && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/60 text-white">
            <Camera className="h-10 w-10 opacity-70" />
            <span className="text-sm opacity-80">الكاميرا متوقفة</span>
          </div>
        )}
      </div>

      <div className="flex justify-center">
        {active ? (
          <Button variant="outline" onClick={stop}>إيقاف الكاميرا</Button>
        ) : (
          <Button onClick={start} className="gap-2">
            <RotateCcw className="h-4 w-4" /> مسح مرة أخرى
          </Button>
        )}
      </div>

      {last?.ok && last.employee && (
        <Card className="mx-auto w-full max-w-md p-4">
          <div className="text-sm text-muted-foreground">آخر عملية</div>
          <div className="text-lg font-semibold">{last.employee.full_name}</div>
          <div className="font-mono text-sm">{last.employee.employee_code}</div>
          <div className="mt-2 text-sm">
            {last.attendance?.check_in && (
              <div>الحضور: {cairoTime(last.attendance.check_in)}</div>
            )}
            {last.attendance?.check_out && (
              <div>الانصراف: {cairoTime(last.attendance.check_out)}</div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
