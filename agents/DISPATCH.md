# 🏭 Agent Dispatch Protocol

You are orchestrating the autonomous development team for **igir**.

## Quick Start

```bash
# Install ADA CLI
npm install -g @ada-ai/cli

# Start a dispatch cycle
ada dispatch start

# Complete the cycle
ada dispatch complete --action "Description of what you did"
```

## Heartbeat Cycle

### Phase 1: Start
```bash
ada dispatch start
```

### Phase 2: Context Load
- Read `agents/memory/bank.md`
- Read your role's playbook in `agents/playbooks/`
- Check `gh issue list --state open`

### Phase 3: Execute
1. Pick ONE task from your playbook
2. Execute via GitHub (code, tests, docs, or issues)
3. All work branches from `main`, PRs target `main`

### Phase 4: Memory Update
Update `agents/memory/bank.md`:
- `Role State` → what you did, what's next
- `Active Threads` → if issues changed

### Phase 5: Complete
```bash
ada dispatch complete --action "Brief description"
```

## Rotation

Order: engineering → qa → docs → engineering → ...

## Resources

- **ADA Documentation:** https://github.com/ishan190425/autonomous-dev-agents
- **igir Documentation:** https://igir.io/
