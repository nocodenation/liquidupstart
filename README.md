# WebDB Playground

## Prerequisites

- **Linux / macOS:** Docker + Docker Compose.
- **Windows:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (its installer sets up everything else for you). Nothing else to install.

## Run it

1. Run the dashboard: `./run.sh` (Windows: double-click `run.bat`), then
   open the printed URL (first free port from 7777 up). On the first run it shows the configuration
   form (secrets left empty are generated for you); afterwards it shows the
   service dashboard: tiles with every URL & credential when the stack runs,
   **Build** / **Start** / **Stop** buttons with a live log, and a
   **Configuration** button to change `.env` anytime.
   (Manual alternative: copy `.env.example` to `.env`, edit it by hand, and
   use the scripts below.)
2. Or build the images and start from the terminal:

   | | Build | Start | Stop | Clean rendered config |
   |---|---|---|---|---|
   | **Linux / macOS** | `./scripts/linux/build.sh` | `./scripts/linux/start.sh` | `./scripts/linux/down.sh` | `./scripts/linux/cleanup.sh` |
   | **Windows** | double-click `scripts\windows\build.bat` | double-click `scripts\windows\start.bat` | `scripts\windows\stop.bat` | `scripts\windows\cleanup.bat` |

3. Access services (default port `8888`, set by `SYSTEM_HTTP_PORT` in `.env`):
   - pgAdmin: http://pgadmin.localhost:8888/
   - REST: http://postgrest.localhost:8888/
   - Swagger: http://swagger.localhost:8888/

   `start.sh` / `start.bat` print the full list of service URLs when they finish.

## How the Windows wrappers work

The `.bat` files run the exact same `.sh` scripts as Linux — no separate Windows
codebase to maintain. On first use they build a small helper "toolbox" container
(`config/win/Dockerfile.toolbox`) that has bash + the tools the scripts expect,
and run the scripts inside it against Docker Desktop's engine. You never need to
open WSL or a terminal; double-clicking the `.bat` is enough.
