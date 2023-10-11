# Contribution Guidelines

Welcome! If you're viewing this, it means that you are likely interested in contributing to the project. That's marvelous!

The following is a set of guidelines for contributing to `igir`. These guidelines are published in order to clarify expectations and reduce potential conflict of opinions.

## Feature requests & bug reports

Feedback is a gift! Your feature requests and bug reports help improve the project for everyone.

If you have an idea for a new feature, please [search for if an active issue already exists](https://github.com/emmercm/igir/issues). If an existing issue doesn't already exist, please submit a detailed [feature request](https://github.com/emmercm/igir/issues/new/choose) in GitHub. If you're not sure if your idea is ready for a full request, feel free to start a [discussion](https://github.com/emmercm/igir/discussions) in GitHub for feedback instead - it can always be turned into a feature request later!

If you are experiencing an issues, please submit a detailed [bug report](https://github.com/emmercm/igir/issues/new/choose) in GitHub.

## Discussions

[GitHub discussions](https://github.com/emmercm/igir/discussions) are a great tool for a number of topics:

- Getting help with `igir` CLI syntax or usage
- Clarifying support for specific features or scenarios
- Brainstorming new feature requests
- ...and more!

Discussions are intended to be low-pressure spaces for questions and collaboration, please feel free to use them openly!

## Code contributions

### Environment setup

First, you will want to check out `igir`'s source code from GitHub:

```shell
git clone https://github.com/emmercm/igir.git
```

`igir` is written in TypeScript for the Node.js runtime. The current version of Node.js that `igir` uses is defined in the `.nvmrc` file. After [installing](https://github.com/nvm-sh/nvm#installing-and-updating), nvm will let you easily switch to the correct Node.js version:

```shell
nvm install
nvm use
```

Third-party dependencies are managed and easily installed with npm:

```shell
npm install
```

Scripts are defined for common npm commands:

```shell
npm start -- [arguments..]
npm test
npm pack
```

### Running code

A script has been defined for the `npm start` command to easily run `igir`:

```shell
npm start -- [commands..] [options]
```

for example:

```shell
npm start -- report --dat *.dat --input ROMs/
```

### Code style

`igir` uses [ESLint](https://eslint.org/) as its linter and style enforcer. Rules have been specifically chosen to increase code consistency, safety, readability, and maintainability.

All code changes must pass the existing ESLint rules. Discussions on adding, removing, and changing ESLint rules should happen outside of pull requests that contain code changes, in their own dedicated pull request or discussion thread (above).

### Automated tests

`igir` uses [Jest](https://jestjs.io/) as its testing framework, and it uses [Codecov](https://about.codecov.io/) to ensure a minimum amount of test coverage.

All code changes must come with appropriate automated tests in order to prove correctness and to protect against future regressions.

### Docs

`igir` uses [MkDocs](https://www.mkdocs.org/) to turn Markdown files into a documentation website.

Appropriate updates must be made to all relevant documentation pages if functionality is added, removed, or changed.

### Git commit messages

`igir` is configured to squash-merge all pull requests, such that only the pull request title ends up in the commit history of the main branch. This means that individual commit messages are less important, and it puts more emphasis on quality pull request titles & descriptions.

That said, quality commit messages help future maintainers understand past intentions. Please use your best judgement on descriptive, clear, and concise commit messages.

### Pull request checklist

Here are steps that should be completed prior to submitting a pull request:

- [ ] Validate your change works as expected locally by running `igir` (not just the unit tests)
- [ ] Unit tests have been added to cover your change
- [ ] `npm test` has been run locally for your change, to validate:
  - Your added & changed tests are passing
  - Your added & changed code adheres to the linter settings
- [ ] Appropriate docs have been added or changed for your change
- [ ] Your branch has no conflicts with the main (destination) branch

### Pull requests

To contribute code changes, you will need to:

1. [Fork the repository](https://github.com/emmercm/igir/fork)
2. Create a new branch in your copy of the repository
3. Make any intended changes
4. Complete the above pull request checklist
5. [Create a pull request](https://github.com/emmercm/igir/compare), complete with a meaningful title & description
6. Ensure that all GitHub status checks are passing, otherwise address the related issue(s)
   1. Running tests in GitHub may require maintainer approval

## License

`igir` is licensed under [GNU General Public License v3.0](https://github.com/emmercm/igir/blob/main/LICENSE).

✅ That means that `igir` can be used for free commercially, can be modified, can be distributed, and can be used for private use.

⚠️ But it also means that distribution of closed-source versions is _not_ allowed.
