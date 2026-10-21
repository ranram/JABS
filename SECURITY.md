# Security

## Credentials and local access

Saved start.gg tokens use OS credential storage. If it is unavailable, session tokens stay in native memory until JABS closes. Remove saved credentials when leaving a shared account. If a token is exposed, revoke it through start.gg.

The OBS service binds to `127.0.0.1` and requires no token in Browser Source URLs. Do not expose it through public tunnels or port forwarding.

## Report a vulnerability

Use GitHub's private vulnerability reporting if enabled, or contact the repository owner privately. Include the affected version, operating system, reproduction steps, and observed impact. Omit real credentials and private player or tournament data.

Keep exploitable details private until a fix is available.
