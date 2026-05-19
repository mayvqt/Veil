## Engineering standards

Always write production-quality, maintainable, modular code.

Architecture:

- Do not put everything into one massive file.
- Keep entrypoints thin and focused on wiring/config/bootstrap only.
- Split code by responsibility and domain.
- Separate UI, business logic, data access, configuration, validation, and infrastructure concerns.
- Prefer modular architecture over monolithic files.
- Keep files, classes, modules, and functions focused and reasonably small.
- Refactor when a file starts becoming a dumping ground.

Code quality:

- Prioritize readability and maintainability over cleverness.
- Write explicit, predictable code.
- Avoid hidden side effects and tightly coupled logic.
- Prefer composition over deep inheritance.
- Keep abstractions practical and justified.
- Avoid premature optimization and unnecessary complexity.
- Eliminate duplication where reasonable.
- Remove dead code, stale comments, unused imports, and obsolete logic.
- Use descriptive naming consistently.
- Keep public APIs/interfaces minimal and intentional.

Structure:

- Organize code by feature/domain when possible instead of dumping by technical type only.
- Avoid generic folders/files like `misc`, `utils`, `helpers`, or `common` unless truly shared.
- Keep dependency direction clean.
- Avoid circular dependencies.
- Isolate external services and I/O boundaries.
- Keep configuration centralized and environment-safe.

Reliability:

- Validate inputs at boundaries.
- Handle errors explicitly and consistently.
- Fail safely with useful error messages.
- Consider edge cases, concurrency, retries, race conditions, and cleanup behavior.
- Do not swallow exceptions/errors silently.

Performance:

- Optimize for correctness first.
- Write efficient code without sacrificing readability.
- Avoid unnecessary allocations, queries, renders, loops, requests, or recomputation.
- Only introduce advanced optimization when there is measurable benefit or clear reasoning.

Security:

- Never trust user input.
- Sanitize and validate external data.
- Avoid leaking secrets, credentials, or internal details.
- Use least-privilege principles where applicable.
- Be careful with authentication, authorization, file access, and serialization/deserialization.

Testing:

- Add or update tests for changed behavior.
- Cover success paths, edge cases, and failure cases.
- Prefer deterministic and isolated tests.
- Keep tests maintainable and readable.
- Run linting, formatting, type checks, and relevant tests when possible.

Frontend/UI:

- Keep components small and composable.
- Avoid massive stateful components.
- Separate presentation from business logic.
- Minimize unnecessary renders and prop drilling.
- Prioritize accessibility, responsiveness, and UX consistency.

Backend/API:

- Keep handlers/controllers thin.
- Put business logic into services/modules.
- Keep database access isolated.
- Avoid fat routes/endpoints.
- Use clear request/response contracts.

Before finishing:

- Review whether any file or module became too large or mixed responsibilities.
- Refactor if needed for clarity and maintainability.
- Ensure naming, structure, and architecture remain consistent.
- Summarize architectural/file structure changes.
- Mention tests/checks run and any remaining tradeoffs or risks.