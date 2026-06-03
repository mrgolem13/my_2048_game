from flask import Flask, request, redirect, render_template, session, jsonify
import sqlite3
from datetime import datetime
import os

app = Flask(__name__)
app.secret_key = '12345'  # 기존 시크릿 키 유지

def get_db():
    conn = sqlite3.connect('game2048.db')
    cursor = conn.cursor()
    return conn, cursor

def init_db():
    conn, cursor = get_db()
    # 1. 유저 테이블
    cursor.execute('''create table if not exists users (
        id integer primary key autoincrement,
        username text,
        password text,
        role text default 'user'
    )''')
    # 2. 점수 기록 테이블
    cursor.execute('''create table if not exists scores (
        id integer primary key autoincrement,
        username text,
        score integer,
        max_tile integer,
        date text
    )''')
    # 관리자 계정 생성
    cursor.execute('select count(*) from users')
    count = cursor.fetchone()[0]
    if count == 0:
        cursor.execute(
            "insert into users (username, password, role) values (?,?,?)",
            ('admin', '1234', 'admin')
        )
    conn.commit()
    conn.close()

init_db()

@app.route('/')
def index():
    if 'username' not in session:
        return redirect('/login/')

    current_user = session['username']
    current_role = session.get('role', 'user')  # 💡 관리자 여부 확인용 세션 추출

    conn, cursor = get_db()
    cursor.execute('select max(score) from scores where username = ?', (current_user,))
    best_score = cursor.fetchone()[0]
    if best_score is None:
        best_score = 0
    conn.close()

    # 💡 index.html로 role(권한) 정보도 함께 넘겨줍니다.
    return render_template('index.html', username=current_user, best_score=best_score, role=current_role)

@app.route('/save_score/', methods=['POST'])
def save_score():
    if 'username' not in session:
        return jsonify({'result': 'fail', 'message': '로그인이 필요합니다.'}), 401

    data = request.get_json()
    score = data.get('score')
    max_tile = data.get('max_tile')
    username = session['username']
    date = datetime.now().strftime('%Y-%m-%d %H:%M')

    conn, cursor = get_db()
    cursor.execute(
        'insert into scores (username, score, max_tile, date) values (?, ?, ?, ?)',
        (username, score, max_tile, date)
    )
    conn.commit()
    conn.close()

    return jsonify({'result': 'success', 'best_score': score})

# 💡 [기능 개선 2] 팝업창에 데이터를 비동기로 쏴줄 JSON용 랭킹 API 추가
@app.route('/api/ranking/')
def api_ranking():
    if 'username' not in session:
        return jsonify({'result': 'fail', 'message': '로그인이 필요합니다.'}), 401

    conn, cursor = get_db()
    cursor.execute('''
        select username, max(score) as max_score, max(max_tile)
        from scores
        group by username
        order by max_score desc
        limit 10
    ''')
    rankings = cursor.fetchall()
    conn.close()

    rank_data = []
    for idx, row in enumerate(rankings):
        rank_data.append({
            'rank': idx + 1,
            'username': row[0],
            'score': row[1],
            'max_tile': row[2]
        })
    return jsonify({'result': 'success', 'rankings': rank_data})

# 기존 HTML 통째로 반환하는 라우트도 호환성을 위해 유지
@app.route('/ranking/')
def ranking():
    if 'username' not in session:
        return redirect('/login/')
    conn, cursor = get_db()
    cursor.execute('''
        select username, max(score) as max_score, max(max_tile)
        from scores
        group by username
        order by max_score desc
        limit 10
    ''')
    rankings = cursor.fetchall()
    conn.close()

    rankList = ''
    rank_num = 1
    for row in rankings:
        rankList += f'<tr><td>{rank_num}등</td><td>{row[0]}</td><td>{row[1]}점</td><td>{row[2]} 블록</td></tr>'
        rank_num += 1
    return render_template('ranking.html', rankList=rankList)

# --- [회원가입 / 로그인 / 로그아웃] ---
@app.route('/register/', methods=['GET', 'POST'])
def register():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        conn, cursor = get_db()
        cursor.execute('select * from users where username = ?', (username,))
        user = cursor.fetchone()
        if user:
            conn.close()
            return render_template('register.html', error='이미 존재하는 아이디입니다.', success='')
        cursor.execute('insert into users (username, password) values (?, ?)', (username, password))
        conn.commit()
        conn.close()
        session['username'] = username
        return render_template('register.html', error='', success='회원가입에 성공했습니다.')
    return render_template('register.html', error='', success='')

@app.route('/login/', methods=['GET', 'POST'])
def login():
    if request.method == 'POST':
        username = request.form['username']
        password = request.form['password']
        conn, cursor = get_db()
        cursor.execute('select * from users where username = ? and password = ?', (username, password))
        user = cursor.fetchone()
        conn.close()
        if user:
            session['username'] = user[1]
            session['role'] = user[3]
            if user[3] == 'admin':
                return redirect('/admin/')
            else:
                return redirect('/')
        else:
            return render_template('login.html', error='아이디 혹은 비밀번호가 일치하지 않습니다.')
    return render_template('login.html', error='')

@app.route('/logout/')
def logout():
    session.clear()
    return redirect('/')

# --- [관리자 전용 대시보드] ---
@app.route('/admin/')
def admin():
    if 'username' not in session:
        return redirect('/login/')
    if session.get('role') != 'admin':
        return redirect('/')

    conn, cursor = get_db()
    cursor.execute('select * from users')
    users = cursor.fetchall()
    cursor.execute('select * from scores order by id desc')
    scores = cursor.fetchall()
    cursor.execute('select count(*) from users')
    userCount = cursor.fetchone()[0]
    cursor.execute('select count(*) from scores')
    scoreCount = cursor.fetchone()[0]
    conn.close()

    return render_template('admin.html', users=users, scores=scores, userCount=userCount, scoreCount=scoreCount)

@app.route('/admin/delete/<id>/')
def admin_delete(id):
    if session.get('role') != 'admin': return redirect('/')
    conn, cursor = get_db()
    cursor.execute('delete from users where id = ?', (id,))
    conn.commit()
    conn.close()
    return redirect('/admin/')

@app.route('/admin/role/<id>/')
def admin_role(id):
    if session.get('role') != 'admin': return redirect('/')
    conn, cursor = get_db()
    cursor.execute('select role from users where id = ?', (id,))
    user = cursor.fetchone()
    newRole = 'admin' if user[0] == 'user' else 'user'
    cursor.execute('update users set role = ? where id=?', (newRole, id))
    conn.commit()
    conn.close()
    return redirect('/admin/')

@app.route('/admin/score/delete/<id>/')
def admin_score_delete(id):
    if session.get('role') != 'admin': return redirect('/')
    conn, cursor = get_db()
    cursor.execute('delete from scores where id = ?', (id,))
    conn.commit()
    conn.close()
    return redirect('/admin/')

if __name__ == '__main__':
    port = int(os.environ.get("PORT", 5000))
    app.run(host='0.0.0.0', port=port)

#app.run(debug=True)