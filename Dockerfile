FROM python:3-slim

WORKDIR /app
COPY server.py index.html styles.css app.js ./
COPY readers/ ./readers/

ENV DATA_ROOT=/data \
    HOST=0.0.0.0 \
    PORT=1999

EXPOSE 1999
CMD ["python", "server.py"]
