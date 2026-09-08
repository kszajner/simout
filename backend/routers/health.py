import zipfile
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, File

from ..database import DATA_DIR, get_conn, rows_to_list

router = APIRouter(prefix="/api/health", tags=["health"])

IMPORT_ZIP_PATH = DATA_DIR / "health_import.zip"

# Apple Health record `type` -> our column name, for simple per-day sums.
ACTIVITY_FIELDS = {
    "HKQuantityTypeIdentifierStepCount": "steps",
    "HKQuantityTypeIdentifierActiveEnergyBurned": "active_energy_kcal",
    "HKQuantityTypeIdentifierBasalEnergyBurned": "basal_energy_kcal",
    "HKQuantityTypeIdentifierDistanceWalkingRunning": "distance_km",
}
HR_TYPE = "HKQuantityTypeIdentifierHeartRate"
RESTING_HR_TYPE = "HKQuantityTypeIdentifierRestingHeartRate"
SLEEP_TYPE = "HKCategoryTypeIdentifierSleepAnalysis"
ASLEEP_VALUES = {
    "HKCategoryValueSleepAnalysisAsleep",  # legacy (pre-iOS 16)
    "HKCategoryValueSleepAnalysisAsleepCore",
    "HKCategoryValueSleepAnalysisAsleepDeep",
    "HKCategoryValueSleepAnalysisAsleepREM",
    "HKCategoryValueSleepAnalysisAsleepUnspecified",
}
IN_BED_VALUE = "HKCategoryValueSleepAnalysisInBed"
BODY_FIELDS = {
    "HKQuantityTypeIdentifierBodyMass": "weight_kg",
    "HKQuantityTypeIdentifierBodyMassIndex": "bmi",
    "HKQuantityTypeIdentifierBodyFatPercentage": "body_fat_pct",
    "HKQuantityTypeIdentifierLeanBodyMass": "lean_body_mass_kg",
}


@router.post("/import")
async def import_apple_health(file: UploadFile = File(...)):
    if not file.filename.lower().endswith(".zip"):
        raise HTTPException(400, "Expected a .zip export from the Apple Health app")

    IMPORT_ZIP_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(IMPORT_ZIP_PATH, "wb") as out:
        while chunk := await file.read(1024 * 1024):
            out.write(chunk)

    try:
        summary = _parse_and_store(IMPORT_ZIP_PATH)
    except Exception as e:
        raise HTTPException(400, f"Could not read export: {e}")

    return summary


@router.get("/status")
def health_status():
    with get_conn() as c:
        activity_count = c.execute("SELECT COUNT(*) FROM health_daily_activity").fetchone()[0]
        activity_range = c.execute("SELECT MIN(date), MAX(date) FROM health_daily_activity").fetchone()
        hr_count = c.execute("SELECT COUNT(*) FROM health_heart_rate_daily").fetchone()[0]
        sleep_count = c.execute("SELECT COUNT(*) FROM health_sleep").fetchone()[0]
        body_count = c.execute("SELECT COUNT(*) FROM health_body_composition").fetchone()[0]

        today = datetime.now().date().isoformat()
        today_row = c.execute(
            "SELECT steps, active_energy_kcal, basal_energy_kcal FROM health_daily_activity WHERE date=?",
            (today,),
        ).fetchone()

    imported = bool(activity_count or hr_count or sleep_count or body_count)
    today_steps = today_row["steps"] if today_row else None
    today_kcal = None
    if today_row and (today_row["active_energy_kcal"] is not None or today_row["basal_energy_kcal"] is not None):
        today_kcal = (today_row["active_energy_kcal"] or 0) + (today_row["basal_energy_kcal"] or 0)

    return {
        "imported": imported,
        "date_range": {"earliest": activity_range[0], "latest": activity_range[1]},
        "counts": {
            "activity_days": activity_count,
            "heart_rate_days": hr_count,
            "sleep_nights": sleep_count,
            "body_composition_days": body_count,
        },
        "today": {"steps": today_steps, "calories_kcal": today_kcal},
    }


@router.get("/activity/chart")
def activity_chart(days: int = 90):
    days = max(1, min(days, 3650))
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM health_daily_activity ORDER BY date DESC LIMIT ?", (days,)
        ).fetchall()
    return {"series": _rows_to_series(reversed(rows_to_list(rows)), "date",
                                       ["steps", "active_energy_kcal", "basal_energy_kcal", "distance_km"])}


@router.get("/heart-rate/chart")
def heart_rate_chart(days: int = 90):
    days = max(1, min(days, 3650))
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM health_heart_rate_daily ORDER BY date DESC LIMIT ?", (days,)
        ).fetchall()
    return {"series": _rows_to_series(reversed(rows_to_list(rows)), "date",
                                       ["min_bpm", "avg_bpm", "max_bpm", "resting_bpm"])}


