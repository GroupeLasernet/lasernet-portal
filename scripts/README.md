# Station scripts

Automation scripts for setting up and maintaining Atelier DSM station PCs
(one PC per station = 1 cobot + 1 laser).

## `bootstrap-station.ps1`

**Purpose:** one-shot setup of a fresh Windows PC into a working station.
Replaces the 14-step manual process (clone, sparse-checkout, pip install, NSSM,
service registration, .env, start).

**Usage** — run as Administrator on the station PC:

```powershell
Set-ExecutionPolicy -Scope Process Bypass -Force
iwr https://raw.githubusercontent.com/GroupeLasernet/lasernet-portal/main/scripts/bootstrap-station.ps1 -OutFile bootstrap.ps1
.\bootstrap.ps1
```

Prompts for robot serial + Portal URL + (optional) license secret, then:

- Clones Prisma with sparse-checkout (robot + relfar + scripts only — **never portal**)
- Installs Python deps for both services
- Installs NSSM
- Registers `ElfinRobot` and `RelfarBridge` as auto-start services
- Starts them
- Prints the station IP

Safe to rerun — services are removed and re-registered cleanly.

**Prereqs on the station PC:**

- Python 3.11+ on PATH (install from python.org, tick "Add to PATH")
- Git for Windows on PATH
- A GitHub deploy key already at `~/.ssh/github_deploy` and `~/.ssh/config`
  with a `Host github.com` entry (one-time setup — see HANDOFF.md)

## `deploy-robot.bat`

**Purpose:** push code changes from dev PC and have the robot PC pull +
restart services, all in one command.

**Usage** — run from Prisma repo root on dev PC:

```cmd
scripts\deploy-robot.bat
```

Prereqs:

- You have SSH key auth to robot PC as host alias `robotpc`
- Services are registered (bootstrap has been run on the robot PC)

Does three things: `git push`, remote `git pull`, and `net stop && net start`
for both services.

## Roadmap

- **Future:** replace `deploy-robot.bat` with in-app updater — see backlog item
  "In-app updater for station PCs" in `BACKLOG.md`. That version has zero SSH
  dependency and runs on every station regardless of network topology.
