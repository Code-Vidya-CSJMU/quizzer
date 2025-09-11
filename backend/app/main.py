from __future__ import annotations
from fastapi import FastAPI, Depends, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import socketio
import os
import secrets
from pydantic import BaseModel, Field
import random
import time
from typing import Dict, List, Optional
from . import storage


# --- FastAPI app ---
GLOBAL_CODE = "GLOBAL"  # single quiz identifier (internal)
QUIZ_ROOM = "quiz"
ADMIN_ROOM = "admin"
app = FastAPI(title="Quizzer API")
# CORS: allow origins from env (comma-separated), default to '*'.
_allowed = os.getenv("ALLOWED_ORIGINS", "*")
_origins = [o.strip() for o in _allowed.split(",") if o.strip()] if _allowed != "*" else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_origins,
    allow_credentials=False,  # safer with '*' and we don't use cookies
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health():
    return {"status": "ok"}


# --- Simple in-memory data store (replace with DB later) ---
class Choice(BaseModel):
    id: str
    text: str


class Question(BaseModel):
    id: str
    text: str
    choices: Optional[List[Choice]] = None  # multiple-choice
    answer: Optional[str] = None  # correct choice id or free text
    duration: int = 30  # seconds
    hint: Optional[str] = None


class Player(BaseModel):
    id: str
    name: str
    email: Optional[str] = None
    participant_code: Optional[str] = None  # now simply the email value
    score: int = 0
    lifelines: Dict[str, bool] = Field(default_factory=lambda: {"5050": True, "hint": True})


class QuizSession(BaseModel):
    code: str
    players: Dict[str, Player] = Field(default_factory=dict)
    questions: List[Question] = Field(default_factory=list)
    current_index: int = -1
    is_active: bool = False
    lifelines_enabled: Dict[str, bool] = Field(default_factory=lambda: {"5050": True, "hint": True})
    allowed_emails: List[str] = Field(default_factory=list)  # empty => open registration
    paused: bool = False
    revealed: bool = False  # whether current question's answer has been revealed
    question_started_at: Optional[float] = None
    current_answers: Dict[str, str] = Field(default_factory=dict)  # playerId -> answer (locked)
    paused_at: Optional[float] = None  # when pause started (if paused)
    paused_accumulated: float = 0.0  # total paused seconds for current question
    current_answer_times: Dict[str, float] = Field(default_factory=dict)  # playerId -> submit time (server epoch)


# --- Request / Response Models (declared early to avoid forward-ref issues) ---

## (Removed duplicate RegisterPayload/RegisterResponse definitions moved earlier)


## (Removed duplicate StartPayload definition moved earlier)


## (Removed duplicate LifelinesPayload definition moved earlier)


SESSIONS: Dict[str, QuizSession] = {}
ACTIVE_PLAYER_SOCKETS: Dict[str, str] = {}  # playerId -> sid
SID_TO_PLAYER: Dict[str, str] = {}  # sid -> playerId


def require_admin(x_admin_token: str = Header(default="")):
    secret = os.getenv("ADMIN_SECRET", "changeme")
    if not x_admin_token or x_admin_token != secret:
        raise HTTPException(status_code=401, detail="Unauthorized")


class CreateQuizResponse(BaseModel):
    code: str


# Payload / response models (must appear before usage in route decorators)
class QuestionsPayload(BaseModel):
    questions: List[Question]


class QuestionSetSavePayload(BaseModel):
    name: str
    questions: List[Question]


class QuestionSetNamePayload(BaseModel):
    name: str


class RegisterPayload(BaseModel):
    name: str
    email: str


class RegisterResponse(BaseModel):
    playerId: str
    participantCode: str


class StartPayload(BaseModel):
    index: Optional[int] = None


class LifelinesPayload(BaseModel):
    lifelines: Dict[str, bool]


class AllowedEmailsPayload(BaseModel):
    emails: List[str]
    mode: Optional[str] = "replace"  # replace | append | remove


