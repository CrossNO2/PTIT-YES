"use client";

import { useState } from "react";
import { Download, Info, Recycle, DollarSign, Leaf } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LineChart, Line } from "recharts";
import { useShop } from "@/lib/hooks/use-shop-context";

export default function AdminEsgPage() {
  const { shopId } = useShop();
  const [filterPeriod, setFilterPeriod] = useState("month");

  const trendData = [
    { date: "01/08", kmSaved: 18.2, co2Saved: 2.7, packagingKg: 15.0 },
    { date: "02/08", kmSaved: 24.5, co2Saved: 3.6, packagingKg: 22.5 },
    { date: "03/08", kmSaved: 19.0, co2Saved: 2.8, packagingKg: 18.0 },
    { date: "04/08", kmSaved: 32.1, co2Saved: 4.8, packagingKg: 30.0 },
    { date: "05/08", kmSaved: 28.4, co2Saved: 4.2, packagingKg: 24.0 },
    { date: "06/08", kmSaved: 20.3, co2Saved: 3.0, packagingKg: 15.0 },
  ];

  const handleExportPdf = () => {
    if (!shopId) return;
    window.open(`/api/reports/esg?shop_id=${shopId}`, "_blank");
  };

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-200 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Dashboard Báo Cáo ESG & Tác Động Môi Trường</h1>
          <p className="text-xs text-slate-500 mt-1">Đo lường CO₂ giảm thải, km tiết kiệm & bao bì tái chế thu gom</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleExportPdf}
            className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-medium text-xs shadow-2xs flex items-center gap-2 transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Xuất Báo Cáo ESG (PDF)</span>
          </button>
        </div>
      </div>

      {/* ESG Impact Stat Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tổng CO₂ Đã Giảm</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Leaf className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            21.1 <span className="text-sm font-normal text-slate-500">kg CO₂</span>
          </div>
          <p className="text-xs text-emerald-600 font-medium">Tương đương trồng 1.2 cây xanh</p>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Bao Bì Thu Gom</span>
            <div className="p-2 bg-emerald-50 text-emerald-600 rounded-lg">
              <Recycle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-emerald-600">
            124.5 <span className="text-sm font-normal text-slate-500">kg</span>
          </div>
          <p className="text-xs text-slate-500">100% tái chế thành công</p>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Cự Ly Tiết Kiệm</span>
            <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
              <Info className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            142.5 <span className="text-sm font-normal text-slate-500">km</span>
          </div>
          <p className="text-xs text-slate-500">So với thuật toán giao cơ bản</p>
        </div>

        <div className="p-5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Tiết Kiệm Chi Phí</span>
            <div className="p-2 bg-slate-100 text-slate-700 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900">
            350.000 <span className="text-sm font-normal text-slate-500">VNĐ</span>
          </div>
          <p className="text-xs text-slate-500">Tiết kiệm nhiên liệu vận tải</p>
        </div>
      </div>

      {/* Chart Panel */}
      <div className="p-6 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-4">
        <h2 className="font-semibold text-slate-900 text-sm border-b border-slate-100 pb-3">
          Biểu Đồ Xu Hướng Giảm Thải CO₂ & Thu Gom Bao Bì
        </h2>
        <div className="h-64 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={trendData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} />
              <Tooltip contentStyle={{ backgroundColor: "#ffffff", borderColor: "#e2e8f0", fontSize: "12px", borderRadius: "8px" }} />
              <Bar dataKey="co2Saved" fill="#16a34a" radius={[4, 4, 0, 0]} name="CO2 Giảm Thải (kg)" />
              <Bar dataKey="packagingKg" fill="#94a3b8" radius={[4, 4, 0, 0]} name="Bao Bì Thu Gom (kg)" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
