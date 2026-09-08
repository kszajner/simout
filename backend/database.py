import os
import sqlite3
from contextlib import contextmanager
from pathlib import Path

DATA_DIR = Path(os.environ.get("SIMOUT_DATA_DIR", "/app/data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)
DB_PATH = DATA_DIR / "simout.db"

SCHEMA = """
CREATE TABLE IF NOT EXISTS exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS training_days (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id INTEGER NOT NULL REFERENCES training_plans(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    order_index INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS training_day_exercises (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    training_day_id INTEGER NOT NULL REFERENCES training_days(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    sets INTEGER DEFAULT 3,
    reps INTEGER DEFAULT 10,
    order_index INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS workout_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    training_day_id INTEGER REFERENCES training_days(id),
    date DATE NOT NULL,
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    finished_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS session_sets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
    exercise_id INTEGER NOT NULL REFERENCES exercises(id),
    set_number INTEGER NOT NULL,
    reps INTEGER,
    weight REAL,
    completed BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS body_measurements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    weight REAL,
    chest REAL,
    waist REAL,
    hips REAL,
    bicep_left REAL,
    bicep_right REAL,
    thigh_left REAL,
    thigh_right REAL
);

CREATE TABLE IF NOT EXISTS health_daily_activity (
    date TEXT PRIMARY KEY,
    steps INTEGER,
    active_energy_kcal REAL,
    basal_energy_kcal REAL,
    distance_km REAL
);

CREATE TABLE IF NOT EXISTS health_heart_rate_daily (
    date TEXT PRIMARY KEY,
    min_bpm REAL,
    avg_bpm REAL,
    max_bpm REAL,
    resting_bpm REAL
);

CREATE TABLE IF NOT EXISTS health_sleep (
    night_date TEXT PRIMARY KEY,
    asleep_hours REAL,
    in_bed_hours REAL,
    source TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS health_body_composition (
    date TEXT PRIMARY KEY,
    weight_kg REAL,
    bmi REAL,
    body_fat_pct REAL,
    lean_body_mass_kg REAL
);

CREATE TABLE IF NOT EXISTS blood_panels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date DATE NOT NULL,
    lab_name TEXT,
    note TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blood_markers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    panel_id INTEGER NOT NULL REFERENCES blood_panels(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT,
    ref_low REAL,
    ref_high REAL,
    order_index INTEGER DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_session_sets_session ON session_sets(session_id);
CREATE INDEX IF NOT EXISTS idx_session_sets_exercise ON session_sets(exercise_id);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_date ON workout_sessions(date);
CREATE INDEX IF NOT EXISTS idx_training_days_plan ON training_days(plan_id);
CREATE INDEX IF NOT EXISTS idx_tde_day ON training_day_exercises(training_day_id);
CREATE INDEX IF NOT EXISTS idx_measurements_date ON body_measurements(date);
CREATE INDEX IF NOT EXISTS idx_blood_markers_panel ON blood_markers(panel_id);
CREATE INDEX IF NOT EXISTS idx_blood_markers_name ON blood_markers(name);
CREATE INDEX IF NOT EXISTS idx_blood_panels_date ON blood_panels(date);
"""


def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.executescript(SCHEMA)
        conn.commit()


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_conn():
    conn = _connect()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


def row_to_dict(row: sqlite3.Row | None):
    return dict(row) if row is not None else None


def rows_to_list(rows):
    return [dict(r) for r in rows]
