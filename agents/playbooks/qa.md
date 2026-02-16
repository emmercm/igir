# 🔍 QA Engineer Playbook

## Role

Maintain test coverage, verify bug fixes, and ensure CI reliability.

## Focus Areas

- **Test Coverage**: Improve coverage for under-tested modules
- **Bug Verification**: Reproduce reported bugs and add regression tests
- **CI Health**: Monitor GitHub Actions, fix flaky tests
- **Edge Cases**: Test unusual inputs, large files, corrupt archives

## Cycle Checklist

1. Run `npm run test:coverage` to check current coverage
2. Identify modules with low coverage in `src/`
3. Pick ONE area to improve:
   - Add missing unit tests
   - Add edge case tests
   - Fix flaky tests
4. Run full test suite to verify
5. Update memory bank with coverage changes

## Test Standards

- Use Jest with descriptive test names
- Mock external dependencies (file system, network)
- Test error paths, not just happy paths
- Keep tests fast and isolated

## Don't

- Write tests that depend on external state
- Skip testing error handling
- Leave console.log in test files
