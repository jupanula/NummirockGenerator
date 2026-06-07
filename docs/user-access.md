# User Access

Nummirock Generator uses Supabase Auth for login and `workspace_members` for app roles.

## Roles

- `owner`: full access to event years, settings, stages, bands, designs, schedules, exports and deletion.
- `editor`: can edit bands, band assets, schedule slots and other schedule acts. Can view and export designs. Cannot create, edit or delete years, settings, stages or designs.
- `viewer`: can view years, bands, designs and schedules. Can export designs and schedules. Cannot create, edit or delete app data.

## Add A User

1. Open Supabase.
2. Go to Authentication -> Users.
3. Create or invite the user by email.
4. Copy the user's UID.
5. Go to Table Editor -> `workspace_members`.
6. Add a row:
   - `workspace_id`: the Nummirock workspace id
   - `user_id`: the copied Auth user UID
   - `role`: `editor` or `viewer`
7. Ask the user to log in.

Use `owner` only for people who should be able to delete years, edit settings and manage structural data.

## Change A Role

1. Open Supabase Table Editor.
2. Open `workspace_members`.
3. Find the user row.
4. Change `role` to `owner`, `editor` or `viewer`.
5. Save and ask the user to refresh the app.

## Remove Access

1. Open Supabase Table Editor.
2. Open `workspace_members`.
3. Delete the user's membership row.
4. Optional: disable or delete the user under Authentication -> Users.

Deleting the membership row removes Generator access while keeping the Auth user available for future reuse.

## Safety Rules

- Do not share the Supabase service-role key.
- Do not commit private keys to GitHub.
- Only publishable Supabase keys belong in the browser app.
- Prefer `viewer` for people who only need exports.
- Prefer `editor` for people who need to maintain bands or schedules.
- Keep `owner` limited.

## Test Checklist

After adding or changing a user role:

- Confirm the account modal shows the correct email and role.
- For `editor`, Settings and year creation should be hidden, bands and schedule should be editable, designs should be view/export only.
- For `viewer`, editing controls should be hidden or disabled, but exports should work.
- For `owner`, all controls should remain available.
