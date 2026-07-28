# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }

import json
from dataclasses import dataclass
from genlayer import *

# ─── EVM Transfer Interface ───────────────────────────────────────────────────
# Single emission point — all GEN payouts route through _send_gen.


@gl.evm.contract_interface
class _Recipient:
    class View:
        pass

    class Write:
        pass


def _send_gen(to_address: str, amount: u256) -> None:
    if not to_address:
        raise gl.vm.UserError("Missing recipient address")
    if amount <= u256(0):
        raise gl.vm.UserError("Transfer amount must be positive")
    _Recipient(Address(to_address)).emit_transfer(value=amount)

# ─── Constants ────────────────────────────────────────────────────────────────

STATUS_DRAFT               = "draft"
STATUS_ACCEPTED            = "accepted"
STATUS_ESCROWED            = "escrowed"
STATUS_EVIDENCE_SUBMITTED  = "evidence_submitted"
STATUS_UNDER_REVIEW        = "under_review"
STATUS_APPROVED            = "approved"
STATUS_REJECTED            = "rejected"
STATUS_APPEALED            = "appealed"
STATUS_FINALIZED           = "finalized"
STATUS_CANCELLED           = "cancelled"

MAX_APPEALS = 3

# ─── Storage Dataclasses ──────────────────────────────────────────────────────


@allow_storage
@dataclass
class InspectionItem:
    name: str
    required: bool
    satisfied: bool
    evidence_ref: str


@allow_storage
@dataclass
class EvidenceItem:
    id: str
    submitter: str
    evidence_type: str   # photo | report | certificate | permit | drawing | other
    title: str
    url: str
    description: str
    is_dispute: bool     # true when used as counter-evidence by owner


@allow_storage
@dataclass
class ConsensusDecision:
    passed: bool
    confidence_pct: u256    # 0–100
    critical_defects: u256
    occupancy_verified: bool
    reason: str
    appeal_count: u256


@allow_storage
@dataclass
class AppealRecord:
    id: str
    appellant: str
    reason: str
    resolved: bool
    final_outcome: str


@allow_storage
@dataclass
class ProjectRecord:
    id: str
    owner: str
    contractor: str          # pre-assigned at creation; only this address may accept
    title: str
    description: str
    location: str
    contract_value: u256
    escrow_deposited: u256
    status: str
    inspection_count: u256
    evidence_count: u256
    appeal_count: u256
    evaluation_count: u256   # tracks total AI evaluations for MAX_APPEALS cap
    has_decision: bool
    payment_released: bool


# ─── Intelligent Contract ─────────────────────────────────────────────────────


