import os

ROLE = []
MSG = []

USERS_DIR = os.path.join(os.path.dirname(__file__), 'users')

def get_username_rank(username):
    username = str(username)
    files = [f for f in os.listdir(USERS_DIR) if f.endswith('.json')]
    files.sort()

    my_file = f"{username}.json"
    if my_file not in files:
        return None
    
    rank = files.index(my_file)
    return rank

def get_users():
    u = []
    files = [f for f in os.listdir(USERS_DIR) if f.endswith('.json')]
    files.sort()
    for f in files:
        u.append(f[:-5])
    return u