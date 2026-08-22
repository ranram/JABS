# Security

JABS stores tournament settings and media on your computer. It also uses a start.gg API token when you connect your account. The following precautions help keep that information safe.

## Install JABS safely

- Download releases from the official JABS repository.
- Check published checksums when they are available.
- Treat operating-system warnings about unsigned builds seriously. Confirm where the file came from before allowing it to run.
- Do not install packages or builds shared by an unknown third party.
- Run JABS from a normal user account rather than as an administrator or root user.

## Protect your start.gg token

- Treat the token like a password.
- Never include it in a screenshot, log, issue, chat message, URL, source file, or `.env` file committed to Git.
- Use **Save token** only on a computer and operating-system account you trust.
- Use **Use for session** on a shared or temporary computer.
- Revoke the token through start.gg and create a new one if it may have been exposed.

JABS stores saved tokens through the operating system's credential storage. Session tokens remain in memory until the app closes.

## Local service and OBS

JABS serves its OBS pages on `127.0.0.1`, which limits access to the same computer. Keep that address when adding Browser Sources or changing the local port.

Do not expose the JABS port through router forwarding, public tunnels, or a public web server. OBS Browser Source URLs do not need your start.gg token and should never contain it.

## Local media

Only add images you trust and have permission to use. PNG, JPEG, and WebP files are supported.

Tournament logos, sponsor logos, player photos, and character artwork may contain personal or licensed material. Review these folders before sharing the project, copying application data, or publishing an installer.

## Shared computers

Use **Use for session** when possible and close JABS when you finish. If you saved your token, remove it before leaving a shared operating-system account.

## Building from source

Install the versions recorded in the repository and use the committed lockfile:

```sh
pnpm install --frozen-lockfile
```

Review dependency changes before accepting them. Avoid placing real tokens in development fixtures, automated tests, or terminal output.

## Report a vulnerability

If private vulnerability reporting is enabled on GitHub, use it to report security problems. Otherwise, contact the repository owner privately before sharing details in public. Include:

- The affected version and operating system
- A clear description of the problem
- Steps to reproduce it
- The impact you observed
- Any suggested fix, if you have one

Do not include real tokens, private tournament data, or player information in the report. Do not open a public issue for a vulnerability that could put users at risk before a fix is available.
