import importlib
import io
import os
import sys
import tempfile
import unittest


class PageNoteTestCase(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp_dir = tempfile.TemporaryDirectory()
        os.environ["DB_PATH"] = os.path.join(cls.temp_dir.name, "test.sqlite3")
        os.environ["PAGENOTE_ADMIN_USERNAME"] = "root-test"
        os.environ["PAGENOTE_ADMIN_PASSWORD"] = "test-password"
        os.environ["SESSION_SECRET"] = "test-session-secret"
        sys.modules.pop("app", None)
        cls.module = importlib.import_module("app")
        cls.module.app.config.update(TESTING=True)

    @classmethod
    def tearDownClass(cls):
        cls.temp_dir.cleanup()

    def setUp(self):
        with self.module.connect_db() as db:
            db.execute("DELETE FROM pagenote_replies")
            db.execute("DELETE FROM pagenote_notes")
            db.execute("DELETE FROM pagenote_projects")
        self.client = self.module.app.test_client()

    def create_project(self):
        response = self.client.post(
            "/api/pagenote/projects",
            data={
                "title": "评审页面",
                "author": "测试员",
                "file": (io.BytesIO(b"<!doctype html><h1 id='title'>Demo</h1>"), "demo.html"),
            },
            content_type="multipart/form-data",
        )
        self.assertEqual(response.status_code, 201)
        return response.get_json()["project"]["id"]

    def admin_login(self):
        response = self.client.post(
            "/login",
            data={"username": "root-test", "password": "test-password"},
        )
        self.assertEqual(response.status_code, 302)

    def test_health_and_static_pages(self):
        self.assertEqual(self.client.get("/health").get_json()["status"], "ok")
        index_response = self.client.get("/pagenote/")
        login_response = self.client.get("/login")
        self.assertEqual(index_response.status_code, 200)
        self.assertEqual(login_response.status_code, 200)
        index_response.close()
        login_response.close()
        self.assertEqual(self.client.get("/pagenote/root").status_code, 302)

    def test_shared_project_annotation_and_reply_flow(self):
        project_id = self.create_project()
        share = self.client.get(f"/pagenote/project/{project_id}")
        self.assertEqual(share.status_code, 200)
        share.close()
        content = self.client.get(f"/api/pagenote/projects/{project_id}/content")
        self.assertIn(b"Demo", content.data)

        note = self.client.post(
            f"/api/pagenote/projects/{project_id}/notes",
            json={"author": "张三", "selector": "#title", "label": "标题", "text": "请调整文案", "rx": 0.5, "ry": 0.5},
        )
        self.assertEqual(note.status_code, 201)
        note_id = note.get_json()["notes"][0]["id"]

        reply = self.client.post(
            f"/api/pagenote/notes/{note_id}/replies",
            json={"author": "李四", "text": "已收到"},
        )
        self.assertEqual(reply.status_code, 201)
        self.assertEqual(reply.get_json()["notes"][0]["replies"][0]["author"], "李四")

        resolved = self.client.patch(
            f"/api/pagenote/notes/{note_id}",
            json={"author": "李四", "status": "resolved"},
        )
        self.assertTrue(resolved.get_json()["notes"][0]["resolved"])

    def test_admin_can_rename_replace_and_permanently_delete(self):
        project_id = self.create_project()
        note_response = self.client.post(
            f"/api/pagenote/projects/{project_id}/notes",
            json={"author": "张三", "selector": "#title", "label": "标题", "text": "待删除", "rx": 0.5, "ry": 0.5},
        )
        note_id = note_response.get_json()["notes"][0]["id"]
        self.client.post(
            f"/api/pagenote/notes/{note_id}/replies",
            json={"author": "李四", "text": "一并删除"},
        )
        self.admin_login()
        headers = {"X-PageNote-Admin": "1"}

        renamed = self.client.patch(
            f"/api/pagenote/admin/projects/{project_id}",
            json={"title": "新名称"},
            headers=headers,
        )
        self.assertEqual(renamed.status_code, 200)
        self.assertEqual(renamed.get_json()["projects"][0]["title"], "新名称")

        replaced = self.client.post(
            f"/api/pagenote/admin/projects/{project_id}/content",
            data={"file": (io.BytesIO(b"<!doctype html><p>Replacement</p>"), "replacement.html")},
            content_type="multipart/form-data",
            headers=headers,
        )
        self.assertEqual(replaced.status_code, 200)

        deleted = self.client.delete(
            f"/api/pagenote/admin/projects/{project_id}",
            headers=headers,
        )
        self.assertEqual(deleted.status_code, 200)
        self.assertEqual(self.client.get(f"/api/pagenote/projects/{project_id}").status_code, 404)
        self.assertEqual(self.client.get(f"/api/pagenote/projects/{project_id}/content").status_code, 404)
        with self.module.connect_db() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM pagenote_projects").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM pagenote_notes").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM pagenote_replies").fetchone()[0], 0)


if __name__ == "__main__":
    unittest.main()
