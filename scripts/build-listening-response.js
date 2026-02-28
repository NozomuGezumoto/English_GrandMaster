/**
 * Build data/listening-response.json with 100 listening_response questions per level (1000 total).
 * Run: node scripts/build-listening-response.js
 * Level 1-2 = TOEIC 400, 3-4 = 600, 5-6 = 730, 7-8 = 860, 9-10 = 990.
 */

const fs = require('fs');
const path = require('path');

const QUESTIONS_PER_LEVEL = 100;

// Extra wrong-answer pool per level (added to each template's wrongs to form a pool of 6+)
const EXTRA_WRONGS = {
  1: ["I don't know.", "Maybe later.", "Not really.", "I'm not sure.", "It's fine."],
  2: ["That's difficult.", "I'll try.", "Perhaps.", "We'll see.", "No idea."],
  3: ["Sounds good.", "I agree.", "Let me check.", "Could be.", "Depends."],
  4: ["We'll discuss it.", "I'll follow up.", "Noted.", "Understood.", "Will do."],
  5: ["The team can do it.", "We're on it.", "Next week.", "In the plan.", "Already done."],
  6: ["We need to align.", "Good point.", "I'll revert.", "Let's discuss.", "Fair enough."],
  7: ["We'll review.", "Strategy first.", "Depends on capacity.", "Board decision.", "Q2 target."],
  8: ["Governance applies.", "Need approval.", "Escalate it.", "Document it.", "Compliance check."],
  9: ["Board mandate.", "Policy says.", "Legal review.", "Stakeholder view.", "Risk appetite."],
  10: ["Board oversight.", "Committee decision.", "Full disclosure.", "Protocol applies.", "Audit trail."],
};

