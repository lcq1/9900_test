# Experiment Platform

一个面向 Researcher、Participant 和 Administrator 的在线实验平台。

## 目录

- `frontend/`：React + TypeScript + Vite 前端。
- `backend/`：FastAPI + SQLAlchemy + Alembic 后端。
- `docker-compose.yml`：本地前后端及 PostgreSQL 编排。

## 本地启动（前端、后端和 PostgreSQL）

安装并启动 Docker Desktop 后，在本目录的 PowerShell 中运行：

```powershell
Copy-Item .env.example .env
# 编辑 .env，至少设置随机 APP_SECRET_KEY 和 ADMIN_PASSWORD_HASH
docker compose up --build
```

首次运行会下载镜像、安装依赖并执行 Alembic 数据库迁移。前端地址为 `http://localhost:5173`，后端健康检查为 `http://localhost:8000/health`，API 文档为 `http://localhost:8000/docs`。按 `Ctrl+C` 停止；需要移除容器时运行 `docker compose down`，此命令保留数据库卷中的数据。

在 Windows PowerShell 中单独运行前端时，如 `npm` 被执行策略阻止，可用 `npm.cmd install` 和 `npm.cmd run dev`。单独运行后端则需本机安装 Python 3.12 和项目依赖，并提供可连接的 PostgreSQL；容器内使用 `db` 主机名，本机运行时数据库地址应改为 `localhost`。

## Administrator 密码

`.env` 中只能保存 Argon2id 哈希，不能保存管理员明文密码。安装后端依赖后可生成哈希：

```powershell
python -c "from argon2 import PasswordHasher; print(PasswordHasher().hash('replace-with-your-password'))"
```

将输出完整复制到 `ADMIN_PASSWORD_HASH`。由于哈希中包含 `$`，请直接写入 env 文件，不要通过会展开变量的 Shell 字符串转写。

## 已实现功能

- Researcher 注册、登录、Session 恢复和退出。
- 实验及有序 Stage 的创建、查询、修改、发布、关闭和删除。
- Participant Code 生成、Participant 登录、知情同意、进度恢复、倒计时和幂等答案提交。
- Administrator 登录，以及 Researcher 和实验列表。
- PostgreSQL 数据结构和 Alembic 迁移。
- 前端 Axios API 接入；本地开发和 Docker Compose 默认启用演示登录，生产构建仅在显式设置 `VITE_DEMO_MODE=true` 时启用。

云存储和外部 AI API 目前仅保留边界接口，尚未连接供应商。

## 本地测试

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pytest -q

cd ..\frontend
npm install
npm run build
```
