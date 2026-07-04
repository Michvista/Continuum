import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-white border border-slate-200 rounded-xl shadow-card ${className}`}>{children}</div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

type BadgeTone = "neutral" | "teal" | "amber" | "red" | "ink" | "blue";

const TONE_CLASSES: Record<BadgeTone, string> = {
  neutral: "bg-slate-100 text-slate-600 border-slate-200",
  teal: "bg-teal-100 text-teal-700 border-teal-100",
  amber: "bg-amber-50 text-amber-700 border-amber-200",
  red: "bg-red-50 text-red-700 border-red-200",
  ink: "bg-ink-900 text-white border-ink-900",
  blue: "bg-blue-50 text-blue-700 border-blue-200",
};

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: BadgeTone }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wide ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function EmptyState({ title, body }: { title: string; body?: string }) {
  return (
    <div className="border border-dashed border-slate-300 rounded-xl py-12 text-center">
      <p className="font-medium text-slate-700">{title}</p>
      {body && <p className="text-sm text-slate-500 mt-1">{body}</p>}
    </div>
  );
}

export function PrimaryButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`bg-ink-900 text-white text-sm font-medium rounded-lg px-4 py-2 hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function GhostButton({
  children,
  className = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`border border-slate-200 text-sm font-medium rounded-lg px-3.5 py-1.5 text-slate-700 hover:bg-slate-50 transition ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}