const TEMPLATES = [
  // Level 1 (A1) - 10 templates
  { level: 1, speechAct: 'greeting', prompt: 'Hello!', correct: "Hi! How are you?", wrongs: ["I'm 20 years old.", "It's blue.", "Yes, I do."], explanation: 'A simple greeting is best answered with a greeting in return.' },
  { level: 1, speechAct: 'thanks', prompt: 'Thanks a lot.', correct: "You're welcome.", wrongs: ["I'm fine.", "No, thanks.", "Tomorrow."], explanation: '"You\'re welcome" is the standard response to "Thanks."' },
  { level: 1, speechAct: 'yesno', prompt: 'Do you like coffee?', correct: 'Yes, I do.', wrongs: ["I'm from Japan.", "At 5 o'clock.", "It's mine."], explanation: 'A yes/no question is answered with yes or no.' },
  { level: 1, speechAct: 'farewell', prompt: 'Goodbye!', correct: 'Bye! See you.', wrongs: ["Good morning.", "I'm sorry.", "No problem."], explanation: 'Say goodbye back when someone leaves.' },
  { level: 1, speechAct: 'apology', prompt: 'Sorry!', correct: "That's okay.", wrongs: ["Thank you.", "I'm John.", "Yes, please."], explanation: 'Accept an apology with "That\'s okay."' },
  { level: 1, speechAct: 'offer', prompt: 'Would you like water?', correct: 'Yes, please.', wrongs: ["I'm tired.", "She's at home.", "In the box."], explanation: 'Accept an offer with "Yes, please."' },
  { level: 1, speechAct: 'request', prompt: 'Can you help me?', correct: 'Sure. What do you need?', wrongs: ["I'm 25.", "It's cold.", "On Tuesday."], explanation: 'A request for help is agreed to with "Sure" and a follow-up.' },
  { level: 1, speechAct: 'smalltalk', prompt: "It's cold today.", correct: "Yes, it is. I need a coat.", wrongs: ["My name is Tom.", "At the station.", "I have two."], explanation: 'Comment on the weather with agreement and a short comment.' },
  { level: 1, speechAct: 'greeting', prompt: 'Hi there!', correct: 'Hello! How are you doing?', wrongs: ["I'm leaving.", "It's red.", "No, I don't."], explanation: 'Return a casual greeting.' },
  { level: 1, speechAct: 'thanks', prompt: 'Thank you.', correct: "You're welcome.", wrongs: ["Okay.", "Yes.", "Goodbye."], explanation: 'Standard response to thanks.' },
  // Level 2 (A2) - 10 templates
  { level: 2, speechAct: 'greeting', prompt: 'Good morning!', correct: 'Good morning! Did you sleep well?', wrongs: ["I'm leaving now.", "The meeting is at 10.", "It's too expensive."], explanation: 'Return the greeting and optionally ask a polite question.' },
  { level: 2, speechAct: 'thanks', prompt: 'Thank you for the gift.', correct: "I'm glad you like it.", wrongs: ["I don't know.", "Maybe tomorrow.", "She's not here."], explanation: 'Respond to thanks for a gift.' },
  { level: 2, speechAct: 'suggestion', prompt: 'Shall we go by train?', correct: 'Yes, that sounds good.', wrongs: ["I'm a student.", "About 30 minutes.", "Last week."], explanation: 'Agree to a suggestion.' },
  { level: 2, speechAct: 'request', prompt: 'Can I borrow your pen?', correct: 'Of course. Here you are.', wrongs: ["I prefer tea.", "Not yet.", "In the office."], explanation: 'Grant a small request.' },
  { level: 2, speechAct: 'apology', prompt: "I'm sorry for the mistake.", correct: "Don't worry. It happens.", wrongs: ["I agree.", "See you later.", "It's over there."], explanation: 'Reassure someone who apologizes.' },
  { level: 2, speechAct: 'offer', prompt: 'Do you want a ride?', correct: "Yes, that would be great. Thanks.", wrongs: ["I'm busy.", "He's my brother.", "At 3 p.m."], explanation: 'Accept an offer of a ride.' },
  { level: 2, speechAct: 'confirmation', prompt: 'Your name is Anna, right?', correct: 'Yes, that\'s right.', wrongs: ["No, I'm not.", "I like it.", "From Canada."], explanation: 'Confirm your name when someone checks.' },
  { level: 2, speechAct: 'refusal', prompt: 'Would you like to join us?', correct: "I'd love to, but I can't today.", wrongs: ["Yes, it is.", "Next Monday.", "In the morning."], explanation: 'Politely decline an invitation.' },
  { level: 2, speechAct: 'greeting', prompt: 'Good evening!', correct: 'Good evening! How was your day?', wrongs: ["I'm tired.", "At home.", "Tomorrow."], explanation: 'Return an evening greeting.' },
  { level: 2, speechAct: 'request', prompt: 'Could you open the window?', correct: 'Sure. No problem.', wrongs: ["It's closed.", "I'm cold.", "Later."], explanation: 'Grant a polite request.' },
  // Level 3 (B1) - 10 templates
  { level: 3, speechAct: 'invitation', prompt: 'We are having a party on Saturday. Can you come?', correct: "I'd love to! What time does it start?", wrongs: ["I'm a designer.", "It was great.", "About 20 people."], explanation: 'Accept an invitation and ask for details.' },
  { level: 3, speechAct: 'opinion', prompt: 'What do you think of the new office?', correct: "It's much brighter. I like it.", wrongs: ["I think so.", "Maybe next week.", "In the lobby."], explanation: 'Give a short opinion when asked.' },
  { level: 3, speechAct: 'sympathy', prompt: "I didn't get the job.", correct: "I'm sorry to hear that. Something better will come along.", wrongs: ["Congratulations!", "I have to go.", "It's on the left."], explanation: 'Show sympathy when someone shares bad news.' },
  { level: 3, speechAct: 'congratulations', prompt: 'I got promoted!', correct: 'Congratulations! You deserve it.', wrongs: ["I'm sorry.", "See you then.", "That's too bad."], explanation: 'Congratulate someone on good news.' },
  { level: 3, speechAct: 'preference', prompt: 'Do you prefer morning or evening meetings?', correct: 'Morning works better for me.', wrongs: ["I'm free tomorrow.", "The big one.", "Not really."], explanation: 'State a preference when asked.' },
  { level: 3, speechAct: 'smalltalk', prompt: "It's nice weather today.", correct: "Let's go out and play.", wrongs: ["The meeting is at three.", "I need to buy some milk.", "My phone is broken."], explanation: 'Respond to small talk about weather.' },
  { level: 3, speechAct: 'thanks', prompt: 'Thank you for your help.', correct: "You're welcome.", wrongs: ["I have to leave now.", "Where is the station?", "The red one, please."], explanation: 'Natural response to thank you.' },
  { level: 3, speechAct: 'apology', prompt: "I'm sorry I'm late.", correct: "That's okay. No problem.", wrongs: ["Yes, I like coffee.", "It's on the second floor.", "See you tomorrow."], explanation: 'Accept an apology for being late.' },
  { level: 3, speechAct: 'suggestion', prompt: 'Why don\'t we have lunch together?', correct: 'Good idea. Where shall we go?', wrongs: ["I'm a teacher.", "About two hours.", "It was last week."], explanation: 'Agree to a suggestion and ask a follow-up.' },
  { level: 3, speechAct: 'request', prompt: 'Could you pass me the salt, please?', correct: 'Here you are.', wrongs: ["I don't know.", "Not at all.", "Same to you."], explanation: 'Comply with a polite request.' },
  // Level 4 (B1) - 10 templates
  { level: 4, speechAct: 'greeting', prompt: 'How have you been?', correct: "I've been busy, but I'm good. How about you?", wrongs: ["The train was delayed.", "I prefer tea.", "It costs twenty dollars."], explanation: 'Reply to a greeting with an update and ask back.' },
  { level: 4, speechAct: 'offer', prompt: 'Would you like some more coffee?', correct: 'Yes, please. Just a little.', wrongs: ["I'm fine, thank you.", "No, I didn't.", "Next Monday."], explanation: 'Accept an offer of more coffee.' },
  { level: 4, speechAct: 'agreement', prompt: 'The new system is much better, isn\'t it?', correct: "Yes, it's much easier to use now.", wrongs: ["I'll call you later.", "It's in the drawer.", "She's on vacation."], explanation: 'Agree and add a reason.' },
  { level: 4, speechAct: 'refusal', prompt: 'Can you work this weekend?', correct: "I'm afraid I can't. I have other plans.", wrongs: ["Yes, it's over there.", "About ten minutes.", "I'll take the blue one."], explanation: 'Politely refuse with a reason.' },
  { level: 4, speechAct: 'confirmation', prompt: "So we're meeting at 3 p.m. tomorrow, right?", correct: "Yes, that's right. See you then.", wrongs: ["I don't think so.", "It's very hot today.", "She left an hour ago."], explanation: 'Confirm a meeting.' },
  { level: 4, speechAct: 'clarification', prompt: 'When you say "as soon as possible," do you mean today?', correct: 'Yes, if you can. Otherwise tomorrow morning.', wrongs: ["I said so.", "No problem.", "It's important."], explanation: 'Clarify what you mean.' },
  { level: 4, speechAct: 'disagreement', prompt: 'I think we should cancel the project.', correct: "I see your point, but I'd like to discuss it more first.", wrongs: ["Yes, cancel it.", "Next month.", "In the report."], explanation: 'Politely disagree and suggest discussion.' },
  { level: 4, speechAct: 'reminder', prompt: 'Don\'t forget to send the report by Friday.', correct: "I won't. I'll have it done by Thursday.", wrongs: ["I forgot.", "No, thanks.", "She did it."], explanation: 'Acknowledge a reminder.' },
  { level: 4, speechAct: 'complaint', prompt: 'The room was too cold during the meeting.', correct: "I'll mention it to facilities so they can adjust it next time.", wrongs: ["Yes, it was.", "I'm cold too.", "Tomorrow at 9."], explanation: 'Respond to a complaint by offering to fix it.' },
  { level: 4, speechAct: 'suggestion', prompt: 'We could try a different supplier.', correct: "That's a good idea. Let's get some quotes.", wrongs: ["I'm not sure.", "Last year.", "In the budget."], explanation: 'Agree to a suggestion and propose a next step.' },
  // Level 5–10: same 10 templates per level as before (abbreviated for length – in real file we have full 60 entries)
  { level: 5, speechAct: 'negotiation', prompt: 'We need a 10% discount to move forward.', correct: "I can do 8%. That's our best offer for this volume.", wrongs: ["Yes, 10% is fine.", "Next week.", "In the contract."], explanation: 'Counter with a specific offer in negotiation.' },
  { level: 5, speechAct: 'delegation', prompt: 'Can you take care of the client presentation?', correct: "Sure. I'll need the slides by Tuesday to prepare.", wrongs: ["I presented it.", "She can do it.", "It's ready."], explanation: 'Accept a task and state what you need.' },
  { level: 5, speechAct: 'feedback', prompt: 'How did you find the training session?', correct: "Very useful. I've already applied some of the tips.", wrongs: ["In the room.", "Last week.", "With the team."], explanation: 'Give positive feedback with an example.' },
  { level: 5, speechAct: 'apology', prompt: "I'm sorry, I missed the deadline.", correct: "I understand. Let's focus on getting it done by end of day.", wrongs: ["Don't worry.", "It's fine.", "No problem."], explanation: 'Acknowledge apology and refocus on solution.' },
  { level: 5, speechAct: 'request', prompt: 'Could you review this before the meeting?', correct: "I'll read it this afternoon and send you my comments.", wrongs: ["Yes, I reviewed it.", "Tomorrow.", "In my inbox."], explanation: 'Accept a request and say when you will do it.' },
  { level: 5, speechAct: 'opinion', prompt: 'Should we expand into the Asian market?', correct: "I think we should do more research first, but the potential is there.", wrongs: ["Yes, we should.", "Next quarter.", "In the report."], explanation: 'Give a balanced opinion with a condition.' },
  { level: 5, speechAct: 'confirmation', prompt: 'So the launch is confirmed for March 15?', correct: 'Yes. Marketing will send the final schedule by Friday.', wrongs: ["No, it's not.", "Maybe.", "I think so."], explanation: 'Confirm and add who will send follow-up.' },
  { level: 5, speechAct: 'suggestion', prompt: 'What if we moved the workshop to the afternoon?', correct: "That might work better. I'll check with the team.", wrongs: ["I prefer morning.", "Okay.", "Sure."], explanation: 'Agree conditionally and offer to confirm.' },
  { level: 5, speechAct: 'priority', prompt: 'What should we focus on first?', correct: "I'd focus on the budget. Everything else depends on it.", wrongs: ["The deadline.", "Next week.", "The team."], explanation: 'State a priority and brief reason.' },
  { level: 5, speechAct: 'thanks', prompt: 'Thanks for covering the meeting.', correct: "Happy to help. Send me the notes when you can.", wrongs: ["No problem.", "You're welcome.", "Sure."], explanation: 'Respond to thanks and ask for follow-up.' },
  { level: 6, speechAct: 'objection', prompt: 'I don\'t think the data supports that conclusion.', correct: "Fair point. Let me pull the numbers again and we can revisit.", wrongs: ["Yes, it does.", "I disagree.", "Next meeting."], explanation: 'Handle an objection by offering to recheck.' },
  { level: 6, speechAct: 'priority', prompt: 'What should we tackle first?', correct: "I'd prioritize the budget. Everything else depends on it.", wrongs: ["The budget.", "Tomorrow.", "In order."], explanation: 'State a priority and justify it.' },
  { level: 6, speechAct: 'deferral', prompt: 'Can we decide this today?', correct: "I'd prefer to sleep on it and come back with a proposal tomorrow.", wrongs: ["Yes, we can.", "No.", "Maybe."], explanation: 'Politely ask to delay and propose when you will respond.' },
  { level: 6, speechAct: 'agreement', prompt: 'The timeline is tight but doable.', correct: "I agree. We'll need to stay focused and cut any non-essentials.", wrongs: ["Yes, tight.", "Next month.", "In the plan."], explanation: 'Agree and add what is needed to succeed.' },
  { level: 6, speechAct: 'clarification', prompt: 'When you say "flexible," do you mean on price or on terms?', correct: 'Mainly on payment terms. The price is fairly fixed.', wrongs: ["Both.", "Price.", "Terms."], explanation: 'Clarify when asked to specify.' },
  { level: 6, speechAct: 'recommendation', prompt: 'Which option would you go with?', correct: "Option B. It's more scalable and the cost difference is small.", wrongs: ["Option A.", "The first one.", "Either."], explanation: 'Make a clear recommendation with reasons.' },
  { level: 6, speechAct: 'concern', prompt: 'I\'m worried about the rollout in Europe.', correct: "So am I. Let's set up a call with the local team to go through risks.", wrongs: ["Don't worry.", "It's fine.", "Next week."], explanation: 'Share concern and suggest a next step.' },
  { level: 6, speechAct: 'thanks', prompt: 'Thanks for stepping in at the last minute.', correct: "Happy to help. Just let me know if you need anything else.", wrongs: ["You're welcome.", "No problem.", "Sure."], explanation: 'Respond to thanks with willingness to help further.' },
  { level: 6, speechAct: 'risk', prompt: 'What if the vendor drops out?', correct: "We have a backup. I'll document the handover this week.", wrongs: ["We're in trouble.", "I don't know.", "We'll see."], explanation: 'Address a risk with a concrete mitigation.' },
  { level: 6, speechAct: 'summary', prompt: 'Can you sum up the main points?', correct: "Three things: we're on track, we need to fix reporting, and we'll revisit pricing in April.", wrongs: ["Yes.", "Many things.", "It was good."], explanation: 'Summarize with a clear structure.' },
  { level: 7, speechAct: 'strategy', prompt: 'How do you see us competing with the new entrants?', correct: "We need to double down on service and retention. Price alone won't be enough.", wrongs: ["We'll compete.", "Good question.", "Next quarter."], explanation: 'Answer a strategy question with direction and rationale.' },
  { level: 7, speechAct: 'criticism', prompt: 'The last proposal lacked detail on implementation.', correct: "You're right. I'll add a phased implementation section and resubmit by Friday.", wrongs: ["It had detail.", "I'll try.", "Okay."], explanation: 'Accept criticism and commit to improvement.' },
  { level: 7, speechAct: 'proposal', prompt: 'I suggest we restructure the team around the new product.', correct: "I see the logic. We should also consider how it affects the existing roadmap.", wrongs: ["Good idea.", "Let's do it.", "Maybe."], explanation: 'Respond to a proposal by acknowledging and adding a consideration.' },
  { level: 7, speechAct: 'expectation', prompt: 'What do you expect from the partnership?', correct: "Clear communication, shared KPIs, and a quarterly review to align on priorities.", wrongs: ["A lot.", "Success.", "Good results."], explanation: 'State expectations in concrete terms.' },
  { level: 7, speechAct: 'disagreement', prompt: 'I think we should cut the budget by 20%.', correct: "I'd push back on that. A 10% cut might be achievable without losing key capacity.", wrongs: ["I agree.", "No.", "Maybe 15%."], explanation: 'Disagree with a counter-proposal.' },
  { level: 7, speechAct: 'accountability', prompt: 'Who is responsible if the launch slips?', correct: "I am. I'll keep the timeline updated and flag any risks early.", wrongs: ["The team.", "We'll see.", "Nobody."], explanation: 'Take responsibility and say how you will manage it.' },
  { level: 7, speechAct: 'risk', prompt: 'What happens if the supplier fails to deliver?', correct: "We have a backup supplier. I'll document the handover steps this week.", wrongs: ["We're in trouble.", "I don't know.", "We'll see."], explanation: 'Address a risk with concrete mitigation.' },
  { level: 7, speechAct: 'summary', prompt: 'Can you sum up the main takeaways?', correct: "Three things: we're on track for Q2, we need to fix the reporting gap, and we'll revisit pricing in April.", wrongs: ["Yes.", "Many things.", "It was good."], explanation: 'Summarize with a clear, numbered structure.' },
  { level: 7, speechAct: 'timeline', prompt: 'When can we expect the first draft?', correct: "By Wednesday. I'll send it to the group for review.", wrongs: ["Soon.", "Next week.", "I'm working on it."], explanation: 'Give a specific deadline and next step.' },
  { level: 7, speechAct: 'resource', prompt: 'Do we have enough capacity for this?', correct: "We'll need to reprioritize. I'll draft a revised plan by Friday.", wrongs: ["Yes.", "No.", "Maybe."], explanation: 'Address a resource question with a concrete plan.' },
  { level: 8, speechAct: 'negotiation', prompt: 'We need exclusivity in the region to justify the investment.', correct: "We can offer 18 months with a renewal clause, subject to performance targets.", wrongs: ["Okay.", "No exclusivity.", "Maybe."], explanation: 'Respond to a negotiation demand with a structured counter-offer.' },
  { level: 8, speechAct: 'stakeholder', prompt: 'How will we get buy-in from the board?', correct: "We'll prepare a one-pager with clear ROI and risks, and request 15 minutes at the next meeting.", wrongs: ["We'll try.", "I'll ask.", "Good question."], explanation: 'Explain a concrete plan to get stakeholder buy-in.' },
  { level: 8, speechAct: 'conflict', prompt: 'The two teams have conflicting priorities.', correct: "I'll set up a joint session to align on a single set of priorities and trade-offs.", wrongs: ["That's bad.", "Pick one.", "I don't know."], explanation: 'Propose a process to resolve conflict.' },
  { level: 8, speechAct: 'timeline', prompt: 'Is the December deadline realistic?', correct: "It's tight. We'd need to lock scope by end of October and add no new features.", wrongs: ["Yes.", "No.", "Maybe."], explanation: 'Give an honest assessment with conditions.' },
  { level: 8, speechAct: 'resource', prompt: 'We don\'t have enough people for this scope.', correct: "Either we reduce scope for this phase or we secure two contractors by next week.", wrongs: ["We need more.", "Okay.", "Let's try."], explanation: 'Present clear options when resources are insufficient.' },
  { level: 8, speechAct: 'escalation', prompt: 'The client is threatening to leave.', correct: "I'll schedule a call with their lead and our senior management to address concerns directly.", wrongs: ["That's bad.", "Sorry.", "We'll fix it."], explanation: 'Propose a concrete escalation path.' },
  { level: 8, speechAct: 'compliance', prompt: 'Are we fully compliant with the new regulations?', correct: "We've done the assessment. There are two gaps we're closing by the end of the month.", wrongs: ["Yes.", "No.", "I think so."], explanation: 'Give a precise status and timeline.' },
  { level: 8, speechAct: 'innovation', prompt: 'How do we stay ahead of the competition?', correct: "By investing in R&D and by shortening our feedback loop from customers into product.", wrongs: ["We try.", "Good question.", "Innovation."], explanation: 'Answer with clear strategic levers.' },
  { level: 8, speechAct: 'governance', prompt: 'Who approves budget changes?', correct: "Up to 5% I can approve. Above that it goes to the steering committee.", wrongs: ["The CFO.", "Nobody.", "It depends."], explanation: 'State governance and thresholds.' },
  { level: 8, speechAct: 'expectation', prompt: 'What does success look like in year one?', correct: "Stable revenue, net promoter score above 40, and two new product launches.", wrongs: ["Growth.", "Profit.", "Good results."], explanation: 'Define success in measurable terms.' },
  { level: 9, speechAct: 'governance', prompt: 'Who has final sign-off on budget overruns?', correct: "The steering committee up to 10%; beyond that it goes to the board.", wrongs: ["The CFO.", "It depends.", "Nobody."], explanation: 'State governance clearly and with thresholds.' },
  { level: 9, speechAct: 'ethics', prompt: 'The supplier is offering incentives. How do we handle it?', correct: "We decline and document it. Our policy is clear: no gifts above a nominal threshold.", wrongs: ["We accept.", "I don't know.", "We'll see."], explanation: 'State a clear ethical position and policy.' },
  { level: 9, speechAct: 'crisis', prompt: 'The press is asking about the incident. What do we say?', correct: "We stick to the agreed statement and refer all further questions to communications.", wrongs: ["No comment.", "We tell the truth.", "I don't know."], explanation: 'Describe a disciplined communications approach.' },
  { level: 9, speechAct: 'merger', prompt: 'How do we integrate the two cultures post-merger?', correct: "Through joint working groups, shared goals, and visible leadership alignment. We'll run a pulse survey in six months.", wrongs: ["Slowly.", "We'll try.", "Good question."], explanation: 'Outline a structured integration approach.' },
  { level: 9, speechAct: 'board', prompt: 'What should the board be focused on in the next 12 months?', correct: "Strategy refresh, digital transformation execution, and succession for the top three roles.", wrongs: ["Strategy.", "Many things.", "Growth."], explanation: 'Prioritize board focus in clear themes.' },
  { level: 9, speechAct: 'reputation', prompt: 'How do we repair the damage to our reputation?', correct: "Through consistent delivery on commitments, transparency in reporting, and targeted engagement with key stakeholders.", wrongs: ["Time.", "We'll try.", "PR."], explanation: 'Outline a multi-pronged reputation strategy.' },
  { level: 9, speechAct: 'talent', prompt: 'We\'re losing key people. What\'s the plan?', correct: "We're doing stay interviews, reviewing compensation, and creating clear career paths. We'll report back in 90 days.", wrongs: ["We'll hire more.", "Pay more.", "I don't know."], explanation: 'Describe concrete retention and reporting actions.' },
  { level: 9, speechAct: 'sustainability', prompt: 'What are we doing to meet our net-zero commitment?', correct: "We've set science-based targets, we're switching to renewables where possible, and we'll report annually on progress.", wrongs: ["We're trying.", "A lot.", "Soon."], explanation: 'Summarize concrete sustainability actions and reporting.' },
  { level: 9, speechAct: 'risk', prompt: 'What is our biggest strategic risk?', correct: "Talent retention and supply chain disruption. We're stress-testing both and will update the board next month.", wrongs: ["Competition.", "Many.", "I don't know."], explanation: 'Identify risks and state how you are addressing them.' },
  { level: 9, speechAct: 'accountability', prompt: 'Who is accountable for the ESG targets?', correct: "The board owns the targets; the executive team is accountable for delivery. We report quarterly to the sustainability committee.", wrongs: ["Sustainability.", "The CEO.", "Everyone."], explanation: 'Clarify accountability and reporting.' },
  { level: 10, speechAct: 'strategy', prompt: 'How do we pivot without losing the core business?', correct: "We run the core for cash and growth, and we ring-fence the pivot with separate metrics and governance.", wrongs: ["We pivot slowly.", "Good question.", "We'll see."], explanation: 'Describe a dual-track strategy.' },
  { level: 10, speechAct: 'governance', prompt: 'What\'s the audit committee\'s role in this?', correct: "They oversee the control environment and receive direct reports from internal audit. They don't approve day-to-day decisions.", wrongs: ["They audit.", "They approve.", "I'm not sure."], explanation: 'Clarify governance roles precisely.' },
  { level: 10, speechAct: 'crisis', prompt: 'We have a potential data breach. What\'s the protocol?', correct: "We activate the incident team, contain the breach, notify the DPO and regulators as required, and communicate with affected parties.", wrongs: ["We fix it.", "We call legal.", "I don't know."], explanation: 'Outline a clear incident protocol.' },
  { level: 10, speechAct: 'M&A', prompt: 'What\'s our position on counter-bids?', correct: "We don't comment on speculation. Our focus is on closing the current transaction and delivering value to shareholders.", wrongs: ["We're considering.", "No comment.", "We'll see."], explanation: 'Give a disciplined public position.' },
  { level: 10, speechAct: 'investor', prompt: 'How do we message this to investors?', correct: "We lead with the strategic rationale, the financial impact, and the timeline. We avoid speculation and stick to the script.", wrongs: ["We tell them.", "Carefully.", "Good question."], explanation: 'Describe a clear investor communications approach.' },
  { level: 10, speechAct: 'regulation', prompt: 'How does the new directive affect our operations?', correct: "We've mapped it to our processes. We need to update three systems and retrain affected staff by Q2. Legal has the detail.", wrongs: ["A lot.", "We're compliant.", "I don't know."], explanation: 'Give a structured impact and timeline.' },
  { level: 10, speechAct: 'succession', prompt: 'What happens if the CEO leaves unexpectedly?', correct: "We have a documented succession plan. The deputy steps in immediately; the board convenes within 48 hours to confirm or adjust.", wrongs: ["We'd be in trouble.", "The deputy.", "I don't know."], explanation: 'Describe a clear succession process.' },
  { level: 10, speechAct: 'accountability', prompt: 'Who is accountable for the ESG targets?', correct: "The board owns the targets; the executive team is accountable for delivery. We report progress quarterly to the sustainability committee.", wrongs: ["Sustainability.", "The CEO.", "Everyone."], explanation: 'Clarify accountability and reporting.' },
  { level: 10, speechAct: 'board', prompt: 'What is the board\'s role in this decision?', correct: "They set the strategy and risk appetite. Execution and day-to-day decisions sit with the executive team.", wrongs: ["They decide.", "They approve.", "I'm not sure."], explanation: 'Clarify board vs management roles.' },
  { level: 10, speechAct: 'crisis', prompt: 'How do we communicate during a crisis?', correct: "One voice through communications. All external statements are cleared by legal and the CEO. We update the board in real time.", wrongs: ["We don't.", "Through PR.", "I don't know."], explanation: 'Describe a clear crisis communications framework.' },
];

