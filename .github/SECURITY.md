# Security policy

Any found security issues should be reported as a [new security advisory on GitHub](https://github.com/emmercm/igir/security/advisories/new). Security advisories are private by default so that attackers cannot immediately exploit it.

## Source control

- **Trunk branch protection.**

  All code pushed to Igir's main branch must go through a pull request, which must pass CI before merging. Nobody (including the project owner) is allowed to push code directly to the main branch.

  This has the added benefit that every commit to the main branch is GPG or SSH-signed (is ["verified"](https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification)).

## Dependencies

- **Automatic updates.**

  Dependencies are kept up-to-date automatically by [Renovate](https://www.mend.io/renovate/). This includes addressing [Dependabot vulnerability alerts](https://docs.github.com/en/code-security/concepts/supply-chain-security/dependabot-alerts).

  Dependency updates are held back for multiple days in the case a vulnerability is discovered quickly after release.

- **Pinned versions.**

  Dependencies have their versions pinned so that new, vulnerable versions are not immediately adopted.

## CI

- **Pinned GitHub Actions versions.**

  GitHub Actions have their version pinned to a commit hash so that Git tags cannot be silently moved to a new, malicious version.

- **Security auditing.**

  GitHub Actions are checked with [actionlint](https://github.com/rhysd/actionlint) and [zizmor](https://github.com/zizmorcore/zizmor) for common mistakes and dangerous patterns.

## Release

- **Immutable GitHub releases.**

  All releases on GitHub have been [immutable](https://docs.github.com/en/code-security/concepts/supply-chain-security/immutable-releases) since [v4.3.2](https://github.com/emmercm/igir/releases/tag/v4.3.2) (February 2026). That means that the published binaries cannot be modified or removed (even if they are found to be broken), and the release's Git tag cannot be moved to a different commit hash.

- **npm package provenance.**

  All releases on npm have been published with a [provenance statement](https://docs.npmjs.com/generating-provenance-statements) since [v1.9.3](https://www.npmjs.com/package/igir/v/1.9.3#provenance) (August 2023). This provides cryptographic evidence that the package was published by a GitHub Actions workflow.

- **npm publishing with OIDC.**

  All releases on npm require [publishing via OpenID Connect (OIDC)](https://docs.npmjs.com/trusted-publishers), which is only granted to the GitHub repository. This protects against humans (including the project owner) bypassing GitHub to publish new versions to npm.