@app.post("/api/admin/quiz", response_model=CreateQuizResponse)
async def create_quiz(_: None = Depends(require_admin)):
    # Backwards compatibility: returns existing global code
    if GLOBAL_CODE not in SESSIONS:
        SESSIONS[GLOBAL_CODE] = QuizSession(code=GLOBAL_CODE)
        storage.save_session_dict(GLOBAL_CODE, SESSIONS[GLOBAL_CODE].model_dump())
    return {"code": GLOBAL_CODE}

# --- Question set management (global) ---
@app.get("/api/admin/question_sets")
async def qsets_list(_: None = Depends(require_admin)):
    items = storage.list_question_sets()
    return {"items": [{"name": n, "count": c} for n, c in items]}


@app.post("/api/admin/question_sets/save")
async def qsets_save(payload: QuestionSetSavePayload, _: None = Depends(require_admin)):
    fname = storage.save_question_set(payload.name, [q.model_dump() for q in payload.questions])
    return {"ok": True, "file": fname}


@app.post("/api/admin/question_sets/load")
async def qsets_load(payload: QuestionSetNamePayload, _: None = Depends(require_admin)):
    arr = storage.load_question_set(payload.name)
    if arr is None:
        raise HTTPException(404, "Question set not found")
    # validate/parse into Question models
    try:
        questions = [Question(**item) for item in arr]
    except Exception:
        raise HTTPException(422, "Invalid question set format")
    return {"questions": [q.model_dump() for q in questions]}


@app.delete("/api/admin/question_sets/{name}")
async def qsets_delete(name: str, _: None = Depends(require_admin)):
    ok = storage.delete_question_set(name)
    if not ok:
        raise HTTPException(404, "Question set not found")
    return {"ok": True}


@app.post("/api/admin/question_sets/apply")
async def qsets_apply(payload: QuestionSetNamePayload, _: None = Depends(require_admin)):
    # load the set and set it as current questions for the global quiz
    session = SESSIONS.get(GLOBAL_CODE)
    if not session:
        raise HTTPException(404, "Quiz not found")
    arr = storage.load_question_set(payload.name)
    if arr is None:
        raise HTTPException(404, "Question set not found")
    try:
        session.questions = [Question(**item) for item in arr]
    except Exception:
        raise HTTPException(422, "Invalid question set format")
    storage.save_session_dict(GLOBAL_CODE, session.model_dump())
    return {"ok": True, "count": len(session.questions)}

# --- Global (code-less) admin endpoints ---
@app.post("/api/admin/questions")
async def upload_questions_global(payload: QuestionsPayload, _: None = Depends(require_admin)):
    return await upload_questions(GLOBAL_CODE, payload, _)

@app.post("/api/admin/start")
async def start_quiz_global(payload: StartPayload | None = None, _: None = Depends(require_admin)):
    return await start_quiz(GLOBAL_CODE, payload, _)

@app.post("/api/admin/next")
async def next_quiz_global(_: None = Depends(require_admin)):
    return await next_question(GLOBAL_CODE, _)

@app.post("/api/admin/reveal")
async def reveal_global(_: None = Depends(require_admin)):
    return await reveal_only(GLOBAL_CODE, _)

@app.post("/api/admin/pause")
async def pause_quiz_global(_: None = Depends(require_admin)):
    return await pause_quiz(GLOBAL_CODE, _)

@app.post("/api/admin/reset")
async def reset_quiz_global(_: None = Depends(require_admin)):
    return await reset_quiz(GLOBAL_CODE, _)

@app.post("/api/admin/lifelines")
async def lifelines_global(payload: LifelinesPayload, _: None = Depends(require_admin)):
    return await set_lifelines(GLOBAL_CODE, payload, _)

@app.get("/api/admin/leaderboard")
async def leaderboard_global(_: None = Depends(require_admin)):
    return await leaderboard(GLOBAL_CODE, _)