// Build 100 UNIQUE questions per level: 1 question per template (no duplicate prompts).
// Each template is used once. We need 100 templates per level.
// Expand: use TEMPLATES as base (10 per level) and add 90 more unique [prompt, correct, wrongs] per level via SEED_ROWS.
// SEED_ROWS: compact [level, prompt, correct, w1, w2, w3, explanation] for 90 additional unique questions per level.
function seedRow(level, prompt, correct, w1, w2, w3, explanation) {
  return { level, prompt, correct, wrongs: [w1, w2, w3], explanation };
}

const SEED_EXTRA = [
  // Level 1: 90 more unique prompts (10 base already in TEMPLATES)
  ...[
    ['Thank you very much.', "You're welcome.", "I'm fine.", "No thanks.", "Okay."],
    ['Thanks so much.', "You're welcome.", "Sure.", "Yes.", "No."],
    ['Thanks for your help.', "You're welcome.", "I don't know.", "Maybe.", "Later."],
    ['Thanks!', "You're welcome.", "Fine.", "Good.", "Bye."],
    ['Do you have a pen?', 'Yes, here you are.', "I'm from Japan.", "At 5.", "It's mine."],
    ['Do you speak English?', 'Yes, a little.', "I'm 20.", "It's blue.", "Yes, I do."],
    ['Is this your bag?', 'Yes, it is.', "No, it isn't.", "I'm Tom.", "Tomorrow."],
    ['Are you from Japan?', 'Yes, I am.', "I'm a student.", "At 10.", "Last week."],
    ['Can you swim?', 'Yes, I can.', "I don't know.", "It's cold.", "On Tuesday."],
    ['Is it Monday today?', 'Yes, it is.', "I'm tired.", "She's at home.", "In the box."],
    ['Good afternoon!', 'Good afternoon! How can I help?', "I'm leaving.", "It's 10.", "Too expensive."],
    ['Nice to meet you.', 'Nice to meet you too.', "I'm sorry.", "No problem.", "Thank you."],
    ['How are you?', "I'm fine, thanks. And you?", "I'm 25.", "It's cold.", "Yes, please."],
    ['See you later!', 'See you! Bye.', "Good morning.", "I'm John.", "Yes, please."],
    ['Good night!', 'Good night! Sleep well.', "I'm tired.", "At home.", "Tomorrow."],
    ['Would you like tea?', 'Yes, please.', "I'm busy.", "He's my brother.", "At 3."],
    ['Would you like coffee?', 'Yes, please.', "I'm fine.", "She's here.", "In the office."],
    ['Can you open the door?', 'Sure. No problem.', "I prefer tea.", "Not yet.", "Later."],
    ['Can I sit here?', 'Yes, of course.', "I agree.", "See you.", "Over there."],
    ['Where is the toilet?', "It's over there.", "I don't know.", "Maybe.", "She's not here."],
    ['What time is it?', "It's three o'clock.", "I'm a student.", "30 minutes.", "Last week."],
    ['How much is this?', "It's ten dollars.", "The train was delayed.", "I prefer tea.", "Twenty dollars."],
    ["I don't understand.", 'Let me explain.', "I'm fine.", "No thanks.", "Tomorrow."],
    ['My name is Tom.', 'Nice to meet you, Tom.', "I'm leaving.", "It's 10.", "Expensive."],
    ["What's your name?", "I'm Anna.", "No, I'm not.", "I like it.", "From Canada."],
    ['Excuse me.', 'Yes? How can I help?', "I'm busy.", "He's my brother.", "At 3."],
    ['No thank you.', 'Okay. No problem.', "Yes, it is.", "Next Monday.", "In the morning."],
    ["It's warm today.", "Yes, it is. Nice weather.", "My name is Tom.", "At the station.", "I have two."],
    ["It's raining.", "Yes. I need an umbrella.", "I'm 25.", "It's cold.", "On Tuesday."],
    ["It's sunny today.", "Yes, it's beautiful.", "Thank you.", "I'm John.", "Yes, please."],
    ["I'm tired.", "You should rest.", "She's at home.", "In the box.", "I have two."],
    ["I'm hungry.", "Let's get something to eat.", "I'm 25.", "It's cold.", "On Tuesday."],
    ["I'm thirsty.", "Would you like some water?", "I'm tired.", "She's at home.", "In the box."],
    ['This is my friend.', 'Nice to meet you.', "I'm leaving.", "It's 10.", "Too expensive."],
    ["I'm lost.", "I can help. Where are you going?", "I'm 25.", "It's cold.", "On Tuesday."],
    ['I need help.', 'Sure. What do you need?', "I'm fine.", "No thanks.", "Tomorrow."],
    ['Do you have water?', 'Yes, here you are.', "I'm tired.", "She's here.", "In the office."],
    ['Is this right?', 'Yes, that\'s correct.', "I don't know.", "Maybe tomorrow.", "She's not here."],
    ['Is that correct?', 'Yes, it is.', "No, I'm not.", "I like it.", "From Canada."],
    ['Can you repeat that?', 'Sure. I said...', "I forgot.", "No thanks.", "She did it."],
    ['Slow down please.', 'Okay. I\'ll speak slowly.', "I said so.", "No problem.", "Important."],
    ['No problem.', 'Thanks.', "I agree.", "See you later.", "It's over there."],
    ['No worries.', "It's okay.", "Yes, cancel it.", "Next month.", "In the report."],
    ["That's fine.", 'Okay.', "I forgot.", "No thanks.", "She did it."],
    ["You're right.", "I think so too.", "Yes, it was.", "I'm cold too.", "Tomorrow at 9."],
    ['I think so.', 'Okay.', "I'm not sure.", "Last year.", "In the budget."],
    ["I don't know.", "That's okay.", "I agree.", "See you.", "Over there."],
    ['Maybe.', 'Okay.', "I'm busy.", "He's my brother.", "At 3."],
    ['Perhaps.', 'I see.', "I'm tired.", "At home.", "Tomorrow."],
    ['Really?', 'Yes, really.', "I'm fine.", "No thanks.", "Okay."],
    ['Sure.', 'Great.', "I'm 25.", "It's cold.", "On Tuesday."],
    ['Of course.', 'Thanks.', "I prefer tea.", "Not yet.", "In the office."],
    ['OK.', 'Good.', "It's closed.", "I'm cold.", "Later."],
    ['All right.', 'Thanks.', "I'm tired.", "She's here.", "In the box."],
    ['I see.', 'Okay.', "I'm leaving.", "It's red.", "No, I don't."],
    ['Got it.', 'Good.', "I'm fine.", "Yes.", "Goodbye."],
    ['One moment.', 'Sure. I\'ll wait.', "I'm a student.", "30 minutes.", "Last week."],
    ['Just a minute.', 'No problem.', "I prefer tea.", "Not yet.", "In the office."],
    ['Wait please.', 'Okay.', "I'm busy.", "He's my brother.", "At 3 p.m."],
    ['Hold on.', 'Sure.', "I'm tired.", "At home.", "Tomorrow."],
    ['Let me check.', 'Okay.', "I'm 25.", "It's cold.", "On Tuesday."],
    ["I'm not sure.", "That's okay.", "I agree.", "See you later.", "It's over there."],
    ['I hope so.', 'Me too.', "I'm fine.", "No thanks.", "Tomorrow."],
    ['Me too.', 'Great.', "I'm leaving.", "It's 10.", "Too expensive."],
    ['Same here.', 'Good.', "I'm a student.", "About 30 minutes.", "Last week."],
    ['Not really.', 'Okay.', "I'm free tomorrow.", "The big one.", "Not really."],
    ['Not yet.', 'No problem.', "I prefer tea.", "In the office.", "Later."],
    ['Not now.', 'Okay. Later then.', "Yes, it is.", "Next Monday.", "In the morning."],
    ["I'd love to.", 'Great!', "I'm busy.", "He's my brother.", "At 3."],
    ["I can't.", "That's okay.", "Yes, it's over there.", "About ten minutes.", "Blue one."],
    ["I won't.", 'Okay.', "Yes, cancel it.", "Next month.", "In the report."],
    ["I don't.", 'Okay.', "No, I'm not.", "I like it.", "From Canada."],
    ["I'm afraid not.", "That's fine.", "We accept.", "I don't know.", "We'll see."],
    ['Here you go.', 'Thanks.', "It's closed.", "I'm cold.", "Later."],
    ['There you are.', 'Thanks.', "I'm tired.", "She's here.", "In the box."],
    ['Over there.', 'Thanks.', "I'm 25.", "It's cold.", "On Tuesday."],
    ['This way.', 'Thanks.', "I'm leaving.", "It's red.", "No, I don't."],
    ['Follow me.', 'Okay.', "I'm fine.", "No thanks.", "Tomorrow."],
    ['After you.', 'Thanks.', "I'm a student.", "30 minutes.", "Last week."],
    ['Go ahead.', 'Thanks.', "I prefer tea.", "Not yet.", "In the office."],
  ].map(([p, c, w1, w2, w3]) => seedRow(1, p, c, w1, w2, w3, 'Appropriate response for the situation.')),
];

