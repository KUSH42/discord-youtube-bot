
# Test Architecture & CI Framework

## 1. Introduction & Purpose

This document serves as the definitive architectural guideline and detailed documentation for the project's testing and Continuous Integration (CI) framework. It is designed for both human developers and AI agents to gain a deep understanding of our testing practices.

The primary purpose of this guide is to:
- Define our testing philosophy and strategy.
- Standardize the structure, location, and conventions for all test types.
- Detail the tools and frameworks used in our testing ecosystem.
- Explain the Continuous Integration (CI) process and how tests are executed and reported.
- Provide clear, actionable instructions for maintaining and expanding the test suite.

A robust testing framework is critical for ensuring code quality, stability, and preventing regressions. It enables confident, rapid development and deployment cycles. For our AI development assistants, this document is the foundational knowledge base, enabling them to autonomously improve, expand, and maintain our test suite and CI processes.

## 2. Testing Philosophy & Principles

Our testing strategy is guided by the following core principles:

- **Fast Feedback Loops:** Tests should run quickly, especially those executed frequently during development.
- **High Confidence on Critical Paths:** We prioritize comprehensive testing of core functionalities and critical user flows.
- **Adherence to the Testing Trophy Model:** We strive for a balanced portfolio of tests, with a strong base of unit tests, a healthy number of integration tests, and a select group of E2E tests for critical workflows.
- **Maintainability Over Sheer Coverage:** While we aim for high coverage, the clarity, readability, and maintainability of tests are paramount.
- **Reliability:** Tests must be deterministic and free of flakiness.
- **Shift-Left Testing:** We aim to catch issues as early as possible in the development lifecycle.

## 3. Test Types & Scope

### 3.1. Unit Tests