@app.post("/api/admin/leaderboard/show")
async def leaderboard_show_global(_: None = Depends(require_admin)):
    session = SESSIONS.get(GLOBAL_CODE)
    if not session:
        raise HTTPException(404, "Quiz not found")
    lb = sorted(session.players.values(), key=lambda pl: pl.score, reverse=True)
    payload = [{"id": pl.id, "name": pl.name, "score": pl.score, "participantCode": pl.participant_code} for pl in lb]
    await sio.emit("leaderboard_show", payload, room=QUIZ_ROOM)
    return {"ok": True}

@app.post("/api/admin/leaderboard/hide")
async def leaderboard_hide_global(_: None = Depends(require_admin)):
    await sio.emit("leaderboard_hide", {}, room=QUIZ_ROOM)
    return {"ok": True}

@app.get("/api/admin/allowed_emails")
async def get_allowed_emails_global(_: None = Depends(require_admin)):
    sess = SESSIONS.get(GLOBAL_CODE)
    if not sess:
        raise HTTPException(404, "Quiz not found")
    return {"emails": sess.allowed_emails}

@app.post("/api/admin/allowed_emails")
async def set_allowed_emails_global(payload: AllowedEmailsPayload, _: None = Depends(require_admin)):
    sess = SESSIONS.get(GLOBAL_CODE)
    if not sess:
        raise HTTPException(404, "Quiz not found")
    normalized = [e.strip().lower() for e in payload.emails if e.strip()]
    if payload.mode == "append":
        existing = set(sess.allowed_emails)
        for e in normalized:
            if e not in existing:
                sess.allowed_emails.append(e)
    elif payload.mode == "remove":
        remove_set = set(normalized)
        sess.allowed_emails = [e for e in sess.allowed_emails if e not in remove_set]
    else:  # replace
        sess.allowed_emails = normalized
    storage.save_session_dict(GLOBAL_CODE, sess.model_dump())
    return {"emails": sess.allowed_emails, "count": len(sess.allowed_emails)}

@app.get("/api/quiz/validate")
async def validate_global():
    return {"valid": True}

@app.post("/api/quiz/register", response_model=RegisterResponse)
async def register_global(payload: RegisterPayload):
    return await register_user(GLOBAL_CODE, payload)


## (removed duplicate QuestionsPayload definition)


@app.post("/api/admin/quiz/{code}/questions")
async def upload_questions(code: str, payload: QuestionsPayload, _: None = Depends(require_admin)):
    session = SESSIONS.get(code)
    if not session:
        raise HTTPException(404, "Quiz not found")
    session.questions = payload.questions
    storage.save_session_dict(code, session.model_dump())
    return {"ok": True, "count": len(session.questions)}


@app.post("/api/admin/questions/export")
async def export_questions(_: None = Depends(require_admin)):
    session = SESSIONS.get(GLOBAL_CODE)
    if not session:
        raise HTTPException(404, "Quiz not found")
    return {"questions": [q.model_dump() for q in session.questions]}


@app.get("/api/quiz/{code}/validate")
async def validate_quiz(code: str):
    # legacy path param still returns True for backwards compatibility
    return {"valid": True}


## (removed duplicate RegisterPayload / RegisterResponse definitions)


@app.post("/api/quiz/{code}/register", response_model=RegisterResponse)
async def register_user(code: str, payload: RegisterPayload):  # legacy path; still supported
    session = SESSIONS.get(code)
    if not session:
        raise HTTPException(404, "Quiz not found")
    if not payload.email:
        raise HTTPException(422, "Email required")
    # Allowed list check (case-insensitive)
    if session.allowed_emails:
        if payload.email.strip().lower() not in {e.lower() for e in session.allowed_emails}:
            raise HTTPException(403, "Email not allowed")
    normalized_email = payload.email.strip().lower()
    # Reuse existing player if email already registered (allow reconnect)
    existing = next((p for p in session.players.values() if (p.email or '').lower() == normalized_email), None)
    if existing:
        return {"playerId": existing.id, "participantCode": existing.participant_code or normalized_email}
    # Create new player
    pid = secrets.token_hex(8)
    player = Player(id=pid, name=payload.name, email=payload.email, participant_code=normalized_email)
    session.players[pid] = player
    storage.save_session_dict(code, session.model_dump())
    return {"playerId": pid, "participantCode": player.participant_code}


