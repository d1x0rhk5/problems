import psycopg2
from psycopg2.extensions import ISOLATION_LEVEL_AUTOCOMMIT

def init_db(db_url: str):
    conn = psycopg2.connect(db_url)
    conn.set_isolation_level(ISOLATION_LEVEL_AUTOCOMMIT)
    cur = conn.cursor()

    cur.execute("""
    CREATE TABLE IF NOT EXISTS people (
        name TEXT PRIMARY KEY,
        age INTEGER NOT NULL,
        location TEXT,
        birthday DATE
    );
    """)

    sample_data = [
        ('Alice', 30, 'Seoul', '1995-07-12'),
        ('Bob', 25, 'Busan', '2000-01-23'),
        ('Charlie', 40, 'Incheon', '1985-12-05'),
    ]

    for name, age, location, birthday in sample_data:
        cur.execute(
            """
            INSERT INTO people (name, age, location, birthday)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (name) DO UPDATE
              SET age = EXCLUDED.age,
                  location = EXCLUDED.location,
                  birthday = EXCLUDED.birthday;
            """,
            (name, age, location, birthday)
        )
    cur.close()
    conn.close()

if __name__ == '__main__':
    db_url = 'postgres://user:pass@localhost:5432/mydb'
    init_db(db_url)
