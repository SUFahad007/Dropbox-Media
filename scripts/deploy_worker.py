#!/usr/bin/env python3
"""Deploy a worker script to Cloudflare via the API.
Usage: python3 scripts/deploy_worker.py <worker-name> <script-file>
Bindings are declared fully per worker, so a deploy is always complete:
  db-index: DROPBOX_ROOT (plain_text) + 3 Dropbox secrets (from env)
  db-addon: INDEX service binding -> db-index
"""
import json, os, sys, urllib.request, urllib.error, uuid

worker, script_file = sys.argv[1], sys.argv[2]
token = os.environ['CF_API_TOKEN']
account = os.environ['CF_ACCOUNT_ID']

bindings = []
if worker == 'db-index':
    bindings.append({'name': 'DROPBOX_ROOT', 'type': 'plain_text', 'text': 'Stream'})
    for name in ['DROPBOX_APP_KEY', 'DROPBOX_APP_SECRET', 'DROPBOX_REFRESH_TOKEN']:
        val = os.environ.get(name)
        if not val:
            raise SystemExit(f'missing env {name}')
        bindings.append({'name': name, 'type': 'secret_text', 'text': val})
elif worker == 'db-addon':
    bindings.append({'environment': 'production', 'name': 'INDEX', 'service': 'db-index', 'type': 'service'})
else:
    raise SystemExit(f'unknown worker {worker}')

meta = json.dumps({'main_module': script_file, 'compatibility_date': '2026-09-15', 'bindings': bindings,
                     'observability': {'enabled': True, 'head_sampling_rate': 1.0}})
code = open(script_file, encoding='utf-8').read()
b = uuid.uuid4().hex
body = (
    f'--{b}\r\nContent-Disposition: form-data; name="metadata"; filename="metadata.json"\r\n'
    f'Content-Type: application/json\r\n\r\n{meta}\r\n'
    f'--{b}\r\nContent-Disposition: form-data; name="{script_file}"; filename="{script_file}"\r\n'
    f'Content-Type: application/javascript+module\r\n\r\n{code}\r\n'
    f'--{b}--\r\n'
).encode()

req = urllib.request.Request(
    f'https://api.cloudflare.com/client/v4/accounts/{account}/workers/scripts/{worker}',
    data=body, method='PUT',
    headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'multipart/form-data; boundary=' + b})
try:
    resp = json.load(urllib.request.urlopen(req, timeout=120))
except urllib.error.HTTPError as e:
    print('DEPLOY FAILED:', e.code, e.read().decode()[:500])
    sys.exit(1)
if not resp.get('success'):
    print('DEPLOY FAILED:', json.dumps(resp.get('errors', []))[:500])
    sys.exit(1)
print(f'DEPLOYED {worker} ({len(code)} bytes)')