@app.get("/api/admin/quiz/{code}/leaderboard")
async def leaderboard(code: str, _: None = Depends(require_admin)):
    session = SESSIONS.get(code)
    if not session:
        raise HTTPException(404, "Quiz not found")
    lb = sorted(session.players.values(), key=lambda p: p.score, reverse=True)
    return [{"id": p.id, "name": p.name, "score": p.score, "participantCode": p.participant_code} for p in lb]


## (removed duplicate StartPayload definition)


@app.post("/api/admin/quiz/{code}/start")
async def start_quiz(code: str, payload: StartPayload | None = None, _: None = Depends(require_admin)):
    session = SESSIONS.get(code)
    if not session:
        raise HTTPException(404, "Quiz not found")
    session.is_active = True
    session.paused = False
    # If no questions uploaded yet, guard
    if not session.questions:
        session.current_index = -1
        storage.save_session_dict(code, session.model_dump())
        return {"ok": False, "message": "No questions uploaded"}
    session.current_index = payload.index if payload and payload.index is not None else 0
    session.revealed = False
    session.current_answers = {}
    session.question_started_at = time.time()
    session.paused_at = None
    session.paused_accumulated = 0.0
    session.current_answer_times = {}
    # Reset per-player lifelines for the new round (once per round)
    for p in session.players.values():
        p.lifelines = {"5050": True, "hint": True}
        # notify connected player of fresh lifeline status
        sid = ACTIVE_PLAYER_SOCKETS.get(p.id)
        if sid:
            try:
                await sio.emit("lifeline_status", p.lifelines, to=sid)
            except Exception:
                pass
    storage.save_session_dict(code, session.model_dump())
    await emit_current_question(code)
    return {"ok": True}


@app.post("/api/admin/quiz/{code}/next")
async def next_question(code: str, _: None = Depends(require_admin)):
    session = SESSIONS.get(code)
    if not session:
        raise HTTPException(404, "Quiz not found")
    if not session.questions:
        return {"ok": False, "message": "No questions"}
    # If not yet revealed, do a reveal (once) and do not advance yet
    if not session.revealed and 0 <= session.current_index < len(session.questions):
        await _reveal_answers(session)
        storage.save_session_dict(code, session.model_dump())
        return {"ok": True, "revealed": True}
    # First next after reset: set to 0 if currently -1
    if session.current_index < 0:
        session.current_index = 0
    else:
        session.current_index += 1
    # Reset per-question state for the new index
    session.revealed = False
    session.current_answers = {}
    session.question_started_at = time.time()
    session.paused = False
    session.paused_at = None
    session.paused_accumulated = 0.0
    session.current_answer_times = {}
    storage.save_session_dict(code, session.model_dump())
    # Ensure leaderboard is hidden when moving to the next question
    await sio.emit("leaderboard_hide", {}, room=QUIZ_ROOM)
    await emit_current_question(code)
    return {"ok": True}


@app.post("/api/admin/quiz/{code}/reveal")
async def reveal_only(code: str, _: None = Depends(require_admin)):
    session = SESSIONS.get(code)
    if not session:
        raise HTTPException(404, "Quiz not found")
    if not (0 <= session.current_index < len(session.questions)):
        return {"ok": False, "message": "No active question"}
    await _reveal_answers(session)
    storage.save_session_dict(code, session.model_dump())
    return {"ok": True, "revealed": True}


