from __future__ import annotations

import csv
import io
import re
from datetime import datetime, timezone
from typing import Literal
from zoneinfo import ZoneInfo

from app.participant.models import Answer, Consent, ParticipantEvent, ParticipantSession, Recording

ExportView = Literal["answers", "activity"]
ANSWER_COLUMNS = [
    "Study", "Study code", "Participant", "Completion status",
    "Started at (Australia/Sydney)", "Completed at (Australia/Sydney)", "Session reference",
]
ACTIVITY_COLUMNS = [
    "Study", "Study code", "Participant", "Completion status",
    "Time (Australia/Sydney)", "Stage", "Question", "Activity", "Content", "Details",
    "Recording file", "Recording download reference", "Event order", "Unix time (ms)",
    "Performance time (ms)", "Session reference", "Record reference",
    "Original event type", "Original timestamp",
]
ACTIVITIES = {
    "stage_view": "Stage opened", "stage_exit": "Stage exited", "answer": "Answer changed",
    "ai_prompt": "AI question", "ai_reply": "AI response", "copy": "Text copied",
    "paste": "Text pasted", "recording_start": "Recording started",
    "recording_stop": "Recording stopped", "recording_media": "Recording saved",
    "timer_tick": "Timer tick", "timer_milestone": "Timer milestone",
    "navigation": "Navigation", "abort": "Participation stopped", "pause": "Paused",
    "resume": "Resumed", "consent": "Consent decision", "clock_sync": "Clock synchronised",
}


def parsed_time(value):
    try:
        result = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        return result.astimezone(timezone.utc) if result.tzinfo else None
    except (ValueError, TypeError, OverflowError):
        return None


def local_time(value):
    parsed = parsed_time(value)
    return parsed.astimezone(ZoneInfo("Australia/Sydney")).isoformat(
        sep=" ", timespec="milliseconds"
    ) if parsed else ""


def time_key(value):
    parsed = parsed_time(value)
    return (0, parsed) if parsed else (1, datetime.max.replace(tzinfo=timezone.utc))


def label(key):
    return re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", str(key)).replace("_", " ").capitalize()


def readable(value):
    """Flatten saved values without exposing embedded files or storage paths."""
    if value is None:
        return ""
    if isinstance(value, bool):
        return "Yes" if value else "No"
    if isinstance(value, dict):
        return details(value)
    if isinstance(value, (list, tuple)):
        return "\n".join(readable(item) for item in value)
    text = str(value)
    if re.search(r"data:[^,]*;base64,", text, re.IGNORECASE):
        return "Attachment recorded"
    return text


def details(value, prefix=""):
    lines = []
    for key, item in value.items():
        normalized = re.sub(r"[^a-z]", "", str(key).lower())
        if normalized in {"path", "filepath", "storagepath", "localpath", "serverpath"}:
            continue
        name = f"{prefix} / {label(key)}" if prefix else label(key)
        if isinstance(item, dict):
            nested = details(item, name)
            if nested:
                lines.append(nested)
        else:
            lines.append(f"{name}: {readable(item)}")
    return "\n".join(lines)


def question_map(experiment):
    questions, stages = {}, {}
    for position, stage in enumerate(experiment.stages or [], 1):
        stage_name = f"Stage {position} – {stage.get('name') or 'Untitled stage'}"
        stages[stage["id"]] = stage_name
        prompt, number = "", 0
        for component in stage.get("components", []):
            kind = component.get("type")
            component_label = str(component.get("label") or "").strip()
            if kind == "text":
                if component_label:
                    prompt = component_label
                continue
            if kind == "button":
                continue
            number += 1
            title = prompt or component_label or "Untitled question"
            if prompt and component_label and component_label != prompt:
                title += f" ({component_label})"
            questions[component["id"]] = (
                f"{stage_name} / Q{number} – {title}", stage_name, kind,
            )
    return questions, stages


def safe_cell(value):
    text = readable(value)
    if text.lstrip().startswith(("=", "+", "-", "@")) or text.startswith(("\t", "\r", "\n")):
        return "'" + text
    return text


def write_csv(columns, rows):
    buffer = io.StringIO(newline="")
    writer = csv.writer(buffer, lineterminator="\r\n")
    writer.writerow([safe_cell(column) for column in columns])
    for row in rows:
        writer.writerow([safe_cell(row.get(column, "")) for column in columns])
    return "\ufeff" + buffer.getvalue()


