# Later Backlog

This file captures intentionally deferred work so we can focus on UI overhaul and polish now.

## Deferred Feature Streams

### 1) E2EE Key Management Lifecycle (Priority #2)

- Room key versioning model per room.
- Key rotation workflow (admin-triggered + audit trail + client prompts).
- Device-linked key envelopes (per device key wrapping).
- Secure recovery import/export lifecycle hardening.
- Failure handling UX for stale/missing room keys.

### 2) Retrieval/Search Depth (Priority #5)

- Room-aware indexed message retrieval beyond currently loaded window.
- Jump-to-context APIs around target message IDs.
- Better long-history pagination ergonomics for large rooms.
- Structured search filters (sender/date/has attachment/reactions).
- Performance tuning for large message datasets.

### 3) Optional Follow-ups

- Room-level role matrix beyond `moderator` (for example, `helper`, `readonly`).
- Fine-grained room permissions (invites/pins/media/retention toggles per role).
- All-room admin dashboards and summaries.

## Notes

- These are deferred by choice for now.
- Current focus: cohesive UI overhaul, usability polish, and consistency.
