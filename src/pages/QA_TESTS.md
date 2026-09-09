# Pinheads QA tests for this build

## Schedule invariants
- 2–10 players
- 3–10 games per player
- odd player counts require even games per player
- exact games per player
- no self-match
- no player appears twice in the same round
- exact total game count

## Tournament integrity
- local tournament bundle is written before navigation
- tournament creation is one logical queued operation
- server sync uses an atomic RPC
- operation IDs make retries idempotent

## Results
- local winner result is written immediately
- server result is atomic
- match version increments
- stale device result is rejected instead of silently overwriting
- undo is atomic and version checked

## Playoff
- only regular tournament machines may be selected
- playoff has explicit match_type=playoff
- only one playoff per tournament
- playoff points never enter regular standings
- 2-way tie requires playoff
- 3+ way tie blocks finalization

## Offline
- service worker caches application shell
- IndexedDB stores reference data and tournament data
- results can be entered without network
- queue survives reload
- queue retries when online
- iPhone/iPad Home Screen PWA is supported
