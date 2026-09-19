/* Shared helpers for the SRE-desk API: invite gate, rate limit, request validation, signed job tokens, simulated pipeline. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const MODE = process.env.SRE_MODE || 'simulated';
const secret = () => process.env.JOB_SECRET || crypto.createHash('sha256').update('job:' + (process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY || 'dev')).digest('hex');

function inviteOk(code) {
  /* forgiving on purpose: case, stray quotes/backticks/spaces from copy-paste */
  const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const list = (process.env.INVITE_CODES || '').split(',').map(norm).filter(Boolean);
  if (!list.length || !norm(code)) return false;
  const c = Buffer.from(norm(code));
  return list.some(x => { const b = Buffer.from(x); return b.length === c.length && crypto.timingSafeEqual(b, c); });
}

const hits = new Map();
function rateLimited(ip, max = 20, windowMs = 60000) {
  const now = Date.now(), arr = (hits.get(ip) || []).filter(t => now - t < windowMs);
  arr.push(now); hits.set(ip, arr);
  return arr.length > max;
}

function readSkills() {
  const dir = path.join(process.cwd(), 'skills');
  const out = { persona: '', skills: [] };
  try { out.persona = fs.readFileSync(path.join(dir, 'persona.md'), 'utf8'); } catch (e) {}
  try {
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      try { out.skills.push({ name: d.name, text: fs.readFileSync(path.join(dir, d.name, 'SKILL.md'), 'utf8') }); } catch (e) {}
    }
  } catch (e) {}
  return out;
}

/* ---- validation: the model only proposes; this decides ---- */
const ENUMS = {
  environment: ['dev', 'test', 'demo'],
  vm_size: ['Standard_B1s', 'Standard_B1ms', 'Standard_B2s', 'Standard_B2ms'],
  os: ['ubuntu-24.04', 'ubuntu-22.04', 'windows-2022'],
  region: ['canadacentral', 'canadaeast', 'westus2', 'eastus'],
  network: ['private', 'public_ssh'],
  observability: ['none', 'basic', 'full'],
  access: ['managed', 'ssh_key'],
};
const SECRETISH = /(password|passwd|secret|BEGIN [A-Z ]*PRIVATE KEY|sk-[A-Za-z0-9]{16,}|AKIA[0-9A-Z]{12,})/i;
function validateAzureVm(p, ctx = {}) {
  const errors = [], out = {};
  if (!p || typeof p !== 'object') return { errors: ['params missing'] };
  p = { access: p.ssh_public_key ? 'ssh_key' : 'managed', ...p };   // the SRE decides access; visitors are not asked for keys
  const str = (k, max, req) => {
    const v = p[k] == null ? '' : String(p[k]).trim();
    if (req && !v) errors.push(`${k} is required`);
    if (v.length > max) errors.push(`${k} too long`);
    if (SECRETISH.test(v)) errors.push(`${k} looks like it contains a secret — never put secrets in a request`);
    out[k] = v;
  };
  str('purpose', 200, true); str('requester_name', 80, true); str('cost_tag', 60, true); str('requester_contact', 120, false);
  for (const k in ENUMS) { const v = String(p[k] || '').trim(); if (!ENUMS[k].includes(v)) errors.push(`${k} must be one of: ${ENUMS[k].join(', ')}`); out[k] = v; }
  const ttl = Number(p.ttl_days); if (!Number.isInteger(ttl) || ttl < 1 || ttl > 14) errors.push('ttl_days must be an integer 1–14'); out.ttl_days = ttl;
  out.backup = !!p.backup;
  if (out.network === 'public_ssh') {
    /* looking up the visitor's IP is the SRE's job, not theirs: take it from the connection */
    const ip = String(ctx.ip || p.source_ip || '').trim();
    if (!/^(\d{1,3}\.){3}\d{1,3}(\/(3[0-2]|[12]?\d))?$/.test(ip) || ip.startsWith('0.0.0.0')) errors.push('could not determine a public IPv4 for the visitor — use network: private, or ask them to retry from an IPv4 connection');
    out.source_ip = ip;
  }
  if (out.access === 'ssh_key') {
    const key = String(p.ssh_public_key || '').trim();
    if (/PRIVATE KEY/.test(key)) errors.push('that is a PRIVATE key — never share it; send the .pub file contents');
    else if (!/^(ssh-ed25519|ssh-rsa|ecdsa-sha2-nistp\d+) [A-Za-z0-9+/=]{40,}( .*)?$/.test(key)) errors.push('ssh_public_key must be an SSH PUBLIC key (ssh-ed25519 … / ssh-rsa …)');
    out.ssh_public_key = key.slice(0, 800);
  }
  return errors.length ? { errors } : { params: out };
}
const VALIDATORS = { 'azure-vm': validateAzureVm };

