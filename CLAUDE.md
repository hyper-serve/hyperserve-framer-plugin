# Working in this repo

Every change ships with tests. Logic lives in plain modules under `src/` with
unit tests next to them; screens get component tests against the Framer mock
in `src/test/framerMock.ts`. "I checked it in Framer" is not a substitute.

A test that recomputes the answer in its own body is not a test. Drive the
real function.

Never put the API key in `framer.setPluginData`: that storage is shared with
everyone on the project. It lives in `localStorage` (`src/keyStore.ts`).