@router.get("/sleep/chart")
def sleep_chart(nights: int = 30):
    nights = max(1, min(nights, 3650))
    with get_conn() as c:
        rows = c.execute(
            "SELECT * FROM health_sleep ORDER BY night_date DESC LIMIT ?", (nights,)
        ).fetchall()
    return {"series": _rows_to_series(reversed(rows_to_list(rows)), "night_date",
                                       ["asleep_hours", "in_bed_hours"])}


@router.get("/body-composition/chart")
def body_composition_chart():
    with get_conn() as c:
        rows = c.execute("SELECT * FROM health_body_composition ORDER BY date ASC").fetchall()
    return {"series": _rows_to_series(rows_to_list(rows), "date",
                                       ["weight_kg", "bmi", "body_fat_pct", "lean_body_mass_kg"])}


def _rows_to_series(rows, date_key: str, fields: list[str]) -> dict:
    series = {f: [] for f in fields}
    for r in rows:
        for f in fields:
            if r.get(f) is not None:
                series[f].append({"date": r[date_key], "value": r[f]})
    return series


def _find_export_xml(zf: zipfile.ZipFile) -> str:
    for name in zf.namelist():
        if name.endswith("export.xml"):
            return name
    raise ValueError("No export.xml found inside the zip")


def _to_float(v):
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


def _merge_and_bucket_by_night(intervals: list[tuple[datetime, datetime]], gap_minutes: int = 5) -> dict[str, float]:
    """Merge overlapping/adjacent intervals (collapses multi-source duplicates),
    then sum merged-block duration (hours) per calendar date of each block's end."""
    if not intervals:
        return {}
    intervals = sorted(intervals, key=lambda iv: iv[0])
    gap = timedelta(minutes=gap_minutes)
    merged = []
    cur_start, cur_end = intervals[0]
    for s, e in intervals[1:]:
        if s <= cur_end + gap:
            cur_end = max(cur_end, e)
        else:
            merged.append((cur_start, cur_end))
            cur_start, cur_end = s, e
    merged.append((cur_start, cur_end))

    by_night: dict[str, float] = {}
    for s, e in merged:
        night = e.date().isoformat()
        hours = (e - s).total_seconds() / 3600
        by_night[night] = by_night.get(night, 0.0) + hours
    return by_night


