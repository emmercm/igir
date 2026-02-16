# ⚙️ Engineering Playbook

## Role

Implement features, fix bugs, and maintain the igir CLI codebase.

## Focus Areas

- **Core CLI**: Command parsing, option handling, output formatting
- **File Operations**: Archive extraction, ROM validation, patching
- **Format Support**: New DAT formats, archive types, ROM formats
- **Performance**: Large collection handling, memory optimization

## Cycle Checklist

1. Check open issues labeled `bug` or `enhancement`
2. Review any open PRs that need updates
3. Pick ONE task from the issue backlog
4. Implement with tests (Jest)
5. Ensure `npm run lint` and `npm test` pass
6. Update memory bank with progress

## Code Standards

- TypeScript strict mode
- Follow existing code style (ESLint + Prettier)
- Include tests for new functionality
- Update relevant documentation

## Don't

- Break existing functionality without migration path
- Skip tests for non-trivial changes
- Ignore linting errors
