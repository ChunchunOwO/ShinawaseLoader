# Mod Market deploy key

Publishes official mods (the entries in `scripts/mod-market.json`) to the Shinawase Mod
Market without a shell on the market server.

- `shinawase-market-apply.py` is installed on the server as
  `/usr/local/bin/shinawase-market-apply` and bound to one SSH key with
  `restrict,command="/usr/local/bin/shinawase-market-apply"`. That key can only run
  `status` (read-only) or `apply` (a tar on stdin with `entries.json`, the named
  packages and icons). Packages must match the sha256/size in their entry; only those
  seed entries change, `seed.json` is backed up first, then the market service is
  restarted and the served versions are checked. Configuration lives in
  `/etc/shinawase-market-deploy.json`: `{"root": "<market dir>", "restart": ["systemctl", "restart", "<unit>"]}`.
- `deploy.mjs` runs on the build machine: it builds the catalog entries from
  `scripts/mod-market.json` and `examples/packages`, streams them to the forced
  command, and checks the public `index.json`.

```powershell
node .\scripts\mod-market-deploy\deploy.mjs --server root@<host> --port <port> --id echo.community-streaming
node .\scripts\mod-market-deploy\deploy.mjs --server root@<host> --port <port> status
```

The private key (`~/.ssh/shinawase_market` by default) stays on the build machine;
never commit, print, or paste it. The key cannot change `mod-market-server.py`.
