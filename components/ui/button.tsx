"use client";

import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  children: React.ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  children,
  className = "",
  disabled,
  ...props
}: ButtonProps) {
  const baseStyle =
    "inline-flex items-center justify-center font-medium rounded-md transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[var(--color-primary)] disabled:opacity-50 disabled:cursor-not-allowed";

  const variants = {
    primary: "bg-[var(--color-primary)] text-white hover:bg-[var(--color-primary-hover)]",
    secondary: "bg-white border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-muted)]",
    outline: "bg-transparent border border-[var(--color-border)] text-[var(--color-text-primary)] hover:bg-[var(--color-surface-muted)]",
    ghost: "bg-transparent text-[var(--color-text-primary)] hover:bg-[var(--color-surface-muted)]",
    danger: "bg-[var(--color-danger)] text-white hover:bg-[var(--color-danger)]",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs h-8",
    md: "px-4 py-2 text-sm h-10",
    lg: "px-5 py-2.5 text-base h-12",
  };

  return (
    <button
      disabled={disabled}
      className={`${baseStyle} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
