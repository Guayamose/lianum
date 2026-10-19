# Account persistence

`durable-generic-account-keeper.mjs` composes the generic engine coordinator with the encrypted parent record, SOURCE session and typed lifecycle record. It alone owns the private durable-keeper brand.

The engine receives three persistence operations: initial state (`opening`), checkpoint retention (`retain`) and closure (`close`). It receives no session verifier or callback that could mint durable membership. The same keeper object, operation lock, child process and generic-account brand remain intact. Backend checks its own original objects before binding or reading a session.

SOURCE checkpoint sequence:

1. Validate the original session/keeper and publish the candidate.
2. Update the parent record through CAS and verify readback.
3. Confirm the checkpoint and check the original child process.
4. Update the lifecycle record, when present.

Any failure blocks the coordinator. Copying an object, implementing the port or creating a generic keeper cannot create a durable keeper. Capture still closes the child process; reopening requires the retained checkpoint and preserves single-use admission.

Import `@lianum/backend/accounts/durable-keeper`. For coordination without SOURCE/wrapped integration, use `@lianum/engine/accounts/keeper`. There is no second registry or duplicate engine implementation.
