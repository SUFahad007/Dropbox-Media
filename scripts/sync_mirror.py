#!/usr/bin/env python3
"""Regenerate the embedded Nuvio plugin mirror inside addon.js from plugin.js.
The mirror is a string literal starting with `"// Dropbox Index`.
Usage: python3 scripts/sync_mirror.py [--check]
  --check  exit 1 if addon.js is out of sync (no write)"""
import sys

def esc(t):
    return t.replace('\\', '\\\\').replace('"', '\\"').replace('\n', '\\n')

plugin = open('plugin.js', encoding='utf-8').read()
addon = open('addon.js', encoding='utf-8').read()

marker = ': "// Dropbox Index'
i = addon.find(marker)
assert i != -1, 'mirror literal not found in addon.js'
i = addon.find('"', i)
j = i + 1
while addon[j] != '"' or addon[j - 1] == '\\':
    j += 1

new_addon = addon[:i] + '"' + esc(plugin) + '"' + addon[j + 1:]
if new_addon == addon:
    print('mirror already in sync')
    sys.exit(0)

if '--check' in sys.argv:
    print('mirror OUT OF SYNC in addon.js')
    sys.exit(1)

open('addon.js', 'w', encoding='utf-8').write(new_addon)
print('mirror updated in addon.js')
