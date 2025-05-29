import threading
import queue
import time
from typing import List, Optional

class CallbackHandler:
    def on_text(self, text: str) -> None:
        raise NotImplementedError("on_text must be implemented by subclasses.")

class QueueCallback(CallbackHandler):
    def __init__(self, q: queue.Queue):
        self.q = q

    def on_text(self, text: str) -> None:
        self.q.put(text)

class ThreadedLLM:
    def __init__(self, callback: Optional[CallbackHandler] = None):
        self.callback = callback
        self.thread = None
        self.response = None
        self.greetings = [
            "Hello!",
            "Hi there!",
            "Greetings!",
            "Hey!",
            "Howdy!"
        ]

    def _generate_response(self, prompt: str) -> str:
        return self.greetings[len(prompt) % 5]

    def _chunk_text(self, text: str, chunk_size: int = 5) -> List[str]:
        return [text[i : i + chunk_size] for i in range(0, len(text), chunk_size)]

    def _worker(self, prompt: str):
        self.response = self._generate_response(prompt)
        for chunk in self._chunk_text(self.response):
            if self.callback:
                self.callback.on_text(chunk)
            time.sleep(0.1)

    def generate_async(self, prompt: str):
        self.thread = threading.Thread(target=self._worker, args=(prompt,))
        self.thread.start()

    def is_done(self) -> bool:
        return self.response is not None
    
def get_msg(prompt):
    q = queue.Queue()
    callback = QueueCallback(q)
    msg_maker = ThreadedLLM(callback=callback)

    msg_maker.generate_async(prompt)
    while True:
        try:
            chunk = q.get(timeout=0.5)
            print(f"Received chunk: {chunk}")
        except queue.Empty:
            if msg_maker.is_done() and q.empty():
                break
    return msg_maker.response