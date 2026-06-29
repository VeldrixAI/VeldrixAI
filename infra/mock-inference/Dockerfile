# Deterministic inference stub — zero third-party deps, stdlib only.
FROM python:3.12-slim

WORKDIR /app
COPY app.py /app/app.py

EXPOSE 9009
# Lightweight, deterministic, free. Started only under the compose "stub" profile.
CMD ["python", "/app/app.py"]
