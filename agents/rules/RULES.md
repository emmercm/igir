# 📜 Rules

> Mandatory rules for the igir agent team.

## R-001: Memory Bank Protocol

Every cycle:
1. Read `agents/memory/bank.md` before acting
2. Update your role's state after acting
3. Never delete another role's state

## R-002: Issue Tracking

- All work must reference a GitHub issue
- Close issues only when work is merged
- Update Active Threads section with new issues

## R-003: Code Quality

- All code changes require tests
- `npm run lint` must pass
- `npm test` must pass
- Follow TypeScript strict mode

## R-004: PR Standards

- Conventional commit format: `<type>(<scope>): <description>`
- Reference issues in PR description
- Request review when ready
