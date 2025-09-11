Backend (FastAPI + Socket.IO)
=============================

Run locally

- Create a virtualenv and install requirements: pip install -r backend/requirements.txt
- Start dev server: uvicorn backend.app.main:asgi_app --reload

Environment

- ADMIN_SECRET: token for admin auth. Default is "changeme".
