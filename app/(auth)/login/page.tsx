"use client";

import { useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Leaf, ArrowRight, Lock, Mail, ShieldAlert, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMessage("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setErrorMessage("Email hoặc mật khẩu không chính xác.");
        setLoading(false);
        return;
      }

      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("account_type")
          .eq("id", data.user.id)
          .single();

        const accountType = profile?.account_type || "customer";

        if (redirectTo) {
          router.push(redirectTo);
        } else if (accountType === "platform_admin" || accountType === "shop_user") {
          router.push("/admin/dashboard");
        } else {
          router.push("/customer/home");
        }
      }
    } catch {
      setErrorMessage("Đã xảy ra lỗi đăng nhập");
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 shadow-xs z-10 space-y-6">
      {/* Brand Header */}
      <div className="flex flex-col items-center text-center">
        <div className="w-12 h-12 bg-emerald-600 rounded-xl flex items-center justify-center text-white shadow-2xs mb-3">
          <Leaf className="w-6 h-6" />
        </div>
        <h1 className="text-xl font-bold tracking-tight text-slate-900">GreenBridge AI</h1>
        <p className="text-xs text-slate-500 mt-1">Nền tảng Tối Ưu Tuyến Đường & Thu Gom Bao Bì Enterprise</p>
      </div>

      {errorMessage && (
        <div className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs flex items-start gap-2.5">
          <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleLogin} className="space-y-4 text-xs">
        <div>
          <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
            Địa chỉ Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@greenbridge.vn"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
            />
          </div>
        </div>

        <div>
          <label className="block font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
            Mật khẩu
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3.5 py-2 text-slate-800 placeholder-slate-400 focus:outline-hidden focus:border-emerald-500 focus:bg-white"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-medium py-2.5 px-4 rounded-lg shadow-2xs flex items-center justify-center gap-2 transition disabled:opacity-50 text-xs"
        >
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Đang xử lý đăng nhập...</span>
            </>
          ) : (
            <>
              <span>Đăng nhập</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </form>

      {/* Footer */}
      <div className="pt-4 border-t border-slate-100 text-center text-xs text-slate-500">
        Chưa có tài khoản?{" "}
        <Link href="/register" className="text-emerald-600 font-semibold hover:underline">
          Đăng ký khách hàng
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col justify-center items-center p-4 relative text-slate-900">
      <Suspense fallback={
        <div className="w-full max-w-md bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-xs">
          Đang tải...
        </div>
      }>
        <LoginForm />
      </Suspense>
    </div>
  );
}
