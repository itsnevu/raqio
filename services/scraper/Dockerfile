# Image worker (python worker.py): job riset pasar, cek kontak, profil IG, dan chat agent. Service HTTP Python legacy sudah dihapus.
# Tag image harus sama dengan pin playwright== di requirements.txt (Chromium di image cocok dengan driver pip).
FROM mcr.microsoft.com/playwright/python:v1.64.0-noble
WORKDIR /app
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    RAQIO_DATA_DIR=/app/cache
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY --chown=pwuser:pwuser . .
# Chromium membuka situs tidak tepercaya: jangan jalan sebagai root. pwuser sudah ada di image Playwright.
# /app/cache = volume ig.db di compose; dibuat di sini supaya volume baru mewarisi pemilik pwuser.
RUN mkdir -p /app/cache && chown pwuser:pwuser /app/cache
USER pwuser
CMD ["python", "worker.py"]
