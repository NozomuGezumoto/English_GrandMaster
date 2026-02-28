const admin = require("firebase-admin");
const { buildAllQuestions, QUESTIONS_PER_LEVEL } = require("./scripts/question-bank");
const { validateQuestion } = require("./scripts/validate-questions");

// エミュレータに接続する設定
process.env.FIRESTORE_EMULATOR_HOST = "localhost:8080";
process.env.FIREBASE_AUTH_EMULATOR_HOST = "localhost:9099";

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: "my-english-battle"
});

const db = admin.firestore();

const BATCH_SIZE = 500;

async function seed() {
  try {
    console.log("Connecting to Firestore Emulator...");
    console.log("FIRESTORE_EMULATOR_HOST:", process.env.FIRESTORE_EMULATOR_HOST);

    const rawQuestions = buildAllQuestions();
    const sampleQuestions = rawQuestions.map((q) => {
      const result = validateQuestion(q);
      if (!result.ok) {
        return { ...q, active: true, qualityStatus: "needs_fix", qaNotes: result.errors.join("; ") };
      }
      return { ...q, active: q.active !== false, qualityStatus: q.qualityStatus || "ok" };
    });
    const needsFix = sampleQuestions.filter((q) => q.qualityStatus === "needs_fix");
    if (needsFix.length > 0) {
      console.log(`Warning: ${needsFix.length} question(s) with qualityStatus=needs_fix`);
    }
    console.log(`Adding ${sampleQuestions.length} questions (${QUESTIONS_PER_LEVEL} per level) to Emulator...`);

    let count = 0;
    for (let i = 0; i < sampleQuestions.length; i += BATCH_SIZE) {
      const batch = db.batch();
      const chunk = sampleQuestions.slice(i, i + BATCH_SIZE);
      for (const question of chunk) {
        const ref = db.collection("questions").doc();
        batch.set(ref, question);
        count++;
      }
      await batch.commit();
      console.log(`Committed batch: ${count} questions so far...`);
    }

    console.log(`Successfully added ${count} questions to Firestore Emulator!`);

    const snapshot = await db.collection("questions").limit(1).get();
    console.log("Verification: Found", snapshot.size, "question(s) in Firestore");

    process.exit(0);
  } catch (error) {
    console.error("Error adding questions:", error);
    console.error("Error details:", error.message);
    process.exit(1);
  }
}

seed();


