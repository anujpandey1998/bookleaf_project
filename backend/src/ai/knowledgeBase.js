// BookLeaf Knowledge Base — single source of truth injected into AI prompts.
// Keep this file in sync with official BookLeaf policies. Sections are addressable
// so we only send the parts relevant to a given task (token/cost control).

export const KB_VERSION = '2026-10-14';

export const KNOWLEDGE_BASE = {
  company: `BookLeaf is a self-publishing company operating in India and the US.
Packages include Standard Free and Bestseller Breakthrough.
BookLeaf handles cover design, typesetting, ISBN assignment, printing, distribution, and royalties.
Printing is performed in-house in Delhi or through partners Repro India and Epitome Books.`,

  royalties: `Author receives 80% of net profit; BookLeaf receives 20%.
Net profit is MRP minus printing cost, platform commission, and shipping charges.
Royalties are calculated quarterly and paid within 45 days of quarter-end.
Minimum payout threshold is ₹1,000. Smaller balances roll over to the next cycle.
Payment is made by bank transfer to the account linked in the author dashboard.
Detailed platform-wise royalty breakdowns are available in the author dashboard.`,

  isbn: `BookLeaf assigns each published book a unique ISBN under its publisher imprint.
Authors wanting an ISBN under their own imprint must obtain it independently.
Duplicate ISBNs or incorrect book-to-ISBN mappings are high-priority issues escalated to production,
with a 48-hour resolution timeline communicated for investigation.`,

  printing: `Standard printing turnaround is 5–7 business days from order confirmation.
Verified defects such as misprints, binding problems, or color inconsistencies qualify for a free reprint.
Request photographs of defective copies when needed.`,

  distribution: `Distribution platforms include Amazon India, Flipkart, Amazon US, Amazon UK, and the BookLeaf Store.
Listings typically go live within 7–10 business days after publication is complete.
Availability problems may be caused by stock synchronization.
The team can trigger a re-sync, typically taking 24–48 hours.`,

  production: `Production stages: Manuscript Received → Editing (if opted) → Cover Design → Typesetting →
Proofreading → ISBN Assignment → Printing → Distribution Setup → Published & Live.
Delays can occur while waiting for author approval or proofreading revisions.
Never claim a specific production stage unless it is supported by actual data.`,

  metadata: `Description/metadata changes can be submitted through the dashboard or by emailing BookLeaf.
Changes typically appear on platforms within 3–5 business days.`,

  communication: `Be empathetic and professional. Acknowledge concerns before proposing solutions.
Be specific when verified details are available. Take responsibility for BookLeaf errors.
For investigations, communicate a clear next step and an appropriate timeline. End with a clear next action.
Important: never claim an investigation has actually started until an authorized team member takes that action.
Never invent payment dates, transaction results, production statuses, or investigations.
If essential facts are missing, ask for clarification or recommend investigation instead of inventing them.`,
};

export const DRAFT_EXAMPLES = [
  {
    category: 'Royalty & Payments',
    query: 'My quarterly royalty has not arrived and it is past the payment window.',
    response: 'I’m sorry your royalty payment has not arrived. Royalties are paid within 45 days of quarter-end. Please confirm the bank account linked in your author dashboard and share which quarter is affected so the team can review the details.',
  },
  {
    category: 'Royalty & Payments',
    query: 'My pending royalty balance is Rs 750. When will it be paid?',
    response: 'Your pending balance is below the Rs 1,000 minimum payout threshold, so it rolls over to the next cycle. Once the threshold is met, payment is made by bank transfer to the account linked in your dashboard.',
  },
  {
    category: 'ISBN & Metadata Issues',
    query: 'My live book listing shows an ISBN that belongs to another title.',
    response: 'I’m sorry the listing shows an incorrect ISBN. A confirmed book-to-ISBN mismatch is treated as high priority and escalated to production. Please share the book title and listing link so the team can verify the mapping; the communicated investigation timeline is 48 hours.',
  },
  {
    category: 'Printing & Quality',
    query: 'Several copies have misprinted pages.',
    response: 'I’m sorry the copies arrived with misprinted pages. Please send clear photographs of the affected pages and the book’s order details. Verified printing defects qualify for a free reprint; standard printing turnaround is 5–7 business days from order confirmation.',
  },
  {
    category: 'Distribution & Availability',
    query: 'My published book is not available on Amazon.',
    response: 'I understand how important it is for readers to find your book. Listings typically go live within 7–10 business days after publication is complete. If that window has passed, please share the title and listing link so the team can check availability and stock synchronization.',
  },
  {
    category: 'Book Status & Production Updates',
    query: 'What stage is my manuscript currently in?',
    response: 'I’d be happy to help confirm the current stage. Production can include editing, cover design, typesetting, proofreading, ISBN assignment, printing, and distribution setup; timing may depend on pending approvals. Please share your book title or reference so the team can verify its status.',
  },
  {
    category: 'General Inquiry',
    query: 'I need help updating my author profile.',
    response: 'I can help point you in the right direction. Please tell us which profile detail you need to update, and avoid sending passwords or bank details in a ticket. The team will share the appropriate next step.',
  },
];

export function kbSections(...names) {
  return names
    .map((n) => {
      const text = KNOWLEDGE_BASE[n];
      if (!text) throw new Error(`Unknown knowledge base section: ${n}`);
      return `### ${n.toUpperCase()}\n${text}`;
    })
    .join('\n\n');
}

export function kbDraftExamples(category) {
  return DRAFT_EXAMPLES
    .filter((example) => example.category === category)
    .slice(0, 2)
    .map(({ query, response }, index) => `Example ${index + 1}\nAuthor query: ${query}\nSupport reply: ${response}`)
    .join('\n\n');
}
