import { useState, useEffect, useRef } from "react";
import { Search, ChevronDown, Loader2 } from "lucide-react";
import { api } from "../api";
import type { Patient } from "../types";

interface PatientSearchSelectProps {
  value: string | null;
  onChange: (id: string | null) => void;
}

export function PatientSearchSelect({ value, onChange }: PatientSearchSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [results, setResults] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fetch individual patient details if value is selected
  useEffect(() => {
    if (!value) {
      setSelectedPatient(null);
      return;
    }
    // If we already have this patient in results, reuse it
    const found = results.find((p) => p.id === value);
    if (found) {
      setSelectedPatient(found);
      return;
    }
    // Otherwise fetch from server
    api.getPatient(value)
      .then((detail) => {
        setSelectedPatient({
          id: detail.id,
          displayName: detail.displayName,
          consentedAt: detail.consentedAt,
          createdAt: detail.createdAt,
        });
      })
      .catch((err) => {
        console.error("Failed to load selected patient details", err);
      });
  }, [value, results]);

  // Query matching patients on open or search query change (debounced)
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      api.listPatients(searchTerm)
        .then((list) => {
          setResults(list);
          setLoading(false);
        })
        .catch((err) => {
          console.error("Search query failed", err);
          setLoading(false);
        });
    }, searchTerm ? 300 : 0);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm, isOpen]);

  // Click outside to close dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative inline-block text-left w-full max-w-[240px]" ref={dropdownRef}>
      <div>
        <button
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          className="flex w-full items-center justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 transition shadow-sm focus:outline-none focus:ring-1 focus:ring-teal-500 focus:border-teal-500"
        >
          {selectedPatient ? (
            <span className="truncate text-left font-medium">
              {selectedPatient.displayName}{" "}
              <span className="text-[10px] text-slate-400 font-mono">
                ({selectedPatient.id.slice(0, 10)})
              </span>
            </span>
          ) : (
            <span className="text-slate-400">Select patient…</span>
          )}
          <ChevronDown size={14} className={`text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
        </button>
      </div>

      {isOpen && (
        <div className="absolute right-0 z-50 mt-1 w-72 origin-top-right rounded-xl border border-slate-200 bg-white p-2 shadow-lg ring-1 ring-black/5 animate-fade-in focus:outline-none">
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 mb-2">
            <Search size={14} className="text-slate-400 shrink-0" />
            <input
              type="text"
              autoFocus
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or ID…"
              className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400 text-slate-700"
            />
            {loading && <Loader2 size={12} className="animate-spin text-slate-400 shrink-0" />}
          </div>

          <div className="max-h-56 overflow-y-auto space-y-0.5 scrollbar-thin">
            {results.length === 0 ? (
              <p className="text-[11px] text-slate-400 text-center py-4">No patients found</p>
            ) : (
              results.map((p) => {
                const isSelected = p.id === value;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onChange(p.id);
                      setIsOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs transition text-left ${
                      isSelected
                        ? "bg-teal-50 text-teal-700 font-medium"
                        : "text-slate-600 hover:bg-slate-50"
                    }`}
                  >
                    <span className="truncate">{p.displayName}</span>
                    <span className="text-[10px] font-mono text-slate-400 ml-2 shrink-0">
                      {p.id.slice(0, 10)}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
