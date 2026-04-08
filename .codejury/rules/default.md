# Default CodeJury Review Rules

These rules are injected into every expert's system prompt.

1. Flag any hardcoded secrets or API keys
2. Warn about functions exceeding 50 lines
3. Check for missing error handling in async functions
4. Ensure all public APIs have proper input validation
5. Flag direct database queries without parameterization
