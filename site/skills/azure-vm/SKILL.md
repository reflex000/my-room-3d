# Skill: azure-vm — create a virtual machine in the sandbox subscription

Use when the visitor wants a VM / server / box / "machine" in Azure.

## Intake — what a normal SRE asks (collect all before summarising)
1. **Purpose** — what is it for? (test app, build agent, demo, learning…). One line is enough.
2. **Environment** — dev, test or demo. **Production is not allowed here** (this is a sandbox): refuse kindly and suggest the proper prod path with a change request.
3. **Size** — ask about workload (CPU/RAM needs, how many users) and recommend the smallest that fits. Allowed: `Standard_B1s` (1 vCPU/1 GB), `Standard_B1ms` (1/2), `Standard_B2s` (2/4), `Standard_B2ms` (2/8). Anything bigger: not available in the sandbox.
4. **OS** — `ubuntu-24.04` (default), `ubuntu-22.04`, or `windows-2022`.
5. **Region** — default `canadacentral`. Allowed: `canadacentral`, `canadaeast`, `westus2`, `eastus`.
6. **Lifetime (TTL)** — how many days do they need it? 1–14 days. Everything is auto-deleted at expiry; say this clearly.
7. **Access** — `private` (no public IP, reachable only inside the VNet — default) or `public_ssh` (public IP, SSH/RDP allowed **only from their IP**). For `public_ssh` you need their public IPv4 (`source_ip`). Never open to 0.0.0.0/0.
8. **SSH public key** — required for Linux (`ssh-ed25519 …` or `ssh-rsa …`). Public key only. For Windows, credentials go to Key Vault; never to chat.
9. **Observability** — `none`, `basic` (Azure Monitor agent + CPU/disk/heartbeat alerts) or `full` (basic + log collection + dashboard). Recommend `basic` unless it is a throwaway box.
10. **Backup** — needed? (usually no for ≤14-day sandbox boxes; ask only if the purpose suggests data matters).
11. **Owner + cost tag** — their name, and which team/project pays (`cost_tag`). Optional: contact email for the done-notification.

## Rough cost (pay-as-you-go, Linux, per month, approximate — say "roughly")
B1s ≈ $10 · B1ms ≈ $20 · B2s ≈ $40 · B2ms ≈ $80. Windows ≈ +40%. Public IP ≈ +$4. `full` observability ≈ +$5–15 depending on logs. Pro-rate by TTL days when you quote.

## Output — call `submit_request` with
```json
{ "skill": "azure-vm",
  "params": { "purpose": "...", "environment": "dev|test|demo", "vm_size": "Standard_B1s|Standard_B1ms|Standard_B2s|Standard_B2ms",
    "os": "ubuntu-24.04|ubuntu-22.04|windows-2022", "region": "canadacentral|canadaeast|westus2|eastus", "ttl_days": 1,
    "network": "private|public_ssh", "source_ip": "x.x.x.x (only if public_ssh)", "ssh_public_key": "ssh-… (linux only)",
    "observability": "none|basic|full", "backup": false, "requester_name": "...", "cost_tag": "...", "requester_contact": "optional email" } }
```
The server validates this again; if it returns errors, fix them with the visitor and resubmit.

## After submit
Tell them the ticket id, that the pipeline is: what-if → Sid's approval → deploy → monitoring, that they can leave and come back with the status link, and that you will ping them when it is done. Then get to work.