@app.post("/api/admin/quiz/{code}/pause")
async def pause_quiz(code: str, _: None = Depends(require_admin)):
    session = SESSIONS.get(code)
    if not session:
        raise HTTPException(404, "Quiz not found")
    # toggle paused with time accounting
    if not session.paused:
        session.paused = True
        session.paused_at = time.time()
        await sio.emit("paused", {"code": code}, room=QUIZ_ROOM)
    else:
        session.paused = False
        now = time.time()
        if session.paused_at:
            session.paused_accumulated += max(0.0, now - session.paused_at)
        session.paused_at = None
        await sio.emit("resumed", {"code": code}, room=QUIZ_ROOM)
    storage.save_session_dict(code, session.model_dump())
    return {"ok": True}


@app.post("/api/admin/quiz/{code}/reset")
async def reset_quiz(code: str, _: None = Depends(require_admin)):
    session = SESSIONS.get(code)
    if not session:
        raise HTTPException(404, "Quiz not found")
    session.players = {}
    session.questions = []
    session.current_index = -1
    session.is_active = False
    session.paused = False
    session.revealed = False
    session.current_answers = {}
    session.question_started_at = None
    await sio.emit("reset", {"code": code}, room=QUIZ_ROOM)
    storage.save_session_dict(code, session.model_dump())
    return {"ok": True}


## (removed duplicate LifelinesPayload definition)


@app.post("/api/admin/quiz/{code}/lifelines")
async def set_lifelines(code: str, payload: LifelinesPayload, _: None = Depends(require_admin)):
    session = SESSIONS.get(code)
    if not session:
        raise HTTPException(404, "Quiz not found")
    allowed_keys = {"5050", "hint"}
    filtered = {k: bool(v) for k, v in payload.lifelines.items() if k in allowed_keys}
    session.lifelines_enabled.update(filtered)
    await sio.emit("lifelines", session.lifelines_enabled, room=ADMIN_ROOM)
    storage.save_session_dict(code, session.model_dump())
    return {"ok": True, "lifelines": session.lifelines_enabled}


# --- Socket.IO server (ASGI) ---
_sio_cors = _origins if _origins != ["*"] else "*"
sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=_sio_cors,
    transports=["websocket"],  # reduce overhead: disable long-polling
)


async def emit_current_question(code: str):
    session = SESSIONS.get(code)
    if not session:
        return
    if 0 <= session.current_index < len(session.questions):
        q = session.questions[session.current_index]
        q_player = q.model_dump()
        if "answer" in q_player:
            q_player["answer"] = None
        # compute remaining
        now = time.time()
        total_paused = session.paused_accumulated + ((now - session.paused_at) if session.paused_at else 0.0)
        elapsed = (now - session.question_started_at) - total_paused if session.question_started_at else 0.0
        remaining = max(0.0, float(q.duration) - max(0.0, elapsed))
        await sio.emit("question", {"question": q_player, "index": session.current_index, "duration": q.duration, "startedAt": session.question_started_at, "serverTime": now, "remaining": remaining}, room=QUIZ_ROOM)
        status_payload = {"index": session.current_index, "total": len(session.questions), "paused": session.paused, "revealed": session.revealed, "duration": q.duration, "startedAt": session.question_started_at, "serverTime": now, "remaining": remaining}
        await sio.emit("status", status_payload, room=ADMIN_ROOM)
        await sio.emit("status", status_payload, room=QUIZ_ROOM)
    else:
        if session.is_active:
            await sio.emit("complete", {}, room=QUIZ_ROOM)
        session.is_active = False
    storage.save_session_dict(code, session.model_dump())


@sio.event
async def connect(sid, environ, auth):
    print("Client connected", sid)


