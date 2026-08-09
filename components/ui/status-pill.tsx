"use client";

import React from "react";

interface StatusPillProps {
  status: string;
  variant?: "success" | "warning" | "info" | "neutral" | "danger";
}

export function StatusPill({ status, variant }: StatusPillProps) {
  const normalized = status.toLowerCase();

  let resolvedVariant = variant;
  if (!resolvedVariant) {
    if (["assigned", "in_progress", "completed", "active", "approved"].includes(normalized)) {
      resolvedVariant = "success";
    } else if (["pending", "draft", "warning"].includes(normalized)) {
      resolvedVariant = "warning";
    } else if (["cancelled", "failed", "inactive"].includes(normalized)) {
      resolvedVariant = "danger";
    } else {
      resolvedVariant = "neutral";
    }
  }

  const styles = {
    success: "bg-[#DCFCE7] text-[#16A34A] border-emerald-200",
    warning: "bg-amber-50 text-amber-700 border-amber-200",
    danger: "bg-red-50 text-red-700 border-red-200",
    info: "bg-blue-50 text-blue-700 border-blue-200",
    neutral: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider font-mono border ${styles[resolvedVariant]}`}
    >
      {status}
    </span>
  );
}
