FROM python:3.12-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      gcc \
      postgresql postgresql-contrib \
      libpq-dev python3-dev \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY app/ /app/

COPY flag.c .

ENV PYTHONUNBUFFERED=1
RUN pip install --no-cache-dir \
      flask \
      psycopg2-binary

RUN service postgresql start \
 && su postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE USER \\\"user\\\" WITH SUPERUSER PASSWORD 'pass';\"" \
 && su postgres -c "psql -v ON_ERROR_STOP=1 -c \"CREATE DATABASE mydb OWNER \\\"user\\\";\"" \
 && python3 /app/init_people.py \
 && service postgresql stop

RUN chmod 0711 /app \
 && chmod 0711 /app/* \
 && chmod 0777 /app/users

RUN gcc -o flag flag.c

RUN rm flag.c

RUN chmod 0111 flag

ENV FLASK_APP=app.py \
    FLASK_RUN_HOST=0.0.0.0 \
    FLASK_RUN_PORT=5000

EXPOSE 5000

CMD ["sh", "-c", "\
    service postgresql start && \
    flask run \
"]
