import os
from flask import Flask, render_template, request, jsonify, session, redirect, url_for
import psycopg2  # 💡 SQLite 대신 외부 클라우드 DB용 라이브러리 사용
from werkzeug.security import generate_password_hash, check_password_hash

app = Flask(__name__)
app.secret_key = 'your_very_secret_key_here'

# 💡 [필수 변경] 아까 Supabase에서 복사한 URI 주소를 여기에 붙여넣으세요.
# 비밀번호 칸([YOUR-PASSWORD])에 본인 DB 패스워드가 잘 들어갔는지 확인하세요!
DB_URI = "postgresql://postgres.xxxx:your_password@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"


def get_db_connection():
    # 외부 클라우드 DB에 접속하는 함수
    conn = psycopg2.connect(DB_URI)
    return conn


def init_db():
    # PostgreSQL 문법에 맞춘 테이블 자동 생성 로직
    conn = get_db_connection()
    cursor = conn.cursor()

    # 1. 유저 테이블 생성
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user'
        )
    ''')

    # 2. 스코어 테이블 생성
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS scores (
            id SERIAL PRIMARY KEY,
            username TEXT NOT NULL,
            score INTEGER NOT NULL,
            max_tile INTEGER NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')

    # 3. 기본 관리자 계정(admin) 자동 생성
    cursor.execute("SELECT COUNT(*) FROM users")
    count = cursor.fetchone()[0]
    if count == 0:
        hashed_pw = generate_password_hash('1234')
        cursor.execute(
            "INSERT INTO users (username, password, role) VALUES (%s, %s, %s)",
            ('admin', hashed_pw, 'admin')
        )

    conn.commit()
    cursor.close()
    conn.close()


# 앱 실행 시 DB 초기화 및 테이블 원격 생성
init_db()


@app.route('/')
def index():
    if 'username' not in session:
        return redirect(url_for('login'))

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT MAX(score) FROM scores WHERE username = %s", (session['username'],))
    best_score = cursor.fetchone()[0]
    best_score = best_score if best_score is not None else 0

    cursor.close()
    conn.close()
    return render_template('index.html', username=session['username'], best_score=best_score)


@app.route('/login/', methods=['GET', 'POST'])
def login():
    error = None
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']

        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM users WHERE username = %s", (username,))
        user = cursor.fetchone()
        cursor.close()
        conn.close()

        # 비밀번호 해시 검증 연동
        if user and (check_password_hash(user[2], password) or user[2] == password):
            session['username'] = user[1]
            session['role'] = user[3]
            if user[3] == 'admin':
                return redirect(url_for('admin_dashboard'))
            return redirect(url_for('index'))
        else:
            error = "아이디 또는 비밀번호가 올바르지 않습니다."

    return render_template('login.html', error=error)


@app.route('/register/', methods=['GET', 'POST'])
def register():
    error = None
    success = None
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        hashed_password = generate_password_hash(password)

        conn = get_db_connection()
        cursor = conn.cursor()
        try:
            cursor.execute(
                "INSERT INTO users (username, password) VALUES (%s, %s)",
                (username, hashed_password)
            )
            conn.commit()
            success = "회원가입이 완료되었습니다! 로그인 해주세요."
        except psycopg2.IntegrityError:
            conn.rollback()
            error = "이미 존재하는 아이디입니다."
        finally:
            cursor.close()
            conn.close()

    return render_template('register.html', error=error, success=success)


@app.route('/logout/')
def logout():
    session.clear()
    return redirect(url_for('login'))


@app.route('/save_score/', methods=['POST'])
def save_score():
    if 'username' not in session:
        return jsonify({'result': 'fail', 'message': '로그인이 필요합니다.'})

    data = request.get_json()
    score = data.get('score')
    max_tile = data.get('max_tile')

    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO scores (username, score, max_tile) VALUES (%s, %s, %s)",
        (session['username'], score, max_tile)
    )
    conn.commit()
    cursor.close()
    conn.close()

    return jsonify({'result': 'success'})


@app.route('/ranking/')
def ranking():
    conn = get_db_connection()
    cursor = conn.cursor()
    # 유저별 역대 최고 기록 Top 10 추출
    cursor.execute('''
        SELECT username, MAX(score) as max_score, MAX(max_tile) as max_tile 
        FROM scores 
        GROUP BY username 
        ORDER BY max_score DESC 
        LIMIT 10
    ''')
    rows = cursor.fetchall()
    cursor.close()
    conn.close()

    rank_html = ""
    for idx, row in enumerate(rows):
        rank_html += f"<tr><td>{idx + 1}</td><td>{row[0]}</td><td>{row[1]}점</td><td>{row[2]} 블록</td></tr>"

    if not rank_html:
        rank_html = "<tr><td colspan='4'>아직 기록이 없습니다. 첫 주인공이 되어보세요!</td></tr>"

    return render_template('ranking.html', rankList=rank_html)


@app.route('/admin/')
def admin_dashboard():
    if 'role' not in session or session['role'] != 'admin':
        return "권한이 없습니다.", 403

    conn = get_db_connection()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM users")
    user_count = cursor.fetchone()[0]

    cursor.execute("SELECT COUNT(*) FROM scores")
    score_count = cursor.fetchone()[0]

    cursor.execute("SELECT id, username, password, role FROM users ORDER BY id ASC")
    users = cursor.fetchall()

    cursor.execute("SELECT id, username, score, max_tile, created_at FROM scores ORDER BY id DESC")
    scores = cursor.fetchall()

    cursor.close()
    conn.close()

    return render_template('admin.html', userCount=user_count, scoreCount=score_count, users=users, scores=scores)


@app.route('/admin/delete/<int:user_id>/')
def admin_delete_user(user_id):
    if 'role' not in session or session['role'] != 'admin': return "권한 없음", 403
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM users WHERE id = %s", (user_id,))
    conn.commit()
    cursor.close()
    conn.close()
    return redirect(url_for('admin_dashboard'))


@app.route('/admin/role/<int:user_id>/')
def admin_toggle_role(user_id):
    if 'role' not in session or session['role'] != 'admin': return "권한 없음", 403
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT role FROM users WHERE id = %s", (user_id,))
    current_role = cursor.fetchone()[0]
    new_role = 'user' if current_role == 'admin' else 'admin'
    cursor.execute("UPDATE users SET role = %s WHERE id = %s", (new_role, user_id))
    conn.commit()
    cursor.close()
    conn.close()
    return redirect(url_for('admin_dashboard'))


@app.route('/admin/score/delete/<int:score_id>/')
def admin_delete_score(score_id):
    if 'role' not in session or session['role'] != 'admin': return "권한 없음", 403
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM scores WHERE id = %s", (score_id,))
    conn.commit()
    cursor.close()
    conn.close()
    return redirect(url_for('admin_dashboard'))


if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)