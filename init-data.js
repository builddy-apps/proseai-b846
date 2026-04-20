import Database from 'better-sqlite3';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure data directory exists
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = new Database(path.join(dataDir, 'app.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Check if data already exists
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get();
if (userCount.count > 0) {
  console.log('Data already seeded, skipping...');
  db.close();
  process.exit(0);
}

// Helper function to hash passwords
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}

// Helper function to generate realistic dates
function daysAgo(days) {
  return new Date(Date.now() - days * 86400000).toISOString();
}

function randomBetween(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

console.log('Seeding database with realistic sample data...');

const insertAll = db.transaction(() => {
  // ============================================
  // USERS
  // ============================================
  const insertUser = db.prepare(`
    INSERT INTO users (email, password, name, role, api_key, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const users = [
    {
      email: 'sarah.chen@email.com',
      password: hashPassword('password123'),
      name: 'Sarah Chen',
      role: 'user',
      apiKey: 'pk_sarah_' + crypto.randomBytes(16).toString('hex'),
      createdAt: daysAgo(28),
      updatedAt: daysAgo(1)
    },
    {
      email: 'marcus.johnson@company.org',
      password: hashPassword('password123'),
      name: 'Marcus Johnson',
      role: 'user',
      apiKey: 'pk_marcus_' + crypto.randomBytes(16).toString('hex'),
      createdAt: daysAgo(21),
      updatedAt: daysAgo(2)
    },
    {
      email: 'elena.rodriguez@proseai.com',
      password: hashPassword('password123'),
      name: 'Elena Rodriguez',
      role: 'user',
      apiKey: 'pk_elena_' + crypto.randomBytes(16).toString('hex'),
      createdAt: daysAgo(14),
      updatedAt: daysAgo(0)
    }
  ];

  const userIds = [];
  for (const user of users) {
    const result = insertUser.run(
      user.email,
      user.password,
      user.name,
      user.role,
      user.apiKey,
      user.createdAt,
      user.updatedAt
    );
    userIds.push(result.lastInsertRowid);
  }

  // ============================================
  // SUBSCRIPTIONS
  // ============================================
  const insertSubscription = db.prepare(`
    INSERT INTO subscriptions (user_id, plan, status, stripe_id, current_period_start, current_period_end, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const subscriptions = [
    { userId: userIds[0], plan: 'pro', status: 'active', stripeId: 'sub_sarah_12345' },
    { userId: userIds[1], plan: 'free', status: 'active', stripeId: null },
    { userId: userIds[2], plan: 'pro', status: 'active', stripeId: 'sub_elena_67890' }
  ];

  for (const sub of subscriptions) {
    insertSubscription.run(
      sub.userId,
      sub.plan,
      sub.status,
      sub.stripeId,
      daysAgo(30),
      daysAgo(-2),
      daysAgo(30),
      daysAgo(0)
    );
  }

  // ============================================
  // USER PREFERENCES
  // ============================================
  const insertPreferences = db.prepare(`
    INSERT INTO user_preferences (user_id, primary_use_case, daily_word_goal, default_tone, onboarding_complete)
    VALUES (?, ?, ?, ?, ?)
  `);

  const preferences = [
    { userId: userIds[0], useCase: 'creative', goal: 1500, tone: 'balanced', onboarding: 1 },
    { userId: userIds[1], useCase: 'blog', goal: 800, tone: 'casual', onboarding: 1 },
    { userId: userIds[2], useCase: 'academic', goal: 1200, tone: 'formal', onboarding: 1 }
  ];

  for (const pref of preferences) {
    insertPreferences.run(pref.userId, pref.useCase, pref.goal, pref.tone, pref.onboarding);
  }

  // ============================================
  // DOCUMENTS
  // ============================================
  const insertDocument = db.prepare(`
    INSERT INTO documents (user_id, title, content, mode, tone, style, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const documents = [
    // Sarah's documents (creative writer)
    {
      userId: userIds[0],
      title: 'The Last Lighthouse Keeper',
      content: 'The morning light crept through the curtains like a reluctant confession, painting shadows on the wall that seemed to tell their own story. She paused at the window, coffee growing cold in her hands, watching the world below with the kind of intensity that suggests either profound wisdom or beautiful madness.\n\nThe lighthouse had been in her family for four generations. Each keeper had added their own mark—a carved initials here, a weathered photograph there—layers of history pressed into the stone like fossils. But when the automated systems came, the human touch became obsolete overnight.\n\n"I suppose every story has its ending," she whispered to the seagulls who had become her only audience. They didn\'t seem to mind. They never did.',
      mode: 'creative',
      tone: 0.7,
      style: 0.8,
      createdAt: daysAgo(25),
      updatedAt: daysAgo(1)
    },
    {
      userId: userIds[0],
      title: 'Midnight in Marrakech',
      content: 'The souk was a labyrinth of colors and sounds, each turn revealing another treasure. Spices piled high in pyramids—saffron, cumin, ras el hanout—their aromas mingling in the warm evening air like an invisible tapestry.\n\nShe had come looking for a story but found something else entirely. The old man at the carpet shop had eyes like polished amber, and when he spoke, his words carried the weight of centuries.\n\n"Every knot tells a story," he said, running his weathered hands over the wool. "This one speaks of love lost and found. That one, of journeys that never end. The carpet chooses its owner, not the other way around."\n\nShe should have walked away then. But the patterns seemed to shift and dance in the lamplight, and she found herself reaching for her wallet.',
      mode: 'creative',
      tone: 0.6,
      style: 0.9,
      createdAt: daysAgo(20),
      updatedAt: daysAgo(3)
    },
    {
      userId: userIds[0],
      title: 'Quarterly Marketing Review - Q3',
      content: '## Q3 Marketing Performance Summary\n\n### Key Metrics\n- Website traffic increased by 23% compared to Q2\n- Email open rates remained steady at 42%\n- Social media engagement grew by 31%\n- Conversion rate improved to 3.8% (up from 2.9%)\n\n### Campaign Highlights\nThe "Summer Stories" campaign exceeded expectations, generating 1,200 new leads and $45,000 in attributed revenue. The influencer partnership with @CreativeMinds reached 2.3 million impressions.\n\n### Recommendations for Q4\n1. Increase investment in video content (73% higher engagement)\n2. Expand email segmentation strategy\n3. Launch customer referral program',
      mode: 'email',
      tone: 0.4,
      style: 0.3,
      createdAt: daysAgo(18),
      updatedAt: daysAgo(5)
    },
    {
      userId: userIds[0],
      title: 'The Art of Slow Living',
      content: '# The Art of Slow Living: Why Less Really Is More\n\n*In a world that glorifies hustle culture, choosing slowness is a radical act of self-care.*\n\nWe live in an era of perpetual motion. Our phones ping with notifications, our calendars overflow with commitments, and our minds race with endless to-do lists. Somewhere between the morning espresso and the midnight doom-scrolling, we forgot how to simply *be*.\n\n## The Problem with "Always On"\n\nResearch shows that chronic busyness doesn\'t make us more productive—it makes us more anxious. A Stanford study found that productivity per hour declines sharply when a person works more than 50 hours a week. After 55 hours, productivity drops so much that putting in any more hours is pointless.\n\n## Embracing the Slow Movement\n\nThe slow movement isn\'t about doing everything at a snail\'s pace. It\'s about doing things at the right speed—savoring rather than rushing, choosing quality over quantity.\n\n### Three Ways to Start:\n\n1. **Practice single-tasking**: Close those 47 browser tabs. Focus on one thing at a time.\n2. **Create tech-free zones**: Your bedroom should be a sanctuary, not a command center.\n3. **Embrace boredom**: Let your mind wander. Some of the best ideas emerge from stillness.\n\n## The Takeaway\n\nSlow living isn\'t laziness—it\'s intentionality. By choosing to move through life with awareness and purpose, we rediscover the joy that busyness stole from us.',
      mode: 'blog',
      tone: 0.5,
      style: 0.7,
      createdAt: daysAgo(15),
      updatedAt: daysAgo(2)
    },
    {
      userId: userIds[0],
      title: 'Morning Pages - Week 12',
      content: 'Day 78: The rain is tapping against the window like an impatient visitor. I should be working on the novel but instead I\'m watching the drops race each other down the glass. There\'s something meditative about rain—it washes away the noise, leaves only the essential.\n\nI dreamed about the ocean last night. Not a beach vacation kind of ocean, but the wild, untamed Atlantic I knew as a child. Waves crashing against the cliff face, spray catching the light like scattered diamonds. My grandmother used to say the sea remembers everything. I believe her now.\n\nWriting feels different lately. Less like pulling teeth and more like... excavation? Unearthing something that was always there, buried under layers of self-doubt and should-bes. The words come easier when I stop trying to be clever and just tell the truth.',
      mode: 'creative',
      tone: 0.8,
      style: 0.9,
      createdAt: daysAgo(12),
      updatedAt: daysAgo(0)
    },
    {
      userId: userIds[0],
      title: 'Product Launch Announcement',
      content: 'Subject: Introducing ProseAI 2.0 — Your Writing, Transformed\n\nDear Valued Community,\n\nToday marks a pivotal moment for ProseAI. After months of development and invaluable feedback from writers like you, we\'re thrilled to announce the launch of ProseAI 2.0.\n\n## What\'s New\n\n### Enhanced AI Comprehension\nOur updated AI engine now understands context 40% better, providing more nuanced suggestions that respect your unique voice.\n\n### Real-Time Collaboration\nWrite together in real-time. Share documents, leave comments, and co-create with seamless synchronization.\n\n### Advanced Analytics\nTrack your writing patterns, identify habits, and watch your skills grow with our expanded metrics dashboard.\n\n## Special Launch Offer\nAs a thank you to our existing community, upgrade to Pro within the next 48 hours and receive 30% off your annual subscription.\n\nStart your free trial today and experience the future of writing.\n\nWarm regards,\nThe ProseAI Team',
      mode: 'email',
      tone: 0.3,
      style: 0.4,
      createdAt: daysAgo(8),
      updatedAt: daysAgo(4)
    },

    // Marcus's documents (blogger)
    {
      userId: userIds[1],
      title: '10 Productivity Hacks That Actually Work',
      content: '# 10 Productivity Hacks That Actually Work (Tested & Proven)\n\n*Forget the generic advice. Here are the strategies that transformed my daily output by 3x.*\n\nAfter years of experimenting with productivity systems—from GTD to Pomodoro to bullet journals—I\'ve distilled what actually works into these ten game-changing hacks.\n\n## 1. The Two-Minute Rule\nIf something takes less than two minutes, do it now. Not later. Not "I\'ll add it to my list." Now.\n\n## 2. Time Blocking with Buffers\nSchedule your tasks in 90-minute blocks, but leave 15-minute buffers between them. Your brain needs transition time.\n\n## 3. The "Eat the Frog" Method\nTackle your hardest task first thing in the morning when willpower is highest. Everything after feels easier.\n\n## 4. Digital Minimalism\nTurn off ALL notifications except from actual humans. Your apps can wait. Your focus can\'t.\n\n## 5. The Power of "No"\nEvery "yes" to someone else is a "no" to your priorities. Guard your time fiercely.\n\n*Continue reading for hacks 6-10...*',
      mode: 'blog',
      tone: 0.5,
      style: 0.6,
      createdAt: daysAgo(22),
      updatedAt: daysAgo(7)
    },
    {
      userId: userIds[1],
      title: 'Remote Work Survival Guide',
      content: '# The Complete Remote Work Survival Guide for 2024\n\nWorking from home sounded like a dream until you realized your couch is also your office, your kitchen is also your cafeteria, and your bedroom is also your conference room.\n\nAfter four years of full-time remote work, here\'s what I\'ve learned:\n\n## Create Sacred Spaces\nYour brain needs physical cues. When you sit at your desk, it\'s work time. When you move to the couch, it\'s relaxation time. Mixing the two is a recipe for burnout.\n\n## The Commute Ritual\nJust because you don\'t commute doesn\'t mean you shouldn\'t have a transition ritual. Walk around the block before starting work. Do it again when you finish. This simple habit creates mental boundaries.\n\n## Social Connection is Non-Negotiable\nIsolation kills productivity and mental health. Schedule virtual coffee chats, join online communities, or work from a café occasionally.\n\n## Set Hard Stop Times\nWithout office hours, work can expand to fill your entire day. Set an alarm for when work ends—and honor it.',
      mode: 'blog',
      tone: 0.4,
      style: 0.5,
      createdAt: daysAgo(17),
      updatedAt: daysAgo(3)
    },
    {
      userId: userIds[1],
      title: 'Client Proposal - Website Redesign',
      content: '## Project Proposal: Website Redesign for TechVenture Inc.\n\n### Executive Summary\nThis proposal outlines a comprehensive redesign of the TechVenture Inc. corporate website to improve user experience, increase conversion rates, and align with current brand positioning.\n\n### Project Scope\n\n#### Phase 1: Discovery & Strategy (Weeks 1-2)\n- Stakeholder interviews\n- User research and persona development\n- Competitive analysis\n- Content audit\n\n#### Phase 2: Design & Prototyping (Weeks 3-5)\n- Information architecture redesign\n- Wireframe development\n- Visual design mockups\n- Interactive prototype\n\n#### Phase 3: Development (Weeks 6-9)\n- Front-end development (React)\n- CMS integration (Contentful)\n- Responsive optimization\n- Performance optimization\n\n#### Phase 4: Launch & Optimization (Weeks 10-11)\n- Quality assurance testing\n- Content migration\n- Launch\n- Post-launch monitoring\n\n### Investment\nTotal project investment: $42,000\n\n### Timeline\n11 weeks from project kickoff to launch.\n\nWe look forward to partnering with you on this exciting transformation.',
      mode: 'email',
      tone: 0.3,
      style: 0.2,
      createdAt: daysAgo(14),
      updatedAt: daysAgo(6)
    },
    {
      userId: userIds[1],
      title: 'Weekly Team Update Template',
      content: 'Subject: Weekly Update - [Week of Date]\n\nHi Team,\n\nHere\'s what I\'ve been working on this week:\n\n## Completed ✓\n- Finished the blog series on productivity (3 posts scheduled)\n- Client proposal for TechVenture submitted\n- Updated content style guide v2.3\n\n## In Progress 🔄\n- Research for Q4 content calendar\n- Interview with industry expert (scheduling)\n- Social media audit\n\n## Blocked ⚠️\n- Waiting on design assets for email campaign\n- Need approval for podcast guest list\n\n## Next Week\'s Focus 🎯\n1. Finalize Q4 content calendar\n2. Launch email campaign (pending assets)\n3. Draft 2 blog posts\n\nLet me know if you need anything from my end!\n\nBest,\nMarcus',
      mode: 'email',
      tone: 0.4,
      style: 0.3,
      createdAt: daysAgo(10),
      updatedAt: daysAgo(3)
    },
    {
      userId: userIds[1],
      title: 'The Future of AI in Content Creation',
      content: '# The Future of AI in Content Creation: A Balanced Perspective\n\n*Will AI replace writers? No. But it will transform how we work.*\n\nThe conversation around AI and content creation has become polarized: either AI is the savior that will revolutionize everything, or it\'s the destroyer of creative careers. The truth, as usual, lies somewhere in between.\n\n## What AI Does Well\n- Generating outlines and frameworks\n- Suggesting alternative phrasings\n- Catching grammar and style inconsistencies\n- Providing research summaries\n\n## What AI Cannot Do\n- Inject genuine human experience\n- Understand cultural nuance without context\n- Create truly original ideas (it remixes, not invents)\n- Feel the emotional weight of a story\n\n## The Hybrid Approach\nThe most effective content creators in 2024 aren\'t avoiding AI or relying on it completely. They\'re using it as a collaborator—a sounding board that amplifies their natural abilities.\n\nThink of AI as a very fast, very knowledgeable intern. It can gather information, draft options, and handle routine tasks. But the final creative decisions? Those remain human.',
      mode: 'blog',
      tone: 0.4,
      style: 0.5,
      createdAt: daysAgo(7),
      updatedAt: daysAgo(1)
    },

    // Elena's documents (academic & professional)
    {
      userId: userIds[2],
      title: 'Research Paper: Digital Literacy in Education',
      content: '## Abstract\n\nThis paper examines the evolving landscape of digital literacy in K-12 education, analyzing current pedagogical approaches and their effectiveness in preparing students for a technology-driven workforce. Through a systematic review of 47 peer-reviewed studies published between 2019-2024, we identify key challenges and propose a framework for integrating digital literacy across curricula.\n\n## Introduction\n\nIn recent years, the field of education has undergone significant transformation. The rapid digitization of society has created an urgent need to rethink how we prepare students for a world where technological fluency is no longer optional—it\'s fundamental.\n\nDigital literacy extends far beyond basic computer skills. It encompasses critical evaluation of online information, understanding of data privacy, creative digital content production, and ethical considerations in digital spaces.\n\n## Methodology\n\nOur analysis employs a mixed-methods approach:\n\n1. **Systematic Literature Review**: 47 peer-reviewed studies from leading education journals\n2. **Case Study Analysis**: 12 schools implementing innovative digital literacy programs\n3. **Survey Data**: Responses from 340 educators across 5 countries\n\n## Preliminary Findings\n\nThe data suggests that integrated approaches—where digital literacy is woven into existing subjects rather than taught in isolation—show 35% better retention and application rates.',
      mode: 'academic',
      tone: 0.2,
      style: 0.2,
      createdAt: daysAgo(24),
      updatedAt: daysAgo(2)
    },
    {
      userId: userIds[2],
      title: 'Grant Proposal: STEM Education Initiative',
      content: '## Grant Proposal: Expanding STEM Access in Underserved Communities\n\n### Organization Overview\nThe Digital Bridge Foundation is a 501(c)(3) nonprofit dedicated to closing the technology access gap in education. Since 2018, we have served over 15,000 students across 40 schools in low-income neighborhoods.\n\n### Problem Statement\nOnly 34% of schools in low-income areas offer comprehensive STEM programs, compared to 72% in affluent districts. This disparity perpetuates the cycle of economic inequality and limits career opportunities for an entire generation.\n\n### Proposed Solution\nThe "Code Forward" initiative will:\n- Establish 8 new computer science labs in underserved schools\n- Train 40 teachers in modern STEM pedagogy\n- Provide after-school coding programs for 2,000 students\n- Create a mentorship network connecting students with tech professionals\n\n### Expected Outcomes\n- 60% increase in students pursuing STEM majors\n- Measurable improvement in standardized test scores\n- 200+ students completing their first coding project\n- Sustainable infrastructure lasting beyond grant period\n\n### Budget Request\nTotal program cost: $285,000\nGrant request: $150,000\n(Remaining funds secured through corporate partnerships and individual donors)',
      mode: 'email',
      tone: 0.3,
      style: 0.2,
      createdAt: daysAgo(19),
      updatedAt: daysAgo(5)
    },
    {
      userId: userIds[2],
      title: 'Literature Review: Cognitive Load Theory',
      content: '# Literature Review: Applications of Cognitive Load Theory in Digital Learning Environments\n\n## Introduction\n\nCognitive Load Theory (CLT), first proposed by John Sweller in 1988, has become one of the most influential frameworks in educational psychology. As learning increasingly moves to digital platforms, understanding how CLT applies to screen-based environments is crucial for effective instructional design.\n\n## Theoretical Foundation\n\nCLT posits that working memory has limited capacity. Effective instruction must manage three types of cognitive load:\n\n1. **Intrinsic Load**: The inherent complexity of the material\n2. **Extraneous Load**: Cognitive effort wasted on poor design\n3. **Germane Load**: Productive effort directed at learning\n\n## CLT in Digital Contexts\n\nRecent research by Mayer (2021) and colleagues has identified specific challenges unique to digital learning:\n\n- **Split-attention effect**: Information presented in separate locations (text on one side, diagram on another) increases extraneous load\n- **Redundancy effect**: Simultaneous presentation of the same information in text and audio harms learning\n- **Modality effect**: Using audio for narration and visuals for diagrams reduces cognitive load\n\n## Implications for Instructional Design\n\nDigital learning platforms should:\n- Integrate text with relevant visuals rather than separating them\n- Use signaling to highlight key information\n- Segment complex content into manageable chunks\n- Provide worked examples before practice problems',
      mode: 'academic',
      tone: 0.2,
      style: 0.1,
      createdAt: daysAgo(13),
      updatedAt: daysAgo(1)
    },
    {
      userId: userIds[2],
      title: 'Conference Presentation: EdTech Trends 2024',
      content: '# EdTech Trends 2024: What Educators Need to Know\n\n## Opening\n\nGood morning, everyone. Thank you for joining me today. I want to talk about something that affects every educator in this room: the rapid evolution of educational technology and what it means for our practice.\n\n## Trend 1: AI-Assisted Personalization\n\nArtificial intelligence is no longer a futuristic concept—it\'s in our classrooms today. Adaptive learning platforms can now:\n- Identify individual student gaps in real-time\n- Adjust difficulty levels automatically\n- Provide personalized practice recommendations\n- Generate instant feedback on assignments\n\n*Key statistic: Schools using AI-assisted platforms report 28% improvement in student outcomes*\n\n## Trend 2: Immersive Learning Experiences\n\nVirtual and augmented reality are making abstract concepts tangible:\n- Virtual field trips to historical sites\n- 3D molecular visualization for chemistry\n- Simulated conversations for language learning\n- Virtual labs for expensive or dangerous experiments\n\n## Trend 3: Collaborative Digital Spaces\n\nThe future of learning is social, even when it\'s digital:\n- Real-time collaborative documents\n- Video discussion platforms\n- Peer review systems\n- Global classroom connections\n\n## The Human Element\n\nTechnology should amplify, not replace, the irreplaceable human elements of teaching: empathy, mentorship, and inspiration.\n\n## Q&A\n\n[Reserved for audience questions]',
      mode: 'blog',
      tone: 0.4,
      style: 0.4,
      createdAt: daysAgo(9),
      updatedAt: daysAgo(2)
    },
    {
      userId: userIds[2],
      title: 'LinkedIn Post Series: Women in STEM',
      content: '🔥 Last week, I had the privilege of speaking at the Women in Tech Summit. Here\'s what I learned:\n\n→ The gender gap in STEM isn\'t closing fast enough. At our current rate, we won\'t reach parity for another 80 years.\n\n→ But there\'s hope: organizations investing in early mentorship programs see 3x more women entering tech careers.\n\n→ The biggest barrier isn\'t ability—it\'s belonging. When girls see women in STEM leadership, they can envision themselves there too.\n\nThree things we can ALL do today:\n1. Mentor a young woman in your field\n2. Amplify women\'s voices in meetings\n3. Challenge unconscious bias when you see it\n\nThe future of STEM depends on including ALL the talent available.\n\nWhat\'s one action you\'ll take this week to support women in tech? 👇\n\n#WomenInSTEM #EdTech #DiversityInTech #Mentorship',
      mode: 'social',
      tone: 0.6,
      style: 0.7,
      createdAt: daysAgo(5),
      updatedAt: daysAgo(0)
    },
    {
      userId: userIds[2],
      title: 'Case Study Analysis: Flipped Classroom Model',
      content: '## Case Study Analysis: Implementing the Flipped Classroom Model at Riverside High School\n\n### Background\nRiverside High School, a public school serving 1,200 students, implemented a flipped classroom model in its science department during the 2023-2024 academic year.\n\n### Implementation\n\n**Phase 1 (Months 1-2): Preparation**\n- Teacher training on video content creation\n- Platform selection and student onboarding\n- Baseline assessment of student performance\n\n**Phase 2 (Months 3-6): Rollout**\n- Students watched lecture videos at home (15-20 min each)\n- Class time devoted to collaborative problem-solving\n- Weekly check-ins to gather student feedback\n\n### Results\n\n| Metric | Before | After | Change |\n|--------|--------|-------|--------|\n| Test Scores | 72% | 81% | +9% |\n| Homework Completion | 64% | 89% | +25% |\n| Student Engagement* | 3.2/5 | 4.1/5 | +0.9 |\n| Teacher Satisfaction | 3.5/5 | 4.3/5 | +0.8 |\n\n*Based on student survey data\n\n### Key Takeaways\n1. Student autonomy increased significantly\n2. Teachers reported more meaningful interactions with students\n3. Initial resistance from parents decreased after seeing results\n4. Technology access remained a challenge for 15% of students',
      mode: 'academic',
      tone: 0.2,
      style: 0.2,
      createdAt: daysAgo(3),
      updatedAt: daysAgo(0)
    }
  ];

  const documentIds = [];
  for (const doc of documents) {
    const result = insertDocument.run(
      doc.userId,
      doc.title,
      doc.content,
      doc.mode,
      doc.tone,
      doc.style,
      doc.createdAt,
      doc.updatedAt
    );
    documentIds.push({ id: result.lastInsertRowid, userId: doc.userId });
  }

  // ============================================
  // CONVERSATIONS & MESSAGES
  // ============================================
  const insertConversation = db.prepare(`
    INSERT INTO conversations (document_id, created_at)
    VALUES (?, ?)
  `);

  const insertMessage = db.prepare(`
    INSERT INTO messages (conversation_id, role, content, token_count, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Create conversations for each document
  const conversationIds = [];
  for (let i = 0; i < documentIds.length; i++) {
    const doc = documentIds[i];
    const convResult = insertConversation.run(doc.id, daysAgo(25 - i));
    conversationIds.push({ id: convResult.lastInsertRowid, documentIndex: i });
  }

  // Add realistic messages to conversations
  const messageTemplates = [
    // Conversation starters and AI responses
    { role: 'user', content: 'Can you help me develop the opening paragraph? I want something that draws the reader in immediately.' },
    { role: 'assistant', content: 'I\'d be happy to help craft a compelling opening! A strong hook typically does one of three things: creates curiosity, establishes an emotional connection, or presents a surprising fact. Would you like me to suggest a few different approaches for your opening?', tokens: 45 },
    { role: 'user', content: 'Yes, please suggest three different approaches. I want to see which style fits best.' },
    { role: 'assistant', content: 'Here are three approaches for your consideration:\n\n**Approach 1: Sensory Immersion**\nStart with vivid sensory details that place the reader directly in the scene.\n\n**Approach 2: Philosophical Question**\nOpen with a thought-provoking question that establishes the theme.\n\n**Approach 3: In Media Res**\nBegin in the middle of action to create immediate momentum.\n\nWhich direction resonates with your vision for this piece?', tokens: 78 },
    { role: 'user', content: 'I like the first approach. Can you help me refine the sensory details?' },
    { role: 'assistant', content: 'Excellent choice! Sensory details create an immersive experience. Here\'s how to strengthen them:\n\n- **Visual**: What does the character see? Focus on specific, telling details rather than broad descriptions.\n- **Auditory**: What sounds fill the space? Include both obvious and subtle sounds.\n- **Tactile**: What textures or temperatures does the character feel?\n- **Olfactory**: Scent is closely linked to memory—use it strategically.\n\nWould you like me to generate a few sample paragraphs using these elements?', tokens: 112 },
    { role: 'user', content: 'This is great! Can you suggest some improvements to the middle section?' },
    { role: 'assistant', content: 'Of course! Looking at your middle section, here are some suggestions:\n\n1. **Pacing**: Consider varying sentence length to create rhythm\n2. **Transitions**: Strengthen the connections between paragraphs\n3. **Character Development**: Add more internal monologue to deepen reader connection\n4. **Conflict**: Introduce subtle tension to maintain engagement\n\nWould you like me to show you specific examples of how to implement any of these suggestions?', tokens: 85 },
    { role: 'user', content: 'Yes, especially the pacing and transitions. I feel like it flows a bit unevenly.' },
    { role: 'assistant', content: 'I understand—pacing can be tricky. Here\'s a technique that often helps:\n\n**The Rhythm Method**: Alternate between long, flowing sentences and short, punchy ones. This creates a natural cadence that keeps readers engaged.\n\nFor transitions, try the "bridge" technique: end each paragraph with a word or phrase that connects to the beginning of the next paragraph. This creates an invisible thread that pulls readers through.\n\nLet me show you a revised version of your middle section with these principles applied.', tokens: 98 }
  ];

  for (const conv of conversationIds) {
    const docIndex = conv.documentIndex;
    const startIdx = (docIndex * 2) % messageTemplates.length;
    
    // Add 4-8 messages per conversation
    const messageCount = randomBetween(4, 8);
    for (let j = 0; j < Math.min(messageCount, messageTemplates.length); j++) {
      const msgTemplate = messageTemplates[(startIdx + j) % messageTemplates.length];
      insertMessage.run(
        conv.id,
        msgTemplate.role,
        msgTemplate.content,
        msgTemplate.tokens || randomBetween(20, 150),
        daysAgo(25 - docIndex - (j * 0.1))
      );
    }
  }

  // ============================================
  // WRITING STATS
  // ============================================
  const insertStats = db.prepare(`
    INSERT INTO writing_stats (user_id, date, words_written, streak_count, total_words)
    VALUES (?, ?, ?, ?, ?)
  `);

  // Generate 30 days of stats for each user
  for (const userId of userIds) {
    let streak = 0;
    let totalWords = 0;

    for (let day = 30; day >= 0; day--) {
      const date = new Date(Date.now() - day * 86400000).toISOString().slice(0, 10);
      const wordsWritten = randomBetween(200, 1800);
      
      // Simulate missed days (about 15% chance)
      if (Math.random() < 0.15 && day < 25) {
        streak = 0;
        insertStats.run(userId, date, 0, 0, totalWords);
      } else {
        streak++;
        totalWords += wordsWritten;
        insertStats.run(userId, date, wordsWritten, streak, totalWords);
      }
    }
  }

  // ============================================
  // USAGE TRACKING
  // ============================================
  const insertUsage = db.prepare(`
    INSERT INTO usage_tracking (user_id, metric, value, date, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);

  const metrics = ['ai_requests', 'words_generated', 'documents_created', 'exports'];
  
  for (const userId of userIds) {
    for (let day = 30; day >= 0; day--) {
      const date = new Date(Date.now() - day * 86400000).toISOString().slice(0, 10);
      
      for (const metric of metrics) {
        let value = 0;
        switch (metric) {
          case 'ai_requests':
            value = randomBetween(2, 25);
            break;
          case 'words_generated':
            value = randomBetween(100, 2000);
            break;
          case 'documents_created':
            value = Math.random() < 0.3 ? 1 : 0;
            break;
          case 'exports':
            value = Math.random() < 0.2 ? randomBetween(1, 3) : 0;
            break;
        }
        
        if (value > 0) {
          insertUsage.run(userId, metric, value, date, daysAgo(day));
        }
      }
    }
  }

  // ============================================
  // REFRESH TOKENS (for active sessions)
  // ============================================
  const insertRefreshToken = db.prepare(`
    INSERT INTO refresh_tokens (user_id, token, expires_at, created_at)
    VALUES (?, ?, ?, ?)
  `);

  for (const userId of userIds) {
    // Create an active refresh token for each user
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 86400000).toISOString();
    insertRefreshToken.run(userId, token, expiresAt, daysAgo(0));
  }
});

insertAll();

// Get final counts for summary
const counts = {
  users: db.prepare('SELECT COUNT(*) as c FROM users').get().c,
  subscriptions: db.prepare('SELECT COUNT(*) as c FROM subscriptions').get().c,
  documents: db.prepare('SELECT COUNT(*) as c FROM documents').get().c,
  conversations: db.prepare('SELECT COUNT(*) as c FROM conversations').get().c,
  messages: db.prepare('SELECT COUNT(*) as c FROM messages').get().c,
  writingStats: db.prepare('SELECT COUNT(*) as c FROM writing_stats').get().c,
  preferences: db.prepare('SELECT COUNT(*) as c FROM user_preferences').get().c,
  templates: db.prepare('SELECT COUNT(*) as c FROM templates').get().c,
  usageTracking: db.prepare('SELECT COUNT(*) as c FROM usage_tracking').get().c,
  refreshTokens: db.prepare('SELECT COUNT(*) as c FROM refresh_tokens').get().c
};

db.close();

console.log('✅ Database seeded successfully!');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('Seeded:');
console.log(`  Users:              ${counts.users}`);
console.log(`  Subscriptions:      ${counts.subscriptions}`);
console.log(`  Documents:          ${counts.documents}`);
console.log(`  Conversations:      ${counts.conversations}`);
console.log(`  Messages:           ${counts.messages}`);
console.log(`  Writing Stats:      ${counts.writingStats} (30 days per user)`);
console.log(`  User Preferences:   ${counts.preferences}`);
console.log(`  Templates:          ${counts.templates} (default)`);
console.log(`  Usage Records:      ${counts.usageTracking}`);
console.log(`  Refresh Tokens:     ${counts.refreshTokens}`);
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
console.log('');
console.log('Demo credentials:');
console.log('  sarah.chen@email.com      / password123');
console.log('  marcus.johnson@company.org / password123');
console.log('  elena.rodriguez@proseai.com / password123');
console.log('');
console.log('🎉 ProseAI is ready to use!');