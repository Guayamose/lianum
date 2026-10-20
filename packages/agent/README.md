# Agent domain

<p><a href="../../README.md"><img src="../../docs/assets/lianum.svg" width="110" alt="Lianum"></a></p>

[Documentation](../../docs/README.md) · [Architecture](../../docs/ARCHITECTURE.md) · [Validation](../../docs/VALIDATION.md)

The agent package owns durable conversational behavior; the separately deployed service supplies provider, gateway, backend and push adapters.

| Export | Responsibility |
| --- | --- |
| `@lianum/agent/store` | Owner-scoped messages, preferences, tasks, deliveries and retained session state |
| `@lianum/agent/runtime` | Accepted-turn execution, bounded context, recovery and follow-up coordination |
| `@lianum/agent/tools` | Scoped wallet observations, explicit memory/tasks and supported proposal tooling |

The package depends on the shared SDK and mobile protocol. It does not own a native wallet key or turn a conversational instruction into owner spending authority. Provider requests and background observation retain their own scopes.

[Agent design](../../docs/AGENT.md) · [Service setup](../../services/agent/README.md) · [Authority boundaries](../../docs/PRIVACY-AND-OPERATIONS.md)
