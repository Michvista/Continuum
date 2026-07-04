import { api } from "./api";
import type { PatientDetail } from "./types";

const DEMO_PATIENT_NAME = "Demo Patient - Amaka O.";
const DEMO_VISITS = [
  {
    institutionName: "Hospital A - Lagos General",
    visitDate: "2026-03-14",
    notes: "Initial complaint of recurring abdominal pain.",
  },
  {
    institutionName: "Hospital B - Eko Community Clinic",
    visitDate: "2026-08-02",
    notes: "Patient presented with fatigue and dizziness.",
  },
];

async function ensureDemoPatient(): Promise<PatientDetail> {
  const patients = await api.listPatients("Demo Patient");
  const existing = patients.find((patient) => patient.displayName.startsWith("Demo Patient"));
  if (existing) {
    return api.getPatient(existing.id);
  }

  const created = await api.createPatient(DEMO_PATIENT_NAME);
  return api.getPatient(created.id);
}

export async function prepareDemoDataset(): Promise<string> {
  let patient = await ensureDemoPatient();

  const visitsByInstitution = new Map(patient.visits.map((visit) => [visit.institutionName, visit]));
  for (const visit of DEMO_VISITS) {
    if (!visitsByInstitution.has(visit.institutionName)) {
      await api.createVisit(patient.id, visit);
    }
  }

  patient = await api.getPatient(patient.id);

  if (patient.fragments.length < 2) {
    const visitA = patient.visits.find((visit) => visit.institutionName === DEMO_VISITS[0].institutionName);
    const visitB = patient.visits.find((visit) => visit.institutionName === DEMO_VISITS[1].institutionName);

    if (visitA) {
      await api.createFragment({
        patientId: patient.id,
        visitId: visitA.id,
        originInstitution: visitA.institutionName,
        originAuthor: "Dr. Adeyemi",
        sourceType: "CLINICAL_NOTE",
        content:
          "Patient reports recurring lower-abdominal pain over 3 weeks, worse after meals. No fever. Prescribed omeprazole 20mg once daily for 14 days.",
      });
    }

    if (visitB) {
      await api.createFragment({
        patientId: patient.id,
        visitId: visitB.id,
        originInstitution: visitB.institutionName,
        originAuthor: "Nurse Practitioner - Funke",
        sourceType: "CLINICAL_NOTE",
        content:
          "Patient presents with fatigue and dizziness over the past week. Mentions abdominal pain from earlier in the year resolved after a course of medication, name not recalled. No current abdominal complaint today.",
      });
    }
  }

  return patient.id;
}