def build_csv(experiment, sessions, answers=(), events=(), consents=(), recordings=(),
              view: ExportView = "answers", session_id=None, _raw=False):
    """Use the whole study to define columns, then optionally select one session."""
    if view not in ("answers", "activity"):
        raise ValueError("Unknown CSV view")
    events = [e for e in events if not e.type.startswith("server.")]
    questions, stages = question_map(experiment)
    for component_id in sorted({answer.component_id for answer in answers} - questions.keys()):
        questions[component_id] = (f"Unmatched question – {component_id}", "", None)
    sessions = sorted(sessions, key=lambda s: (s.participant_code, time_key(s.started_at), s.id))
    rows = []
    for session in sessions:
        if session_id is not None and session.id != session_id:
            continue
        base = {
            "Study": experiment.name, "Study code": experiment.code,
            "Participant": session.participant_code,
            "Completion status": "Completed" if session.finished_at else "In progress",
            "Session reference": session.id,
        }
        session_events = [event for event in events if event.session_id == session.id]
        session_recordings = {r.id: r for r in recordings if r.session_id == session.id}

        def answer_text(component_id, value):
            kind = questions.get(component_id, ("", "", None))[2]
            embedded_file = isinstance(value, str) and re.search(r"data:[^,]*;base64,", value, re.IGNORECASE)
            if (kind == "attachment" or embedded_file) and value not in (None, ""):
                matches = [
                    e for e in session_events
                    if e.type == "answer" and isinstance(e.detail, dict)
                    and e.detail.get("componentId") == component_id
                    and e.detail.get("value") == value and e.detail.get("fileName")
                ]
                if matches:
                    return readable(max(matches, key=lambda e: (e.seq or 0, e.id)).detail["fileName"])
                return "Attachment recorded"
            return readable(value)

        if view == "answers":
            row = {
                **base, "Started at (Australia/Sydney)": local_time(session.started_at),
                "Completed at (Australia/Sydney)": local_time(session.finished_at),
            }
            for answer in answers:
                if answer.session_id == session.id:
                    column = questions[answer.component_id][0]
                    value = answer_text(answer.component_id, answer.value)
                    row[column] = row[column] + "\n" + value if column in row else value
            rows.append(row)
            continue

        session_rows, linked_recordings = [], set()

        def add(record_id, timestamp, sequence=None, **fields):
            row = {
                **base, "Record reference": record_id, "Original timestamp": timestamp or "",
                "Time (Australia/Sydney)": local_time(timestamp), **fields,
            }
            session_rows.append((time_key(timestamp), sequence if sequence is not None else float("inf"),
                                 record_id, row))

        def recording_fields(recording):
            return {
                "Recording file": recording.filename,
                "Recording download reference":
                    f"/api/participant/sessions/{session.id}/recordings/{recording.id}",
            }

        for event in session_events:
            payload = event.detail if isinstance(event.detail, dict) else {}
            component_id = payload.get("componentId", payload.get("component_id", ""))
            if not isinstance(component_id, str):
                component_id = ""
            question = questions.get(component_id)
            content_key = "text" if "text" in payload else "value" if "value" in payload else None
            content = answer_text(component_id, payload[content_key]) if content_key else ""
            remaining = {key: value for key, value in payload.items() if key != content_key}
            fields = {}
            if event.type == "recording_media":
                recording_id = payload.get("recordingId")
                recording = session_recordings.get(recording_id) if isinstance(recording_id, str) else None
                if recording:
                    fields = recording_fields(recording)
                    linked_recordings.add(recording.id)
            add(
                event.id, event.timestamp, event.seq,
                **{
                    "Stage": stages.get(event.stage_id, f"Unmatched stage – {event.stage_id}" if event.stage_id else question[1] if question else ""),
                    "Question": question[0] if question else f"Unmatched question – {component_id}" if component_id else "",
                    "Activity": ACTIVITIES.get(event.type, label(event.type)),
                    "Content": content, "Details": details(remaining),
                    "Event order": event.seq, "Unix time (ms)": event.epoch_ms,
                    "Performance time (ms)": event.perf_ms, "Original event type": event.type,
                    **fields,
                },
            )
        for consent in consents:
            if consent.session_id == session.id:
                add(consent.id, consent.signed_at, Activity="Consent recorded",
                    Content=readable(consent.name), Details=details(consent.payload or {}))
        for recording in session_recordings.values():
            if recording.id not in linked_recordings:
                add(recording.id, recording.created_at, Activity="Recording saved",
                    **recording_fields(recording))
        rows.extend(item[3] for item in sorted(session_rows, key=lambda item: item[:3]))
    columns = ANSWER_COLUMNS + [q[0] for q in questions.values()] if view == "answers" else ACTIVITY_COLUMNS
    return (columns, rows) if _raw else write_csv(columns, rows)


