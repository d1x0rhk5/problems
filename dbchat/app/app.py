import os
import json
from flask import Flask, render_template, request, redirect, url_for, session, jsonify
import hashlib
from simple_llm import get_msg
from auth import admin_required, login_required
from common import get_username_rank, get_users, ROLE, MSG
from sql_llm import Answer

app = Flask(__name__)
app.secret_key = os.environ.get('SECRET_KEY', 'dev_secret_key')

USERS_DIR = os.path.join(os.path.dirname(__file__), 'users')
os.makedirs(USERS_DIR, exist_ok=True)

ROLE.append('admin')
MSG.append("HELLO")

def hash_password(password: str) -> str:
    return hashlib.sha256(password.encode('utf-8')).hexdigest()

def load_user(username):
    username = str(username)
    filename = f"{username}.json"
    path = os.path.join(USERS_DIR, filename)
    
    real_path = os.path.realpath(path)
    users_dir_real = os.path.realpath(USERS_DIR)
    if not real_path.startswith(users_dir_real + os.sep):
        return None

    if not os.path.isfile(path):
        return None
    
    with open(path, 'r', encoding='utf-8') as f:
        return json.load(f)

def save_user(username, password_hash):
    username = str(username)
    filename = f"{username}.json"
    path = os.path.join(USERS_DIR, filename)
     
    real_path = os.path.realpath(path)
    users_dir_real = os.path.realpath(USERS_DIR)
    if not real_path.startswith(users_dir_real + os.sep):
        return None
    
    if os.path.isfile(path):
        return None

    with open(path, 'w', encoding='utf-8') as f:
        json.dump({
            "username": username,
            "password_hash": password_hash
        }, f, ensure_ascii=False, indent=2)

@app.route('/login', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        data = request.get_json() or {}
        username = data.get('username', '')
        password = data.get('password', '')

        user = load_user(username)
        if user and user['password_hash'] == hash_password(password):
            session['username'] = username
            return jsonify(success=True, redirect=url_for('index'))
        else:
            return jsonify(success=False, message='ID or password is not valid'), 400

    return render_template('login.html')

@app.route('/register', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        data = request.get_json() or {}
        username = data.get('username', '')
        pw1 = data.get('password', '')
        pw2 = data.get('confirm_password', '')
        role = data.get('role', '')

        if not username:
            return jsonify(success=False, message='Please enter your ID'), 400
        if load_user(username):
            return jsonify(success=False, message='The ID is already in use'), 400
        if not pw1 or not pw2:
            return jsonify(success=False, message='Please enter your password'), 400
        if pw1 != pw2:
            return jsonify(success=False, message='Password does not match'), 400
        if role == 'admin':
            return jsonify(success=False, message='role can not be admin'), 400

        pw_hash = hash_password(pw1)
        save_user(username, pw_hash)
        msg = get_msg(username)
        rank = get_username_rank(username)
        ROLE.insert(rank, role)
        MSG.insert(rank, msg)
        return jsonify(success=True, message='Registration successful! Please log in.'), 201

    return render_template('register.html')

@app.route('/')
@login_required
def index():
    rank = get_username_rank(session["username"])
    return f'{MSG[rank]}, {session["username"]}'

@app.route('/admin')
@admin_required
def admin():
        return f'hello, {session["username"]}, welcome to admin page'

@app.route('/admin/chat', methods=['GET', 'POST'])
@admin_required
def chat():
    if request.method == 'POST':
        data = request.get_json() or {}
        prompt = data.get('question', '').strip()
        print(prompt)
        answer = Answer(prompt)
        return jsonify(success=True, answer=answer)
    
    return render_template('chat.html')

@app.route('/admin/users')
@admin_required
def userlist():
    user_list = get_users()
    ret = ''
    for user in user_list:
        ret += user + ", "
    return ret[:-2]

@app.route('/logout')
def logout():
    session.clear()
    return redirect(url_for('login'))

if __name__ == '__main__':
    app.run(debug=True, port=5000)