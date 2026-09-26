# Experiment Platform

<!--
本文件是项目入口文档，供前后端成员共同维护。
当前仓库仅提供架构骨架；业务实现应遵循根目录 plan.md 中的接口、权限和数据约束。
-->

一个面向 Researcher、Participant 和 Administrator 的在线实验平台。

## 目录

- `frontend/`：React + TypeScript + Vite 前端。
- `backend/`：FastAPI + SQLAlchemy + Alembic 后端。
- `docker-compose.yml`：本地前后端及 PostgreSQL 编排。

## 本地启动（前端、后端和 PostgreSQL）

安装并启动 Docker Desktop 后，在本目录的 PowerShell 中运行：

```powershell
Copy-Item .env.example .env
docker compose up --build
```

首次运行会下载镜像并安装依赖。前端地址为 `http://localhost:5173`，后端健康检查为 `http://localhost:8000/health`，API 文档为 `http://localhost:8000/docs`。按 `Ctrl+C` 停止；需要移除容器时运行 `docker compose down`，此命令保留数据库卷中的数据。

在 Windows PowerShell 中单独运行前端时，如 `npm` 被执行策略阻止，可用 `npm.cmd install` 和 `npm.cmd run dev`。单独运行后端则需本机安装 Python 3.12 和项目依赖，并提供可连接的 PostgreSQL；容器内使用 `db` 主机名，本机运行时数据库地址应改为 `localhost`。

前端已实现 `plan.md` 2.1–2.6 的页面与交互：角色入口、三类登录、Researcher 注册和实验 Dashboard。`frontend/src/api.ts` 保留了带中文 TODO 的通信接口，目前会返回“后端接口尚未接入”；因此真实登录、刷新后恢复 Session、实验列表读取和保存，需要后端实现后才能联通。密码哈希、角色授权和实验代码生成均由后端负责。

> TODO：业务代码完成后补充迁移、测试、生产部署及故障排查说明。
