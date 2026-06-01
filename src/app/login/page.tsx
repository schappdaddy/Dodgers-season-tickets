"use client";

import React, { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleLogin() {
    setLoading(true);
    setError("");
    const res = await fetch("/api/auth/admin-login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push("/admin/dashboard");
    } else {
      setError("Invalid password");
    }
    setLoading(false);
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#0C2340] to-[#005A9C] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-10 h-10 bg-[#0C2340] rounded-full flex items-center justify-center">
            <span className="text-white font-bold text-sm">LA</span>
          </div>
          <div>
            <div className="font-bold text-zinc-900">Ticket Manager</div>
            <div className="text-xs text-zinc-400">Admin login</div>
          </div>
        </div>
        <div className="grid gap-4">
          <div>
            <label className="text-sm font-medium text-zinc-700">Password</label>
            <input
              type="password"
              className="mt-1 w-full border rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleLogin()}
              placeholder="Enter admin password"
              autoFocus
            />
          </div>
          {error && (
            <div className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {error}
            </div>
          )}
          <button
            onClick={handleLogin}
            disabled={!password || loading}
            className="w-full py-2.5 bg-[#005A9C] text-white rounded-xl font-medium hover:bg-[#0C2340] disabled:opacity-50 transition-colors"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
