from datetime import date, datetime
from typing import Optional
from pydantic import BaseModel, Field


class ExerciseIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class Exercise(BaseModel):
    id: int
    name: str
    created_at: datetime


class PlanIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)


class Plan(BaseModel):
    id: int
    name: str
    created_at: datetime


class DayIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    order_index: int = 0


class Day(BaseModel):
    id: int
    plan_id: int
    name: str
    order_index: int


class DayExerciseIn(BaseModel):
    exercise_id: int
    sets: int = 3
    reps: int = 10
    order_index: int = 0


class DayExercisePatch(BaseModel):
    sets: Optional[int] = None
    reps: Optional[int] = None
    order_index: Optional[int] = None
    exercise_id: Optional[int] = None


class DayExercise(BaseModel):
    id: int
    training_day_id: int
    exercise_id: int
    exercise_name: str
    sets: int
    reps: int
    order_index: int


class SessionStart(BaseModel):
    training_day_id: int
    date: date


class SessionRow(BaseModel):
    id: int
    training_day_id: Optional[int]
    training_day_name: Optional[str]
    plan_name: Optional[str]
    date: date
    started_at: Optional[datetime]
    finished_at: Optional[datetime]


class SetIn(BaseModel):
    exercise_id: int
    set_number: int
    reps: Optional[int] = None
    weight: Optional[float] = None
    completed: bool = True


class SetPatch(BaseModel):
    reps: Optional[int] = None
    weight: Optional[float] = None
    completed: Optional[bool] = None


class SetRow(BaseModel):
    id: int
    session_id: int
    exercise_id: int
    set_number: int
    reps: Optional[int]
    weight: Optional[float]
    completed: bool


class MeasurementIn(BaseModel):
    date: date
    weight: Optional[float] = None
    chest: Optional[float] = None
    waist: Optional[float] = None
    hips: Optional[float] = None
    bicep_left: Optional[float] = None
    bicep_right: Optional[float] = None
    thigh_left: Optional[float] = None
    thigh_right: Optional[float] = None


class Measurement(MeasurementIn):
    id: int


class BloodMarkerIn(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    value: float
    unit: Optional[str] = None
    ref_low: Optional[float] = None
    ref_high: Optional[float] = None


class BloodPanelIn(BaseModel):
    date: date
    lab_name: Optional[str] = None
    note: Optional[str] = None
    markers: list[BloodMarkerIn] = []
