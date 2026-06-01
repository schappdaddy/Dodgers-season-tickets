import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Tier, Disposition, TIER_DEFAULTS, SEATGEEK_FEE } from "./types";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatLA(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

export function formatDate(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "short",
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

export function money(n: number | null | undefined) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(n || 0);
}

export function toNumberOrNull(input: string): number | null {
  const t = (input || "").trim().replace(/[$,]/g, "");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function calcNetProceeds(listPricePerTicket: number): number {
  return listPricePerTicket * 2 * (1 - SEATGEEK_FEE);
}

export function getSuggestedPrice(tier: Tier): number {
  return TIER_DEFAULTS[tier].suggestedPrice;
}

export function getFloorPrice(tier: Tier): number {
  return TIER_DEFAULTS[tier].floorPrice;
}

export function tierLabel(tier: Tier): string {
  return { premium: "Premium", mid: "Mid", low: "Low" }[tier];
}

export function dispositionLabel(d: Disposition): string {
  return { sell: "Sell", keep: "Keep", friends: "Friends" }[d];
}

export function daysUntil(iso: string): number {
  const now = new Date();
  const game = new Date(iso);
  return Math.ceil((game.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function pad2(n: number) {
  return String(n).padStart(2, "0");
}

export function toICSDateUTC(date: Date) {
  return (
    date.getUTCFullYear() +
    pad2(date.getUTCMonth() + 1) +
    pad2(date.getUTCDate()) +
    "T" +
    pad2(date.getUTCHours()) +
    pad2(date.getUTCMinutes()) +
    pad2(date.getUTCSeconds()) +
    "Z"
  );
}

export function makeICS(opts: {
  title: string;
  description: string;
  location: string;
  start: Date;
  end: Date;
  uid: string;
}) {
  const safe = (s = "") => String(s).replace(/\n/g, "\\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dodgers Tickets Manager//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${opts.uid}`,
    `DTSTAMP:${toICSDateUTC(new Date())}`,
    `DTSTART:${toICSDateUTC(opts.start)}`,
    `DTEND:${toICSDateUTC(opts.end)}`,
    `SUMMARY:${safe(opts.title)}`,
    `DESCRIPTION:${safe(opts.description)}`,
    `LOCATION:${safe(opts.location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

export function downloadFile(
  filename: string,
  content: string,
  mime = "text/calendar;charset=utf-8"
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
