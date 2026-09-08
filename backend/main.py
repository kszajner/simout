from pathlib import Path
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .database import init_db
from .routers import exercises, training_plans, sessions, measurements, health, blood

app = FastAPI(title="SimOut", description="Simple Workout Tracker", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("startup")
def _startup():
    init_db()


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


@app.middleware("http")
async def no_cache_static(request, call_next):
    # This app redeploys frequently during development; without this, phone
    # browsers (Safari especially) hold onto old JS/CSS for a long time since
    # StaticFiles sets no Cache-Control at all, so heuristic caching kicks in.
    # `no-cache` still lets the browser cache, but forces an ETag revalidation
    # request every load, so a redeploy is picked up immediately.
    response = await call_next(request)
    if not request.url.path.startswith("/api"):
        response.headers["Cache-Control"] = "no-cache"
    return response


app.include_router(exercises.router)
app.include_router(training_plans.router)
app.include_router(sessions.router)
app.include_router(measurements.router)
app.include_router(health.router)
app.include_router(blood.router)

# Mount the SPA last so /api/* routes win.
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"
if FRONTEND_DIR.is_dir():
    app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")
