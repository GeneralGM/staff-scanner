import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cairoTime } from "@/lib/cairo";

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

function ScannerPage() {
  const containerId = "qr-reader";
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const [active, setActive] = useState(false);
  const [last, setLast] = useState<ScanResult | null>(null);
  const lockRef = useRef<{ code: string; at: number } | null>(null);

  const start = async () => {
    if (scannerRef.current) return;
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;
    try {
      await scanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 250 } },
        async (decoded) => {
          const now = Date.now();
          if (lockRef.current && lockRef.current.code === decoded && now - lockRef.current.at < 3000) return;
          lockRef.current = { code: decoded, at: now };
          const { data, error } = await supabase.rpc("scan_qr", { p_code: decoded });
          if (error) {
            toast.error(error.message);
            return;
          }
          const res = data as unknown as ScanResult;
          setLast(res);
          if (!res.ok) {
            toast.error(res.error || "Scan failed");
          } else if (res.action === "check_in") {
            toast.success(`✅ Check-in: ${res.employee?.full_name}`);
          } else if (res.action === "check_out" || res.action === "check_out_update") {
            toast.success(`🚪 Check-out: ${res.employee?.full_name}`);
          }
        },
        () => {},
      );
      setActive(true);
    } catch (e) {
      toast.error((e as Error).message || "Camera failed");
      scannerRef.current = null;
    }
  };

  const stop = async () => {
    if (!scannerRef.current) return;
    try {
      await scannerRef.current.stop();
      await scannerRef.current.clear();
    } catch {}
    scannerRef.current = null;
    setActive(false);
  };

  useEffect(() => {
    start();
    return () => {
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col gap-4 p-4">
      <div id={containerId} className="overflow-hidden rounded-lg bg-black aspect-square w-full max-w-md mx-auto" />
      <div className="flex justify-center">
        {active ? (
          <Button variant="outline" onClick={stop}>Stop camera</Button>
        ) : (
          <Button onClick={start}>Start camera</Button>
        )}
      </div>
      {last?.ok && last.employee && (
        <Card className="mx-auto w-full max-w-md p-4">
          <div className="text-sm text-muted-foreground">Last scan</div>
          <div className="text-lg font-semibold">{last.employee.full_name}</div>
          <div className="font-mono text-sm">{last.employee.employee_code}</div>
          <div className="mt-2 text-sm">
            {last.attendance?.check_in && (
              <div>Check-in: {cairoTime(last.attendance.check_in)}</div>
            )}
            {last.attendance?.check_out && (
              <div>Check-out: {cairoTime(last.attendance.check_out)}</div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
