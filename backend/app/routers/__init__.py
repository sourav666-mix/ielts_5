"""ATLAS IELTS Academy — API routers.

    auth      /auth/*            guest-first accounts, in-place upgrade
    profile   /profile           §10.1 read/write
    days      /days/*            §10.2 read/write + the §2.3 advance
    history   /history           §10.3 list
    content   /reading /listening /warmup /speaking — AI generation relays
    writing   /writing/*         generate · grade (vision two-step) · model · image
    voice     /tts /stt          §13 Kokoro + Whisper

All mounted under settings.api_prefix ("/api") by main.py. Every route
requires a bearer token except /auth/guest, /auth/login and /health.
"""