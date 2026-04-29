from fastapi import APIRouter, HTTPException
from ..database import get_conn, rows_to_list, row_to_dict
from ..models import MeasurementIn

router = APIRouter(prefix="/api", tags=["measurements"])

FIELDS = [
    "date", "weight", "chest", "waist", "hips",
    "bicep_left", "bicep_right", "thigh_left", "thigh_right",
]


@router.get("/measurements")
def list_measurements():
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM body_measurements ORDER BY date DESC, id DESC"
        ).fetchall()
    return rows_to_list(rows)


@router.post("/measurements", status_code=201)
def create_measurement(payload: MeasurementIn):
    data = payload.model_dump()
    data["date"] = data["date"].isoformat()
    cols = ", ".join(FIELDS)
    placeholders = ", ".join(["?"] * len(FIELDS))
    values = [data[f] for f in FIELDS]
    with get_conn() as c:
        cur = c.execute(
            f"INSERT INTO body_measurements ({cols}) VALUES ({placeholders})", values
        )
        row = c.execute(
            "SELECT * FROM body_measurements WHERE id=?", (cur.lastrowid,)
        ).fetchone()
    return row_to_dict(row)


@router.put("/measurements/{measurement_id}")
def update_measurement(measurement_id: int, payload: MeasurementIn):
    data = payload.model_dump()
    data["date"] = data["date"].isoformat()
    set_clause = ", ".join(f"{f}=?" for f in FIELDS)
    values = [data[f] for f in FIELDS] + [measurement_id]
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM body_measurements WHERE id=?", (measurement_id,)).fetchone():
            raise HTTPException(404, "Measurement not found")
        c.execute(f"UPDATE body_measurements SET {set_clause} WHERE id=?", values)
        row = c.execute(
            "SELECT * FROM body_measurements WHERE id=?", (measurement_id,)
        ).fetchone()
    return row_to_dict(row)


@router.delete("/measurements/{measurement_id}", status_code=204)
def delete_measurement(measurement_id: int):
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM body_measurements WHERE id=?", (measurement_id,)).fetchone():
            raise HTTPException(404, "Measurement not found")
        c.execute("DELETE FROM body_measurements WHERE id=?", (measurement_id,))
    return None


@router.get("/measurements/chart")
def chart_data():
    """All numeric series over time, oldest first, suitable for line charts."""
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM body_measurements ORDER BY date ASC, id ASC"
        ).fetchall()
    rows = rows_to_list(rows)
    series_keys = [f for f in FIELDS if f != "date"]
    series = {k: [] for k in series_keys}
    for r in rows:
        for k in series_keys:
            if r.get(k) is not None:
                series[k].append({"date": r["date"], "value": r[k]})
    return {"series": series}
