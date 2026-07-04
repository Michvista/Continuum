import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "../context/AppContext";
import type { UserRole } from "../types";

interface ProtectedRouteProps {
  allowedRoles?: UserRole[];
}

export function ProtectedRoute({ allowedRoles }: ProtectedRouteProps) {
  const { session } = useApp();
  if (!session) return <Navigate to="/login" replace />;
  if (allowedRoles && !allowedRoles.includes(session.role)) {
    return (
      <Navigate
        to={session.role === "PATIENT" ? "/portal" : "/dashboard"}
        replace
      />
    );
  }
  return <Outlet />;
}
