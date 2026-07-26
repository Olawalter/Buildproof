"""
Direct tests for ConstructionEscrow intelligent contract.
These run entirely in-process without GenVM — LLM and web calls are mocked.
Run: pytest tests/direct -v
"""

import json
import pytest
from unittest.mock import patch, MagicMock
from genlayer.py.testing import BaseTestCase

# ─── Fixtures ─────────────────────────────────────────────────────────────────

OWNER = "0xOwner000000000000000000000000000000000001"
CONTRACTOR = "0xContractor00000000000000000000000000002"
OTHER = "0xOther0000000000000000000000000000000003"

DEFAULT_INSPECTIONS = [
    "Structural Inspection",
    "Electrical Inspection",
    "Plumbing Inspection",
    "Fire Safety Inspection",
]

CONTRACT_VALUE = 500_000_000  # ₦500M in base units


def make_contract(sender: str = OWNER):
    """Instantiate a fresh ConstructionEscrow contract."""
    import sys
    import os
    sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
    from contracts.construction_escrow import ConstructionEscrow
    return BaseTestCase(ConstructionEscrow, sender=sender)


# ─── LLM Mock Helpers ─────────────────────────────────────────────────────────

MOCK_PASS_RESPONSE = json.dumps({
    "passed": True,
    "confidence": 0.93,
    "critical_defects": 0,
    "occupancy_verified": True,
    "inspection_coverage": {
        "Structural Inspection": True,
        "Electrical Inspection": True,
        "Plumbing Inspection": True,
        "Fire Safety Inspection": True,
    },
    "blocking_issues": [],
    "reason": "All required inspections have valid certificates. "
               "Occupancy permit verified. No critical defects found.",
})

MOCK_FAIL_RESPONSE = json.dumps({
    "passed": False,
    "confidence": 0.88,
    "critical_defects": 2,
    "occupancy_verified": False,
    "inspection_coverage": {
        "Structural Inspection": True,
        "Electrical Inspection": False,
        "Plumbing Inspection": False,
        "Fire Safety Inspection": True,
    },
    "blocking_issues": [
        "Electrical inspection certificate missing",
        "Plumbing certificate not submitted",
    ],
    "reason": "Electrical and plumbing certificates are absent. "
               "Occupancy permit not verified. Payment should not be released.",
})


# ─── Project Creation Tests ────────────────────────────────────────────────────

class TestCreateProject:
    def test_create_project_succeeds(self):
        case = make_contract(OWNER)
        pid = case.call("create_project",
                        "Lagos Commercial Tower",
                        "10-storey office complex",
                        "Victoria Island, Lagos",
                        CONTRACT_VALUE,
                        DEFAULT_INSPECTIONS)
        assert pid == "0"
        details = case.view("project_details", "0")
        assert details["title"] == "Lagos Commercial Tower"
        assert details["status"] == "draft"
        assert details["owner"].lower() == OWNER.lower()
        assert details["contractor"] == ""
        assert details["inspection_count"] == 4

    def test_project_counter_increments(self):
        case = make_contract(OWNER)
        p1 = case.call("create_project", "Project A", "desc", "loc", 1000, ["Structural"])
        p2 = case.call("create_project", "Project B", "desc", "loc", 2000, ["Electrical"])
        assert p1 == "0"
        assert p2 == "1"
        assert case.view("get_project_count") == 2

    def test_create_project_empty_title_fails(self):
        case = make_contract(OWNER)
        with pytest.raises(Exception, match="Title cannot be empty"):
            case.call("create_project", "", "desc", "loc", CONTRACT_VALUE, DEFAULT_INSPECTIONS)

    def test_create_project_no_inspections_fails(self):
        case = make_contract(OWNER)
        with pytest.raises(Exception, match="Must define at least one inspection"):
            case.call("create_project", "Title", "desc", "loc", CONTRACT_VALUE, [])

    def test_create_project_zero_value_fails(self):
        case = make_contract(OWNER)
        with pytest.raises(Exception, match="Contract value must be positive"):
            case.call("create_project", "Title", "desc", "loc", 0, DEFAULT_INSPECTIONS)


# ─── Accept Project Tests ──────────────────────────────────────────────────────

