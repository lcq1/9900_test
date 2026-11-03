# Client item 4 — Reference platform review checklist

**Status: pending client input.** The reference platform has not been reviewed.
Nothing in this document claims what the reference platform does; every field
marked *(to complete)* has to be filled from the client's own material.

This repository deliberately contains no copy of the client's reference
platform material. The client keeps it in the Microsoft Teams channel for the
project, and it must not be re-published here without permission.

## 1. What we need from the client

| # | Request | Why it is needed |
| --- | --- | --- |
| 1 | Name of the reference platform and what the client uses it for today | Frames the comparison: a study-hosting tool, a survey tool, or an internal UNSW system behave very differently. |
| 2 | Read-only access, a recorded walkthrough, or annotated screenshots of the researcher side | Screen-by-screen comparison is the only way to judge whether our builder is recognisable to the client's team. |
| 3 | The same for the participant side, including the invitation email or code the participant receives | Entry and consent are where participants drop out; we need the exact wording and flow. |
| 4 | One exported data file from a finished session (redacted) | Defines the expected column set, timestamp precision, and whether media is linked or embedded. |
| 5 | Which behaviours are mandatory to keep, and which are merely habit | Prevents us from copying a habit the client would happily drop. |
| 6 | Whether anything from the reference platform is licensed or restricted | Determines whether we may copy layout ideas at all. |

If access cannot be granted, request 2 can be met by a screen-share walkthrough
recorded with the client's consent; request 4 can be met by a header row plus
one example row.

## 2. Review session (60 minutes)

1. Five-minute framing: we are not rebuilding the reference platform, we are
   checking that our stage builder maps onto the client's mental model.
2. Twenty-five minutes: researcher walkthrough by the client, one person
   noting every screen, one person noting terminology.
3. Fifteen minutes: participant walkthrough, with the invitation text in view.
4. Ten minutes: open the client's exported file and read the columns aloud.
5. Five minutes: agree which gaps become Jira stories, and who owns each.

Rules: no recording without explicit consent, no participant data in the room,
no screenshots committed to the repository. Decisions are recorded as Jira
comments on the affected story so the audit trail stays with the work.

## 3. Comparison template

Copy this table into the review session notes and fill the third column live.
The fourth column is our current behaviour and must be verified against the
running build before the session, not from memory.

| Dimension | Question to answer about the reference platform | Beyond today | Gap / action |
| --- | --- | --- | --- |
| Stage authoring | How does a researcher create a step? Free text, templates, or a fixed form? | Stage list with per-stage type, content components and feature switches | *(to complete)* |
| Participant entry | Invitation link, access code, or account? | Experiment code plus participant code, no participant account | *(to complete)* |
| Consent | Where is consent shown, and how is it signed? | Consent stage with handwritten signature or full legal name, clauses configurable | *(to complete)* |
| Timing | Is there a visible clock, a countdown, or both? What happens at zero? | Optional stage clock, optional countdown, expiry handled per stage | *(to complete)* |
| AI interaction | Is AI embedded, and is the conversation stored verbatim? | Optional per-stage AI chat rail, each prompt and reply recorded as events | *(to complete)* |
| Copy and paste | Is copying from the page captured? | Optional copy/paste events with text and timestamp on fill-in and short-answer stages | *(to complete)* |
| Media capture | Screen, camera, microphone, or none? Per stage or per session? | Per-stage screen recording and camera/microphone capture, optional | *(to complete)* |
| Pause and abort | Can a participant pause? Is an abort recorded? | Optional pause and abort controls, both recorded as events | *(to complete)* |
| Data export | Which formats, and does one row equal one participant? | Excel workbook plus CSV views, one row per answer, session-scoped download | *(to complete)* |
| Timestamps | One clock or several? How precise? | Single session clock, millisecond timestamps, server-anchored offset | *(to complete)* |
| Hosting and storage | Where does data live? | Self-hosted stack; storage location chosen per researcher | *(to complete)* |
| Accessibility | Any stated requirement? | Keyboard reachable forms, labelled controls | *(to complete)* |

## 4. Decision rules

- A difference is only a gap if the client says it matters. Everything else is
  recorded as "observed, not required".
- Anything that would copy protected material is out of scope by default and
  needs written approval before implementation.
- Anything that changes the study protocol (consent wording, timing, media)
  goes back to the client and the ethics approval, not just to the backlog.

## 5. Sign-off

The item can be marked complete when the client confirms, in writing:

1. the material listed in section 1 has been received, and
2. each row of section 3 is either "same", "different but acceptable", or
   "different and must change", and
3. the "different and must change" rows exist as Jira stories with an owner.
