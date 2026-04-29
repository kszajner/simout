from fastapi import APIRouter, HTTPException
from ..database import get_conn, rows_to_list, row_to_dict
from ..models import ExerciseIn

router = APIRouter(prefix="/api", tags=["exercises"])


@router.get("/exercises")
def list_exercises():
    with get_conn() as c:
        rows = c.execute("SELECT * FROM exercises ORDER BY name COLLATE NOCASE").fetchall()
    return rows_to_list(rows)


@router.post("/exercises", status_code=201)
def create_exercise(payload: ExerciseIn):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Name required")
    try:
        with get_conn() as c:
            cur = c.execute("INSERT INTO exercises (name) VALUES (?)", (name,))
            row = c.execute("SELECT * FROM exercises WHERE id=?", (cur.lastrowid,)).fetchone()
        return row_to_dict(row)
    except Exception as e:
        if "UNIQUE" in str(e):
            raise HTTPException(409, "Exercise with this name already exists")
        raise


@router.put("/exercises/{exercise_id}")
def rename_exercise(exercise_id: int, payload: ExerciseIn):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "Name required")
    with get_conn() as c:
        existing = c.execute("SELECT id FROM exercises WHERE id=?", (exercise_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Exercise not found")
        try:
            c.execute("UPDATE exercises SET name=? WHERE id=?", (name, exercise_id))
        except Exception as e:
            if "UNIQUE" in str(e):
                raise HTTPException(409, "Exercise with this name already exists")
            raise
        row = c.execute("SELECT * FROM exercises WHERE id=?", (exercise_id,)).fetchone()
    return row_to_dict(row)


@router.delete("/exercises/{exercise_id}", status_code=204)
def delete_exercise(exercise_id: int):
    with get_conn() as c:
        existing = c.execute("SELECT id FROM exercises WHERE id=?", (exercise_id,)).fetchone()
        if not existing:
            raise HTTPException(404, "Exercise not found")
        used_in_session = c.execute(
            "SELECT 1 FROM session_sets WHERE exercise_id=? LIMIT 1", (exercise_id,)
        ).fetchone()
        if used_in_session:
            raise HTTPException(409, "Cannot delete: exercise has logged sets in workout history")
        used_in_template = c.execute(
            "SELECT 1 FROM training_day_exercises WHERE exercise_id=? LIMIT 1", (exercise_id,)
        ).fetchone()
        if used_in_template:
            raise HTTPException(409, "Cannot delete: exercise is used in a plan template. Remove it from the template first.")
        c.execute("DELETE FROM exercises WHERE id=?", (exercise_id,))
    return None


@router.get("/exercises/{exercise_id}/last-session")
def last_session_for_exercise(exercise_id: int, before_session_id: int | None = None):
    """Return all sets from the most recent finished/started session that contains this exercise.
    Optionally exclude a current session via before_session_id so an in-progress session
    does not shadow the previous reference."""
    with get_conn() as c:
        params: list = [exercise_id]
        sql = """
            SELECT ws.id AS session_id, ws.date AS session_date
            FROM workout_sessions ws
            JOIN session_sets ss ON ss.session_id = ws.id
            WHERE ss.exercise_id = ?
        """
        if before_session_id is not None:
            sql += " AND ws.id <> ?"
            params.append(before_session_id)
        sql += " ORDER BY ws.date DESC, ws.id DESC LIMIT 1"
        sess = c.execute(sql, params).fetchone()
        if not sess:
            return None
        sets = c.execute(
            "SELECT id, set_number, reps, weight, completed FROM session_sets "
            "WHERE session_id=? AND exercise_id=? ORDER BY set_number",
            (sess["session_id"], exercise_id),
        ).fetchall()
    return {
        "session_id": sess["session_id"],
        "date": sess["session_date"],
        "sets": rows_to_list(sets),
    }


@router.get("/exercises/{exercise_id}/progress")
def progress(exercise_id: int):
    """Per-session max weight for this exercise, in date order. Also returns PR info.
    Counts any logged set that has a weight value (completion is a workout-time signal,
    not a historical filter)."""
    with get_conn() as c:
        rows = c.execute(
            """
            SELECT ws.date AS date, MAX(ss.weight) AS max_weight
            FROM session_sets ss
            JOIN workout_sessions ws ON ws.id = ss.session_id
            WHERE ss.exercise_id = ? AND ss.weight IS NOT NULL
            GROUP BY ws.id, ws.date
            ORDER BY ws.date ASC, ws.id ASC
            """,
            (exercise_id,),
        ).fetchall()
        pr = c.execute(
            """
            SELECT ss.weight AS weight, ss.reps AS reps, ws.date AS date
            FROM session_sets ss
            JOIN workout_sessions ws ON ws.id = ss.session_id
            WHERE ss.exercise_id = ? AND ss.weight IS NOT NULL
            ORDER BY ss.weight DESC, ws.date ASC
            LIMIT 1
            """,
            (exercise_id,),
        ).fetchone()
        counts = c.execute(
            """
            SELECT
              COUNT(*) AS total,
              SUM(CASE WHEN weight IS NOT NULL THEN 1 ELSE 0 END) AS with_weight
            FROM session_sets WHERE exercise_id = ?
            """,
            (exercise_id,),
        ).fetchone()
        recent = c.execute(
            """
            SELECT ss.id, ss.set_number, ss.reps, ss.weight, ss.completed,
                   ws.date AS session_date, ws.id AS session_id
            FROM session_sets ss
            JOIN workout_sessions ws ON ws.id = ss.session_id
            WHERE ss.exercise_id = ?
            ORDER BY ws.date DESC, ws.id DESC, ss.set_number ASC
            LIMIT 25
            """,
            (exercise_id,),
        ).fetchall()
    return {
        "points": [{"date": r["date"], "max_weight": r["max_weight"]} for r in rows],
        "pr": row_to_dict(pr),
        "logged_sets": counts["total"] if counts else 0,
        "logged_sets_with_weight": (counts["with_weight"] or 0) if counts else 0,
        "recent_sets": rows_to_list(recent),
    }
