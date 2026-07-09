# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Version semantics for this app:

- **MAJOR** — a redesign or a break in familiar UX.
- **MINOR** — a new user-facing feature.
- **PATCH** — bug fixes and minor tweaks.

## [Unreleased]

## [0.1.2] - 2026-07-09

### Added
- Application version shown at the bottom of every page ([#18]).

## [0.1.1] - 2026-07-09

### Added

- Changelog and one-command release automation (`npm run release`).

## [0.1.0] - 2026-07-09

Initial release.

### Added

- Goals dashboard UI with static export, deployed to GitHub Pages.
- Delete goal action ([#6]).
- Playwright end-to-end tests, wired into CI.
- PR CI running lint and build ([#2]).

### Fixed

- Share button not working ([#3]).

[Unreleased]: https://github.com/e-maximus/goals-app/compare/v0.1.2...HEAD
[0.1.2]: https://github.com/e-maximus/goals-app/compare/v0.1.1...v0.1.2
[0.1.1]: https://github.com/e-maximus/goals-app/releases/tag/v0.1.1
[0.1.0]: https://github.com/e-maximus/goals-app/releases/tag/v0.1.0
[#2]: https://github.com/e-maximus/goals-app/pull/2
[#3]: https://github.com/e-maximus/goals-app/pull/3
[#6]: https://github.com/e-maximus/goals-app/pull/6
[#18]: https://github.com/e-maximus/goals-app/issues/18