@sio.event
async def disconnect(sid):
    print("Client disconnected", sid)
    # clean active socket tracking
    player_id = SID_TO_PLAYER.pop(sid, None)
    if player_id and ACTIVE_PLAYER_SOCKETS.get(player_id) == sid:
        ACTIVE_PLAYER_SOCKETS.pop(player_id, None)


@sio.event
async def join_quiz(sid, data):
    code = data.get("code") or GLOBAL_CODE
    name = data.get("name")
    pid = data.get("playerId")
    email = data.get("email")
    if not code or not name or not pid:
        await sio.emit("error", {"message": "Missing code, name, or playerId"}, to=sid)
        return
    session = SESSIONS.get(code)
    if not session or pid not in session.players:
        await sio.emit("error", {"message": "Invalid session or player"}, to=sid)
        return
    player = session.players.get(pid)
    if player and email:
        # Always sync email & participant_code to email (or keep existing unique variant)
        if not player.email:
            player.email = email
        if player.participant_code and not player.participant_code.startswith(player.email.lower()):
            # leave customized unique variant
            pass
        elif not player.participant_code:
            player.participant_code = player.email.lower()
        storage.save_session_dict(code, session.model_dump())
    await sio.save_session(sid, {"code": code, "playerId": pid, "name": name, "admin": False})
    # Enforce single active socket per player: disconnect prior if exists
    prev_sid = ACTIVE_PLAYER_SOCKETS.get(pid)
    if prev_sid and prev_sid != sid:
        try:
            await sio.emit("replaced", {"reason": "Another tab connected"}, to=prev_sid)
            await sio.disconnect(prev_sid)
        except Exception:
            pass
    ACTIVE_PLAYER_SOCKETS[pid] = sid
    SID_TO_PLAYER[sid] = pid
    await sio.enter_room(sid, QUIZ_ROOM)
    await sio.emit("joined", {"ok": True, "participantCode": player.participant_code if player else None}, to=sid)
    # send current lifeline status to this player
    if player:
        await sio.emit("lifeline_status", player.lifelines, to=sid)
    # If a quiz is already active, send the current question immediately so late joiners see it
    if session.is_active and 0 <= session.current_index < len(session.questions):
        q = session.questions[session.current_index]
        q_player = q.model_dump()
        if "answer" in q_player:
            q_player["answer"] = None
        now = time.time()
        total_paused = session.paused_accumulated + ((now - session.paused_at) if session.paused_at else 0.0)
        elapsed = (now - session.question_started_at) - total_paused if session.question_started_at else 0.0
        remaining = max(0.0, float(q.duration) - max(0.0, elapsed))
        await sio.emit("question", {"question": q_player, "index": session.current_index, "duration": q.duration, "startedAt": session.question_started_at, "serverTime": now, "remaining": remaining}, to=sid)
        await sio.emit("status", {"index": session.current_index, "total": len(session.questions), "paused": session.paused, "revealed": session.revealed, "duration": q.duration, "startedAt": session.question_started_at, "serverTime": now, "remaining": remaining}, to=sid)


@sio.event
async def submit_answer(sid, data):
    sess = await sio.get_session(sid)
    code = sess.get("code") if sess else None
    pid = sess.get("playerId") if sess else None
    answer = data.get("answer")
    if not code or not pid:
        await sio.emit("error", {"message": "Not in quiz"}, to=sid)
        return
    # Evaluate
    session = SESSIONS.get(code)
    if not session:
        return
    idx = session.current_index
    p = session.players.get(pid)
    # Validation checks
    if session.paused or session.revealed:
        await sio.emit("answer_rejected", {"reason": "paused_or_revealed"}, to=sid)
        return
    if not (0 <= idx < len(session.questions)):
        await sio.emit("answer_rejected", {"reason": "no_active_question"}, to=sid)
        return
    q = session.questions[idx]
    # Time expiry (account for paused time)
    now = time.time()
    total_paused = session.paused_accumulated + ((now - session.paused_at) if session.paused_at else 0.0)
    if session.question_started_at and (now - session.question_started_at - total_paused) > q.duration:
        await sio.emit("answer_rejected", {"reason": "time_expired"}, to=sid)
        return
    # Lock answer if not already answered
    if pid in session.current_answers:
        await sio.emit("answer_rejected", {"reason": "already_locked"}, to=sid)
        return
    session.current_answers[pid] = str(answer)
    session.current_answer_times[pid] = time.time()
    storage.save_session_dict(code, session.model_dump())
    await sio.emit("answer_submitted", {"playerId": pid, "name": p.name if p else "?"}, room=ADMIN_ROOM)
    await sio.emit("answer_locked", {"locked": True}, to=sid)


