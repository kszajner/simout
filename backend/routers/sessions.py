from datetime import datetime
from fastapi import APIRouter, HTTPException
from ..database import get_conn, rows_to_list, row_to_dict
from ..models import SessionStart, SetIn, SetPatch

router = APIRouter(prefix="/api", tags=["sessions"])


def _session_with_meta_sql(where: str = "") -> str:
    return f"""
        SELECT ws.id, ws.training_day_id, ws.date, ws.started_at, ws.finished_at,
               td.name AS training_day_name, tp.name AS plan_name
        FROM workout_sessions ws
        LEFT JOIN training_days td ON td.id = ws.training_day_id
        LEFT JOIN training_plans tp ON tp.id = td.plan_id
        {where}
    """


@router.get("/sessions")
def list_sessions(limit: int = 20, offset: int = 0):
    limit = max(1, min(limit, 100))
    offset = max(0, offset)
    with get_conn() as c:
        rows = c.execute(
            _session_with_meta_sql("ORDER BY ws.date DESC, ws.id DESC LIMIT ? OFFSET ?"),
            (limit, offset),
        ).fetchall()
    return rows_to_list(rows)


@router.get("/sessions/active")
def active_session():
    """Return current in-progress session (finished_at IS NULL), if any. Single user → at most one."""
    with get_conn() as c:
        row = c.execute(
            _session_with_meta_sql("WHERE ws.finished_at IS NULL ORDER BY ws.id DESC LIMIT 1")
        ).fetchone()
    return row_to_dict(row)


@router.get("/sessions/last-day")
def last_used_day():
    """Most recently used training day, for the home screen shortcut."""
    with get_conn() as c:
        row = c.execute(
            """
            SELECT td.id AS day_id, td.name AS day_name, tp.id AS plan_id, tp.name AS plan_name
            FROM workout_sessions ws
            JOIN training_days td ON td.id = ws.training_day_id
            JOIN training_plans tp ON tp.id = td.plan_id
            WHERE ws.training_day_id IS NOT NULL
            ORDER BY ws.date DESC, ws.id DESC
            LIMIT 1
            """
        ).fetchone()
    return row_to_dict(row)


@router.get("/sessions/{session_id}")
def session_detail(session_id: int):
    with get_conn() as c:
        sess = c.execute(
            _session_with_meta_sql("WHERE ws.id=?"), (session_id,)
        ).fetchone()
        if not sess:
            raise HTTPException(404, "Session not found")
        # Template (planned exercises) for the day, in order
        template = []
        if sess["training_day_id"] is not None:
            template = c.execute(
                """SELECT tde.id, tde.exercise_id, tde.sets, tde.reps, tde.order_index,
                          e.name AS exercise_name
                   FROM training_day_exercises tde
                   JOIN exercises e ON e.id = tde.exercise_id
                   WHERE tde.training_day_id=?
                   ORDER BY tde.order_index, tde.id""",
                (sess["training_day_id"],),
            ).fetchall()
        sets = c.execute(
            """SELECT ss.id, ss.session_id, ss.exercise_id, ss.set_number,
                      ss.reps, ss.weight, ss.completed, e.name AS exercise_name
               FROM session_sets ss
               JOIN exercises e ON e.id = ss.exercise_id
               WHERE ss.session_id=?
               ORDER BY ss.exercise_id, ss.set_number""",
            (session_id,),
        ).fetchall()
    return {
        "session": row_to_dict(sess),
        "template": rows_to_list(template),
        "sets": rows_to_list(sets),
    }


@router.post("/sessions", status_code=201)
def start_session(payload: SessionStart):
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM training_days WHERE id=?", (payload.training_day_id,)).fetchone():
            raise HTTPException(404, "Training day not found")
        active = c.execute(
            "SELECT id FROM workout_sessions WHERE finished_at IS NULL ORDER BY id DESC LIMIT 1"
        ).fetchone()
        if active:
            raise HTTPException(409, f"An in-progress session already exists (id={active['id']}). Resume or finish it first.")
        cur = c.execute(
            "INSERT INTO workout_sessions (training_day_id, date, started_at) VALUES (?,?,?)",
            (payload.training_day_id, payload.date.isoformat(), datetime.utcnow().isoformat(timespec="seconds")),
        )
        row = c.execute(_session_with_meta_sql("WHERE ws.id=?"), (cur.lastrowid,)).fetchone()
    return row_to_dict(row)


