"""Issued participant codes and backwards-compatible study admission."""
from secrets import token_hex

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.participant.models import ParticipantSession
from app.researcher.models import Experiment, StudyAccessCode


def issue_code(db: Session, experiment: Experiment) -> StudyAccessCode:
    code = StudyAccessCode(experiment_id=experiment.id, code="P-" + token_hex(8).upper())
    db.add(code)
    db.commit()
    db.refresh(code)
    return code


def check_code(db: Session, experiment: Experiment, participant: str) -> StudyAccessCode | None:
    issued = db.get(StudyAccessCode, (experiment.id, participant))
    if issued is not None:
        if issued.revoked:
            raise HTTPException(status_code=403, detail="This participant code is not accepted for this study.")
        return issued
    has_issued_codes = db.query(StudyAccessCode).filter_by(experiment_id=experiment.id).first()
    if has_issued_codes and not db.query(ParticipantSession).filter_by(
        experiment_code=experiment.code, participant_code=participant, finished_at=None,
    ).first():
        raise HTTPException(status_code=403, detail="This participant code is not accepted for this study.")
    return None