/* ---- signed, stateless job tokens (Step 1: simulated pipeline; Step 2 swaps this for a real store + runner) ---- */
const b64u = (b) => Buffer.from(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function signJob(job) {
  const body = b64u(JSON.stringify(job));
  return body + '.' + b64u(crypto.createHmac('sha256', secret()).update(body).digest());
}
function verifyJob(token) {
  try {
    const [body, sig] = String(token || '').split('.');
    const want = b64u(crypto.createHmac('sha256', secret()).update(body).digest());
    if (!sig || sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return null;
    return JSON.parse(Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'));
  } catch (e) { return null; }
}
function newJob(skill, params) {
  const id = 'SRE-' + crypto.randomBytes(3).toString('hex').toUpperCase();
  const p = { ...params };
  if (p.ssh_public_key) p.ssh_public_key = p.ssh_public_key.slice(0, 24) + '…';   // the ticket is shareable; keep it light
  return { id, skill, mode: MODE, createdAt: Date.now(), params: p };
}

const STAGES = [
  { key: 'queued', label: 'Queued', secs: 3 },
  { key: 'what_if', label: 'Bicep what-if (plan)', secs: 7 },
  { key: 'approval', label: "Waiting for Sid's approval", secs: 9 },
  { key: 'deploy', label: 'Deploying VM + network', secs: 24 },
  { key: 'observability', label: 'Wiring monitoring + alerts', secs: 8 },
  { key: 'done', label: 'Done', secs: 0 },
];
function jobStatus(job, now = Date.now()) {
  const total = STAGES.reduce((a, s) => a + s.secs, 0), elapsed = Math.max(0, Math.min(total, (now - job.createdAt) / 1000));
  let t = elapsed, idx = STAGES.length - 1;
  for (let i = 0; i < STAGES.length - 1; i++) { if (t < STAGES[i].secs) { idx = i; break; } t -= STAGES[i].secs; }
  const done = idx === STAGES.length - 1;
  const p = job.params, short = job.id.slice(4).toLowerCase();
  const name = `vm-${(p.cost_tag || 'sbx').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'sbx'}-${short}`;
  const log = [
    `[queue]    ticket ${job.id} accepted — skill ${job.skill} (${job.mode})`,
    `[validate] ${p.vm_size} · ${p.os} · ${p.region} · ttl ${p.ttl_days}d · ${p.network}`,
    `[what-if]  = vnet-sandbox (no change)`,
    `[what-if]  + nsg-${name}${p.network === 'public_ssh' ? ` (allow 22 from ${p.source_ip})` : ' (deny inbound)'}`,
    `[what-if]  + Microsoft.Compute/virtualMachines/${name}`,
    `[policy]   allowed SKU ✓  region ✓  ttl tag ✓  cost tag "${p.cost_tag}" ✓`,
    `[approval] waiting for Sid…`,
    `[approval] approved ✓`,
    `[deploy]   nic, disk, vm → provisioning`,
    `[deploy]   ${name} running`,
    p.observability === 'none' ? `[monitor]  skipped (observability: none)` : `[monitor]  Azure Monitor agent + ${p.observability === 'full' ? 'logs, dashboard, ' : ''}cpu/disk/heartbeat alerts`,
    `[cleanup]  auto-delete scheduled in ${p.ttl_days} day(s)`,
    `[done]     ${job.mode === 'simulated' ? 'SIMULATION complete — nothing was created in Azure' : 'ready'}`,
  ];
  const shown = Math.max(1, Math.round(log.length * (elapsed / total)));
  return {
    id: job.id, skill: job.skill, mode: job.mode, createdAt: job.createdAt, params: p,
    stage: STAGES[idx].key, stageLabel: STAGES[idx].label, stageIndex: idx, stages: STAGES.map(s => s.label), progress: +(elapsed / total).toFixed(3), done,
    log: done ? log : log.slice(0, shown),
    outputs: done ? {
      vm_name: name, region: p.region, private_ip: '10.42.1.' + (10 + parseInt(short.slice(0, 2), 16) % 200),
      public_ip: p.network === 'public_ssh' ? '(assigned at deploy — simulated)' : null, expires_in_days: p.ttl_days,
      note: job.mode === 'simulated' ? 'Dry run: no Azure resources exist yet.' : '',
    } : null,
  };
}

module.exports = { MODE, inviteOk, rateLimited, readSkills, VALIDATORS, signJob, verifyJob, newJob, jobStatus };