@router.put("/sessions/{session_id}/finish")
def finish_session(session_id: int):
    with get_conn() as c:
        existing = c.execute("SELECT * FROM workout_sessions WHERE id=?", (session_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Session not found")
        if existing["finished_at"] is not None:
            return row_to_dict(existing)
        c.execute(
            "UPDATE workout_sessions SET finished_at=? WHERE id=?",
            (datetime.utcnow().isoformat(timespec="seconds"), session_id),
        )
        row = c.execute(_session_with_meta_sql("WHERE ws.id=?"), (session_id,)).fetchone()
    return row_to_dict(row)


@router.delete("/sessions/{session_id}", status_code=204)
def delete_session(session_id: int):
    """Used to discard an abandoned in-progress session."""
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM workout_sessions WHERE id=?", (session_id,)).fetchone():
            raise HTTPException(404, "Session not found")
        c.execute("DELETE FROM workout_sessions WHERE id=?", (session_id,))
    return None


# ---------- sets ----------

@router.post("/sessions/{session_id}/sets", status_code=201)
def log_set(session_id: int, payload: SetIn):
    with get_conn() as c:
        sess = c.execute("SELECT * FROM workout_sessions WHERE id=?", (session_id,)).fetchone()
        if not sess:
            raise HTTPException(404, "Session not found")
        if sess["finished_at"] is not None:
            raise HTTPException(409, "Session is finished; cannot add sets")
        if not c.execute("SELECT 1 FROM exercises WHERE id=?", (payload.exercise_id,)).fetchone():
            raise HTTPException(404, "Exercise not found")
        cur = c.execute(
            """INSERT INTO session_sets
               (session_id, exercise_id, set_number, reps, weight, completed)
               VALUES (?,?,?,?,?,?)""",
            (
                session_id,
                payload.exercise_id,
                payload.set_number,
                payload.reps,
                payload.weight,
                1 if payload.completed else 0,
            ),
        )
        row = c.execute(
            """SELECT id, session_id, exercise_id, set_number, reps, weight, completed
               FROM session_sets WHERE id=?""",
            (cur.lastrowid,),
        ).fetchone()
    return row_to_dict(row)


@router.put("/sets/{set_id}")
def update_set(set_id: int, payload: SetPatch):
    with get_conn() as c:
        existing = c.execute("SELECT * FROM session_sets WHERE id=?", (set_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Set not found")
        sess = c.execute(
            "SELECT finished_at FROM workout_sessions WHERE id=?", (existing["session_id"],)
        ).fetchone()
        if sess and sess["finished_at"] is not None:
            raise HTTPException(409, "Session is finished; cannot edit sets")
        new_reps = payload.reps if payload.reps is not None else existing["reps"]
        new_weight = payload.weight if payload.weight is not None else existing["weight"]
        new_completed = (
            (1 if payload.completed else 0) if payload.completed is not None else existing["completed"]
        )
        c.execute(
            "UPDATE session_sets SET reps=?, weight=?, completed=? WHERE id=?",
            (new_reps, new_weight, new_completed, set_id),
        )
        row = c.execute(
            """SELECT id, session_id, exercise_id, set_number, reps, weight, completed
               FROM session_sets WHERE id=?""",
            (set_id,),
        ).fetchone()
    return row_to_dict(row)


@router.delete("/sets/{set_id}", status_code=204)
def delete_set(set_id: int):
    with get_conn() as c:
        existing = c.execute("SELECT * FROM session_sets WHERE id=?", (set_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Set not found")
        sess = c.execute(
            "SELECT finished_at FROM workout_sessions WHERE id=?", (existing["session_id"],)
        ).fetchone()
        if sess and sess["finished_at"] is not None:
            raise HTTPException(409, "Session is finished; cannot delete sets")
        c.execute("DELETE FROM session_sets WHERE id=?", (set_id,))
    return None