def _parse_and_store(zip_path: Path) -> dict:
    activity_totals: dict[str, dict[str, dict[str, float]]] = {}  # date -> field -> source -> value
    hr_acc: dict[str, list] = {}  # date -> [sum, count, min, max]
    resting_hr: dict[str, tuple] = {}  # date -> (value, startDate)
    sleep_raw: list[tuple[str, str, str]] = []  # (start, end, value)
    body_latest: dict[str, dict[str, tuple]] = {}  # date -> field -> (value, startDate)

    record_count = 0
    earliest = None
    latest = None

    with zipfile.ZipFile(zip_path) as zf:
        xml_name = _find_export_xml(zf)
        with zf.open(xml_name) as f:
            context = ET.iterparse(f, events=("start", "end"))
            _, root = next(context)
            for event, elem in context:
                if event == "end" and elem.tag == "Record":
                    record_count += 1
                    rtype = elem.get("type", "")
                    start = elem.get("startDate", "")
                    source = elem.get("sourceName", "unknown")

                    if start:
                        if not earliest or start < earliest:
                            earliest = start
                        if not latest or start > latest:
                            latest = start

                    if rtype in ACTIVITY_FIELDS and start:
                        value = _to_float(elem.get("value"))
                        if value is not None:
                            date = start[:10]
                            field = ACTIVITY_FIELDS[rtype]
                            bucket = activity_totals.setdefault(date, {}).setdefault(field, {})
                            bucket[source] = bucket.get(source, 0.0) + value

                    elif rtype == HR_TYPE and start:
                        value = _to_float(elem.get("value"))
                        if value is not None:
                            date = start[:10]
                            acc = hr_acc.setdefault(date, [0.0, 0, None, None])
                            acc[0] += value
                            acc[1] += 1
                            acc[2] = value if acc[2] is None else min(acc[2], value)
                            acc[3] = value if acc[3] is None else max(acc[3], value)

                    elif rtype == RESTING_HR_TYPE and start:
                        value = _to_float(elem.get("value"))
                        if value is not None:
                            date = start[:10]
                            prev = resting_hr.get(date)
                            if not prev or start > prev[1]:
                                resting_hr[date] = (value, start)

                    elif rtype == SLEEP_TYPE:
                        end = elem.get("endDate", "")
                        value = elem.get("value", "")
                        if start and end:
                            sleep_raw.append((start, end, value))

                    elif rtype in BODY_FIELDS and start:
                        value = _to_float(elem.get("value"))
                        if value is not None:
                            date = start[:10]
                            field = BODY_FIELDS[rtype]
                            prev = body_latest.setdefault(date, {}).get(field)
                            if not prev or start > prev[1]:
                                body_latest[date][field] = (value, start)

                    elem.clear()
                    root.clear()
                elif event == "end":
                    elem.clear()

    # Activity: resolve one dominant source per field (avoids double-counting
    # when both phone and watch log the same metric), fall back to whatever
    # source is present on days the dominant one has no data.
    field_source_totals: dict[str, dict[str, float]] = {}
    for fields in activity_totals.values():
        for field, sources in fields.items():
            fs = field_source_totals.setdefault(field, {})
            for source, val in sources.items():
                fs[source] = fs.get(source, 0.0) + val
    dominant_source = {
        field: max(sources.items(), key=lambda kv: kv[1])[0]
        for field, sources in field_source_totals.items()
    }

    activity_daily: dict[str, dict[str, float]] = {}
    for date, fields in activity_totals.items():
        row = activity_daily.setdefault(date, {})
        for field, sources in fields.items():
            dom = dominant_source.get(field)
            row[field] = sources[dom] if dom in sources else max(sources.values())

    # Sleep: merge overlapping/fragmented intervals per category, bucket by
    # the calendar date each merged block ends on (the "morning after").
    asleep_intervals, inbed_intervals = [], []
    for start, end, value in sleep_raw:
        try:
            s, e = datetime.fromisoformat(start), datetime.fromisoformat(end)
        except ValueError:
            continue
        if value == IN_BED_VALUE:
            inbed_intervals.append((s, e))
        elif value in ASLEEP_VALUES:
            asleep_intervals.append((s, e))

    asleep_by_night = _merge_and_bucket_by_night(asleep_intervals)
    inbed_by_night = _merge_and_bucket_by_night(inbed_intervals)
    sleep_rows = []
    for night in set(asleep_by_night) | set(inbed_by_night):
        if night in asleep_by_night:
            sleep_rows.append((night, asleep_by_night[night], None, "asleep"))
        else:
            sleep_rows.append((night, None, inbed_by_night[night], "in_bed_fallback"))

    # Heart rate: daily min/avg/max from HeartRate samples, resting from its own type.
    hr_rows = []
    seen_dates = set(hr_acc) | set(resting_hr)
    for date in seen_dates:
        acc = hr_acc.get(date)
        if acc:
            total, count, mn, mx = acc
            avg = total / count if count else None
        else:
            mn = avg = mx = None
        resting = resting_hr.get(date, (None, None))[0]
        hr_rows.append((date, mn, avg, mx, resting))

    # Body composition: latest reading per day per field (a smart-scale re-weigh
    # replaces the earlier one, rather than being averaged with it).
    body_rows = [
        (date, fields.get("weight_kg", (None,))[0], fields.get("bmi", (None,))[0],
         fields.get("body_fat_pct", (None,))[0], fields.get("lean_body_mass_kg", (None,))[0])
        for date, fields in body_latest.items()
    ]

    with get_conn() as c:
        c.execute("DELETE FROM health_daily_activity")
        c.executemany(
            "INSERT INTO health_daily_activity (date, steps, active_energy_kcal, basal_energy_kcal, distance_km) "
            "VALUES (?, ?, ?, ?, ?)",
            [(d, r.get("steps"), r.get("active_energy_kcal"), r.get("basal_energy_kcal"), r.get("distance_km"))
             for d, r in activity_daily.items()],
        )

        c.execute("DELETE FROM health_heart_rate_daily")
        c.executemany(
            "INSERT INTO health_heart_rate_daily (date, min_bpm, avg_bpm, max_bpm, resting_bpm) "
            "VALUES (?, ?, ?, ?, ?)",
            hr_rows,
        )

        c.execute("DELETE FROM health_sleep")
        c.executemany(
            "INSERT INTO health_sleep (night_date, asleep_hours, in_bed_hours, source) VALUES (?, ?, ?, ?)",
            sleep_rows,
        )

        c.execute("DELETE FROM health_body_composition")
        c.executemany(
            "INSERT INTO health_body_composition (date, weight_kg, bmi, body_fat_pct, lean_body_mass_kg) "
            "VALUES (?, ?, ?, ?, ?)",
            body_rows,
        )

    return {
        "file_size_bytes": zip_path.stat().st_size,
        "record_count": record_count,
        "date_range": {"earliest": earliest, "latest": latest},
        "days_activity": len(activity_daily),
        "days_heart_rate": len(hr_rows),
        "nights_sleep": len(sleep_rows),
        "days_body_composition": len(body_rows),
    }
