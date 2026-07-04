// Seeds one fake patient with fragments from two fake "hospitals" so the
// live two-session demo has something to recall from the moment it boots.
// Run with: npm run seed
import { PrismaClient, FragmentSourceType, SensitiveCategory } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const patient = await prisma.patient.create({
    data: { displayName: "Demo Patient — Amaka O." },
  });

  const visitA = await prisma.visit.create({
    data: {
      patientId: patient.id,
      institutionName: "Hospital A — Lagos General",
      visitDate: new Date("2026-03-14"),
      notes: "Initial complaint of recurring abdominal pain.",
    },
  });

  const visitB = await prisma.visit.create({
    data: {
      patientId: patient.id,
      institutionName: "Hospital B — Eko Community Clinic",
      visitDate: new Date("2026-08-02"),
      notes: "Patient presented with fatigue and dizziness.",
    },
  });

  await prisma.fragment.createMany({
    data: [
      {
        patientId: patient.id,
        visitId: visitA.id,
        originInstitution: visitA.institutionName,
        originAuthor: "Dr. Adeyemi",
        sourceType: FragmentSourceType.CLINICAL_NOTE,
        content:
          "Patient reports recurring lower-abdominal pain over 3 weeks, worse after meals. No fever. Prescribed omeprazole 20mg once daily for 14 days.",
        sensitiveCategory: SensitiveCategory.NONE,
      },
      {
        patientId: patient.id,
        visitId: visitA.id,
        originInstitution: visitA.institutionName,
        originAuthor: "Lab Tech — Ibironke",
        sourceType: FragmentSourceType.LAB_RESULT,
        content:
          "Full blood count within normal range. H. pylori stool antigen test: positive.",
        sensitiveCategory: SensitiveCategory.NONE,
      },
      {
        patientId: patient.id,
        visitId: visitB.id,
        originInstitution: visitB.institutionName,
        originAuthor: "Nurse Practitioner — Funke",
        sourceType: FragmentSourceType.CLINICAL_NOTE,
        content:
          "Patient presents with fatigue and dizziness over the past week. Mentions abdominal pain from earlier in the year resolved after a course of medication, name not recalled. No current abdominal complaint today.",
        sensitiveCategory: SensitiveCategory.NONE,
      },
      {
        patientId: patient.id,
        visitId: visitB.id,
        originInstitution: visitB.institutionName,
        originAuthor: "Nurse Practitioner — Funke",
        sourceType: FragmentSourceType.VOICE_NOTE,
        content:
          "Voice note transcript: patient also mentions feeling low and withdrawn for the past month, hasn't told family. Flagging for follow-up screening.",
        sensitiveCategory: SensitiveCategory.MENTAL_HEALTH,
      },
    ],
  });

  console.log("Seeded patient:", patient.id);
  console.log("Use this patient ID in the frontend demo.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
