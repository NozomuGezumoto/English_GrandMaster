const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const sampleQuestions = [
  {
    lang: 'en',
    exam: 'toeic',
    level: 5,
    prompt: 'Choose the word that best completes the sentence: The meeting was _____ postponed due to bad weather.',
    choices: [
      'suddenly',
      'recently',
      'temporarily',
      'immediately'
    ],
    answerIndex: 2,
    explanation: '"temporarily" means for a limited time, which fits the context of postponing a meeting.'
  },
  {
    lang: 'en',
    exam: 'toeic',
    level: 5,
    prompt: 'What is the main purpose of the email?',
    choices: [
      'To request a meeting',
      'To confirm an appointment',
      'To cancel a reservation',
      'To submit a report'
    ],
    answerIndex: 1,
    explanation: 'The email is asking for confirmation of the scheduled appointment.'
  },
  {
    lang: 'en',
    exam: 'toeic',
    level: 6,
    prompt: 'The company has decided to _____ its operations in Asia.',
    choices: [
      'expand',
      'reduce',
      'maintain',
      'eliminate'
    ],
    answerIndex: 0,
    explanation: '"expand" means to make larger, which fits the context of growing operations.'
  },
  {
    lang: 'en',
    exam: 'toeic',
    level: 6,
    prompt: 'According to the passage, what is the primary concern?',
    choices: [
      'Cost reduction',
      'Customer satisfaction',
      'Employee training',
      'Market expansion'
    ],
    answerIndex: 1,
    explanation: 'The passage emphasizes the importance of customer satisfaction as the main focus.'
  },
  {
    lang: 'en',
    exam: 'toeic',
    level: 7,
    prompt: 'The manager asked the team to _____ the proposal by Friday.',
    choices: [
      'review',
      'submit',
      'discuss',
      'approve'
    ],
    answerIndex: 0,
    explanation: '"review" means to examine or check, which is what the manager requested.'
  },
  {
    lang: 'en',
    exam: 'toeic',
    level: 7,
    prompt: 'What does the word "procure" most likely mean in this context?',
    choices: [
      'To sell',
      'To obtain',
      'To manufacture',
      'To distribute'
    ],
    answerIndex: 1,
    explanation: '"Procure" means to obtain or acquire something, especially with care or effort.'
  },
  {
    lang: 'en',
    exam: 'toeic',
    level: 8,
    prompt: 'The new policy will _____ affect all employees starting next month.',
    choices: [
      'directly',
      'indirectly',
      'partially',
      'completely'
    ],
    answerIndex: 0,
    explanation: '"directly" means in a straightforward manner, indicating immediate impact.'
  },
  {
    lang: 'en',
    exam: 'toeic',
    level: 8,
    prompt: 'Which of the following is NOT mentioned in the article?',
    choices: [
      'The budget allocation',
      'The timeline for completion',
      'The number of participants',
      'The location of the event'
    ],
    answerIndex: 3,
    explanation: 'The article discusses budget, timeline, and participants, but does not mention the location.'
  },
  {
    lang: 'en',
    exam: 'toeic',
    level: 9,
    prompt: 'The company\'s profits have _____ significantly over the past quarter.',
    choices: [
      'fluctuated',
      'stabilized',
      'declined',
      'accelerated'
    ],
    answerIndex: 0,
    explanation: '"fluctuated" means to vary or change irregularly, which describes profit changes.'
  },
  {
    lang: 'en',
    exam: 'toeic',
    level: 9,
    prompt: 'What is the author\'s main argument?',
    choices: [
      'Technology improves efficiency',
      'Traditional methods are outdated',
      'A balanced approach is needed',
      'Change is inevitable'
    ],
    answerIndex: 2,
    explanation: 'The author argues for a balanced approach that combines new and traditional methods.'
  }
];

async function seed() {
  try {
    console.log('Adding sample questions to Firestore...');
    
    const batch = db.batch();
    let count = 0;
    
    sampleQuestions.forEach((q) => {
      const ref = db.collection("questions").doc();
      batch.set(ref, q);
      count++;
    });
    
    await batch.commit();
    console.log(`Successfully added ${count} questions to Firestore!`);
    process.exit(0);
  } catch (error) {
    console.error('Error adding questions:', error);
    process.exit(1);
  }
}

seed();
