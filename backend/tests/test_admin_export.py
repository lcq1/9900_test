"""Unit test for the CSV export helper (also covers the export contract)."""
from __future__ import annotations

from app.participant.export_csv import export_session_csv
from app.participant.models import ParticipantEvent


def test_export_session_csv_produces_expected_rows():
    events = [
        ParticipantEvent(
            seq=0,
            type="stage_view",
            timestamp="t0",
            epoch_ms=0,
            perf_ms=1,
            stage_id="s1",
            detail={"a": 1},
        ),
        ParticipantEvent(
            seq=1,
            type="answer",
            timestamp="t1",
            epoch_ms=10,
            perf_ms=2,
            stage_id=None,
            detail=None,
        ),
    ]
    csv_text = export_session_csv(events)
    lines = csv_text.strip().splitlines()
    assert lines[0] == "seq,type,timestamp,epochMs,perfMs,stageId,detail"
    assert len(lines) == 3  # header + 2 data rows
    assert "stage_view" in lines[1]
    assert lines[1].split(",")[5] == "s1"  # stageId column
    assert lines[2].split(",")[5] == ""  # empty stageId