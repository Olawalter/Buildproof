"""
Integration tests for ConstructionEscrow.
These run against a live GLSim or Studio instance via gltest.
Run: gltest tests/integration -v -s

Requirements: gltest.config.yaml must point to a running simulator.
"""

import json
import pytest
import asyncio

# ─── Fixtures ─────────────────────────────────────────────────────────────────

CONTRACT_FILE = "contracts/construction_escrow.py"

DEFAULT_INSPECTIONS = [
    "Structural Inspection",
    "Electrical Inspection",
    "Plumbing Inspection",
    "Fire Safety Inspection",
]

CONTRACT_VALUE = 500_000_000


@pytest.fixture(scope="module")
def contract(gl_client, accounts):
    """Deploy ConstructionEscrow and return the contract handle."""
    owner = accounts[0]
    receipt = gl_client.deploy(
        contract_file=CONTRACT_FILE,
        from_account=owner,
    )
    assert receipt.status == "FINALIZED"
    return gl_client.get_contract(receipt.contract_address)


@pytest.fixture(scope="module")
def accounts(gl_client):
    """Return the test accounts list."""
    return gl_client.accounts


# ─── Full Happy-Path Flow ──────────────────────────────────────────────────────

class TestFullFlow:
    def test_full_happy_path(self, contract, accounts):
        """
        End-to-end integration: owner creates project, contractor accepts,
        owner deposits escrow, contractor submits evidence, requests inspection,
        AI validators evaluate and approve, payment is released.
        """
        owner = accounts[0]
        contractor = accounts[1]

        # Step 1: Create project
        tx = contract.write("create_project",
                            "Integration Tower",
                            "Full integration test building",
                            "Test City",
                            CONTRACT_VALUE,
                            DEFAULT_INSPECTIONS,
                            from_account=owner)
        assert tx.status == "FINALIZED"
        pid = tx.return_value
        assert isinstance(pid, str)

        # Step 2: Contractor accepts
        tx = contract.write("accept_project", pid, from_account=contractor)
        assert tx.status == "FINALIZED"
        details = contract.read("project_details", pid)
        assert details["status"] == "accepted"

        # Step 3: Owner deposits escrow
        tx = contract.write("deposit_escrow", pid,
                            from_account=owner, value=1_000_000)
        assert tx.status == "FINALIZED"
        details = contract.read("project_details", pid)
        assert details["status"] == "escrowed"

        # Step 4: Contractor submits evidence
        evidence_items = [
            ("certificate", "Structural Certificate",
             "https://ipfs.io/s1", "Certified structural inspection"),
            ("certificate", "Electrical Certificate",
             "https://ipfs.io/e1", "Certified electrical inspection"),
            ("certificate", "Plumbing Certificate",
             "https://ipfs.io/p1", "Certified plumbing inspection"),
            ("certificate", "Fire Safety Certificate",
             "https://ipfs.io/f1", "Certified fire safety inspection"),
            ("permit", "Occupancy Permit",
             "https://ipfs.io/op1",
             "Lagos State Government Occupancy Permit No. LAG/2024/OP/9821"),
            ("photo", "Completion Photos",
             "https://ipfs.io/photos1",
             "30 photographs documenting completed construction at all floors"),
            ("drawing", "As-Built Drawings",
             "https://ipfs.io/drawings1",
             "Final as-built architectural and structural drawings matching approved plans"),
        ]
        for ev_type, title, url, desc in evidence_items:
            tx = contract.write("submit_evidence", pid, ev_type, title, url, desc, False,
                                from_account=contractor)
            assert tx.status == "FINALIZED"

        # Step 5: Contractor requests inspection
        tx = contract.write("request_inspection", pid, from_account=contractor)
        assert tx.status == "FINALIZED"
        details = contract.read("project_details", pid)
        assert details["status"] == "under_review"

        # Step 6: Evaluate completion (AI validators)
        tx = contract.write("evaluate_completion", pid, from_account=contractor)
        assert tx.status == "FINALIZED"

        details = contract.read("project_details", pid)
        assert details["has_decision"] is True
        # Status should be approved or rejected based on AI evaluation
        assert details["status"] in ("approved", "rejected")

        cs = contract.read("consensus_status", pid)
        assert cs["has_decision"] is True
        assert isinstance(cs["confidence_pct"], int)
        assert isinstance(cs["reason"], str)
        print(f"\n[Integration] Decision: passed={cs['passed']}, "
              f"confidence={cs['confidence_pct']}%, "
              f"reason='{cs['reason'][:80]}...'")

    def test_rejection_and_appeal_flow(self, contract, accounts):
        """
        Integration test for the rejection + appeal + re-evaluation path.
        """
        owner = accounts[0]
        contractor = accounts[1]

        # Create, accept, deposit
        pid = contract.write("create_project", "Appeal Test Building",
                             "Testing appeal flow", "Abuja",
                             100_000, ["Structural Inspection"],
                             from_account=owner).return_value

        contract.write("accept_project", pid, from_account=contractor)
        contract.write("deposit_escrow", pid, from_account=owner, value=100_000)

        # Submit minimal (incomplete) evidence
        contract.write("submit_evidence", pid, "photo",
                       "Partial Photo", "https://ipfs.io/partial",
                       "One photo of the site, not fully complete", False,
                       from_account=contractor)

        contract.write("request_inspection", pid, from_account=contractor)
        contract.write("evaluate_completion", pid, from_account=contractor)

        details = contract.read("project_details", pid)
        # If the AI determined it failed, test appeal; otherwise skip
        if details["status"] == "rejected":
            # Submit appeal
            contract.write("submit_appeal", pid,
                           "We have now uploaded all missing certificates. "
                           "Please re-evaluate the project with the new evidence.",
                           from_account=contractor)
            # Reopen and add more evidence
            contract.write("reopen_for_evidence", pid, from_account=contractor)
            contract.write("submit_evidence", pid, "certificate",
                           "Full Structural Cert", "https://ipfs.io/full-struct",
                           "Complete structural inspection certificate from COREN", False,
                           from_account=contractor)
            contract.write("submit_evidence", pid, "permit",
                           "Occupancy Permit", "https://ipfs.io/op2",
                           "Official occupancy permit from the FCT government", False,
                           from_account=contractor)
            contract.write("request_inspection", pid, from_account=contractor)
            contract.write("evaluate_completion", pid, from_account=contractor)

            details = contract.read("project_details", pid)
            print(f"\n[Integration] Appeal re-evaluation status: {details['status']}")
        else:
            print(f"\n[Integration] Project approved on first try — skipping appeal test")