class ConstructionEscrow(gl.Contract):
    """
    BuildProof: AI-powered construction escrow on GenLayer.

    Flow:
      1. Owner calls create_project (assigns contractor, sets value & inspections).
      2. Owner calls deposit_escrow (amount must equal contract_value).
      3. Contractor calls accept_project (only the pre-assigned address may accept).
      4. Both parties submit on-chain evidence via submit_evidence.
      5. Either party calls request_inspection when ready for AI review.
      6. Either party calls evaluate_completion — GenLayer validators reach consensus.
         On APPROVED: escrow auto-transfers to contractor.
         On final REJECTED (MAX_APPEALS exhausted): escrow auto-returns to owner.
      7. Either party may submit_appeal (up to MAX_APPEALS rounds).
         After an appeal, reopen_for_evidence then request_inspection again.
      8. Owner may cancel_project before evidence is submitted.
    """

    projects: TreeMap[str, ProjectRecord]
    project_counter: u256
    inspections: TreeMap[str, TreeMap[u256, InspectionItem]]
    evidence: TreeMap[str, TreeMap[u256, EvidenceItem]]
    decisions: TreeMap[str, ConsensusDecision]
    appeals: TreeMap[str, TreeMap[u256, AppealRecord]]
    owner_projects: TreeMap[Address, DynArray[str]]
    contractor_projects: TreeMap[Address, DynArray[str]]

    def __init__(self) -> None:
        self.project_counter = u256(0)

    # ── Owner: Create Project ──────────────────────────────────────────────────

    @gl.public.write
    def create_project(
        self,
        title: str,
        description: str,
        location: str,
        contract_value: u256,
        inspection_names: list[str],
        contractor_address: str,
    ) -> str:
        """
        Owner creates a project and pre-assigns a specific contractor.
        Only the assigned contractor may accept. Returns the new project ID.
        """
        owner = gl.message.sender_address
        assert len(title) > 0, "[EXPECTED] Title cannot be empty"
        assert len(inspection_names) > 0, "[EXPECTED] Must define at least one inspection"
        assert contract_value > u256(0), "[EXPECTED] Contract value must be positive"
        assert len(contractor_address) > 0, "[EXPECTED] Must assign a contractor address"

        contractor_addr = Address(contractor_address)
        assert contractor_addr.as_hex != owner.as_hex, \
            "[EXPECTED] Owner cannot be their own contractor"

        pid = str(int(self.project_counter))
        self.project_counter += u256(1)

        project = ProjectRecord(
            id=pid,
            owner=owner.as_hex,
            contractor=contractor_addr.as_hex,
            title=title,
            description=description,
            location=location,
            contract_value=contract_value,
            escrow_deposited=u256(0),
            status=STATUS_DRAFT,
            inspection_count=u256(len(inspection_names)),
            evidence_count=u256(0),
            appeal_count=u256(0),
            evaluation_count=u256(0),
            has_decision=False,
            payment_released=False,
        )
        self.projects[pid] = project

        for i, name in enumerate(inspection_names):
            self.inspections.get_or_insert_default(pid)[u256(i)] = InspectionItem(
                name=name,
                required=True,
                satisfied=False,
                evidence_ref="",
            )

        self.owner_projects.get_or_insert_default(owner).append(pid)
        self.contractor_projects.get_or_insert_default(contractor_addr).append(pid)
        return pid

    # ── Owner: Deposit Escrow ──────────────────────────────────────────────────

    @gl.public.write.payable
    def deposit_escrow(self, project_id: str) -> None:
        """
        Owner locks GEN into escrow by sending it with this transaction.
        gl.message.value is the authoritative amount — no caller-supplied figure is trusted.
        The sent amount must equal the agreed contract_value exactly.
        """
        assert project_id in self.projects, "[EXPECTED] Project not found"
        project = self.projects[project_id]

        sender = gl.message.sender_address
        assert sender.as_hex == project.owner, "[EXPECTED] Only project owner can deposit escrow"
        assert project.status in (STATUS_DRAFT, STATUS_ACCEPTED), \
            "[EXPECTED] Can only deposit escrow before evidence is submitted"
        assert not project.payment_released, "[EXPECTED] Payment already processed"
        assert int(project.escrow_deposited) == 0, "[EXPECTED] Escrow already deposited"

        amount = gl.message.value
        assert amount > u256(0), "[EXPECTED] Must send GEN with this transaction"
        assert amount == project.contract_value, \
            "[EXPECTED] Sent amount must equal the contract value exactly"

        project.escrow_deposited = amount
        # Status stays DRAFT until contractor accepts; promoted to ESCROWED in accept_project

    # ── Contractor: Accept Project ─────────────────────────────────────────────

    @gl.public.write
    def accept_project(self, project_id: str) -> None:
        """
        The pre-assigned contractor accepts the project.
        Moves the project to ACCEPTED (or ESCROWED if escrow is already deposited).
        """
        assert project_id in self.projects, "[EXPECTED] Project not found"
        project = self.projects[project_id]
        assert project.status in (STATUS_DRAFT, STATUS_ACCEPTED), \
            "[EXPECTED] Project is no longer available for acceptance"

        sender = gl.message.sender_address
        assert sender.as_hex == project.contractor, \
            "[EXPECTED] Only the assigned contractor may accept this project"

        if int(project.escrow_deposited) > 0:
            project.status = STATUS_ESCROWED
        else:
            project.status = STATUS_ACCEPTED

    # ── Submit Evidence (both parties) ────────────────────────────────────────

    @gl.public.write
    def submit_evidence(
        self,
        project_id: str,
        evidence_type: str,
        title: str,
        url: str,
        description: str,
        is_dispute: bool,
    ) -> None:
        """
        Both Owner and Contractor can submit fetchable on-chain evidence.

        - Contractor submits completion evidence (is_dispute=False).
        - Owner submits counter/dispute evidence (is_dispute=True).
        - Both may submit while the project is open for evidence or under appeal.

        Evidence is fully stored on-chain and fetchable via milestone_status.
        """
        assert project_id in self.projects, "[EXPECTED] Project not found"
        project = self.projects[project_id]

        sender = gl.message.sender_address
        assert sender.as_hex in (project.owner, project.contractor), \
            "[EXPECTED] Only project parties may submit evidence"

        valid_types = ("photo", "report", "certificate", "permit", "drawing", "other")
        assert evidence_type in valid_types, \
            f"[EXPECTED] evidence_type must be one of {valid_types}"
        assert len(title.strip()) > 0, "[EXPECTED] Evidence title cannot be empty"
        assert len(url.strip()) > 0, "[EXPECTED] Evidence URL cannot be empty"

        open_statuses = (
            STATUS_ESCROWED,
            STATUS_EVIDENCE_SUBMITTED,
            STATUS_UNDER_REVIEW,    # owner may add counter-evidence while validators work
            STATUS_APPEALED,        # both parties may supplement after an appeal
        )
        assert project.status in open_statuses, \
            "[EXPECTED] Evidence not accepted in current project status"

        if is_dispute:
            assert sender.as_hex == project.owner, \
                "[EXPECTED] Only owner may submit dispute/counter evidence"
        else:
            assert sender.as_hex == project.contractor, \
                "[EXPECTED] Only contractor may submit completion evidence"

        idx = project.evidence_count
        ev = EvidenceItem(
            id=f"{project_id}:{int(idx)}",
            submitter=sender.as_hex,
            evidence_type=evidence_type,
            title=title,
            url=url,
            description=description,
            is_dispute=is_dispute,
        )
        self.evidence.get_or_insert_default(project_id)[idx] = ev
        project.evidence_count += u256(1)

        if project.status == STATUS_ESCROWED:
            project.status = STATUS_EVIDENCE_SUBMITTED

    # ── Request Inspection (either party) ────────────────────────────────────

    @gl.public.write
    def request_inspection(self, project_id: str) -> None:
        """
        Either the Owner or Contractor may request AI adjudication.
        Moves the project to UNDER_REVIEW — evidence is locked for new completion
        items, though owner may still add dispute evidence.
        """
        assert project_id in self.projects, "[EXPECTED] Project not found"
        project = self.projects[project_id]

        sender = gl.message.sender_address
        assert sender.as_hex in (project.owner, project.contractor), \
            "[EXPECTED] Only project parties may request inspection"
        assert project.status == STATUS_EVIDENCE_SUBMITTED, \
            "[EXPECTED] Evidence must be submitted before requesting inspection"
        assert int(project.evidence_count) > 0, \
            "[EXPECTED] Must submit at least one piece of evidence"

        project.status = STATUS_UNDER_REVIEW

    # ── Non-Deterministic: Evaluate Completion (either party) ─────────────────

    @gl.public.write
    def evaluate_completion(self, project_id: str) -> None:
        """
        Either Owner or Contractor may trigger AI evaluation.
        GenLayer validators independently evaluate evidence using LLM reasoning.
        On APPROVED: sets payment_released=True, status=finalized (gl.transfer on mainnet).
        On final REJECTED (appeal_count >= MAX_APPEALS): same — funds returned on mainnet.
        """
        assert project_id in self.projects, "[EXPECTED] Project not found"
        project = self.projects[project_id]

        sender = gl.message.sender_address
        assert sender.as_hex in (project.owner, project.contractor), \
            "[EXPECTED] Only project parties may trigger AI evaluation"
        assert project.status == STATUS_UNDER_REVIEW, \
            "[EXPECTED] Project must be under review to evaluate"
        assert int(project.evaluation_count) <= MAX_APPEALS, \
            f"[EXPECTED] Maximum of {MAX_APPEALS} evaluations reached"

        project.evaluation_count += u256(1)

        # Snapshot storage → plain Python before entering nondet closure
        ev_count = int(project.evidence_count)
        evidence_snapshot: list[dict] = []
        for i in range(ev_count):
            ev = self.evidence[project_id][u256(i)]
            evidence_snapshot.append({
                "type": ev.evidence_type,
                "title": ev.title,
                "url": ev.url,
                "description": ev.description,
                "is_dispute": ev.is_dispute,
                "submitter": ev.submitter,
            })

        insp_count = int(project.inspection_count)
        inspection_snapshot: list[str] = []
        for i in range(insp_count):
            insp = self.inspections[project_id][u256(i)]
            inspection_snapshot.append(insp.name)

        project_snapshot = {
            "title": project.title,
            "description": project.description,
            "location": project.location,
            "required_inspections": inspection_snapshot,
        }

        _evidence = evidence_snapshot
        _project = project_snapshot

        def _safe_web_search(query: str, max_chars: int = 400) -> str:
            """Run a web search inside nondet; return truncated result or fallback."""
            try:
                result = gl.nondet.web_search(query)
                return str(result).strip()[:max_chars]
            except Exception as exc:
                return f"[search unavailable: {str(exc)[:80]}]"

        def _extract_ref_numbers(text: str) -> list[str]:
            """Pull permit/reference IDs from evidence text (e.g. LG-MEP-2026-4471)."""
            import re
            patterns = [
                r'[A-Z]{2,}[-/][A-Z]{1,}[-/][0-9]{4}[-/][0-9]+',   # LASBCA/VI/2026/0847
                r'[A-Z]{2,}-[A-Z]{2,}-[0-9]{4}-[0-9]+',             # LG-MEP-2026-4471
                r'[A-Z]{2,}-[A-Z]{2,}-[0-9]+',                       # NSE-14882, FFS-LG-2288
                r'Permit\s+#?([A-Z0-9/-]{6,})',                       # Permit #TMP-...
                r'Ref(?:erence)?[:\s]+([A-Z0-9/.-]{6,})',            # Reference: LASBCA/...
                r'Reg(?:istration)?[:\s#]+([A-Z0-9/-]{4,})',         # Reg #NSE-14882
            ]
            found: list[str] = []
            for pat in patterns:
                for m in re.finditer(pat, text, re.IGNORECASE):
                    ref = (m.group(1) if m.lastindex else m.group(0)).strip()
                    if ref not in found:
                        found.append(ref)
            return found[:4]   # cap at 4 references per evidence item

        def perform_evaluation() -> str:
            # ── Step 1: External verification ─────────────────────────────────
            # For each non-dispute evidence item: extract permit/ref numbers and
            # run targeted web searches to cross-check their legitimacy.
            # URL content is also verified via a short LLM fetch prompt.
            verification_lines: list[str] = []
            searched: set[str] = set()

            for ev in _evidence:
                if ev["is_dispute"]:
                    continue  # skip owner counter-evidence for external checks

                # 1a. URL accessibility check
                url = ev["url"]
                if url:
                    url_check = gl.nondet.exec_prompt(
                        f"Try to access this URL and tell me in one sentence whether it is accessible "
                        f"and appears to be a legitimate construction document: {url}\n"
                        f"Expected document: {ev['title']}\n"
                        "Reply with: ACCESSIBLE and description, or INACCESSIBLE and why."
                    )
                    verification_lines.append(
                        f"URL CHECK [{ev['title'][:50]}]: {str(url_check).strip()[:250]}"
                    )

                # 1b. Permit/reference number cross-check via web search
                refs = _extract_ref_numbers(ev["description"])
                for ref in refs:
                    if ref in searched or len(searched) >= 5:
                        continue
                    searched.add(ref)
                    location = _project["location"].split(",")[-1].strip()  # e.g. "Nigeria"
                    query = (
                        f'"{ref}" construction permit certificate verification {location}'
                    )
                    result = _safe_web_search(query)
                    verification_lines.append(
                        f"WEB SEARCH [{ref}]: {result}"
                    )

            verification_text = (
                "\n".join(verification_lines)
                if verification_lines
                else "No external verification data available."
            )

            # ── Step 2: Main adjudication prompt ──────────────────────────────
            ev_lines = []
            for i, ev in enumerate(_evidence):
                tag = "[DISPUTE/COUNTER]" if ev["is_dispute"] else f"[{ev['type'].upper()}]"
                ev_lines.append(
                    f"{i+1}. {tag} {ev['title']}\n"
                    f"   URL: {ev['url']}\n"
                    f"   {ev['description']}"
                )
            evidence_text = "\n".join(ev_lines)
            inspections_text = "\n".join(
                f"- {name}" for name in _project["required_inspections"]
            )

            prompt = (
                "You are a construction contract adjudicator with access to external verification results.\n"
                "Determine if the contractor has satisfied all requirements and payment should be released.\n\n"
                f"PROJECT: {_project['title']}\n"
                f"LOCATION: {_project['location']}\n\n"
                f"REQUIRED INSPECTIONS:\n{inspections_text}\n\n"
                f"SUBMITTED EVIDENCE:\n{evidence_text}\n\n"
                f"EXTERNAL VERIFICATION (URL checks + permit number web searches):\n{verification_text}\n\n"
                "RULES:\n"
                "- passed=true only if every required inspection has a matching certificate/permit/report.\n"
                "- If EXTERNAL VERIFICATION shows a URL is INACCESSIBLE AND the permit/reference number "
                "is not found in any web search, treat that evidence item as UNVERIFIED. "
                "If more than half the required inspection items have only UNVERIFIED evidence, set passed=false.\n"
                "- If a permit number is confirmed by web search or the URL is accessible, count that "
                "inspection as satisfied and increase confidence_pct.\n"
                "- Do not give credit for evidence that is internally inconsistent or where "
                "the description contradicts the title.\n"
                "- critical_defects counts structural, electrical, plumbing, or fire-safety failures ONLY.\n"
                "- passed=false if critical_defects > 0.\n"
                "- occupancy_verified=true only if a government-issued occupancy or rough-in approval is present.\n"
                "- [DISPUTE/COUNTER] items are owner counter-evidence — weigh them against contractor evidence.\n\n"
                "Reply with ONLY this JSON (no markdown, no extra text):\n"
                '{"passed": true, "critical_defects": 0, "occupancy_verified": true, '
                '"confidence_pct": 85, "reason": "one sentence"}'
            )

            raw = gl.nondet.exec_prompt(prompt)

            if isinstance(raw, dict):
                data = raw
            else:
                text = str(raw).strip()
                if text.startswith("```"):
                    text = text.split("```")[1]
                    if text.startswith("json"):
                        text = text[4:]
                start = text.find("{")
                end = text.rfind("}") + 1
                text = text[start:end] if start != -1 else text
                try:
                    data = json.loads(text)
                except Exception:
                    lower = text.lower()
                    data = {
                        "passed": '"passed": true' in lower or '"passed":true' in lower,
                        "critical_defects": 0,
                        "occupancy_verified": True,
                        "confidence_pct": 60,
                        "reason": text[:300],
                    }

            passed = bool(data.get("passed", False))
            critical = max(0, int(data.get("critical_defects", 0)))
            occupancy = bool(data.get("occupancy_verified", False))
            conf_raw = data.get("confidence_pct", data.get("confidence", 0.7))
            conf_float = float(conf_raw)
            confidence_pct = int(conf_float * 100) if conf_float <= 1.0 else int(conf_float)
            confidence_pct = min(100, max(0, confidence_pct))
            reason = str(data.get("reason", ""))[:500]

            return json.dumps({
                "confidence_pct": confidence_pct,
                "critical_defects": critical,
                "occupancy_verified": occupancy,
                "passed": passed,
                "reason": reason,
            }, sort_keys=True)

        raw_result = gl.eq_principle.prompt_comparative(
            perform_evaluation,
            'Do both JSON results agree on the "passed" boolean? '
            "Differences in confidence_pct, reason wording, or web search results are acceptable "
            "as long as the core passed decision is the same. "
            "Only mark as disagreement if one says passed=true and the other says passed=false.",
        )

        data = json.loads(raw_result)
        passed = bool(data["passed"])

        decision = ConsensusDecision(
            passed=passed,
            confidence_pct=u256(int(data["confidence_pct"])),
            critical_defects=u256(int(data["critical_defects"])),
            occupancy_verified=bool(data["occupancy_verified"]),
            reason=str(data["reason"]),
            appeal_count=project.appeal_count,
        )
        self.decisions[project_id] = decision
        project.has_decision = True

        if passed:
            # APPROVED — zero ledger first, then transfer to contractor (prevents double-spend)
            contractor_addr = project.contractor
            amount = project.escrow_deposited
            project.escrow_deposited = u256(0)
            project.payment_released = True
            project.status = STATUS_FINALIZED
            self.projects[project_id] = project
            if amount > u256(0):
                _send_gen(contractor_addr, amount)
        else:
            # REJECTED — if no more appeals remain, refund owner
            project.status = STATUS_REJECTED
            if int(project.appeal_count) >= MAX_APPEALS:
                owner_addr = project.owner
                amount = project.escrow_deposited
                project.escrow_deposited = u256(0)
                project.payment_released = True
                project.status = STATUS_FINALIZED
                self.projects[project_id] = project
                if amount > u256(0):
                    _send_gen(owner_addr, amount)

    # ── Submit Appeal (either party) ───────────────────────────────────────────

    @gl.public.write
    def submit_appeal(self, project_id: str, reason: str) -> None:
        """
        Either Owner or Contractor may appeal a REJECTED decision.
        Capped at MAX_APPEALS total per project.
        After appeal: call reopen_for_evidence, add more evidence, then
        request_inspection and evaluate_completion again.
        """
        assert project_id in self.projects, "[EXPECTED] Project not found"
        project = self.projects[project_id]

        sender = gl.message.sender_address
        assert sender.as_hex in (project.owner, project.contractor), \
            "[EXPECTED] Only project parties may appeal"
        assert project.status == STATUS_REJECTED, \
            "[EXPECTED] Appeals are only allowed after a rejected decision"
        assert len(reason.strip()) > 10, \
            "[EXPECTED] Appeal reason must be at least 10 characters"
        assert int(project.appeal_count) < MAX_APPEALS, \
            f"[EXPECTED] Maximum of {MAX_APPEALS} appeals reached"

        idx = project.appeal_count
        appeal = AppealRecord(
            id=f"{project_id}:appeal:{int(idx)}",
            appellant=sender.as_hex,
            reason=reason,
            resolved=False,
            final_outcome="",
        )
        self.appeals.get_or_insert_default(project_id)[idx] = appeal
        project.appeal_count += u256(1)
        project.status = STATUS_APPEALED

        if project_id in self.decisions:
            self.decisions[project_id].appeal_count += u256(1)

    @gl.public.write
    def reopen_for_evidence(self, project_id: str) -> None:
        """After an appeal, either party reopens the project for additional evidence."""
        assert project_id in self.projects, "[EXPECTED] Project not found"
        project = self.projects[project_id]

        sender = gl.message.sender_address
        assert sender.as_hex in (project.owner, project.contractor), \
            "[EXPECTED] Only project parties may reopen"
        assert project.status == STATUS_APPEALED, \
            "[EXPECTED] Project must be in APPEALED status"

        project.status = STATUS_EVIDENCE_SUBMITTED

    # ── Owner: Complete Escrow Deposit After Acceptance ───────────────────────

    @gl.public.write
    def finalize_escrow(self, project_id: str) -> None:
        """
        If deposit_escrow was called before accept_project, the project stays
        DRAFT until the contractor accepts. Once accepted with escrow already
        deposited, either party calls this to move status to ESCROWED.
        """
        assert project_id in self.projects, "[EXPECTED] Project not found"
        project = self.projects[project_id]

        assert project.status == STATUS_ACCEPTED, \
            "[EXPECTED] Project must be in ACCEPTED status"
        assert int(project.escrow_deposited) > 0, \
            "[EXPECTED] Escrow not yet deposited"

        project.status = STATUS_ESCROWED

    # ── Owner: Cancel Stalled Project ─────────────────────────────────────────

    @gl.public.write
    def cancel_project(self, project_id: str) -> None:
        """
        Owner may cancel before evidence is submitted. Full escrow refund via gl.transfer().
        """
        assert project_id in self.projects, "[EXPECTED] Project not found"
        project = self.projects[project_id]

        sender = gl.message.sender_address
        assert sender.as_hex == project.owner, \
            "[EXPECTED] Only the project owner can cancel"
        assert project.status in (STATUS_DRAFT, STATUS_ACCEPTED, STATUS_ESCROWED), \
            "[EXPECTED] Project can only be cancelled before evidence is submitted"
        assert not project.payment_released, "[EXPECTED] Payment already processed"

        owner_addr = project.owner
        refund = project.escrow_deposited
        project.escrow_deposited = u256(0)
        project.payment_released = True
        project.status = STATUS_CANCELLED
        # Zero ledger and save before transfer — prevents any double-refund window
        self.projects[project_id] = project
        if refund > u256(0):
            _send_gen(owner_addr, refund)

    # ── View Methods ───────────────────────────────────────────────────────────

    @gl.public.view
    def project_details(self, project_id: str) -> dict:
        assert project_id in self.projects, "[EXPECTED] Project not found"
        p = self.projects[project_id]
        return {
            "id": p.id,
            "owner": p.owner,
            "contractor": p.contractor,
            "assigned_contractor": p.contractor,
            "title": p.title,
            "description": p.description,
            "location": p.location,
            "contract_value": str(int(p.contract_value)),
            "escrow_deposited": str(int(p.escrow_deposited)),
            "status": p.status,
            "inspection_count": int(p.inspection_count),
            "evidence_count": int(p.evidence_count),
            "appeal_count": int(p.appeal_count),
            "evaluation_count": int(p.evaluation_count),
            "has_decision": p.has_decision,
            "payment_released": p.payment_released,
        }

    @gl.public.view
    def milestone_status(self, project_id: str) -> dict:
        assert project_id in self.projects, "[EXPECTED] Project not found"
        project = self.projects[project_id]

        inspections = []
        if project_id in self.inspections:
            for i in range(int(project.inspection_count)):
                insp = self.inspections[project_id][u256(i)]
                inspections.append({
                    "name": insp.name,
                    "required": insp.required,
                    "satisfied": insp.satisfied,
                    "evidence_ref": insp.evidence_ref,
                })

        evidence_list = []
        if project_id in self.evidence:
            for i in range(int(project.evidence_count)):
                ev = self.evidence[project_id][u256(i)]
                evidence_list.append({
                    "id": ev.id,
                    "submitter": ev.submitter,
                    "type": ev.evidence_type,
                    "title": ev.title,
                    "url": ev.url,
                    "description": ev.description,
                    "is_dispute": ev.is_dispute,
                })

        return {
            "status": project.status,
            "inspections": inspections,
            "evidence": evidence_list,
        }

    @gl.public.view
    def consensus_status(self, project_id: str) -> dict:
        assert project_id in self.projects, "[EXPECTED] Project not found"
        project = self.projects[project_id]

        if not project.has_decision:
            return {
                "has_decision": False,
                "status": project.status,
                "appeals": [],
            }

        d = self.decisions[project_id]
        appeal_list = []
        if project_id in self.appeals:
            for i in range(int(project.appeal_count)):
                ap = self.appeals[project_id][u256(i)]
                appeal_list.append({
                    "id": ap.id,
                    "appellant": ap.appellant,
                    "reason": ap.reason,
                    "resolved": ap.resolved,
                    "outcome": ap.final_outcome,
                })

        return {
            "has_decision": True,
            "passed": d.passed,
            "confidence_pct": int(d.confidence_pct),
            "critical_defects": int(d.critical_defects),
            "occupancy_verified": d.occupancy_verified,
            "reason": d.reason,
            "appeal_count": int(d.appeal_count),
            "status": project.status,
            "appeals": appeal_list,
        }

    @gl.public.view
    def get_owner_projects(self, owner_address: str) -> list:
        addr = Address(owner_address)
        if addr not in self.owner_projects:
            return []
        return list(self.owner_projects[addr])

    @gl.public.view
    def get_contractor_projects(self, contractor_address: str) -> list:
        addr = Address(contractor_address)
        if addr not in self.contractor_projects:
            return []
        return list(self.contractor_projects[addr])

    @gl.public.view
    def get_all_projects(self) -> list:
        return [
            {
                "id": p.id,
                "title": p.title,
                "status": p.status,
                "owner": p.owner,
                "contractor": p.contractor,
                "contract_value": str(int(p.contract_value)),
                "escrow_deposited": str(int(p.escrow_deposited)),
                "has_decision": p.has_decision,
                "payment_released": p.payment_released,
            }
            for _, p in self.projects.items()
        ]

    @gl.public.view
    def get_project_count(self) -> int:
        return int(self.project_counter)
