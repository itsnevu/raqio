# Satu image untuk worker (python worker.py) dan service legacy IG (python app.py).
FROM mcr.microsoft.com/playwright/python:v1.47.0-jammy
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt "psycopg[binary]>=3.2"
COPY . .
ENV PYTHONUNBUFFERED=1
CMD ["python", "worker.py"]
