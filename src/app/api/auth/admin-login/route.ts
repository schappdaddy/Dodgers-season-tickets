import { NextResponse } from "next/server";
import crypto from "crypto";

function sign(value: string, secret: string) {
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export async function POST(req: Request) {
  const { password } = await req.json();

  const adminPassword = process.env.ADMIN_PASSWORD || "";
  const secret = process.env.ADMIN_COOKIE_SECRET || "";

  if (!adminPassword || !secret) {
    return NextResponse.json(
      { message: "Missing ADMIN_PASSWORD or ADMIN_COOKIE_SECRET" },
      { status: 500 }
    );
  }

  if (!password || String(password) !== adminPassword) {
    return NextResponse.json({ message: "Invalid password" }, { status: 401 });
  }

  const ts = Date.now().toString();
  const sig = sign(ts, secret);
  const token = `${ts}.${sig}`;

  const res = NextResponse.json({ ok: true });

  res.cookies.set("admin_auth", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });

  return res;
}