- **Definition:** Unit tests verify the functionality of individual, isolated units of code, such as functions, methods, or components. Their primary objective is to ensure that each unit of the software performs as designed.
- **Tools/Frameworks:** [Jest](https://jestjs.io/)
- **Location:** `tests/unit/`
- **Conventions:**
    - **Naming:** `*.test.js`
    - **Mocking:** Mocks are located in `tests/mocks/`. Jest's built-in mocking features (`jest.mock`, `jest.spyOn`) are used extensively to isolate units under test.
- **AI Agent Guidance:**
    - Prioritize creating unit tests for all new functions and logic.
    - When fixing a bug, first write a failing unit test that reproduces the issue, then implement the fix.
    - Ensure all mocks are cleared between tests using `jest.clearAllMocks()`.

### 3.2. Integration Tests

- **Definition:** Integration tests verify that different modules or services used by the application work together as expected. These tests focus on the interactions between components.
- **Tools/Frameworks:** [Jest](https://jestjs.io/)
- **Location:** `tests/integration/`
- **Conventions:**
    - **Naming:** `*.test.js`
    - **Environment:** These tests run in a Docker container with dependent services (like Redis) available.
- **AI Agent Guidance:**
    - Create integration tests for workflows that involve multiple internal modules (e.g., the command processor interacting with the Discord service).
    - Focus on testing the contracts and data flow between integrated parts.

### 3.3. End-to-End (E2E) Tests

- **Definition:** E2E tests simulate real user scenarios and verify that the entire application works as expected from start to finish. This includes the UI, backend services, and external integrations.
- **Tools/Frameworks:** [Jest](https://jestjs.io/), [Playwright](https://playwright.dev/) (for browser interactions)
- **Location:** `tests/e2e/`
- **Conventions:**
    - **Naming:** `*.test.js`
    - **Configuration:** E2E tests use `jest.e2e.config.js`.
- **AI Agent Guidance:**
    - Add E2E tests for new critical user journeys.
    - When a bug is found in production, consider if an E2E test could have caught it.
    - Analyze flaky E2E tests and propose more robust solutions (e.g., improved waiting strategies, atomic assertions).

### 3.4. Performance Tests

- **Definition:** Performance tests measure the application's responsiveness, stability, and scalability under a given workload.
- **Tools/Frameworks:** [Jest](https://jestjs.io/)
- **Location:** `tests/performance/`
- **Conventions:**
    - **Naming:** `*.test.js`
    - **Focus:** These tests are designed to benchmark critical operations and identify performance regressions.
- **AI Agent Guidance:**
    - Analyze the output of performance tests to identify bottlenecks.
    - Propose optimizations to the code or test environment to improve performance.

### 3.5. Security Tests

- **Definition:** Security tests are designed to uncover vulnerabilities in the application and ensure that it is robust against common threats.
- **Tools/Frameworks:** [Jest](https://jestjs.io/), `npm audit`
- **Location:** `tests/security/`
- **Conventions:**
    - **Naming:** `*.test.js`
    - **Configuration:** Security tests use `jest.security.config.js`.
    - **Focus:** Tests include input validation, dependency vulnerability checks, and checks for potential secret leaks.
- **AI Agent Guidance:**
    - Add new security tests for any new input processing logic.
    - Regularly check for and propose fixes for vulnerabilities reported by `npm audit`.

### 3.6. Accessibility (A11y) Tests

- (Not currently implemented)

## 4. Test Frameworks & Libraries

- **[Jest](https://jestjs.io/):** The primary testing framework for unit, integration, E2E, performance, and security tests.
- **[Playwright](https://playwright.dev/):** Used for browser automation in E2E tests.
- **[ESLint](https://eslint.org/):** For static code analysis and enforcing code style.
- **[Prettier](https://prettier.io/):** For consistent code formatting.
- **[Codecov](https://about.codecov.io/):** Used for tracking code coverage.

## 5. Test Structure & Code Conventions

- **File Naming & Organization:** Test files are co-located in the `tests/` directory, under subdirectories corresponding to the test type.
- **Test Data Management:** Test data and fixtures are managed within the tests themselves or in the `tests/fixtures/` directory.
- **Mocking/Stubbing/Spying Strategy:** Jest's built-in functions (`jest.mock`, `jest.spyOn`, `jest.fn`) are the standard for creating test doubles.
- **Assertion Style:** The `expect` assertion style from Jest is used (`expect(value).toBe(expected)`).
- **Readability & Maintainability:** Tests should follow the **Arrange-Act-Assert** pattern. Each test should have a single, clear responsibility.

## 6. Continuous Integration (CI) Framework

- **CI/CD Platform:** [GitHub Actions](https://github.com/features/actions)
- **Workflow Triggers:**
    - `push`: On pushes to `main`, `master`, `dev`, and `develop` branches.
    - `pull_request`: On pull requests targeting the main branches.
    - `schedule`: Daily runs at 2 AM UTC.
    - `workflow_dispatch`: Manual runs.
- **Test Execution Commands:**
    - **All Tests (via individual jobs):** The CI pipeline runs each test suite in a separate job.
    - **Unit Tests:** `npm run test:unit`
    - **Integration Tests:** `npm run test:integration`
    - **E2E Tests:** `npm run test:e2e`
    - **Performance Tests:** `npm run test:performance`
    - **Security Tests:** `npm run test:security`
    - **Linting:** `npm run lint`
- **Reporting:**
    - **Code Coverage:** Coverage is collected using Jest's `--coverage` flag and uploaded to [Codecov](https://app.codecov.io/gh/KUSH42/discord-youtube-bot). Merged reports are generated in CI.
    - **Test Results:** Test results and artifacts are uploaded to GitHub Actions for each run.
- **Quality Gates & Checks:**
    - All tests must pass before a pull request can be merged.
    - The `lint` job must pass.
    - A minimum code coverage threshold is enforced by Codecov (see Codecov settings for specifics, currently aiming for >25%).

## 7. Local Development Workflow

- **Running All Tests:**
  ```shell
  npm test
  ```
- **Running Tests for a Specific File:**
  ```shell
  npm test -- <path_to_file>
  ```
- **Running Tests in Watch Mode:**
  ```shell
  npm run test:watch
  ```
- **Generating Coverage Reports:**
  ```shell
  npm run test:coverage
  ```
  The report is generated in the `coverage/` directory. Open `coverage/lcov-report/index.html` to view it.

## 8. Contribution Guidelines & AI Agent Directives

- **Adding New Tests:** All new features and bug fixes must be accompanied by corresponding tests. The type of test (unit, integration, etc.) should be chosen based on the nature of the change.
- **Updating Existing Tests:** When refactoring or modifying code, the corresponding tests must be updated to reflect the changes.

### AI Agent Specific Directives:

- **Coverage Improvement:** Proactively identify critical modules with low test coverage and generate new tests to cover untested logic.
- **Flakiness Detection & Resolution:** Analyze test results to identify flaky tests and propose deterministic fixes.
- **Performance Optimization:** Analyze test runtimes and suggest optimizations.
- **CI Optimization:** Propose improvements to the GitHub Actions workflow (`.github/workflows/test.yml`) for speed, efficiency, or robustness.
- **Code Generation:** Generate new test files and test cases, strictly adhering to the conventions defined in this document.

## 9. Troubleshooting & Common Issues

- **`Module not found`:** This usually indicates a problem with module mocking or a missing dependency. Verify that `jest.mock` is used correctly or run `npm install`.
- **Timeout Errors:** In E2E or integration tests, this can indicate a slow response from an external service or a flaw in the test's waiting mechanism.
- **Flaky E2E Tests:** Often caused by race conditions or timing issues. Investigate the test flow and add more robust waiting mechanisms (e.g., `waitForSelector` instead of fixed delays).

## 10. Future Enhancements & Roadmap

- **Mutation Testing:** Explore integrating a mutation testing framework to assess the quality of our tests.
- **Contract Testing:** For services we don't own, introduce contract testing to ensure our integrations remain valid.
- **Expand Performance Testing:** Broaden the scope of performance tests to cover more application scenarios.

## 11. Support & Contact

For any questions or issues related to the testing framework or CI pipeline, please refer to the project's main `README.md` or open an issue in the GitHub repository.