# ─── Concurrent Evidence Submission ────────────────────────────────────────────

class TestConcurrentEvidence:
    def test_owner_and_contractor_evidence_separate(self, contract, accounts):
        """Both parties can submit evidence concurrently without interfering."""
        owner = accounts[0]
        contractor = accounts[1]

        pid = contract.write("create_project", "Concurrent Test",
                             "desc", "loc", 50_000, ["Structural"],
                             from_account=owner).return_value
        contract.write("accept_project", pid, from_account=contractor)
        contract.write("deposit_escrow", pid, from_account=owner, value=50_000)

        contract.write("submit_evidence", pid, "certificate",
                       "Structural Cert", "https://ipfs.io/str-c",
                       "Certified structural inspection certificate", False,
                       from_account=contractor)

        contract.write("submit_evidence", pid, "dispute",
                       "Minor Crack Report", "https://ipfs.io/crack",
                       "Small cosmetic crack on exterior wall, non-structural", True,
                       from_account=owner)

        ms = contract.read("milestone_status", pid)
        assert len(ms["evidence"]) == 2

        completion_evs = [e for e in ms["evidence"] if not e["is_dispute"]]
        dispute_evs = [e for e in ms["evidence"] if e["is_dispute"]]
        assert len(completion_evs) == 1
        assert len(dispute_evs) == 1


# ─── View Methods ──────────────────────────────────────────────────────────────

class TestViewMethods:
    def test_get_all_projects_returns_list(self, contract, accounts):
        projects = contract.read("get_all_projects")
        assert isinstance(projects, list)

    def test_get_project_count(self, contract, accounts):
        count = contract.read("get_project_count")
        assert isinstance(count, int)
        assert count >= 0

    def test_owner_projects_index(self, contract, accounts):
        owner = accounts[0]
        owner_projs = contract.read("get_owner_projects", owner.address)
        assert isinstance(owner_projs, list)

    def test_empty_contractor_index(self, contract, accounts):
        # Use an address that has not acted as contractor
        import secrets
        random_addr = "0x" + secrets.token_hex(20)
        projs = contract.read("get_contractor_projects", random_addr)
        assert projs == []
