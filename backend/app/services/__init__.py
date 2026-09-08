"""ATLAS IELTS Academy — service layer.

    profile_service   §10.1 persistence (camelCase round-trip)
    day_service       §10.2 persistence + the server-authoritative
                      §2.3 advance (four-done gate, streak, rollover,
                      Day-270 completion) + §9.4 band math
    history_service   §10.3 append/list (ordered by completion)

Discipline: services own commits for their own operations; day
advance owns ONE commit for its whole transition. JSON columns are
never mutated in place — always fresh object assignment.
"""