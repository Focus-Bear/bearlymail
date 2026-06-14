import {
  allFamilies,
  assignFamily,
  categoryName,
  OTHER_FAMILY,
} from "./category-family.taxonomy";

describe("category-family taxonomy", () => {
  it("returns Other for null/empty", () => {
    expect(assignFamily(null)).toBe(OTHER_FAMILY);
    expect(assignFamily("")).toBe(OTHER_FAMILY);
  });

  it("separates GitHub PRs, issues and CI", () => {
    expect(
      assignFamily("🔧 GitHub PR Updates - human-sent PR notifications"),
    ).toBe("GitHub / Pull Requests");
    expect(
      assignFamily("🤖 GitHub Bot PR Updates - automated bot PR notifications"),
    ).toBe("GitHub / Pull Requests");
    expect(
      assignFamily("🐛 Human-reported Bug Issues - new GitHub issues"),
    ).toBe("GitHub / Issues");
    expect(
      assignFamily("❌ CI/CD & QA Pipeline Failures - failed GitHub Actions"),
    ).toBe("GitHub / CI & Build");
  });

  it("does not let a description negation steal into Pull Requests", () => {
    expect(
      assignFamily(
        "Customer feedback (github issues or feedback forms). Not pull requests.",
      ),
    ).toBe("GitHub / Issues");
  });

  it("does not match the 'form' keyword inside 'platform'", () => {
    expect(
      assignFamily("💼 Upwork Platform Notifications - status updates"),
    ).toBe("Sales, Partnerships & Support");
  });

  it("keeps 'grant access' in Documents, not Finance", () => {
    expect(
      assignFamily("📄 Document Access Requests - requests to grant access"),
    ).toBe("Documents & Forms");
  });

  it("routes email delivery failures to Alerts, shipping to Shipping", () => {
    expect(
      assignFamily("📧 Email Delivery Failures - failed email delivery"),
    ).toBe("Alerts & Monitoring");
    expect(
      assignFamily("📦 Shipping & Delivery - package dispatch and tracking"),
    ).toBe("Shipping & Delivery");
  });

  it("parses colon-separated names", () => {
    expect(
      assignFamily("🤖 Automated System Alerts: system update notifications"),
    ).toBe("Alerts & Monitoring");
    expect(assignFamily("Fundraising: investors/grants")).toBe(
      "Finance & Payments",
    );
  });

  it("strips emoji and description in categoryName", () => {
    expect(
      categoryName("🔧 GitHub PR Updates - human-sent notifications"),
    ).toBe("github pr updates");
    expect(categoryName("Fundraising: investors/grants")).toBe("fundraising");
  });

  it("lists unique families including Other", () => {
    const families = allFamilies();
    expect(families).toContain(OTHER_FAMILY);
    expect(new Set(families).size).toBe(families.length);
  });
});
