import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AppProvider } from "./context/AppContext";
import { ProtectedRoute } from "./routes/ProtectedRoute";
import { AppShell } from "./layout/AppShell";
import Landing from "./pages/Landing";
import Login from "./pages/Login";
import PatientPortal from "./pages/PatientPortal";
import ConsentDashboard from "./pages/ConsentDashboard";
import Dashboard from "./pages/Dashboard";
import Patients from "./pages/Patients";
import Timeline from "./pages/Timeline";
import KnowledgeGraphPage from "./pages/KnowledgeGraphPage";
import Conflicts from "./pages/Conflicts";
import VerifiableProof from "./pages/VerifiableProof";
import Settings from "./pages/Settings";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <BrowserRouter>
      <AppProvider>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route element={<ProtectedRoute allowedRoles={["PATIENT"]} />}>
            <Route path="/portal" element={<PatientPortal />} />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route
            element={
              <ProtectedRoute
                allowedRoles={["CLINICIAN", "REVIEWER", "ADMIN", "NURSE"]}
              />
            }>
            <Route element={<AppShell />}>
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/consent" element={<ConsentDashboard />} />
              <Route path="/patients" element={<Patients />} />
              <Route path="/timeline" element={<Timeline />} />
              <Route path="/knowledge-graph" element={<KnowledgeGraphPage />} />
              <Route path="/conflicts" element={<Conflicts />} />
              <Route path="/verifiable-proof" element={<VerifiableProof />} />
              <Route path="/settings" element={<Settings />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppProvider>
    </BrowserRouter>
  </React.StrictMode>,
);
