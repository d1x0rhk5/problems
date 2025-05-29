import re
import threading
import queue
import time
import psycopg2
from psycopg2.extras import RealDictCursor
from typing import Optional, List
from simple_llm import QueueCallback

class PersonInfoExecutor:
    ALLOWED_FIELDS = {'name', 'age', 'location', 'birthday'}
    _pattern = re.compile(
        r"^\s*"
        r"what\s+is\s+"
        r"(?P<field>\w+)\s+of\s+"
        r"(?P<name>[^;]+?)"
        r"\s*\?*\s*$",
        re.IGNORECASE
    )

    def __init__(self, db_url: str, callback: Optional[object] = None):
        self.db_url = db_url
        self.callback = callback
        self.thread = None
        self.response = None

    def _generate_sql(self, prompt: str) -> (str, List):
        m = self._pattern.match(prompt)
        if not m:
            return None
        field = m.group("field").lower()
        name = m.group("name").strip()
        if field not in self.ALLOWED_FIELDS:
            return None
        sql = f"SELECT {field} FROM people WHERE name='{name}';"
        return sql

    def _execute_sql(self, sql: str) -> List[dict]:
        conn = psycopg2.connect(self.db_url, cursor_factory=RealDictCursor)
        conn.set_session(autocommit=True)
        try:
            with conn.cursor() as cur:
                cur.execute(sql, ())
                return cur.fetchall()
        finally:
            conn.close()

    def _worker(self, prompt: str):
        try:
            sql = self._generate_sql(prompt)
            rows = self._execute_sql(sql)
            if not rows:
                out = "no result"
            else:
                first_row = rows[0]
                value = next(iter(first_row.values()))
                out = str(value)
        except Exception as e:
            out = f"{e}"
        self.response = out

        for i in range(0, len(out), 100):
            if self.callback:
                self.callback.on_text(out[i : i + 100])
            time.sleep(0.05)

    def generate_async(self, prompt: str):
        self.thread = threading.Thread(
            target=self._worker, args=(prompt,), daemon=True
        )
        self.thread.start()

    def is_done(self) -> bool:
        return self.response is not None
    
def Answer(prompt):
    from queue import Queue
    DB_URL = "postgres://user:pass@localhost:5432/mydb"
    q = Queue()
    executor = PersonInfoExecutor(db_url=DB_URL, callback=QueueCallback(q))
    executor.generate_async(prompt)

    while True:
        try:
            chunk = q.get(timeout=0.5)
        except queue.Empty:
            if executor.is_done() and q.empty():
                break

    return executor.response