def export_experiment_csv(db, experiment, view: ExportView = "answers", session_id=None):
    sessions = db.query(ParticipantSession).filter(
        ParticipantSession.experiment_code == experiment.code
    ).all()
    ids = [session.id for session in sessions]
    records = [
        db.query(model).filter(model.session_id.in_(ids)).all() if ids else []
        for model in (Answer, ParticipantEvent, Consent, Recording)
    ]
    return build_csv(experiment, sessions, *records, view=view, session_id=session_id)


XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
CELL_LIMIT = 30000
MAX_ROWS = 1048576
MAX_COLUMNS = 16384


def second_time(value):
    parsed = parsed_time(value)
    return parsed.astimezone(ZoneInfo("Australia/Sydney")).isoformat(sep=" ", timespec="seconds") if parsed else ""


def export_filename(code):
    return re.sub(r"[^A-Za-z0-9_-]", "_", code)[:100] + ".xlsx"


def clean_export(value):
    """Remove embedded files, private paths and credentials from metadata."""
    if isinstance(value, dict):
        hidden = {"path", "filepath", "storagepath", "localpath", "serverpath", "password", "secret", "apikey", "token"}
        return {str(k): clean_export(v) for k, v in value.items()
                if re.sub(r"[^a-z]", "", str(k).lower()) not in hidden}
    if isinstance(value, list):
        return [clean_export(v) for v in value]
    if isinstance(value, str) and re.search(r"data:[^,]*;base64,", value, re.I):
        return "Attachment recorded"
    return value


def excel_parts(value, limit=CELL_LIMIT):
    """Count UTF-16 units so emoji cannot exceed Excel's cell capacity."""
    from fastapi import HTTPException
    from openpyxl.cell.cell import ILLEGAL_CHARACTERS_RE
    text = str(value)
    if ILLEGAL_CHARACTERS_RE.search(text):
        raise HTTPException(status_code=422, detail="The export contains characters Excel cannot represent; no data was truncated.")
    try:
        encoded = text.encode("utf-16-le")
    except UnicodeError as exc:
        raise HTTPException(status_code=422, detail="The export contains invalid Unicode characters.") from exc
    parts = []
    offset = 0
    while offset < len(encoded):
        end = min(len(encoded), offset + limit * 2)
        if end < len(encoded) and 0xD800 <= int.from_bytes(encoded[end - 2:end], "little") <= 0xDBFF:
            end -= 2
        parts.append(encoded[offset:end].decode("utf-16-le"))
        offset = end
    return parts or [""]


def workbook_table(workbook, title, headers, rows):
    """Expand long cells before openpyxl can silently truncate them."""
    from fastapi import HTTPException
    from openpyxl.styles import Alignment, Font, PatternFill
    from openpyxl.utils import get_column_letter
    if len(rows) + 1 > MAX_ROWS:
        raise HTTPException(status_code=422, detail="The export exceeds Excel worksheet capacity; no data was truncated.")
    header_parts = [excel_parts(header, CELL_LIMIT - 30) for header in headers]
    rows = [[excel_parts(readable(value)) for value in row] for row in rows]
    widths = [max(len(parts), max((len(row[i]) for row in rows), default=1)) for i, parts in enumerate(header_parts)]
    if sum(widths) > MAX_COLUMNS:
        raise HTTPException(status_code=422, detail="The export exceeds Excel worksheet capacity; no data was truncated.")
    sheet = workbook.create_sheet(title)
    expanded_headers = []
    for parts, count in zip(header_parts, widths):
        for n in range(count):
            text = parts[n] if n < len(parts) else parts[0] if len(parts) == 1 else "Continued"
            expanded_headers.append(text + (f" {n + 1} / {count}" if count > 1 else ""))
    sheet.append(expanded_headers)
    for cell in sheet[1]:
        cell.data_type = "s"
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor="24476A")
        cell.alignment = Alignment(wrap_text=True, vertical="top")
    for row in rows:
        sheet.append([parts[n] if n < len(parts) else "" for parts, count in zip(row, widths) for n in range(count)])
        for cell in sheet[sheet.max_row]:
            cell.data_type = "s"
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    sheet.freeze_panes = "A2"
    sheet.auto_filter.ref = sheet.dimensions
    for i in range(1, len(expanded_headers) + 1):
        sheet.column_dimensions[get_column_letter(i)].width = 28 if i <= 6 else 55
    return sheet


