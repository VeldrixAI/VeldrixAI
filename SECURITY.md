# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 1.x     | Yes                |
| < 1.0   | No                 |

---

## Reporting a Vulnerability

**Do not report security vulnerabilities through public GitHub issues.**

If you discover a security vulnerability in VeldrixAI, please report it by emailing:

**security@veldrix.ai**

Include the following information in your report:

- A description of the vulnerability and its potential impact
- Steps to reproduce or a proof-of-concept (where applicable)
- Any suggested mitigations or fixes you may have identified
- Your contact information for follow-up

### What to expect

- We will acknowledge receipt of your report within **2 business days**.
- We will provide an initial assessment and timeline within **7 business days**.
- We will keep you informed of our progress and coordinate disclosure timing with you.
- We ask that you give us a reasonable amount of time to address the issue before any public disclosure.

---

## Scope

The following are in scope for responsible disclosure:

- Authentication and authorization bypasses in any service
- Remote code execution vulnerabilities
- SQL injection or other data exfiltration vulnerabilities
- Credential leakage in API responses or logs
- JWT handling flaws in the auth service
- NVIDIA NIM API key exposure

---

## Out of Scope

- Vulnerabilities in third-party dependencies (please report these upstream)
- Social engineering attacks
- Denial-of-service attacks against hosted infrastructure

---

## Disclosure Policy

VeldrixAI follows a coordinated disclosure model. We will publicly acknowledge valid reports after a fix has been deployed, unless you prefer to remain anonymous.
