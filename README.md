# SimOut — Simple Workout

A single-user workout tracker. FastAPI + vanilla JS SPA + SQLite.

- **Port**: 8090
- **Persistent data**: `/mnt/ssd/docker/simout/data`
- **No auth**: intended to be reached over WireGuard

Interactive API docs at `/docs` once the server is running.

## Run locally

```bash
python -m venv .venv
. .venv/Scripts/activate     # Windows
# . .venv/bin/activate       # macOS/Linux
pip install -r requirements.txt

SIMOUT_DATA_DIR=./data uvicorn backend.main:app --reload --port 8090
```

Open <http://localhost:8090>. The database is created automatically at `./data/simout.db` on first request.

---

## Deploy to Raspberry Pi (Linux, no Docker)

Assumes Pi 5 / Debian, SSH access, Python 3.11+, SSD mounted at `/mnt/ssd`.

### 1. Copy the project

From your dev machine:

```bash
rsync -av --exclude '.venv' --exclude 'data' --exclude '__pycache__' \
    ./ pi@raspberrypi.local:/srv/simout/
```

### 2. Prepare the data directory

On the Pi:

```bash
sudo mkdir -p /mnt/ssd/docker/simout/data
sudo chown -R $USER:$USER /mnt/ssd/docker/simout/data
```

### 3. Install dependencies

On the Pi, in `/srv/simout`:

```bash
python3 -m venv .venv
.venv/bin/pip install --upgrade pip
.venv/bin/pip install -r requirements.txt
```

Quick test it boots:

```bash
SIMOUT_DATA_DIR=/mnt/ssd/docker/simout/data \
    .venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8090
```

Open `http://<pi-host>:8090` to confirm. Then Ctrl-C.

### 4. Run as a systemd service

Create `/etc/systemd/system/simout.service`:

```ini
[Unit]
Description=SimOut workout tracker
After=network.target

[Service]
Type=simple
User=pi
WorkingDirectory=/srv/simout
Environment=SIMOUT_DATA_DIR=/mnt/ssd/docker/simout/data
ExecStart=/srv/simout/.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8090
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

(Replace `User=pi` with your actual username if different.)

Enable and start:

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now simout
sudo systemctl status simout
```

### 5. Verify

```bash
curl http://localhost:8090/api/health
```

Reach it from your phone over WireGuard at `http://<pi-host>:8090`.

### Update later

```bash
rsync -av --exclude '.venv' --exclude 'data' ./ pi@raspberrypi.local:/srv/simout/
ssh pi@raspberrypi.local "sudo systemctl restart simout"
```

### Back up

```bash
cp /mnt/ssd/docker/simout/data/simout.db ~/backup/simout-$(date +%F).db
```
