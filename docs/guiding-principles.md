# Guiding Principles

It is intended that Igir lives by these tenets:

- **Igir should be predictable.**

  Igir should only perform the actions that you tell it, and those actions should be obvious based on the command & option names. Igir should not take any action you did not specify.

  This includes being deterministic & repeatable. Igir should perform the same actions every time given the same inputs (including filesystem state).

- **Igir should have safe defaults.**

  Igir's option defaults should work for the most number of people out of the box. This may require more processing than is required for every situation, but it will produce the most predictable results.

  This includes being non-destructive by default. Igir should respect your data. Igir will not delete any files unless you explicitly provide it relevant commands & options.

- **Igir should be scriptable.**

  It should be easy to use Igir in a larger, scripted workflow. Igir should not require any prompts during execution.

- **Igir should be portable.**

  Igir should work on the most number of OSes and CPU architectures that is feasible. Igir should support all actively supported major LTS versions of Node.js.

- **Igir should be well-documented.**

  All of Igir's behavior should be documented in as clear English as possible. No command or option should behave in a manner that isn't explained in the documentation.

- **Igir should not spy on you.**

  Igir should not make any network requests other than what is required, including emitting any kind of usage or telemetry data.

- **Igir should be semantically versioned.**

  Igir should adhere to the [semantic versioning](https://semver.org/) standards of major, minor, and patch versions. Igir will only introduce potentially breaking functionality during major version updates.

If you find that Igir is violating any of these tenets, please open an [issue on GitHub](https://github.com/emmercm/igir/issues/new/choose)!
