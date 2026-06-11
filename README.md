# WebDB Playground

## Prerequisites

- **Linux / macOS:** Docker + Docker Compose.
- **Windows:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) (its installer sets up everything else for you). Nothing else to install.

## Run it

1. Copy `.env.example` to `.env` (on Windows this is done for you on first run).
2. Build the images, then start:

   | | Build | Start | Stop | Clean rendered config |
   |---|---|---|---|---|
   | **Linux / macOS** | `./build.sh` | `./start.sh` | `./down.sh` | `./cleanup.sh` |
   | **Windows** | double-click `win\build.bat` | double-click `win\start.bat` | `win\down.bat` | `win\cleanup.bat` |

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
