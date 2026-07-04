import { Link } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { Card, Badge } from "../components/ui";

export default function Settings() {
  const { session, patients, selectedPatientId } = useApp();
  const patient = patients.find((p) => p.id === selectedPatientId);

  return (
    <div className="max-w-2xl space-y-6">
      <Card className="p-5">
        <h2 className="font-semibold text-base mb-3">Session</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
          <div>
            <p className="text-slate-400 text-xs">Institution</p>
            <p>{session?.institutionName}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">Signed in as</p>
            <p>{session?.authorName}</p>
          </div>
          <div>
            <p className="text-slate-400 text-xs">Role</p>
            <p>{session?.role?.toLowerCase()}</p>
          </div>
        </div>
        <p className="text-xs text-slate-400 mt-3">
          This session identity is for provenance and audit trails. The public patient portal is a separate
          surface for consent management and does not replace the clinician workflow.
        </p>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-base mb-3">Network &amp; consent model</h2>
        <ul className="text-sm text-slate-600 space-y-2 list-disc pl-5">
          <li>Patients opt in once, at enrollment - that's consent to be in the network.</li>
          <li>
            The patient portal can hide sensitive categories from self-service view, but clinicians can still
            access care-critical information through audited break-glass access.
          </li>
          <li>
            Sensitive categories (mental health, reproductive health, substance use, HIV status, IPV-related)
            are visible in the portal as governance controls, not silent deletions.
          </li>
        </ul>
      </Card>

      <Card className="p-5">
        <h2 className="font-semibold text-base mb-3">Scope boundary</h2>
        <p className="text-sm text-slate-600">
          Continuum solves the technical reconciliation problem - turning scattered fragments into one coherent,
          queryable patient timeline using Cognee. The portal adds visibility controls and auditability; real-world
          hospital contracts and legal compliance still belong in the deployment layer.
        </p>
      </Card>


      {patient && (
        <Card className="p-5">
          <h2 className="font-semibold text-base mb-3">Current patient</h2>
          <p className="text-sm">{patient.displayName}</p>
          <Badge>{patient.id}</Badge>
        </Card>
      )}
    </div>
  );
}
