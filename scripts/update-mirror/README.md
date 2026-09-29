# Self-hosted download mirror

The loader and the Windows installer try a mirror first and fall back to the public
sources (GitHub via the ghproxy mirror, then GitHub directly; the Node and npm mirrors
chosen in setup). The default mirror is `http://43.248.10.82/shinawase`.

What the mirror serves, and how each part is protected (so the mirror does **not** have
to be trusted, and plain HTTP is acceptable):

| Path under the base URL | Used by | Integrity |
|---|---|---|
| `mirror-manifest.json` + `mirror-manifest.sig` | loader self-update | Ed25519 signature; the public key is embedded in `ShinawaseLoader/update-net.mjs` |
| `ShinawaseLoader-main.zip` | loader self-update | SHA-256 listed in the signed manifest |
| `examples/packages/*.echomod` | loader self-update | SHA-256 listed in the signed manifest |
| `node/v<ver>/node-v<ver>-win-x64.zip` | installer | SHA-256 (`nodeSha256`) from the local `loader-version.json` |
| `npm/` (caching registry proxy) | installer | `package-lock.json` integrity hashes |

## Publish (each release)

```powershell
# one-time: the signing key lives outside git; the public half is already embedded
# (to rotate: node scripts/build-update-mirror.mjs --generate-key "<PRIVATE_KEY.pem>")
node .\scripts\build-update-mirror.mjs ".\mirror-out" --key ".\.update-signing-key.pem" --with-node
```

The archive is built from git `HEAD`, so commit first. Copy the **contents** of
`mirror-out` to `/var/www/shinawase/` on the server (for example with `scp -r` or
`rsync`). `--with-node` is only needed when `nodeVersion` in `loader-version.json`
changes. The builder refuses to sign if the key does not match the embedded public key.

## Server

`nginx.conf.example` is a complete site: static files under `/shinawase/`, a read-only
caching proxy for the npm registry under `/shinawase/npm/`, and Range support (the
loader resumes interrupted downloads). Enable HTTPS if you have a domain; it is not
required for safety but stops on-path parties from seeing what is downloaded.

## Client configuration

- `loader.config.json` / `updateMirrors: ["http://host/path"]` — replaces the default
  list for loader self-updates (`[]` disables).
- Environment `SHINAWASE_UPDATE_MIRRORS` (loader) and `SHINAWASE_MIRRORS` (installer) —
  comma-separated URLs; the word `none` disables.
- Users who choose "Node.js official / direct" in setup bypass every mirror.

## Behaviour to know

- A mirror that is down costs one short probe/timeout per run, then is skipped.
- A mirror that serves wrong bytes (bad hash or signature) is ignored and the next
  source is used.
- Launch-time updates have a 45 s budget; a partial download is kept and resumed.
- A mirror lagging behind GitHub is authoritative while reachable: publish after each
  release.