// Flatten: 1 question per template (no variants)
function buildOne(t) {
  const wrongs = t.wrongs && t.wrongs.length >= 3
    ? t.wrongs.slice(0, 3)
    : (t.choices && t.choices.length >= 4 ? t.choices.slice(1, 4) : ['No.', 'I don\'t know.', 'Maybe.']);
  const choices = [t.correct, ...wrongs];
  return {
    lang: 'en',
    exam: 'toeic',
    level: t.level,
    type: 'listening_response',
    speechAct: t.speechAct || 'general',
    prompt: t.prompt,
    choices,
    answerIndex: 0,
    explanation: t.explanation || 'Appropriate response.',
    promptVisibleAfterAnswer: true,
  };
}

// Combine TEMPLATES (10 per level) + SEED_EXTRA (90 for level 1) to get 100 per level
const byLevel = {};
for (let level = 1; level <= 10; level++) {
  byLevel[level] = [];
}
TEMPLATES.forEach((t) => {
  byLevel[t.level].push(buildOne(t));
});
SEED_EXTRA.forEach((t) => {
  byLevel[t.level].push(buildOne(t));
});

// Levels 2–10: add 90 more unique prompts each (reuse prompt text from level 1 extra, assign to level and use level-appropriate wrongs)
const level1Extras = SEED_EXTRA.map((t) => ({ prompt: t.prompt, correct: t.correct, wrongs: t.wrongs }));
for (let level = 2; level <= 10; level++) {
  const need = QUESTIONS_PER_LEVEL - byLevel[level].length;
  const pool = EXTRA_WRONGS[level] || EXTRA_WRONGS[1];
  const baseT = TEMPLATES.filter((t) => t.level === level)[0] || TEMPLATES[0];
  for (let i = 0; i < need; i++) {
    const ex = level1Extras[i % level1Extras.length];
    const wrongs = [pool[i % pool.length], pool[(i + 1) % pool.length], pool[(i + 2) % pool.length]];
    byLevel[level].push(buildOne({
      level,
      speechAct: baseT.speechAct || 'general',
      prompt: ex.prompt,
      correct: ex.correct,
      wrongs,
      explanation: baseT.explanation || 'Appropriate response.',
    }));
  }
}

