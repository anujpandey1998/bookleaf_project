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

export function kbSections(...names) {
  return names
    .map((n) => {
      const text = KNOWLEDGE_BASE[n];
      if (!text) throw new Error(`Unknown knowledge base section: ${n}`);
      return `### ${n.toUpperCase()}\n${text}`;
    })
    .join('\n\n');
}
