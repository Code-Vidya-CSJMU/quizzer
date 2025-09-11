Quizzer — FastAPI + React (Vite) live quiz app
==============================================

Dev setup

- Backend: FastAPI + Socket.IO (ASGI). Run with: uvicorn backend.app.main:asgi_app --reload
- Frontend: Vite + React. In the frontend folder: npm install and npm run dev

Environment

- ADMIN_SECRET: token for admin auth (default: changeme)

Paths

- REST API at http://localhost:8000/api
- Socket.IO at http://localhost:8000/ws/socket.io

# quizzer