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
