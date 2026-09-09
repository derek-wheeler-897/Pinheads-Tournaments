# Pinheads offline mode

## 1. Supabase
Run `supabase_offline_migration.sql` once in Supabase SQL Editor.

This adds:
- `tournament_matches.match_type`
- `tournament_matches.version`
- idempotent sync operations
- atomic tournament bundle sync
- atomic result recording
- atomic undo
- atomic tournament completion/cancellation/deletion

## 2. Files
Replace these files in `src/` / `src/pages/`:
- `src/pages/Tournament.jsx`
- `src/pages/CurrentTournament.jsx`
- `src/pages/PlayerStats.jsx`
- `src/pages/TournamentHistory.jsx`
- `src/lib/offlineStore.js`
- `src/lib/offlineStatus.js`
- `src/main.jsx`

Create:
- `public/sw.js`

Do not replace `App.jsx`.

## 3. First-time setup on an iPhone/iPad
The device must be online once before an offline tournament so Pinheads can cache players, locations, machines, and tournament types.

Then:
1. Open the web app while online.
2. Allow it to finish loading.
3. Add it to the Home Screen in Safari.
4. Open the Home Screen version once while online.
5. After that, the active tournament can continue without internet.

## 4. Offline behavior
- Tournament setup reads cached players/locations/machines.
- Creating a tournament works offline.
- Recording winners works offline.
- Editing/undoing results works offline.
- Winner-take-all playoff works offline.
- Completing/cancelling works offline.
- Changes are queued in IndexedDB.
- When connectivity returns, the queue automatically syncs to Supabase.
- Supabase RPCs make server writes atomic and idempotent.
- Version checks prevent silent overwrites from another device.

## 5. Important operating rule
For tournament night, use one designated scoring device for the active tournament. The app protects against stale concurrent writes, but the cleanest tournament workflow remains one scorer/device.
