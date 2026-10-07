# checkout-submodules

A replacement for [actions/checkout](https://github.com/actions/checkout)'s `submodules: 'recursive'` that only checks out the nested submodules the native addons build. This helps save substantial time across many workflows.

This action doesn't use any cache, so it's safe to use in workflows that publish.

## Usage

The repository must be checked out first, without submodules:

```yaml
- uses: actions/checkout@<commit>
  with:
    persist-credentials: false
- uses: ./.github/actions/checkout-submodules
```
