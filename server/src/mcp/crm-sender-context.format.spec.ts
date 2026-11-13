import { CRM_PROVIDERS } from "./bigin/bigin-sender-context.constants";
import { formatCrmSenderContext } from "./crm-sender-context.format";
import { CRM_MATCH_KINDS, CrmSenderContext } from "./crm-sender-context.types";

const CONTEXT: CrmSenderContext = {
  provider: CRM_PROVIDERS.ZOHO_BIGIN,
  matchedBy: CRM_MATCH_KINDS.CONTACT_EMAIL,
  matchCount: 2,
  contact: { id: "c1", name: "Ada Lovelace", title: "CTO", owner: "Jeremy" },
  company: { id: "a1", name: "Acme", website: null },
  deals: [
    {
      id: "d1",
      name: "Acme pilot",
      stage: "Proposal",
      isOpen: true,
      amount: 12000,
      closingDate: "2026-12-01",
      pipeline: "Sales",
    },
  ],
  notes: [
    {
      id: "n1",
      title: null,
      content: "Wants a quote.",
      createdAt: "2026-11-02",
    },
  ],
};

describe("formatCrmSenderContext", () => {
  it("renders a compact block with only the parts that exist", () => {
    expect(formatCrmSenderContext(CONTEXT)).toBe(
      [
        "Contact: Ada Lovelace · CTO · owner Jeremy",
        "Company: Acme",
        "2 matching records; showing the most recently updated",
        "Deals:",
        "- Acme pilot · Proposal · 12000 · closes 2026-12-01 · Sales",
        "Recent notes:",
        "- 2026-11-02 · Wants a quote.",
      ].join("\n"),
    );
  });

  it("omits empty sections", () => {
    const companyOnly: CrmSenderContext = {
      ...CONTEXT,
      matchedBy: CRM_MATCH_KINDS.COMPANY_DOMAIN,
      matchCount: 1,
      contact: null,
      deals: [],
      notes: [],
    };
    expect(formatCrmSenderContext(companyOnly)).toBe("Company: Acme");
  });
});