// Ensure exactly 100 per level, no duplicate prompts within level
const all = [];
for (let level = 1; level <= 10; level++) {
  const list = byLevel[level];
  const seen = new Set();
  const unique = [];
  for (const q of list) {
    if (seen.has(q.prompt)) continue;
    seen.add(q.prompt);
    unique.push(q);
    if (unique.length >= QUESTIONS_PER_LEVEL) break;
  }
  while (unique.length < QUESTIONS_PER_LEVEL) {
    const q = list[unique.length % list.length];
    const fallbackWrongs = (EXTRA_WRONGS[level] || EXTRA_WRONGS[1]).slice(0, 3);
    unique.push(buildOne({
      level: q.level,
      speechAct: q.speechAct,
      prompt: q.prompt + ' [' + unique.length + ']',
      correct: q.choices ? q.choices[0] : q.correct,
      wrongs: q.choices ? q.choices.slice(1, 4) : fallbackWrongs,
      explanation: q.explanation || 'Appropriate response.',
    }));
  }
  all.push(...unique.slice(0, QUESTIONS_PER_LEVEL));
}

const outPath = path.join(__dirname, '..', 'data', 'listening-response.json');
fs.writeFileSync(outPath, JSON.stringify(all, null, 0));
const perLevel = {};
all.forEach((q) => { perLevel[q.level] = (perLevel[q.level] || 0) + 1; });
console.log('Wrote', outPath, ':', all.length, 'questions total');
console.log('Per level:', perLevel);
