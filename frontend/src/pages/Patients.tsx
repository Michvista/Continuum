import { useState, useEffect, useCallback } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Users, Plus, ShieldCheck, ArrowRight, Search, Loader2 } from "lucide-react";
import { useApp } from "../context/AppContext";
import { api } from "../api";
import type { Patient } from "../types";
import { Card, PrimaryButton, EmptyState } from "../components/ui";

export default function Patients() {
  const { patients: recentPatients, refreshPatients, setSelectedPatientId } = useApp();
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Patient[]>([]);
  const [searching, setSearching] = useState(false);
  const navigate = useNavigate();

  // Debounced search query
  const runSearch = useCallback((q: string) => {
    setSearching(true);
    api.listPatients(q)
      .then((list) => {
        setSearchResults(list);
        setSearching(false);
      })
      .catch(() => setSearching(false));
  }, []);

  useEffect(() => {
    const timeout = setTimeout(() => runSearch(searchTerm), searchTerm ? 300 : 0);
    return () => clearTimeout(timeout);
  }, [searchTerm, runSearch]);

  const displayedPatients = searchTerm ? searchResults : recentPatients;

  async function enroll(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    try {
      const patient = await api.createPatient(name.trim());
      await refreshPatients();
      setSelectedPatientId(patient.id);
      setName("");
      navigate("/dashboard");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <div className="lg:col-span-2">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-base">
            {searchTerm ? "Search results" : "Recent patients"}
          </h2>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 shadow-sm w-56 focus-within:border-teal-400 focus-within:ring-1 focus-within:ring-teal-200 transition">
            <Search size={13} className="text-slate-400 shrink-0" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or ID…"
              className="flex-1 text-xs bg-transparent outline-none placeholder:text-slate-400 text-slate-700"
            />
            {searching && <Loader2 size={12} className="animate-spin text-slate-400 shrink-0" />}
          </div>
        </div>

        {displayedPatients.length === 0 ? (
          searchTerm ? (
            <EmptyState title="No patients found" body={`No results for "${searchTerm}"`} />
          ) : (
            <EmptyState title="No patients enrolled yet" body="Enroll the first one from the panel on the right." />
          )
        ) : (
          <div className="space-y-2">
            {displayedPatients.map((p) => (
              <Card key={p.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{p.displayName}</p>
                  <p className="text-xs text-slate-400 font-mono mt-0.5">
                    ID: {p.id} · enrolled {new Date(p.consentedAt).toLocaleDateString()}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedPatientId(p.id);
                    navigate("/dashboard");
                  }}
                  className="text-xs font-mono border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50"
                >
                  Open
                </button>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Card className="p-5 h-fit">
        <div className="flex items-center gap-2 mb-3">
          <Users size={16} className="text-teal-600" />
          <h2 className="font-semibold text-sm">Enroll a patient</h2>
        </div>
        <p className="text-xs text-slate-500 mb-4">
          Enrollment is consent to join the network. The patient portal can hide selected categories, but
          clinicians still have an audited break-glass route when the case demands it.
        </p>
        <form onSubmit={enroll} className="space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Patient display name"
            className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
          />
          <PrimaryButton
            type="submit"
            disabled={saving || !name.trim()}
            className="w-full flex items-center justify-center gap-1.5"
          >
            <Plus size={14} /> Enroll patient
          </PrimaryButton>
        </form>
        <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50 p-4">
          <div className="flex items-center gap-2 text-teal-700">
            <ShieldCheck size={15} />
            <p className="text-sm font-medium">Need the public consent view?</p>
          </div>
          <p className="text-xs text-teal-700/80 mt-2">
            Open the patient portal to manage shared-care visibility and emergency override settings.
          </p>
          <Link
            to="/portal"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-teal-700 hover:text-teal-900"
          >
            <ArrowRight size={13} /> Open portal
          </Link>
        </div>
      </Card>
    </div>
  );
}
