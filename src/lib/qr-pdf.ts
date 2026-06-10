import QRCode from "qrcode";
import { jsPDF } from "jspdf";

export async function downloadQrPdf(code: string, name: string) {
  const dataUrl = await QRCode.toDataURL(code, { width: 600, margin: 2 });
  const pdf = new jsPDF({ unit: "mm", format: [90, 120] });
  pdf.setFontSize(14);
  pdf.text(name, 45, 12, { align: "center" });
  pdf.addImage(dataUrl, "PNG", 15, 18, 60, 60);
  pdf.setFontSize(18);
  pdf.text(code, 45, 90, { align: "center" });
  pdf.setFontSize(9);
  pdf.text("Employee ID", 45, 98, { align: "center" });
  pdf.save(`${code}-${name}.pdf`);
}

export async function qrDataUrl(code: string) {
  return QRCode.toDataURL(code, { width: 400, margin: 2 });
}
