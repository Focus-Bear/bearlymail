import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from taxonomy import OTHER_FAMILY, all_families, assign_family  # noqa: E402


def test_none_and_empty_are_other():
    assert assign_family(None) == OTHER_FAMILY
    assert assign_family("") == OTHER_FAMILY


def test_github_families_separate_prs_issues_and_ci():
    assert assign_family("🔧 GitHub PR Updates - human-sent PR notifications") == "GitHub / Pull Requests"
    assert assign_family("🤖 GitHub Bot PR Updates - automated bot PR notifications") == "GitHub / Pull Requests"
    assert assign_family("🐛 Human-reported Bug Issues - new GitHub issues") == "GitHub / Issues"
    assert assign_family("❌ CI/CD & QA Pipeline Failures - failed GitHub Actions") == "GitHub / CI & Build"


def test_description_negation_does_not_steal_into_pull_requests():
    # "Customer feedback ... Not pull requests" must stay in Issues, not PRs —
    # the rule matches the name, not the negating description.
    cat = "Customer feedback (github issues or feedback forms). Not pull requests."
    assert assign_family(cat) == "GitHub / Issues"


def test_form_word_boundary_does_not_match_platform():
    # "Upwork Platform" contains the substring "form" but must not become a Form.
    assert assign_family("💼 Upwork Platform Notifications - status updates") == "Sales, Partnerships & Support"


def test_grant_in_description_does_not_make_document_financial():
    # "Requests to grant ... access" — "grant" is a Finance keyword but only in
    # the description, so the name-based match keeps it in Documents.
    assert assign_family("📄 Document Access Requests - requests to grant access") == "Documents & Forms"


def test_email_delivery_failure_is_alert_not_shipping():
    assert assign_family("📧 Email Delivery Failures - failed email delivery") == "Alerts & Monitoring"
    assert assign_family("📦 Shipping & Delivery - package dispatch and tracking") == "Shipping & Delivery"


def test_colon_separated_name_is_parsed():
    assert assign_family("🤖 Automated System Alerts: system update notifications") == "Alerts & Monitoring"
    assert assign_family("Fundraising: investors/grants") == "Finance & Payments"


def test_all_families_includes_other_and_is_unique():
    fams = all_families()
    assert OTHER_FAMILY in fams
    assert len(fams) == len(set(fams))
