# Supabase Migration Plan

## Goal

Move Nummirock Generator from browser-local IndexedDB to a shared online database while keeping the app cheap to host and safe to recover.

The shared backend should allow multiple users to:

- log in to the same event workspace
- edit bands, stages, schedules, and designs from different browsers
- keep images/logos in shared storage
- export Canva-ready XLSX/CSV/PDF data from the current source of truth
- see a changelog of app data edits
- recover from accidental edits or deletes

## Cost Target

Start on Supabase Free if possible.

Important size expectations:

- Current JSON backup is around 100MB because it includes images as base64.
- Base64 is larger than the original binary files.
- In Supabase, binary assets should live in Storage, while the database stores metadata and storage paths.
- Estimated working size of 100-500MB should be reasonable for the prototype if we avoid storing duplicate generated exports forever.

## First Architecture

Frontend:

- Keep the current Vite/React app.
- It can stay on GitHub Pages initially.

Backend:

- Supabase Postgres for structured data.
- Supabase Storage for uploaded logos/photos and generated export files.
- Supabase Auth for user login.

Authentication:

- Use email/password accounts, not one shared password.
- This lets the changelog record who changed each item.
- If we want a simple shared access gate later, add workspace membership rather than hiding the whole app behind one secret.

## Public Repository Safety

The GitHub repository can stay public if secrets and private event data never enter it.

Safe to commit:

- app source code
- database schema
- public Supabase project URL
- Supabase publishable key, or legacy anon public key
- UI assets that are meant to ship with the app

Never commit:

- Supabase service role key
- database password
- JWT secret
- `.env` files with real values
- JSON/ZIP backups
- XLSX/CSV/PDF exports with private schedule data
- generated assets or unpublished festival data

The Supabase publishable key / legacy anon key is expected to be public in a browser app. Security must come from Row Level Security policies and private Storage buckets, not from hiding frontend code.

The repo ignores backups and exports by default. Keep using `.env.example` for variable names and `.env` for local real values.

## Data Ownership

Each event year is the root object.

Deleting an event year must delete:

- event days
- stages
- schedule acts
- performance slots
- bands
- auto-designs
- old legacy designs, until removed
- registered asset metadata
- generated export metadata
- storage files belonging to that event year

Database rows can be deleted with `ON DELETE CASCADE`.

Storage files do not automatically disappear just because a row was deleted. The app must use a controlled delete flow:

1. User confirms deleting an event year.
2. App creates a full JSON backup first, or asks user to confirm skipping it.
3. App deletes all Storage objects under `event-years/{event_year_id}/`.
4. App deletes the `event_years` row.
5. Postgres cascades the database rows.
6. Changelog records the deletion summary.

This prevents Supabase Storage from bloating with orphaned images.

## Storage Path Convention

Use event-year scoped paths:

```text
event-years/{event_year_id}/bands/{band_id}/logo.svg
event-years/{event_year_id}/bands/{band_id}/photo.png
event-years/{event_year_id}/bands/{band_id}/composite.png
event-years/{event_year_id}/stages/{stage_id}/logo.svg
event-years/{event_year_id}/exports/{export_id}/schedule.xlsx
```

The `asset_files` table stores the canonical metadata for these objects.

## Backup Strategy

For now, keep the JSON backup/export feature.

The Supabase version should still support a full backup export that includes:

- all database rows for selected event years
- all referenced Storage files encoded into the JSON backup, or exported as a ZIP package later

The current local JSON backup includes the images and data. We should preserve that safety model during migration.

Later, a ZIP backup is probably better than one huge JSON file:

```text
nummirock-backup-YYYY-MM-DDTHH-MM-SS.zip
  data.json
  assets/...
```

## Changelog Strategy

Create `change_log` rows for meaningful changes:

- create/update/delete event year
- create/update/delete band
- create/update/delete stage
- create/update/delete slot
- create/update/delete schedule act
- create/update/delete auto-design
- upload/replace/delete asset

Each log row should include:

- workspace/event year
- table name
- row id
- action
- previous data JSON
- new data JSON
- user id
- timestamp

First implementation:

- show a read-only changelog.

Second implementation:

- allow restoring one item from a previous `old_data` or `new_data` snapshot.

Third implementation:

- restore an entire event year from a backup snapshot.

## Migration Phases

### Phase 1: Schema and Config

- Add Supabase schema.
- Add environment variables.
- Add Supabase client package.
- Add login screen.
- Keep IndexedDB as-is.

### Phase 2: Upload Current Data

- Build migration/import from current JSON backup into Supabase.
- Upload image blobs to Storage.
- Insert database rows with stable relationships.
- Verify counts:
  - event years
  - bands
  - stages
  - event days
  - slots
  - schedule acts
  - auto-designs

### Phase 3: Read From Supabase

- Add a data layer that can read from Supabase.
- Start with year list and scheduler data.
- Keep IndexedDB export/import available.

### Phase 4: Write To Supabase

- Move create/update/delete operations to Supabase.
- Add changelog writes.
- Add Storage upload replacement for logos/photos.

### Phase 5: Safe Deletes

- Implement controlled event-year delete flow.
- Delete Storage folder first.
- Delete DB row second.
- Confirm cascades.

### Phase 6: Supabase-backed Exports

- Generate XLSX/CSV/PDF from Supabase data.
- Optionally store generated exports in Supabase Storage and show shareable download links.

## Open Decisions

- Whether to keep GitHub Pages or move frontend hosting to Vercel/Netlify.
- Whether changelog is implemented in app code first or database triggers first.
- Whether full backups stay JSON or become ZIP.
- Whether generated exports should be retained or automatically deleted after a small number per event year.
