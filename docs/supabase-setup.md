# Supabase Setup

This guide is for the first shared online version of Nummirock Generator.

## 1. Create Project

1. Create a Supabase project.
2. Keep the project on the free tier while prototyping.
3. Save these values from Project Settings → API:
   - Project URL
   - publishable key, or legacy anon public key

Do not use the service role key in the frontend app.

## 2. Configure Local App

Create `.env` locally:

```text
VITE_SUPABASE_URL=your-project-url
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
```

`.env` is ignored by git. Do not commit it.

## 3. Run Schema

In Supabase SQL Editor, run:

```text
supabase/schema.sql
```

This creates:

- workspaces and memberships
- event years
- event days
- stages
- bands
- schedule acts
- performance slots
- auto-designs
- asset metadata
- generated export metadata
- changelog
- role-based Row Level Security policies

The role policies are safe to run again. They enforce this app model:

- `owner`: full access, including years, settings, stages, designs, bands, schedules, assets and deletion.
- `editor`: can manage bands, band assets, schedule slots and other schedule acts. Can view/export designs but cannot create, edit or delete designs. Cannot edit year settings, stages or event dates.
- `viewer`: can read years, bands, designs and schedules, and can export. Cannot create, edit or delete app data.

User creation still happens in Supabase Auth. Access is granted by adding the user to `workspace_members` with one of these roles.

## 4. Create Storage Bucket

Create a Storage bucket:

```text
nummirock-assets
```

Keep it private initially.

The app will use paths like:

```text
event-years/{event_year_id}/bands/{band_id}/logo.svg
event-years/{event_year_id}/bands/{band_id}/photo.png
event-years/{event_year_id}/stages/{stage_id}/logo.svg
event-years/{event_year_id}/exports/{export_id}/schedule.xlsx
```

## 5. Create First User

Use Supabase Auth to create/invite the first user.

Later we will add an in-app admin flow for inviting additional users.

## 6. Create First Workspace

For the first prototype, we can create the first workspace and membership manually in SQL after user signup:

```sql
insert into public.workspaces (name)
values ('Nummirock')
returning id;
```

Then add your authenticated user to that workspace:

```sql
insert into public.workspace_members (workspace_id, user_id, role)
values ('WORKSPACE_ID_HERE', 'AUTH_USER_ID_HERE', 'owner');
```

## 7. Migration After Setup

After the project is connected, the next app work is:

1. Read Supabase session in the app.
2. Build a migration importer from existing JSON backup.
3. Upload images/logos to Storage.
4. Insert rows into Supabase tables.
5. Verify row and asset counts.
6. Switch app reads/writes from IndexedDB to Supabase.
