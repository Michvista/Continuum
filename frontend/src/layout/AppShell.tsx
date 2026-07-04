import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useEffect, useMemo, useState } from "react";
import {
  LayoutDashboard,
  Activity,
  Share2,
  ListChecks,
  Users,
  ShieldCheck,
  Settings as SettingsIcon,
  Bell,
  Search,
  Building2,
  LogOut,
  ChevronDown,
  Menu,
  X,
} from "lucide-react";
import { useApp } from "../context/AppContext";
import { PatientSearchSelect } from "../components/PatientSearchSelect";

const NAV_ITEMS = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/consent", label: "Consent dashboard", icon: ShieldCheck },
  { to: "/timeline", label: "Timeline", icon: Activity },
  { to: "/knowledge-graph", label: "Knowledge Graph", icon: Share2 },
  { to: "/conflicts", label: "Conflicts", icon: ListChecks },
  { to: "/patients", label: "Patients", icon: Users },
];

export function AppShell() {
  const {
    session,
    logout,
    selectedPatientId,
    setSelectedPatientId,
    selectedPatient: patient,
    fragments,
  } = useApp();
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [query, setQuery] = useState("");

  // Close sidebar on route change
  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);
  const conflictCount = useMemo(
    () =>
      fragments.filter(
        (f) => f.conflictsWithId && f.reviewStatus !== "RESOLVED",
      ).length,
    [fragments],
  );

  async function quickRecall(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || !selectedPatientId) return;
    navigate(`/timeline?ask=${encodeURIComponent(query)}`);
    setSidebarOpen(false);
  }

  if (!session) return null;

  const sidebarContent = (
    <>
      <div className="px-5 py-5 border-b border-slate-100 flex items-center justify-between">
        <p className="text-lg font-semibold tracking-tight">Continuum</p>
        {/* Close button — visible on mobile only */}
        <button
          className="lg:hidden text-slate-400 hover:text-slate-700"
          onClick={() => setSidebarOpen(false)}
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-5 py-4 border-b border-slate-100">
        <p className="eyebrow">Patient Identity</p>
        {patient ? (
          <>
            <p className="font-medium text-sm mt-1">{patient.displayName}</p>
            <p className="text-xs text-slate-400 font-mono mt-0.5">
              ID: {patient.id.slice(0, 10)}
            </p>
          </>
        ) : (
          <p className="text-xs text-slate-400 mt-1">No patient selected</p>
        )}
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {NAV_ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-teal-100 text-teal-700"
                  : "text-slate-600 hover:bg-slate-50"
              }`
            }>
            <item.icon size={16} />
            {item.label}
            {item.to === "/conflicts" && conflictCount > 0 && (
              <span className="ml-auto bg-red-50 text-red-600 text-[10px] font-mono px-1.5 py-0.5 rounded-full border border-red-200">
                {conflictCount}
              </span>
            )}
          </NavLink>
        ))}
        <NavLink
          to="/verifiable-proof"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              isActive
                ? "bg-teal-100 text-teal-700"
                : "text-slate-600 hover:bg-slate-50"
            }`
          }>
          <ShieldCheck size={16} /> Verifiable Proof
        </NavLink>
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition ${
              isActive
                ? "bg-teal-100 text-teal-700"
                : "text-slate-600 hover:bg-slate-50"
            }`
          }>
          <SettingsIcon size={16} /> Settings
        </NavLink>
      </nav>
    </>
  );

  return (
    <div className="min-h-screen flex bg-[#f7f8fa]">
      {/* ── Mobile sidebar overlay ── */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* ── Sidebar (desktop: always visible; mobile: slide-in drawer) ── */}
      <aside
        className={`
          fixed inset-y-0 left-0 z-40 w-64 border-r border-slate-200 bg-white flex flex-col h-screen
          transform transition-transform duration-200 ease-in-out
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 lg:static lg:w-60 lg:shrink-0
        `}
      >
        {sidebarContent}
      </aside>

      {/* ── Main column ── */}
      <div className="flex-1 min-w-0 flex flex-col h-screen overflow-hidden">
        {/* Topbar */}
        <header className="h-14 lg:h-16 border-b border-slate-200 bg-white flex items-center gap-3 px-4 lg:px-6 shrink-0">
          {/* Hamburger — mobile only */}
          <button
            className="lg:hidden text-slate-500 hover:text-slate-700 mr-1"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation"
          >
            <Menu size={20} />
          </button>

          <form onSubmit={quickRecall} className="flex-1 min-w-0 max-w-md">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <Search size={15} className="text-slate-400 shrink-0" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Recall clinical history…"
                className="bg-transparent text-sm outline-none flex-1 min-w-0 placeholder:text-slate-400"
              />
            </div>
          </form>

          <div className="hidden sm:block">
            <PatientSearchSelect
              value={selectedPatientId}
              onChange={setSelectedPatientId}
            />
          </div>

          <div className="flex items-center gap-2 ml-auto">
            <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-500 font-mono border border-slate-200 rounded-full px-3 py-1.5 max-w-[140px] truncate">
              <Building2 size={13} className="shrink-0" />
              <span className="truncate">{session.institutionName}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-teal-700 font-mono border border-teal-200 bg-teal-50 rounded-full px-3 py-1.5">
              <ShieldCheck size={13} /> {session.role.toLowerCase()}
            </div>
            <button className="relative text-slate-500 hover:text-slate-700 p-1">
              <Bell size={18} />
              {conflictCount > 0 && (
                <span className="absolute top-0 right-0 w-2 h-2 bg-red-500 rounded-full" />
              )}
            </button>
            <div className="relative">
              <button
                onClick={() => setMenuOpen((m) => !m)}
                className="flex items-center gap-1 text-sm text-slate-700"
              >
                <span className="w-7 h-7 rounded-full bg-slate-800 text-white text-xs flex items-center justify-center font-medium shrink-0">
                  {session.authorName.slice(0, 1).toUpperCase()}
                </span>
                <ChevronDown size={14} className="text-slate-400 hidden sm:block" />
              </button>
              {menuOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-white border border-slate-200 rounded-lg shadow-lg py-1 z-50">
                  <div className="px-3 py-2 border-b border-slate-100">
                    <p className="text-sm font-medium truncate">{session.authorName}</p>
                    <p className="text-xs text-slate-400 truncate">
                      {session.institutionName}
                    </p>
                  </div>
                  {/* Patient picker inside dropdown on mobile */}
                  <div className="sm:hidden px-3 py-2 border-b border-slate-100">
                    <p className="text-xs text-slate-400 mb-1">Patient</p>
                    <PatientSearchSelect
                      value={selectedPatientId}
                      onChange={(id) => {
                        setSelectedPatientId(id);
                        setMenuOpen(false);
                      }}
                    /> 
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      navigate("/");
                    }}
                    className="w-full flex items-center gap-2 text-sm text-slate-600 px-3 py-2 hover:bg-slate-50"
                  >
                    <LogOut size={14} /> Sign out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 lg:p-6 min-h-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
