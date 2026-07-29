# PageNote

PageNote 是一个轻量的共享网页批注工具。上传单文件 HTML 后会生成独立分享链接，访问者无需登录即可查看页面、添加批注、回复并更新处理状态。

## 功能

- 上传 `.html` / `.htm` 文件并生成随机分享链接
- 多人共享批注、回复、作者、时间和处理状态
- SQLite 持久化，无需单独部署数据库
- 上传页面在沙箱 iframe 中运行
- `/pagenote/root` 管理台支持改名、替换 HTML 和永久删除项目
- 管理员登录限速、会话 Cookie 和基础安全响应头
- Docker Compose 一键部署

## Docker 部署

```bash
cp .env.example .env
```

编辑 `.env`，至少替换管理员密码和会话密钥。可使用下面的命令生成会话密钥：

```bash
python -c "import secrets; print(secrets.token_hex(32))"
```

启动服务：

```bash
docker compose up -d --build
```

打开：

- PageNote：`http://localhost:8000/pagenote/`
- 管理台：`http://localhost:8000/pagenote/root`
- 健康检查：`http://localhost:8000/health`

数据库保存在 Docker 命名卷 `pagenote-data` 中。升级容器不会删除项目数据；执行 `docker compose down -v` 会删除该卷及其中的全部数据。

生产环境使用 HTTPS 时，将 `PAGENOTE_COOKIE_SECURE` 设置为 `1`。若通过 Nginx 部署在域名下，请将请求反向代理到容器的 `8000` 端口。

## 本地运行

```bash
python -m venv .venv
# Windows: .venv\Scripts\activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements.txt
```

设置环境变量后运行：

```bash
python app.py
```

首次启动时会自动创建 `data/pagenote.sqlite3`。`examples/demo.html` 可用于上传测试。

## 配置

| 环境变量 | 说明 | 默认值 |
| --- | --- | --- |
| `PAGENOTE_ADMIN_USERNAME` | 管理员用户名 | `admin` |
| `PAGENOTE_ADMIN_PASSWORD` | 管理员密码，未设置时无法登录 | 空 |
| `SESSION_SECRET` | Flask 会话签名密钥，生产环境必须固定设置 | 每次启动随机生成 |
| `DB_PATH` | SQLite 数据库路径 | `data/pagenote.sqlite3` |
| `PAGENOTE_COOKIE_SECURE` | HTTPS 环境设为 `1` | `0` |
| `PORT` | 直接运行 `app.py` 时的监听端口 | `8000` |

## 测试

```bash
python -m unittest -v
node --check static/annotator.js
```

## 数据删除说明

管理台中的“永久删除”会删除项目数据库记录。由于 HTML 正文、批注和回复都存储在同一个 SQLite 数据库中，删除项目时会一并删除 HTML 正文，并通过外键级联删除该项目的全部批注和回复。SQLite 文件本身及其他项目不会被删除。

## License

[MIT](LICENSE)
