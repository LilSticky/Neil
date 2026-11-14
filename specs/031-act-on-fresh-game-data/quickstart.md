# Quickstart: Act on fresh game data

## Automated

```powershell
npm run typecheck; npm run lint; npm run test
```

Expect the client tests to show: `?fresh=1` on live lookups and not on copy lookups; `asOf` = receive − `age_seconds`;
a live lookup skipping a cached old copy; a live answer reused within the cache window.

## Manual (test server, after the deploy)

1. `/player` for a Player nobody looked up today: the footer's "as of" may be hours back (the tracker's copy age).
2. Officer Link or an Interview Link of a test Member: the log shows one request; roles and nickname match the game now.
3. `/booty` in an `alliance-chat`: the Members online in the game right now are mentioned.
4. `/quota` before and after: each step costs the same number of requests as before the slice.
