import { jsPDF } from "jspdf";
import { ESG_DISCLAIMER } from "@/lib/esg";

export type EsgReportPdfData = {
  shopName: string;
  reportDate: string;
  totalKmSaved: number;
  totalCo2SavedKg: number;
  totalPackagingCollectedKg: number;
  totalCostSavedVnd: number;
  routeCount: number;
};

export function generateEsgPdfReport(data: EsgReportPdfData): Buffer {
  const doc = new jsPDF();

  // Header
  doc.setFontSize(20);
  doc.setTextColor(22, 163, 74); // Green
  doc.text("GREENBRIDGE AI — BÁO CÁO ESG", 20, 25);

  doc.setFontSize(10);
  doc.setTextColor(100, 116, 139);
  doc.text(`Shop: ${data.shopName}`, 20, 33);
  doc.text(`Ngay xuat bao cao: ${data.reportDate}`, 20, 40);

  // Line Divider
  doc.setLineWidth(0.5);
  doc.setDrawColor(203, 213, 225);
  doc.line(20, 45, 190, 45);

  // Key ESG Metrics Summary Table
  doc.setFontSize(14);
  doc.setTextColor(15, 23, 42);
  doc.text("Tong Quan Chi So Xanh & Tiet Kiem Environment", 20, 58);

  doc.setFontSize(11);
  doc.text(`1. Tong Quang Duong Tiet Kiem: ${data.totalKmSaved} km`, 25, 70);
  doc.text(`2. Uoc Tinh CO2 Giam Thai: ${data.totalCo2SavedKg} kg CO2e`, 25, 80);
  doc.text(`3. Bao Bi Thu Gom Tai Che: ${data.totalPackagingCollectedKg} kg`, 25, 90);
  doc.text(`4. Chi Phi Nhien Lieu Tiet Kiem: ${data.totalCostSavedVnd.toLocaleString()} VND`, 25, 100);
  doc.text(`5. Tong So Tuyens Duong Thuc Hien: ${data.routeCount} routes`, 25, 110);

  // Baseline Method
  doc.setFontSize(10);
  doc.setTextColor(71, 85, 105);
  doc.text("Phuong phap So Sanh Baseline: CREATION_ORDER_V1 (Order Creation Sequence)", 20, 130);

  // Disclaimer Notice
  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text("GHI CHU BAO MAT & MINH MINH:", 20, 150);
  doc.text(ESG_DISCLAIMER, 20, 156, { maxWidth: 170 });

  const arrayBuffer = doc.output("arraybuffer");
  return Buffer.from(arrayBuffer);
}
