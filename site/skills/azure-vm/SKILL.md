# Skill: azure-vm — a virtual machine in the sandbox subscription

Use when the visitor needs "a server / machine / box / VM / somewhere to run X".

## Intake — plain-English questions only (one at a time, skip what you already know)
1. **What is it for?** What will run on it (a small web app, a script, a demo, a build job…)?
2. **Who uses it and how heavy is it?** Just them, a few teammates, a demo audience? Anything CPU- or memory-hungry?
3. **Does anyone need to open it from the internet**, or is it enough that they (or their team) can log into it?
4. **How long do they need it?** Days, not months — this is a sandbox (max 14 days, auto-deleted at the end; say this clearly).
5. **Does it hold anything they cannot afford to lose?** (decides backup)
6. **Is this real production or customer-facing?** If yes: this desk cannot do it — explain kindly that production goes through the change process, and offer a sandbox copy to try things first.
7. **Name and which team/project should be billed**, and optionally an email for the "it's ready" message.

Never ask for: VM size, OS version, region, IP addresses, network design, SSH keys, monitoring level. You decide those.

## Your decisions (map the answers to parameters yourself)
- `environment`: `demo` if it is shown to others, `test` if it validates something, else `dev`.
- `vm_size`: light script / tiny app / one user → `Standard_B1s`; small web app or a few users → `Standard_B1ms`; builds, several users, anything "a bit heavy" → `Standard_B2s`; memory-hungry → `Standard_B2ms`. Nothing bigger exists here.
- `os`: `ubuntu-24.04` unless they clearly need Windows (`windows-2022`).
- `region`: `canadacentral` unless they mention being in the US (`westus2` / `eastus`).
- `network`: `private` by default. `public_ssh` only if people must reach it from the internet; the server locks access to the visitor's current IP automatically — do not ask for it.
- `access`: `managed` (you send them login instructions via their company sign-in when it is ready). Use `ssh_key` only if they spontaneously give you an SSH **public** key.
- `observability`: `basic` by default; `none` for a 1–2 day throwaway; `full` if others depend on it or it is a demo that must not die.
- `backup`: true only if they said the data matters.
- `ttl_days`: what they asked for, 1–14.

## Rough cost (pay-as-you-go, per month, approximate — always say "roughly")
B1s ≈ $10 · B1ms ≈ $20 · B2s ≈ $40 · B2ms ≈ $80. Windows ≈ +40%. Internet-reachable ≈ +$4. `full` monitoring ≈ +$5–15. Pro-rate by the number of days.

## Output — call `submit_request` with
```json
{ "skill": "azure-vm",
  "params": { "purpose": "...", "environment": "dev|test|demo", "vm_size": "Standard_B1s|Standard_B1ms|Standard_B2s|Standard_B2ms",
    "os": "ubuntu-24.04|ubuntu-22.04|windows-2022", "region": "canadacentral|canadaeast|westus2|eastus", "ttl_days": 3,
    "network": "private|public_ssh", "access": "managed|ssh_key", "ssh_public_key": "only when access is ssh_key",
    "observability": "none|basic|full", "backup": false, "requester_name": "...", "cost_tag": "...", "requester_contact": "optional email" } }
```
The server validates again and fills in the visitor's IP when needed. If it returns errors, fix them yourself where you can; only go back to the visitor for something only they know.

## After submit
Ticket id, one sentence on what happens next (plan check → Sid's approval → build → monitoring), they can leave and come back with the status link, you will tell them when it is ready. Then get to work.
