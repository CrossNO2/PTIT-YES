"use client";

import React from "react";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  unit?: string;
  icon: LucideIcon;
  trend?: {
    value: string;
    isPositive?: boolean;
    label?: string;
  };
  subtitle?: string;
  accentColor?: "green" | "neutral";
}

export function MetricCard({
  title,
  value,
  unit,
  icon: Icon,
  trend,
  subtitle,
  accentColor = "neutral",
}: MetricCardProps) {
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-2xs transition-all duration-200 hover:shadow-xs flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{title}</span>
        <div
          className={`p-2 rounded-lg ${
            accentColor === "green" ? "bg-[#DCFCE7] text-[#16A34A]" : "bg-slate-100 text-slate-600"
          }`}
        >
          <Icon className="w-4 h-4" />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold tracking-tight text-slate-900">{value}</span>
          {unit && <span className="text-sm font-normal text-slate-500">{unit}</span>}
        </div>

        <div className="flex items-center gap-2 mt-2">
          {trend && (
            <span
              className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                trend.isPositive !== false
                  ? "bg-[#DCFCE7] text-[#16A34A]"
                  : "bg-red-50 text-red-600"
              }`}
            >
              {trend.isPositive !== false ? (
                <TrendingUp className="w-3 h-3" />
              ) : (
                <TrendingDown className="w-3 h-3" />
              )}
              {trend.value}
            </span>
          )}
          {subtitle && <span className="text-xs text-slate-500">{subtitle}</span>}
        </div>
      </div>
    </div>
  );
}
