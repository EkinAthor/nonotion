# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Nonotion, please report it responsibly.

**Do NOT open a public GitHub issue for security vulnerabilities.**

Instead, use **GitHub's private vulnerability reporting**:
1. Go to the repository's **Security** tab
2. Click **"Report a vulnerability"**
3. Fill in the details

Include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

You will receive an acknowledgment within 48 hours.

## Supported Versions

| Version | Supported |
|---------|-----------|
| latest  | Yes       |

## Security Best Practices for Deployment

- **Always set `JWT_SECRET`** to a strong, unique value (32+ random characters)
- **Use HTTPS** in production (via reverse proxy like nginx)
- **Set `NODE_ENV=production`** to enable production security checks
- **Keep dependencies updated** — run `pnpm audit` regularly
- **Use a reverse proxy** (nginx, Caddy) for rate limiting, security headers, and TLS termination
- **Review `AUTH_MODES`** — only enable authentication methods you need
- **Set `REQUIRE_USER_APPROVAL=true`** to prevent unauthorized signups