@sio.event
async def lifeline_request(sid, data):
    sess = await sio.get_session(sid)
    code = sess.get("code") if sess else GLOBAL_CODE
    pid = sess.get("playerId") if sess else None
    lifeline = data.get("lifeline")
    if not code or not pid or not lifeline:
        await sio.emit("error", {"message": "Missing lifeline or not in quiz"}, to=sid)
        return
    session = SESSIONS.get(code)
    player = session.players.get(pid) if session else None
    if not session or not player:
        return
    if lifeline not in {"5050", "hint"}:
        await sio.emit("lifeline_denied", {"lifeline": lifeline}, to=sid)
        return
    if not session.lifelines_enabled.get(lifeline, True) or not player.lifelines.get(lifeline, False):
        await sio.emit("lifeline_denied", {"lifeline": lifeline}, to=sid)
        return
    # Mark used and notify admin; clients implement effects client-side
    player.lifelines[lifeline] = False
    await sio.emit("lifeline_used", {"playerId": pid, "name": player.name, "lifeline": lifeline}, room=ADMIN_ROOM)
    # notify player of current lifeline availability
    await sio.emit("lifeline_status", player.lifelines, to=sid)
    # Server-driven effects
    idx = session.current_index
    if lifeline == "5050" and 0 <= idx < len(session.questions):
        q = session.questions[idx]
        if q.choices and q.answer:
            wrong = [c.id for c in q.choices if c.id != q.answer]
            keep = [q.answer]
            if wrong:
                keep.append(random.choice(wrong))
            await sio.emit("lifeline_5050", {"keepIds": keep}, to=sid)
        else:
            await sio.emit("lifeline_ack", {"lifeline": lifeline}, to=sid)
    elif lifeline == "hint" and 0 <= idx < len(session.questions):
        q = session.questions[idx]
        await sio.emit("lifeline_hint", {"hint": q.hint or ""}, to=sid)
    else:
        await sio.emit("lifeline_ack", {"lifeline": lifeline}, to=sid)
    storage.save_session_dict(code, session.model_dump())


@sio.event
async def admin_join(sid, data):
    code = data.get("code") or GLOBAL_CODE
    token = data.get("token")
    secret = os.getenv("ADMIN_SECRET", "changeme")
    if not code or token != secret:
        await sio.emit("error", {"message": "Unauthorized"}, to=sid)
        return
    await sio.save_session(sid, {"code": code, "admin": True})
    await sio.enter_room(sid, ADMIN_ROOM)
    await sio.emit("admin_joined", {"ok": True}, to=sid)


@sio.event
async def admin_command(sid, data):
    sess = await sio.get_session(sid)
    if not sess or not sess.get("admin"):
        await sio.emit("error", {"message": "Unauthorized"}, to=sid)
        return
    code = sess.get("code") or GLOBAL_CODE
    action = data.get("action")
    if action == "next":
        await next_question(code)
    elif action == "pause":
        await pause_quiz(code)
    elif action == "reveal":
        session = SESSIONS.get(code)
        if session:
            await _reveal_answers(session)
            storage.save_session_dict(code, session.model_dump())
    elif action == "show_leaderboard":
        session = SESSIONS.get(code)
        if session:
            lb = sorted(session.players.values(), key=lambda pl: pl.score, reverse=True)
            payload = [{"id": pl.id, "name": pl.name, "score": pl.score, "participantCode": pl.participant_code} for pl in lb]
            await sio.emit("leaderboard_show", payload, room=QUIZ_ROOM)
    elif action == "hide_leaderboard":
        await sio.emit("leaderboard_hide", {}, room=QUIZ_ROOM)


