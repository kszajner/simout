from fastapi import APIRouter, HTTPException
from ..database import get_conn, rows_to_list, row_to_dict
from ..models import PlanIn, DayIn, DayExerciseIn, DayExercisePatch

router = APIRouter(prefix="/api", tags=["plans"])


# ---------- plans ----------

@router.get("/plans")
def list_plans():
    with get_conn() as c:
        rows = c.execute("SELECT * FROM training_plans ORDER BY created_at DESC, id DESC").fetchall()
    return rows_to_list(rows)


@router.post("/plans", status_code=201)
def create_plan(payload: PlanIn):
    with get_conn() as c:
        cur = c.execute("INSERT INTO training_plans (name) VALUES (?)", (payload.name.strip(),))
        row = c.execute("SELECT * FROM training_plans WHERE id=?", (cur.lastrowid,)).fetchone()
    return row_to_dict(row)


@router.put("/plans/{plan_id}")
def rename_plan(plan_id: int, payload: PlanIn):
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM training_plans WHERE id=?", (plan_id,)).fetchone():
            raise HTTPException(404, "Plan not found")
        c.execute("UPDATE training_plans SET name=? WHERE id=?", (payload.name.strip(), plan_id))
        row = c.execute("SELECT * FROM training_plans WHERE id=?", (plan_id,)).fetchone()
    return row_to_dict(row)


@router.delete("/plans/{plan_id}", status_code=204)
def delete_plan(plan_id: int):
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM training_plans WHERE id=?", (plan_id,)).fetchone():
            raise HTTPException(404, "Plan not found")
        c.execute("DELETE FROM training_plans WHERE id=?", (plan_id,))
    return None


# ---------- days ----------

@router.get("/plans/{plan_id}/days")
def list_days(plan_id: int):
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM training_days WHERE plan_id=? ORDER BY order_index, id",
            (plan_id,),
        ).fetchall()
    return rows_to_list(rows)


@router.post("/plans/{plan_id}/days", status_code=201)
def create_day(plan_id: int, payload: DayIn):
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM training_plans WHERE id=?", (plan_id,)).fetchone():
            raise HTTPException(404, "Plan not found")
        cur = c.execute(
            "INSERT INTO training_days (plan_id, name, order_index) VALUES (?,?,?)",
            (plan_id, payload.name.strip(), payload.order_index),
        )
        row = c.execute("SELECT * FROM training_days WHERE id=?", (cur.lastrowid,)).fetchone()
    return row_to_dict(row)


@router.put("/days/{day_id}")
def update_day(day_id: int, payload: DayIn):
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM training_days WHERE id=?", (day_id,)).fetchone():
            raise HTTPException(404, "Day not found")
        c.execute(
            "UPDATE training_days SET name=?, order_index=? WHERE id=?",
            (payload.name.strip(), payload.order_index, day_id),
        )
        row = c.execute("SELECT * FROM training_days WHERE id=?", (day_id,)).fetchone()
    return row_to_dict(row)


@router.delete("/days/{day_id}", status_code=204)
def delete_day(day_id: int):
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM training_days WHERE id=?", (day_id,)).fetchone():
            raise HTTPException(404, "Day not found")
        c.execute("DELETE FROM training_days WHERE id=?", (day_id,))
    return None


# ---------- day exercises (template) ----------

@router.get("/days/{day_id}/exercises")
def list_day_exercises(day_id: int):
    with get_conn() as c:
        rows = c.execute(
            """
            SELECT tde.id, tde.training_day_id, tde.exercise_id, tde.sets, tde.reps,
                   tde.order_index, e.name AS exercise_name
            FROM training_day_exercises tde
            JOIN exercises e ON e.id = tde.exercise_id
            WHERE tde.training_day_id = ?
            ORDER BY tde.order_index, tde.id
            """,
            (day_id,),
        ).fetchall()
    return rows_to_list(rows)


@router.post("/days/{day_id}/exercises", status_code=201)
def add_day_exercise(day_id: int, payload: DayExerciseIn):
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM training_days WHERE id=?", (day_id,)).fetchone():
            raise HTTPException(404, "Day not found")
        if not c.execute("SELECT 1 FROM exercises WHERE id=?", (payload.exercise_id,)).fetchone():
            raise HTTPException(404, "Exercise not found")
        cur = c.execute(
            """INSERT INTO training_day_exercises
               (training_day_id, exercise_id, sets, reps, order_index)
               VALUES (?,?,?,?,?)""",
            (day_id, payload.exercise_id, payload.sets, payload.reps, payload.order_index),
        )
        row = c.execute(
            """SELECT tde.id, tde.training_day_id, tde.exercise_id, tde.sets, tde.reps,
                      tde.order_index, e.name AS exercise_name
               FROM training_day_exercises tde
               JOIN exercises e ON e.id = tde.exercise_id
               WHERE tde.id=?""",
            (cur.lastrowid,),
        ).fetchone()
    return row_to_dict(row)


@router.put("/day-exercises/{tde_id}")
def update_day_exercise(tde_id: int, payload: DayExercisePatch):
    with get_conn() as c:
        existing = c.execute(
            "SELECT * FROM training_day_exercises WHERE id=?", (tde_id,)
        ).fetchone()
        if not existing:
            raise HTTPException(404, "Template entry not found")
        new_exercise_id = payload.exercise_id if payload.exercise_id is not None else existing["exercise_id"]
        new_sets = payload.sets if payload.sets is not None else existing["sets"]
        new_reps = payload.reps if payload.reps is not None else existing["reps"]
        new_order = payload.order_index if payload.order_index is not None else existing["order_index"]
        if payload.exercise_id is not None:
            if not c.execute("SELECT 1 FROM exercises WHERE id=?", (new_exercise_id,)).fetchone():
                raise HTTPException(404, "Exercise not found")
        c.execute(
            """UPDATE training_day_exercises
               SET exercise_id=?, sets=?, reps=?, order_index=? WHERE id=?""",
            (new_exercise_id, new_sets, new_reps, new_order, tde_id),
        )
        row = c.execute(
            """SELECT tde.id, tde.training_day_id, tde.exercise_id, tde.sets, tde.reps,
                      tde.order_index, e.name AS exercise_name
               FROM training_day_exercises tde
               JOIN exercises e ON e.id = tde.exercise_id
               WHERE tde.id=?""",
            (tde_id,),
        ).fetchone()
    return row_to_dict(row)


@router.delete("/day-exercises/{tde_id}", status_code=204)
def delete_day_exercise(tde_id: int):
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM training_day_exercises WHERE id=?", (tde_id,)).fetchone():
            raise HTTPException(404, "Template entry not found")
        c.execute("DELETE FROM training_day_exercises WHERE id=?", (tde_id,))
    return None