class TestAcceptProject:
    def test_contractor_accepts_successfully(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        case.set_sender(CONTRACTOR)
        case.call("accept_project", pid)
        details = case.view("project_details", pid)
        assert details["status"] == "accepted"
        assert details["contractor"].lower() == CONTRACTOR.lower()

    def test_owner_cannot_accept_own_project(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        with pytest.raises(Exception, match="Owner cannot act as contractor"):
            case.call("accept_project", pid)

    def test_cannot_accept_non_draft_project(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        case.set_sender(CONTRACTOR)
        case.call("accept_project", pid)
        # Try to accept again
        with pytest.raises(Exception, match="Project must be in draft status"):
            case.call("accept_project", pid)

    def test_contractor_project_index_updated(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        case.set_sender(CONTRACTOR)
        case.call("accept_project", pid)
        contractor_projects = case.view("get_contractor_projects", CONTRACTOR)
        assert pid in contractor_projects


# ─── Escrow Tests ──────────────────────────────────────────────────────────────

class TestDepositEscrow:
    def _setup_accepted_project(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        case.set_sender(CONTRACTOR)
        case.call("accept_project", pid)
        case.set_sender(OWNER)
        return case, pid

    def test_owner_deposits_escrow(self):
        case, pid = self._setup_accepted_project()
        case.call("deposit_escrow", pid, value=1_000_000)
        details = case.view("project_details", pid)
        assert details["status"] == "escrowed"
        assert details["escrow_deposited"] == str(1_000_000)

    def test_contractor_cannot_deposit(self):
        case, pid = self._setup_accepted_project()
        case.set_sender(CONTRACTOR)
        with pytest.raises(Exception, match="Only project owner can deposit escrow"):
            case.call("deposit_escrow", pid, value=1_000_000)

    def test_zero_value_deposit_fails(self):
        case, pid = self._setup_accepted_project()
        with pytest.raises(Exception, match="Must send a positive amount"):
            case.call("deposit_escrow", pid, value=0)

    def test_cannot_deposit_on_draft_project(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        with pytest.raises(Exception, match="Project must be accepted before escrow"):
            case.call("deposit_escrow", pid, value=1_000_000)


# ─── Evidence Submission Tests ─────────────────────────────────────────────────

class TestSubmitEvidence:
    def _setup_escrowed_project(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        case.set_sender(CONTRACTOR)
        case.call("accept_project", pid)
        case.set_sender(OWNER)
        case.call("deposit_escrow", pid, value=1_000_000)
        return case, pid

    def test_contractor_submits_completion_evidence(self):
        case, pid = self._setup_escrowed_project()
        case.set_sender(CONTRACTOR)
        case.call("submit_evidence", pid, "certificate",
                  "Structural Certificate", "https://ipfs.io/abc123",
                  "Structural inspection certificate from certified engineer", False)
        details = case.view("project_details", pid)
        assert details["status"] == "evidence_submitted"
        assert details["evidence_count"] == 1

    def test_owner_submits_dispute_evidence(self):
        case, pid = self._setup_escrowed_project()
        case.set_sender(CONTRACTOR)
        case.call("submit_evidence", pid, "photo", "Site Photo",
                  "https://ipfs.io/photo1", "Completion photo", False)
        case.set_sender(OWNER)
        case.call("submit_evidence", pid, "dispute", "Defect Report",
                  "https://ipfs.io/defect1",
                  "Crack visible in east wall. Appears structural.", True)
        ms = case.view("milestone_status", pid)
        assert len(ms["evidence"]) == 2
        assert ms["evidence"][1]["is_dispute"] is True

    def test_contractor_cannot_submit_dispute_evidence(self):
        case, pid = self._setup_escrowed_project()
        case.set_sender(CONTRACTOR)
        with pytest.raises(Exception, match="Only owner may submit dispute evidence"):
            case.call("submit_evidence", pid, "dispute",
                      "Fake Dispute", "https://url", "desc", True)

    def test_owner_cannot_submit_completion_evidence(self):
        case, pid = self._setup_escrowed_project()
        case.set_sender(OWNER)
        with pytest.raises(Exception, match="Only contractor may submit completion evidence"):
            case.call("submit_evidence", pid, "certificate",
                      "Fake Cert", "https://url", "desc", False)

    def test_third_party_cannot_submit_evidence(self):
        case, pid = self._setup_escrowed_project()
        case.set_sender(OTHER)
        with pytest.raises(Exception, match="Only project parties may submit evidence"):
            case.call("submit_evidence", pid, "photo", "Photo",
                      "https://url", "desc", False)

    def test_invalid_evidence_type_rejected(self):
        case, pid = self._setup_escrowed_project()
        case.set_sender(CONTRACTOR)
        with pytest.raises(Exception):
            case.call("submit_evidence", pid, "video",
                      "Video", "https://url", "desc", False)

    def test_multiple_evidence_items_indexed_correctly(self):
        case, pid = self._setup_escrowed_project()
        case.set_sender(CONTRACTOR)
        for i, name in enumerate(DEFAULT_INSPECTIONS):
            case.call("submit_evidence", pid, "certificate",
                      f"{name} Certificate", f"https://ipfs.io/cert{i}",
                      f"Certificate for {name}", False)
        ms = case.view("milestone_status", pid)
        assert len(ms["evidence"]) == 4


# ─── Inspection Request Tests ──────────────────────────────────────────────────

class TestRequestInspection:
    def _setup_with_evidence(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        case.set_sender(CONTRACTOR)
        case.call("accept_project", pid)
        case.set_sender(OWNER)
        case.call("deposit_escrow", pid, value=1_000_000)
        case.set_sender(CONTRACTOR)
        case.call("submit_evidence", pid, "certificate",
                  "Structural Cert", "https://ipfs.io/s1",
                  "Structural inspection passed", False)
        return case, pid

    def test_contractor_requests_inspection(self):
        case, pid = self._setup_with_evidence()
        case.call("request_inspection", pid)
        details = case.view("project_details", pid)
        assert details["status"] == "under_review"

    def test_owner_cannot_request_inspection(self):
        case, pid = self._setup_with_evidence()
        case.set_sender(OWNER)
        with pytest.raises(Exception, match="Only contractor can request inspection"):
            case.call("request_inspection", pid)

    def test_cannot_request_without_evidence(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        case.set_sender(CONTRACTOR)
        case.call("accept_project", pid)
        case.set_sender(OWNER)
        case.call("deposit_escrow", pid, value=1_000_000)
        case.set_sender(CONTRACTOR)
        # Need evidence_submitted status, not escrowed
        with pytest.raises(Exception, match="Evidence must be submitted before requesting inspection"):
            case.call("request_inspection", pid)


# ─── Evaluation Tests ──────────────────────────────────────────────────────────

class TestEvaluateCompletion:
    def _setup_under_review(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        case.set_sender(CONTRACTOR)
        case.call("accept_project", pid)
        case.set_sender(OWNER)
        case.call("deposit_escrow", pid, value=1_000_000)
        case.set_sender(CONTRACTOR)
        for name in DEFAULT_INSPECTIONS:
            case.call("submit_evidence", pid, "certificate",
                      f"{name} Certificate", f"https://ipfs.io/{name}",
                      f"{name} certificate from certified authority", False)
        case.call("submit_evidence", pid, "permit",
                  "Occupancy Permit", "https://ipfs.io/occupancy",
                  "Government occupancy permit No. LAG/2024/OP/9821", False)
        case.call("request_inspection", pid)
        return case, pid

    def test_approval_releases_project(self):
        case, pid = self._setup_under_review()
        with patch(
            "genlayer.gl.eq_principle.prompt_comparative",
            return_value=json.dumps({
                "passed": True,
                "critical_defects": 0,
                "occupancy_verified": True,
                "confidence_pct": 93,
                "reason": "All requirements satisfied.",
            }, sort_keys=True),
        ):
            case.call("evaluate_completion", pid)

        details = case.view("project_details", pid)
        assert details["status"] == "approved"
        assert details["has_decision"] is True

    def test_rejection_on_critical_defects(self):
        case, pid = self._setup_under_review()
        with patch(
            "genlayer.gl.eq_principle.prompt_comparative",
            return_value=json.dumps({
                "passed": False,
                "critical_defects": 2,
                "occupancy_verified": False,
                "confidence_pct": 88,
                "reason": "Electrical and plumbing certificates missing.",
            }, sort_keys=True),
        ):
            case.call("evaluate_completion", pid)

        details = case.view("project_details", pid)
        assert details["status"] == "rejected"

        cs = case.view("consensus_status", pid)
        assert cs["passed"] is False
        assert cs["critical_defects"] == 2

    def test_evaluate_wrong_status_fails(self):
        case, pid = self._setup_under_review()
        # Project is under_review; set it to something else
        case.set_sender(CONTRACTOR)
        case._contract.projects[pid].status = "evidence_submitted"
        with pytest.raises(Exception, match="Project must be under review"):
            case.call("evaluate_completion", pid)

    def test_consensus_status_populated_after_evaluation(self):
        case, pid = self._setup_under_review()
        with patch(
            "genlayer.gl.eq_principle.prompt_comparative",
            return_value=json.dumps({
                "passed": True,
                "critical_defects": 0,
                "occupancy_verified": True,
                "confidence_pct": 95,
                "reason": "All inspections satisfied.",
            }, sort_keys=True),
        ):
            case.call("evaluate_completion", pid)

        cs = case.view("consensus_status", pid)
        assert cs["has_decision"] is True
        assert cs["passed"] is True
        assert cs["confidence_pct"] == 95
        assert cs["occupancy_verified"] is True


# ─── Payment Release Tests ─────────────────────────────────────────────────────

class TestPaymentRelease:
    def _setup_approved_project(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        case.set_sender(CONTRACTOR)
        case.call("accept_project", pid)
        case.set_sender(OWNER)
        case.call("deposit_escrow", pid, value=1_000_000)
        case.set_sender(CONTRACTOR)
        case.call("submit_evidence", pid, "permit",
                  "Occupancy Permit", "https://ipfs.io/op",
                  "Occupancy permit", False)
        case.call("request_inspection", pid)
        with patch(
            "genlayer.gl.eq_principle.prompt_comparative",
            return_value=json.dumps({
                "passed": True, "critical_defects": 0,
                "occupancy_verified": True, "confidence_pct": 90,
                "reason": "Approved.",
            }, sort_keys=True),
        ):
            case.call("evaluate_completion", pid)
        return case, pid

    def test_release_payment_succeeds(self):
        case, pid = self._setup_approved_project()
        case.set_sender(OWNER)  # Anyone can trigger release
        case.call("release_payment", pid)
        details = case.view("project_details", pid)
        assert details["status"] == "finalized"
        assert details["payment_released"] is True
        assert details["escrow_deposited"] == "0"

    def test_double_release_fails(self):
        case, pid = self._setup_approved_project()
        case.call("release_payment", pid)
        with pytest.raises(Exception, match="Payment has already been released"):
            case.call("release_payment", pid)

    def test_release_on_rejected_project_fails(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        case.set_sender(CONTRACTOR)
        case.call("accept_project", pid)
        case.set_sender(OWNER)
        case.call("deposit_escrow", pid, value=1_000_000)
        case.set_sender(CONTRACTOR)
        case.call("submit_evidence", pid, "photo",
                  "Photo", "https://ipfs.io/p1", "Photo", False)
        case.call("request_inspection", pid)
        with patch(
            "genlayer.gl.eq_principle.prompt_comparative",
            return_value=json.dumps({
                "passed": False, "critical_defects": 1,
                "occupancy_verified": False, "confidence_pct": 80,
                "reason": "Rejected.",
            }, sort_keys=True),
        ):
            case.call("evaluate_completion", pid)

        with pytest.raises(Exception, match="Project must be approved"):
            case.call("release_payment", pid)


# ─── Rejection & Refund Tests ──────────────────────────────────────────────────

class TestRefundOwner:
    def _setup_rejected_project(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        case.set_sender(CONTRACTOR)
        case.call("accept_project", pid)
        case.set_sender(OWNER)
        case.call("deposit_escrow", pid, value=500_000)
        case.set_sender(CONTRACTOR)
        case.call("submit_evidence", pid, "photo",
                  "Photo", "https://ipfs.io/p1", "Photo", False)
        case.call("request_inspection", pid)
        with patch(
            "genlayer.gl.eq_principle.prompt_comparative",
            return_value=json.dumps({
                "passed": False, "critical_defects": 3,
                "occupancy_verified": False, "confidence_pct": 91,
                "reason": "Multiple critical defects.",
            }, sort_keys=True),
        ):
            case.call("evaluate_completion", pid)
        return case, pid

    def test_owner_refund_on_rejection(self):
        case, pid = self._setup_rejected_project()
        case.set_sender(OWNER)
        case.call("refund_owner", pid)
        details = case.view("project_details", pid)
        assert details["status"] == "finalized"
        assert details["payment_released"] is True

    def test_contractor_cannot_trigger_refund(self):
        case, pid = self._setup_rejected_project()
        case.set_sender(CONTRACTOR)
        with pytest.raises(Exception, match="Only the project owner may claim a refund"):
            case.call("refund_owner", pid)


# ─── Appeal Tests ──────────────────────────────────────────────────────────────

class TestAppeal:
    def _setup_rejected_project(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        case.set_sender(CONTRACTOR)
        case.call("accept_project", pid)
        case.set_sender(OWNER)
        case.call("deposit_escrow", pid, value=500_000)
        case.set_sender(CONTRACTOR)
        case.call("submit_evidence", pid, "photo",
                  "Photo", "https://ipfs.io/p1", "Photo", False)
        case.call("request_inspection", pid)
        with patch(
            "genlayer.gl.eq_principle.prompt_comparative",
            return_value=json.dumps({
                "passed": False, "critical_defects": 2,
                "occupancy_verified": False, "confidence_pct": 85,
                "reason": "Missing certificates.",
            }, sort_keys=True),
        ):
            case.call("evaluate_completion", pid)
        return case, pid

    def test_contractor_can_appeal_rejection(self):
        case, pid = self._setup_rejected_project()
        case.set_sender(CONTRACTOR)
        case.call("submit_appeal", pid,
                  "Electrical and plumbing certs were submitted but misclassified by the AI system.")
        details = case.view("project_details", pid)
        assert details["status"] == "appealed"

    def test_appeal_reason_too_short_fails(self):
        case, pid = self._setup_rejected_project()
        case.set_sender(CONTRACTOR)
        with pytest.raises(Exception, match="Appeal reason must be at least 10 characters"):
            case.call("submit_appeal", pid, "Short")

    def test_cannot_appeal_non_rejected_project(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        case.set_sender(CONTRACTOR)
        case.call("accept_project", pid)
        with pytest.raises(Exception, match="Appeals are only allowed after a rejected decision"):
            case.call("submit_appeal", pid, "This is my appeal reason for this project decision.")

    def test_reopen_for_evidence_after_appeal(self):
        case, pid = self._setup_rejected_project()
        case.set_sender(CONTRACTOR)
        case.call("submit_appeal", pid,
                  "All certificates were actually submitted. Please re-review the evidence.")
        case.call("reopen_for_evidence", pid)
        details = case.view("project_details", pid)
        assert details["status"] == "evidence_submitted"

    def test_re_evaluation_after_appeal(self):
        case, pid = self._setup_rejected_project()
        case.set_sender(CONTRACTOR)
        case.call("submit_appeal", pid,
                  "Re-submitting missing electrical and plumbing certificates.")
        case.call("reopen_for_evidence", pid)
        # Submit additional evidence
        case.call("submit_evidence", pid, "certificate",
                  "Electrical Certificate", "https://ipfs.io/elec",
                  "Certified electrical inspection from NERC", False)
        case.call("submit_evidence", pid, "certificate",
                  "Plumbing Certificate", "https://ipfs.io/plumb",
                  "Certified plumbing inspection from COREN", False)
        case.call("request_inspection", pid)
        with patch(
            "genlayer.gl.eq_principle.prompt_comparative",
            return_value=json.dumps({
                "passed": True, "critical_defects": 0,
                "occupancy_verified": True, "confidence_pct": 92,
                "reason": "All requirements now satisfied after additional certificates.",
            }, sort_keys=True),
        ):
            case.call("evaluate_completion", pid)
        details = case.view("project_details", pid)
        assert details["status"] == "approved"


# ─── Access Control Tests ──────────────────────────────────────────────────────

class TestAccessControl:
    def test_third_party_cannot_accept_project(self):
        case = make_contract(OWNER)
        pid = case.call("create_project", "Tower", "desc", "loc",
                        CONTRACT_VALUE, DEFAULT_INSPECTIONS)
        case.set_sender(CONTRACTOR)
        case.call("accept_project", pid)
        # Try another address accepting a second project that doesn't exist
        case.set_sender(OTHER)
        with pytest.raises(Exception):
            case.call("accept_project", "999")

    def test_project_not_found_raises(self):
        case = make_contract(OWNER)
        with pytest.raises(Exception, match="Project not found"):
            case.view("project_details", "999")

    def test_owner_project_index(self):
        case = make_contract(OWNER)
        p1 = case.call("create_project", "A", "d", "l", 1000, ["S"])
        p2 = case.call("create_project", "B", "d", "l", 2000, ["E"])
        owner_projs = case.view("get_owner_projects", OWNER)
        assert p1 in owner_projs
        assert p2 in owner_projs