# Compose ASGI app so that both HTTP and Socket.IO share the same server
asgi_app = socketio.ASGIApp(sio, other_asgi_app=app, socketio_path="/ws/socket.io")

# Load persisted sessions on startup
@app.on_event("startup")
async def _load_sessions():
    data = storage.load_all_session_dicts()
    for code, sess_dict in data.items():
        try:
            SESSIONS[code] = QuizSession(**sess_dict)
        except Exception:
            # skip corrupt sessions
            continue
    if GLOBAL_CODE not in SESSIONS:
        SESSIONS[GLOBAL_CODE] = QuizSession(code=GLOBAL_CODE)
        storage.save_session_dict(GLOBAL_CODE, SESSIONS[GLOBAL_CODE].model_dump())

# Run with: uvicorn backend.app.main:asgi_app --reload --app-dir .

# --- Helper to reveal answers ---
async def _reveal_answers(session: QuizSession):
    if session.revealed or not (0 <= session.current_index < len(session.questions)):
        return
    q = session.questions[session.current_index]
    # Evaluate all locked answers with rank-based bonus
    correct_ids: List[str] = []
    for pid, ans in session.current_answers.items():
        player = session.players.get(pid)
        if not player:
            continue
        correct = q.answer is None or str(ans).strip().lower() == str(q.answer).strip().lower()
        if correct:
            correct_ids.append(pid)
    # Sort correct responders by submission time (earlier is better)
    correct_ids.sort(key=lambda pid: session.current_answer_times.get(pid, float('inf')))
    base_points = 10
    def bonus_for_rank(rank: int) -> int:
        # 1st..5th get 5..1 bonus; others 0
        return max(0, 6 - rank) if 1 <= rank <= 5 else 0
    # Award scores
    for idx, pid in enumerate(correct_ids, start=1):
        player = session.players.get(pid)
        if not player:
            continue
        player.score += base_points + bonus_for_rank(idx)
    session.revealed = True
    # Emit reveal to players (include correct answer id/text)
    reveal_payload = {"correctAnswer": q.answer}
    await sio.emit("reveal", reveal_payload, room=QUIZ_ROOM)
    # Send per-player answer result (include rank/bonus for correct answers)
    for pid, ans in session.current_answers.items():
        player = session.players.get(pid)
        if not player:
            continue
        correct = q.answer is None or str(ans).strip().lower() == str(q.answer).strip().lower()
        sid = ACTIVE_PLAYER_SOCKETS.get(pid)
        if sid:
            rank = (correct_ids.index(pid) + 1) if correct and pid in correct_ids else None
            bonus = bonus_for_rank(rank) if rank else 0
            await sio.emit("answer_result", {"correct": correct, "score": player.score, "rank": rank, "bonus": bonus}, to=sid)
    # Update leaderboard for admins
    lb = sorted(session.players.values(), key=lambda pl: pl.score, reverse=True)
    lb_payload = [{"id": pl.id, "name": pl.name, "score": pl.score, "participantCode": pl.participant_code} for pl in lb]
    await sio.emit("leaderboard", lb_payload, room=ADMIN_ROOM)
    await sio.emit("leaderboard", lb_payload, room=QUIZ_ROOM)
    # Update status for admins and players
    status_payload = {"index": session.current_index, "total": len(session.questions), "paused": session.paused, "revealed": session.revealed}
    await sio.emit("status", status_payload, room=ADMIN_ROOM)
    await sio.emit("status", status_payload, room=QUIZ_ROOM)
