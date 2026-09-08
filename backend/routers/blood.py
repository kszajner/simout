from fastapi import APIRouter, HTTPException
from ..database import get_conn, rows_to_list, row_to_dict
from ..models import BloodPanelIn

router = APIRouter(prefix="/api/blood", tags=["blood"])


def _panel_with_markers(c, panel_id: int):
    panel = row_to_dict(c.execute("SELECT * FROM blood_panels WHERE id=?", (panel_id,)).fetchone())
    if panel is None:
        return None
    markers = rows_to_list(
        c.execute(
            "SELECT * FROM blood_markers WHERE panel_id=? ORDER BY order_index, id",
            (panel_id,),
        ).fetchall()
    )
    panel["markers"] = markers
    return panel


def _insert_markers(c, panel_id: int, markers):
    for i, m in enumerate(markers):
        name = m.name.strip()
        if not name:
            continue
        c.execute(
            "INSERT INTO blood_markers (panel_id, name, value, unit, ref_low, ref_high, order_index) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (panel_id, name, m.value, m.unit, m.ref_low, m.ref_high, i),
        )


@router.get("/panels")
def list_panels():
    with get_conn() as c:
        ids = [r[0] for r in c.execute("SELECT id FROM blood_panels ORDER BY date DESC, id DESC").fetchall()]
        panels = [_panel_with_markers(c, pid) for pid in ids]
    return panels


@router.get("/panels/{panel_id}")
def get_panel(panel_id: int):
    with get_conn() as c:
        panel = _panel_with_markers(c, panel_id)
    if panel is None:
        raise HTTPException(404, "Panel not found")
    return panel


@router.post("/panels", status_code=201)
def create_panel(payload: BloodPanelIn):
    with get_conn() as c:
        cur = c.execute(
            "INSERT INTO blood_panels (date, lab_name, note) VALUES (?, ?, ?)",
            (payload.date.isoformat(), payload.lab_name, payload.note),
        )
        panel_id = cur.lastrowid
        _insert_markers(c, panel_id, payload.markers)
        panel = _panel_with_markers(c, panel_id)
    return panel


@router.put("/panels/{panel_id}")
def update_panel(panel_id: int, payload: BloodPanelIn):
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM blood_panels WHERE id=?", (panel_id,)).fetchone():
            raise HTTPException(404, "Panel not found")
        c.execute(
            "UPDATE blood_panels SET date=?, lab_name=?, note=? WHERE id=?",
            (payload.date.isoformat(), payload.lab_name, payload.note, panel_id),
        )
        c.execute("DELETE FROM blood_markers WHERE panel_id=?", (panel_id,))
        _insert_markers(c, panel_id, payload.markers)
        panel = _panel_with_markers(c, panel_id)
    return panel


@router.delete("/panels/{panel_id}", status_code=204)
def delete_panel(panel_id: int):
    with get_conn() as c:
        if not c.execute("SELECT 1 FROM blood_panels WHERE id=?", (panel_id,)).fetchone():
            raise HTTPException(404, "Panel not found")
        c.execute("DELETE FROM blood_panels WHERE id=?", (panel_id,))
    return None


@router.get("/markers/chart")
def markers_chart():
    """Time series per marker name, for names that recur across >=2 panels."""
    with get_conn() as c:
        rows = rows_to_list(
            c.execute(
                "SELECT bm.name, bm.value, bm.unit, bm.ref_low, bm.ref_high, bp.date "
                "FROM blood_markers bm JOIN blood_panels bp ON bp.id = bm.panel_id "
                "ORDER BY bp.date ASC"
            ).fetchall()
        )
    series: dict[str, list] = {}
    for r in rows:
        series.setdefault(r["name"], []).append(
            {"date": r["date"], "value": r["value"], "unit": r["unit"], "ref_low": r["ref_low"], "ref_high": r["ref_high"]}
        )
    return {"series": {name: pts for name, pts in series.items() if len(pts) >= 2}}