def build_workbook(experiment, sessions, answers=(), events=(), consents=(), recordings=(), history=(), turns=(), conversations=()):
    import json
    from types import SimpleNamespace
    from openpyxl import Workbook
    from app.core.clock import now_iso
    workbook = Workbook()
    workbook.remove(workbook.active)
    dumps = lambda value: json.dumps(clean_export(value), ensure_ascii=False, indent=2)
    versions = sorted([e for e in history if e.type == "server.published"], key=lambda e: e.detail["version"])
    created = next((e for e in history if e.type == "server.created"), None)
    info = [
        ["Study code", "", "", experiment.code, ""],
        ["Study name", "", "", experiment.name, ""],
        ["Status", "", "", experiment.status, ""],
        ["Created at", "", second_time(created.timestamp) if created else "", "" if created else f"{experiment.created} (original date; precise time unknown)", ""],
        ["Exported at", "", second_time(now_iso()), "Australia/Sydney; displayed to the second; activity retains original millisecond timestamps", ""],
        ["Notes", "", "", "One row per session. Legacy records have unknown versions and questions are identified by original component IDs. Only explicitly linked legacy AI conversations are exported.", ""],
    ]
    for event in history:
        if event.type != "server.published":
            continue
        payload = event.detail or {}
        category = {"server.created": "Study created", "server.changed": "Configuration changed", "server.published": "Version published", "server.publish_reused": "Existing version republished"}.get(event.type, event.type)
        if payload.get("baseline"):
            category = "Configuration baseline at deployment (not the original publication time)"
        info.append([category, payload.get("version", ""), second_time(event.timestamp),
                     dumps(payload), payload.get("actor", "")])
        if event.type == "server.published":
            for position, stage in enumerate(payload["snapshot"].get("stages", []), 1):
                info.append([f"Stage {position}: {stage.get('name', '')}", payload["version"], "", dumps(stage), ""])
                for number, component in enumerate(stage.get("components", []), 1):
                    info.append([f"Stage {position} / Component {number}: {component.get('label', '')}", payload["version"], "", dumps(component), ""])
    workbook_table(workbook, "Study information", ["Category", "Version", "Time (Australia/Sydney)", "Content / Full configuration", "Actor ID"], info)
    bindings = {e.session_id: e.detail for e in events if e.type == "server.version"}
    links = {}
    for event in events:
        if event.type == "server.ai":
            links.setdefault(event.session_id, set()).add(event.detail["conversation_id"])
    conversation_map = {c.id: c for c in conversations}
    groups = [(f"V{e.detail['version']}", e.detail["version"], SimpleNamespace(**e.detail["snapshot"])) for e in versions]
    known = {version for _, version, _ in groups}
    if any(bindings.get(s.id, {}).get("version") not in known for s in sessions):
        groups.append(("Unknown legacy version", None, SimpleNamespace(name=experiment.name, code=experiment.code, stages=[])))
    for title, version, config in groups:
        selected = sorted([s for s in sessions if (bindings.get(s.id, {}).get("version") == version if version is not None
                          else bindings.get(s.id, {}).get("version") not in known)], key=lambda s: (time_key(s.started_at), s.id))
        questions, stage_names = question_map(config)
        missing = sorted({a.component_id for a in answers if a.session_id in {s.id for s in selected}} - questions.keys())
        for component_id in missing:
            questions[component_id] = (f"Original question ID (legacy question unknown): {component_id}", "", None)
        headers = ["Participant code", "Session ID", "Version", "Completion status", "Started at (Australia/Sydney)", "Completed at (Australia/Sydney)"]
        headers += [f"{q[0]} [{key}]" for key, q in questions.items()]
        headers += ["Successful AI turns", "AI history", "Activity timeline"]
        rows = []
        for session in selected:
            session_events = sorted([e for e in events if e.session_id == session.id and not e.type.startswith("server.")],
                                    key=lambda e: (time_key(e.timestamp), e.seq or 0, e.id))
            values = {a.component_id: a.value for a in answers if a.session_id == session.id}
            for event in sorted(session_events, key=lambda e: (e.seq or 0, time_key(e.timestamp), e.id)):
                if event.type == "answer" and isinstance(event.detail, dict) and event.detail.get("componentId") in questions and "value" in event.detail:
                    values[event.detail["componentId"]] = event.detail["value"]
            answer_cells = []
            for component_id, (_, _, kind) in questions.items():
                value = values.get(component_id)
                if kind == "attachment" or (isinstance(value, str) and re.search(r"data:[^,]*;base64,", value, re.I)):
                    names = [e.detail.get("fileName") for e in session_events if e.type == "answer" and isinstance(e.detail, dict)
                             and e.detail.get("componentId") == component_id and e.detail.get("fileName")]
                    value = names[-1] if names else "Attachment recorded" if value else ""
                answer_cells.append(readable(value))
            linked = links.get(session.id, set())
            session_turns = sorted([t for t in turns if t.conversation_id in linked],
                                   key=lambda t: (time_key(t.created_at), t.conversation_id, t.sequence))
            ai_lines = []
            for turn in session_turns:
                conversation = conversation_map.get(turn.conversation_id)
                stage_id = conversation.stage_id if conversation else ""
                ai_lines.append(f"{second_time(turn.created_at)} | {stage_names.get(stage_id, stage_id)} | {turn.provider} / {turn.model} | request={turn.request_id}\nUser: {turn.prompt}\nAI: {turn.reply}")
            if not linked and any(e.type in ("ai_prompt", "ai_reply") for e in session_events):
                ai_lines.append("Legacy AI links are unknown. The following browser events are explicitly linked to this session and are not counted as confirmed successful turns.")
                ai_lines.extend(f"{second_time(e.timestamp)} | {e.stage_id or ''} | {e.type}\n{readable((e.detail or {}).get('text', ''))}"
                                for e in session_events if e.type in ("ai_prompt", "ai_reply"))
            _, activity = build_csv(config, [session], answers, session_events, consents, recordings, view="activity", _raw=True)
            for item in activity:
                item["Time (Australia/Sydney)"] = second_time(item.get("Original timestamp"))
            timeline = "\n\n".join(dumps(item) for item in activity)
            rows.append([session.participant_code, session.id, f"V{version}" if version is not None else "Unknown legacy version",
                         "Completed" if session.finished_at else "In progress", second_time(session.started_at), second_time(session.finished_at),
                         *answer_cells, len(session_turns) if linked or version is not None else "Unknown (legacy record)", "\n\n".join(ai_lines), timeline])
        workbook_table(workbook, title, headers, rows)
    result = io.BytesIO()
    workbook.save(result)
    return result.getvalue()


def export_experiment_xlsx(db, experiment):
    from app.researcher import repository as versions
    from app.participant.models import AIChatTurn, AIConversation
    sessions = db.query(ParticipantSession).filter_by(experiment_code=experiment.code).all()
    ids = [s.id for s in sessions]
    records = [db.query(model).filter(model.session_id.in_(ids)).all() if ids else []
               for model in (Answer, ParticipantEvent, Consent, Recording)]
    links = {e.detail["conversation_id"] for e in records[1] if e.type == "server.ai"}
    conversations = db.query(AIConversation).filter(AIConversation.id.in_(links), AIConversation.experiment_id == experiment.id).all() if links else []
    allowed = [c.id for c in conversations]
    turns = db.query(AIChatTurn).filter(AIChatTurn.conversation_id.in_(allowed)).all() if allowed else []
    return build_workbook(experiment, sessions, *records, history=versions.experiment_history(db, experiment),
                          turns=turns, conversations=conversations)
