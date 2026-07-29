import os
import secrets
import sqlite3
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from functools import wraps

from flask import Flask, Response, jsonify, redirect, request, session, url_for


app = Flask(__name__)
app.secret_key = os.environ.get("SESSION_SECRET", secrets.token_hex(32))
app.config.update(
    MAX_CONTENT_LENGTH=6 * 1024 * 1024,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("PAGENOTE_COOKIE_SECURE", "0") == "1",
)

DB_PATH = os.environ.get("DB_PATH", os.path.join(os.path.dirname(__file__), "data", "pagenote.sqlite3"))
ADMIN_USERNAME = os.environ.get("PAGENOTE_ADMIN_USERNAME", "admin")
ADMIN_PASSWORD = os.environ.get("PAGENOTE_ADMIN_PASSWORD", "")
MAX_HTML_BYTES = 5 * 1024 * 1024
LOGIN_WINDOW_SECONDS = 10 * 60
LOGIN_MAX_FAILURES = 5
_login_failures = {}


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def clean_text(value, max_length):
    if not isinstance(value, str):
        return ""
    return " ".join(value.strip().split())[:max_length]


@contextmanager
def connect_db():
    directory = os.path.dirname(DB_PATH)
    if directory:
        os.makedirs(directory, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.execute("PRAGMA busy_timeout = 5000")
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def initialize_db():
    with connect_db() as db:
        db.executescript(
            """
            CREATE TABLE IF NOT EXISTS pagenote_projects (
                id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                filename TEXT NOT NULL,
                html_content TEXT NOT NULL,
                created_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS pagenote_notes (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                selector TEXT NOT NULL,
                label TEXT NOT NULL,
                content TEXT NOT NULL,
                rx REAL NOT NULL,
                ry REAL NOT NULL,
                status TEXT NOT NULL DEFAULT 'open',
                author TEXT NOT NULL,
                updated_by TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                FOREIGN KEY(project_id) REFERENCES pagenote_projects(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS pagenote_replies (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                note_id INTEGER NOT NULL,
                content TEXT NOT NULL,
                author TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY(note_id) REFERENCES pagenote_notes(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_pagenote_notes_project ON pagenote_notes(project_id, id);
            CREATE INDEX IF NOT EXISTS idx_pagenote_replies_note ON pagenote_replies(note_id, id);
            PRAGMA user_version = 1;
            """
        )


def admin_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not session.get("pagenote_admin"):
            if request.path.startswith("/api/"):
                return jsonify({"error": "Please sign in to PageNote Root."}), 401
            session["after_login"] = "/pagenote/root"
            return redirect(url_for("login"))
        return view(*args, **kwargs)

    return wrapped


def read_html_upload():
    upload = request.files.get("file")
    if upload is None or not upload.filename:
        return None, (jsonify({"error": "请选择 HTML 文件。"}), 400)
    if not upload.filename.lower().endswith((".html", ".htm")):
        return None, (jsonify({"error": "只支持 .html 或 .htm 文件。"}), 400)
    raw = upload.stream.read(MAX_HTML_BYTES + 1)
    if len(raw) > MAX_HTML_BYTES:
        return None, (jsonify({"error": "HTML 文件不能超过 5 MB。"}), 413)
    try:
        content = raw.decode("utf-8-sig")
    except UnicodeDecodeError:
        try:
            content = raw.decode("gb18030")
        except UnicodeDecodeError:
            return None, (jsonify({"error": "HTML 文件需使用 UTF-8 或 GB18030 编码。"}), 400)
    if not content.strip():
        return None, (jsonify({"error": "HTML 文件内容为空。"}), 400)
    return (clean_text(upload.filename, 160), content), None


def project_state(db, project_id):
    project = db.execute(
        "SELECT id, title, filename, created_by, created_at, updated_at FROM pagenote_projects WHERE id = ?",
        (project_id,),
    ).fetchone()
    if project is None:
        return None
    replies = {}
    for row in db.execute(
        """
        SELECT r.id, r.note_id, r.content, r.author, r.created_at
        FROM pagenote_replies r
        JOIN pagenote_notes n ON n.id = r.note_id
        WHERE n.project_id = ? ORDER BY r.id
        """,
        (project_id,),
    ):
        replies.setdefault(row["note_id"], []).append(
            {"id": row["id"], "text": row["content"], "author": row["author"], "createdAt": row["created_at"]}
        )
    notes = []
    for row in db.execute(
        """
        SELECT id, selector, label, content, rx, ry, status, author, updated_by, created_at, updated_at
        FROM pagenote_notes WHERE project_id = ? ORDER BY id
        """,
        (project_id,),
    ):
        notes.append(
            {
                "id": row["id"],
                "selector": row["selector"],
                "label": row["label"],
                "text": row["content"],
                "rx": row["rx"],
                "ry": row["ry"],
                "status": row["status"],
                "resolved": row["status"] == "resolved",
                "author": row["author"],
                "updatedBy": row["updated_by"],
                "createdAt": row["created_at"],
                "updatedAt": row["updated_at"],
                "replies": replies.get(row["id"], []),
            }
        )
    return {
        "project": {
            "id": project["id"],
            "title": project["title"],
            "filename": project["filename"],
            "createdBy": project["created_by"],
            "createdAt": project["created_at"],
            "updatedAt": project["updated_at"],
            "shareUrl": url_for("pagenote_project", project_id=project["id"]),
        },
        "notes": notes,
    }


def admin_projects(db):
    return [
        {
            "id": row["id"],
            "title": row["title"],
            "filename": row["filename"],
            "htmlBytes": row["html_bytes"],
            "createdBy": row["created_by"],
            "createdAt": row["created_at"],
            "updatedAt": row["updated_at"],
            "noteCount": row["note_count"],
            "openCount": row["open_count"],
            "replyCount": row["reply_count"],
            "shareUrl": url_for("pagenote_project", project_id=row["id"]),
        }
        for row in db.execute(
            """
            SELECT p.id, p.title, p.filename, p.created_by, p.created_at, p.updated_at,
                   length(CAST(p.html_content AS BLOB)) AS html_bytes,
                   (SELECT COUNT(*) FROM pagenote_notes n WHERE n.project_id = p.id) AS note_count,
                   (SELECT COUNT(*) FROM pagenote_notes n WHERE n.project_id = p.id AND n.status = 'open') AS open_count,
                   (SELECT COUNT(*) FROM pagenote_replies r JOIN pagenote_notes n ON n.id = r.note_id WHERE n.project_id = p.id) AS reply_count
            FROM pagenote_projects p ORDER BY p.updated_at DESC, p.created_at DESC
            """
        )
    ]


def author_from(data):
    return clean_text(data.get("author"), 40)


def admin_mutation_allowed():
    return request.headers.get("X-PageNote-Admin") == "1"


@app.after_request
def security_headers(response):
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("X-Frame-Options", "SAMEORIGIN")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    return response


@app.get("/")
def index():
    return redirect(url_for("pagenote_index"))


@app.get("/health")
def health():
    with connect_db() as db:
        db.execute("SELECT COUNT(*) FROM pagenote_projects").fetchone()
    return jsonify({"status": "ok", "schema": 1})


@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "GET":
        return app.send_static_file("login.html")
    ip = request.remote_addr or "unknown"
    current = time.time()
    failures = [stamp for stamp in _login_failures.get(ip, []) if current - stamp < LOGIN_WINDOW_SECONDS]
    if len(failures) >= LOGIN_MAX_FAILURES:
        return redirect("/login?error=rate")
    username = request.form.get("username", "")
    password = request.form.get("password", "")
    valid = bool(ADMIN_PASSWORD) and secrets.compare_digest(username, ADMIN_USERNAME) and secrets.compare_digest(password, ADMIN_PASSWORD)
    if not valid:
        failures.append(current)
        _login_failures[ip] = failures
        return redirect("/login?error=invalid")
    destination = session.get("after_login")
    session.clear()
    session["pagenote_admin"] = True
    _login_failures.pop(ip, None)
    return redirect(destination if destination == "/pagenote/root" else "/pagenote/root")


@app.post("/logout")
def logout():
    session.clear()
    return redirect(url_for("login"))


@app.get("/pagenote/")
def pagenote_index():
    return app.send_static_file("index.html")


@app.get("/pagenote/annotator.js")
def pagenote_annotator():
    return app.send_static_file("annotator.js")


@app.get("/pagenote/project/<project_id>")
def pagenote_project(project_id):
    with connect_db() as db:
        exists = db.execute("SELECT 1 FROM pagenote_projects WHERE id = ?", (project_id,)).fetchone()
    return app.send_static_file("index.html") if exists else ("PageNote project not found", 404)


@app.get("/pagenote/root")
@admin_required
def pagenote_root():
    return app.send_static_file("admin.html")


@app.post("/api/pagenote/projects")
def create_project():
    upload, error = read_html_upload()
    if error:
        return error
    filename, content = upload
    author = clean_text(request.form.get("author"), 40)
    title = clean_text(request.form.get("title"), 100) or os.path.splitext(filename)[0]
    if not author:
        return jsonify({"error": "请填写你的名字。"}), 400
    timestamp = now_iso()
    with connect_db() as db:
        while True:
            project_id = secrets.token_urlsafe(12)
            if db.execute("SELECT 1 FROM pagenote_projects WHERE id = ?", (project_id,)).fetchone() is None:
                break
        db.execute(
            "INSERT INTO pagenote_projects VALUES (?, ?, ?, ?, ?, ?, ?)",
            (project_id, title, filename, content, author, timestamp, timestamp),
        )
        state = project_state(db, project_id)
    return jsonify(state), 201


@app.get("/api/pagenote/projects/<project_id>")
def get_project(project_id):
    with connect_db() as db:
        state = project_state(db, project_id)
    return (jsonify(state), 200) if state else (jsonify({"error": "分享项目不存在。"}), 404)


@app.get("/api/pagenote/projects/<project_id>/content")
def get_project_content(project_id):
    with connect_db() as db:
        row = db.execute("SELECT html_content FROM pagenote_projects WHERE id = ?", (project_id,)).fetchone()
    if row is None:
        return jsonify({"error": "分享项目不存在。"}), 404
    response = Response(row["html_content"], content_type="text/html; charset=utf-8")
    response.headers["Cache-Control"] = "no-store"
    return response


@app.post("/api/pagenote/projects/<project_id>/notes")
def create_note(project_id):
    data = request.get_json(silent=True) or {}
    author = author_from(data)
    selector = clean_text(data.get("selector"), 800)
    label = clean_text(data.get("label"), 100)
    content = clean_text(data.get("text"), 1000)
    try:
        rx = min(1.0, max(0.0, float(data.get("rx"))))
        ry = min(1.0, max(0.0, float(data.get("ry"))))
    except (TypeError, ValueError):
        return jsonify({"error": "批注位置无效。"}), 400
    if not author or not selector or not content:
        return jsonify({"error": "批注作者、位置和内容不能为空。"}), 400
    timestamp = now_iso()
    with connect_db() as db:
        if db.execute("SELECT 1 FROM pagenote_projects WHERE id = ?", (project_id,)).fetchone() is None:
            return jsonify({"error": "分享项目不存在。"}), 404
        db.execute(
            """
            INSERT INTO pagenote_notes
                (project_id, selector, label, content, rx, ry, author, updated_by, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (project_id, selector, label or selector[:100], content, rx, ry, author, author, timestamp, timestamp),
        )
        db.execute("UPDATE pagenote_projects SET updated_at = ? WHERE id = ?", (timestamp, project_id))
        state = project_state(db, project_id)
    return jsonify(state), 201


@app.patch("/api/pagenote/notes/<int:note_id>")
def update_note(note_id):
    data = request.get_json(silent=True) or {}
    author = author_from(data)
    if not author:
        return jsonify({"error": "请填写你的名字。"}), 400
    with connect_db() as db:
        note = db.execute("SELECT project_id, content, status FROM pagenote_notes WHERE id = ?", (note_id,)).fetchone()
        if note is None:
            return jsonify({"error": "批注不存在。"}), 404
        content = clean_text(data.get("text"), 1000) if "text" in data else note["content"]
        status = data.get("status", note["status"])
        if not content or status not in {"open", "resolved"}:
            return jsonify({"error": "批注内容或状态无效。"}), 400
        timestamp = now_iso()
        db.execute(
            "UPDATE pagenote_notes SET content = ?, status = ?, updated_by = ?, updated_at = ? WHERE id = ?",
            (content, status, author, timestamp, note_id),
        )
        db.execute("UPDATE pagenote_projects SET updated_at = ? WHERE id = ?", (timestamp, note["project_id"]))
        state = project_state(db, note["project_id"])
    return jsonify(state)


@app.delete("/api/pagenote/notes/<int:note_id>")
def delete_note(note_id):
    with connect_db() as db:
        note = db.execute("SELECT project_id FROM pagenote_notes WHERE id = ?", (note_id,)).fetchone()
        if note is None:
            return jsonify({"error": "批注不存在。"}), 404
        db.execute("DELETE FROM pagenote_notes WHERE id = ?", (note_id,))
        db.execute("UPDATE pagenote_projects SET updated_at = ? WHERE id = ?", (now_iso(), note["project_id"]))
        state = project_state(db, note["project_id"])
    return jsonify(state)


@app.post("/api/pagenote/notes/<int:note_id>/replies")
def create_reply(note_id):
    data = request.get_json(silent=True) or {}
    author = author_from(data)
    content = clean_text(data.get("text"), 600)
    if not author or not content:
        return jsonify({"error": "回复作者和内容不能为空。"}), 400
    with connect_db() as db:
        note = db.execute("SELECT project_id FROM pagenote_notes WHERE id = ?", (note_id,)).fetchone()
        if note is None:
            return jsonify({"error": "批注不存在。"}), 404
        timestamp = now_iso()
        db.execute("INSERT INTO pagenote_replies (note_id, content, author, created_at) VALUES (?, ?, ?, ?)", (note_id, content, author, timestamp))
        db.execute("UPDATE pagenote_projects SET updated_at = ? WHERE id = ?", (timestamp, note["project_id"]))
        state = project_state(db, note["project_id"])
    return jsonify(state), 201


@app.get("/api/pagenote/admin/projects")
@admin_required
def get_admin_projects():
    with connect_db() as db:
        projects = admin_projects(db)
    return jsonify({"projects": projects})


@app.patch("/api/pagenote/admin/projects/<project_id>")
@admin_required
def update_admin_project(project_id):
    if not admin_mutation_allowed():
        return jsonify({"error": "管理请求校验失败。"}), 403
    title = clean_text((request.get_json(silent=True) or {}).get("title"), 100)
    if not title:
        return jsonify({"error": "项目名称不能为空。"}), 400
    with connect_db() as db:
        result = db.execute("UPDATE pagenote_projects SET title = ?, updated_at = ? WHERE id = ?", (title, now_iso(), project_id))
        if result.rowcount == 0:
            return jsonify({"error": "项目不存在。"}), 404
        projects = admin_projects(db)
    return jsonify({"projects": projects})


@app.post("/api/pagenote/admin/projects/<project_id>/content")
@admin_required
def replace_admin_content(project_id):
    if not admin_mutation_allowed():
        return jsonify({"error": "管理请求校验失败。"}), 403
    upload, error = read_html_upload()
    if error:
        return error
    filename, content = upload
    with connect_db() as db:
        result = db.execute(
            "UPDATE pagenote_projects SET filename = ?, html_content = ?, updated_at = ? WHERE id = ?",
            (filename, content, now_iso(), project_id),
        )
        if result.rowcount == 0:
            return jsonify({"error": "项目不存在。"}), 404
        projects = admin_projects(db)
    return jsonify({"projects": projects})


@app.delete("/api/pagenote/admin/projects/<project_id>")
@admin_required
def delete_admin_project(project_id):
    if not admin_mutation_allowed():
        return jsonify({"error": "管理请求校验失败。"}), 403
    with connect_db() as db:
        result = db.execute("DELETE FROM pagenote_projects WHERE id = ?", (project_id,))
        if result.rowcount == 0:
            return jsonify({"error": "项目不存在。"}), 404
    return jsonify({"deleted": project_id})


initialize_db()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", "8000")))
