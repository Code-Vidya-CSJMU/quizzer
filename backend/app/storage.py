from __future__ import annotations
import json
import os
from typing import Dict, List, Optional, Tuple


def get_data_dir() -> str:
    base = os.getenv("QUIZ_DATA_DIR")
    if not base:
        base = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
    os.makedirs(os.path.join(base, "sessions"), exist_ok=True)
    os.makedirs(os.path.join(base, "question_sets"), exist_ok=True)
    os.makedirs(os.path.join(base, "leaderboards"), exist_ok=True)
    return base


def _session_path(code: str) -> str:
    code = str(code).upper()
    return os.path.join(get_data_dir(), "sessions", f"{code}.json")


def save_session_dict(code: str, data: Dict) -> None:
    path = _session_path(code)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)


def load_session_dict(code: str) -> Dict | None:
    path = _session_path(code)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def load_all_session_dicts() -> Dict[str, Dict]:
    base = get_data_dir()
    sessions_dir = os.path.join(base, "sessions")
    if not os.path.isdir(sessions_dir):
        return {}
    out: Dict[str, Dict] = {}
    for name in os.listdir(sessions_dir):
        if not name.endswith(".json"):
            continue
        code = name[:-5]
        try:
            with open(os.path.join(sessions_dir, name), "r", encoding="utf-8") as f:
                out[code] = json.load(f)
        except Exception:
            # skip corrupt file
            continue
    return out


def delete_session(code: str) -> None:
    path = _session_path(code)
    if os.path.exists(path):
        os.remove(path)


# --- Question set (bank) helpers ---
def _sanitized_name(name: str) -> str:
    # allow alnum, dash, underscore only; lowercased
    safe = ''.join(ch for ch in name if ch.isalnum() or ch in ('-', '_')).strip('-_').lower()
    return safe or 'untitled'


def _qset_path(name: str) -> str:
    base = get_data_dir()
    return os.path.join(base, "question_sets", f"{_sanitized_name(name)}.json")


def save_question_set(name: str, questions: List[Dict]) -> str:
    path = _qset_path(name)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(questions, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)
    return os.path.basename(path)


def load_question_set(name: str) -> Optional[List[Dict]]:
    path = _qset_path(name)
    if not os.path.exists(path):
        return None
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def list_question_sets() -> List[Tuple[str, int]]:
    base = get_data_dir()
    qdir = os.path.join(base, "question_sets")
    out: List[Tuple[str, int]] = []
    if not os.path.isdir(qdir):
        return out
    for name in os.listdir(qdir):
        if not name.endswith('.json'):
            continue
        filepath = os.path.join(qdir, name)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                arr = json.load(f)
                count = len(arr) if isinstance(arr, list) else 0
        except Exception:
            count = 0
        out.append((name[:-5], count))
    # sort by name
    out.sort(key=lambda t: t[0])
    return out


def delete_question_set(name: str) -> bool:
    path = _qset_path(name)
    if os.path.exists(path):
        os.remove(path)
        return True
    return False


# --- Leaderboard snapshots ---
def _leaderboard_dir() -> str:
    return os.path.join(get_data_dir(), "leaderboards")


def save_leaderboard_snapshot(code: str, leaderboard: List[Dict]) -> str:
    import datetime as _dt
    code = str(code).upper()
    ts = _dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    fname = f"{code}_{ts}.json"
    path = os.path.join(_leaderboard_dir(), fname)
    tmp = path + ".tmp"
    payload = {"code": code, "createdAt": ts, "leaderboard": leaderboard}
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, ensure_ascii=False)
    os.replace(tmp, path)
    return fname


def list_leaderboard_snapshots(code: Optional[str] = None) -> List[Dict]:
    items: List[Dict] = []
    ldir = _leaderboard_dir()
    if not os.path.isdir(ldir):
        return items
    for name in os.listdir(ldir):
        if not name.endswith('.json'):
            continue
        if code and not name.upper().startswith(str(code).upper() + '_'):
            continue
        try:
            with open(os.path.join(ldir, name), 'r', encoding='utf-8') as f:
                data = json.load(f)
            created_at = data.get("createdAt")
            created_human = None
            if isinstance(created_at, str):
                try:
                    import datetime as _dt
                    dt = _dt.datetime.strptime(created_at, "%Y%m%d_%H%M%S")
                    created_human = dt.strftime("%Y-%m-%d %H:%M:%S UTC")
                except Exception:
                    created_human = created_at
            items.append({
                "name": name[:-5],
                "file": name,
                "createdAt": created_at,
                "createdAtHuman": created_human,
                "count": len(data.get("leaderboard") or []),
                "code": data.get("code"),
            })
        except Exception:
            continue
    # newest first
    items.sort(key=lambda d: d.get("file"), reverse=True)
    return items


def load_leaderboard_snapshot(file_name: str) -> Optional[Dict]:
    ldir = _leaderboard_dir()
    path = os.path.join(ldir, file_name if file_name.endswith('.json') else file_name + '.json')
    if not os.path.exists(path):
        return None
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)


def delete_leaderboard_snapshots(code: Optional[str] = None) -> int:
    """Delete leaderboard snapshots. If code is provided, only delete for that code.
    Returns the number of files deleted.
    """
    ldir = _leaderboard_dir()
    if not os.path.isdir(ldir):
        return 0
    deleted = 0
    prefix = (str(code).upper() + "_") if code else None
    for name in list(os.listdir(ldir)):
        if not name.endswith('.json'):
            continue
        if prefix and not name.upper().startswith(prefix):
            continue
        try:
            os.remove(os.path.join(ldir, name))
            deleted += 1
        except Exception:
            continue
    return deleted
