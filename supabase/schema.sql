-- Nummirock Generator Supabase schema draft
-- This is the first shared-database model. It is intentionally explicit about
-- cascade rules so deleting an event year removes dependent database rows.
--
-- Storage files still require app/edge-function cleanup. See docs/supabase-migration-plan.md.

create extension if not exists pgcrypto;

create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workspace_members (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'editor' check (role in ('owner', 'editor', 'viewer')),
  created_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table if not exists public.event_years (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  year integer not null,
  separator_color text not null default '#E6007E',
  separator_char text not null default '■',
  name_text_color text not null default '#FFFFFF',
  start_date date,
  end_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, year)
);

create table if not exists public.event_days (
  id uuid primary key default gen_random_uuid(),
  event_year_id uuid not null references public.event_years(id) on delete cascade,
  date date not null,
  title_fi text not null,
  title_en text not null,
  display_date text not null,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_year_id, date)
);

create table if not exists public.stages (
  id uuid primary key default gen_random_uuid(),
  event_year_id uuid not null references public.event_years(id) on delete cascade,
  name text not null,
  logo_asset_id uuid,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.bands (
  id uuid primary key default gen_random_uuid(),
  event_year_id uuid not null references public.event_years(id) on delete cascade,
  name text not null,
  logo_asset_id uuid,
  photo_asset_id uuid,
  composite_asset_id uuid,
  is_headliner boolean not null default false,
  include_in_designs boolean not null default true,
  sort_order integer not null default 0,
  logo_scale numeric not null default 1,
  logo_offset_x numeric not null default 0,
  logo_offset_y numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.schedule_acts (
  id uuid primary key default gen_random_uuid(),
  event_year_id uuid not null references public.event_years(id) on delete cascade,
  name text not null,
  type text not null default 'activity' check (type in ('performer', 'activity', 'host', 'other')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.performance_slots (
  id uuid primary key default gen_random_uuid(),
  event_year_id uuid not null references public.event_years(id) on delete cascade,
  event_day_id uuid not null references public.event_days(id) on delete cascade,
  stage_id uuid not null references public.stages(id) on delete cascade,
  band_id uuid references public.bands(id) on delete set null,
  schedule_act_id uuid references public.schedule_acts(id) on delete set null,
  display_time text not null,
  sort_minutes integer not null,
  end_display_time text,
  end_sort_minutes integer,
  is_after_midnight boolean not null default false,
  is_end_after_midnight boolean,
  is_tba boolean not null default true,
  tba_text text not null default 'TBA',
  visibility text not null default 'public' check (visibility in ('public', 'hidden')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint slot_end_after_start check (end_sort_minutes is null or end_sort_minutes > sort_minutes),
  constraint slot_one_assignment check (
    band_id is null
    or schedule_act_id is null
  )
);

create table if not exists public.auto_designs (
  id uuid primary key default gen_random_uuid(),
  event_year_id uuid not null references public.event_years(id) on delete cascade,
  name text not null,
  config jsonb not null,
  thumbnail_asset_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.asset_files (
  id uuid primary key default gen_random_uuid(),
  event_year_id uuid not null references public.event_years(id) on delete cascade,
  owner_table text not null,
  owner_id uuid,
  kind text not null,
  bucket text not null default 'nummirock-assets',
  storage_path text not null,
  mime_type text not null,
  size_bytes bigint,
  width integer,
  height integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (bucket, storage_path)
);

alter table public.stages
  add constraint stages_logo_asset_fk
  foreign key (logo_asset_id) references public.asset_files(id) on delete set null;

alter table public.bands
  add constraint bands_logo_asset_fk
  foreign key (logo_asset_id) references public.asset_files(id) on delete set null;

alter table public.bands
  add constraint bands_photo_asset_fk
  foreign key (photo_asset_id) references public.asset_files(id) on delete set null;

alter table public.bands
  add constraint bands_composite_asset_fk
  foreign key (composite_asset_id) references public.asset_files(id) on delete set null;

alter table public.auto_designs
  add constraint auto_designs_thumbnail_asset_fk
  foreign key (thumbnail_asset_id) references public.asset_files(id) on delete set null;

create table if not exists public.generated_exports (
  id uuid primary key default gen_random_uuid(),
  event_year_id uuid not null references public.event_years(id) on delete cascade,
  asset_file_id uuid references public.asset_files(id) on delete set null,
  export_type text not null,
  filename text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.change_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  event_year_id uuid references public.event_years(id) on delete set null,
  table_name text not null,
  row_id uuid,
  action text not null check (action in ('create', 'update', 'delete', 'restore')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists event_years_workspace_idx on public.event_years(workspace_id, year);
create index if not exists event_days_year_order_idx on public.event_days(event_year_id, sort_order);
create index if not exists stages_year_order_idx on public.stages(event_year_id, sort_order);
create index if not exists bands_year_order_idx on public.bands(event_year_id, sort_order);
create index if not exists slots_year_day_time_idx on public.performance_slots(event_year_id, event_day_id, sort_minutes);
create index if not exists slots_stage_time_idx on public.performance_slots(stage_id, sort_minutes);
create index if not exists assets_year_idx on public.asset_files(event_year_id);
create index if not exists change_log_year_idx on public.change_log(event_year_id, created_at desc);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_workspaces_updated_at on public.workspaces;
create trigger touch_workspaces_updated_at
before update on public.workspaces
for each row execute function public.touch_updated_at();

drop trigger if exists touch_event_years_updated_at on public.event_years;
create trigger touch_event_years_updated_at
before update on public.event_years
for each row execute function public.touch_updated_at();

drop trigger if exists touch_event_days_updated_at on public.event_days;
create trigger touch_event_days_updated_at
before update on public.event_days
for each row execute function public.touch_updated_at();

drop trigger if exists touch_stages_updated_at on public.stages;
create trigger touch_stages_updated_at
before update on public.stages
for each row execute function public.touch_updated_at();

drop trigger if exists touch_bands_updated_at on public.bands;
create trigger touch_bands_updated_at
before update on public.bands
for each row execute function public.touch_updated_at();

drop trigger if exists touch_schedule_acts_updated_at on public.schedule_acts;
create trigger touch_schedule_acts_updated_at
before update on public.schedule_acts
for each row execute function public.touch_updated_at();

drop trigger if exists touch_performance_slots_updated_at on public.performance_slots;
create trigger touch_performance_slots_updated_at
before update on public.performance_slots
for each row execute function public.touch_updated_at();

drop trigger if exists touch_auto_designs_updated_at on public.auto_designs;
create trigger touch_auto_designs_updated_at
before update on public.auto_designs
for each row execute function public.touch_updated_at();

drop trigger if exists touch_asset_files_updated_at on public.asset_files;
create trigger touch_asset_files_updated_at
before update on public.asset_files
for each row execute function public.touch_updated_at();

-- RLS foundation. Policies are intentionally simple for the first shared app:
-- users can access rows belonging to workspaces where they are members.

alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.event_years enable row level security;
alter table public.event_days enable row level security;
alter table public.stages enable row level security;
alter table public.bands enable row level security;
alter table public.schedule_acts enable row level security;
alter table public.performance_slots enable row level security;
alter table public.auto_designs enable row level security;
alter table public.asset_files enable row level security;
alter table public.generated_exports enable row level security;
alter table public.change_log enable row level security;

create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.is_event_year_member(target_event_year_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_years ey
    join public.workspace_members wm on wm.workspace_id = ey.workspace_id
    where ey.id = target_event_year_id
      and wm.user_id = auth.uid()
  );
$$;

create or replace function public.has_workspace_role(target_workspace_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.role = any(allowed_roles)
  );
$$;

create or replace function public.has_event_year_role(target_event_year_id uuid, allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.event_years ey
    join public.workspace_members wm on wm.workspace_id = ey.workspace_id
    where ey.id = target_event_year_id
      and wm.user_id = auth.uid()
      and wm.role = any(allowed_roles)
  );
$$;

drop policy if exists "workspace members read workspaces" on public.workspaces;
drop policy if exists "workspace members read memberships" on public.workspace_members;
drop policy if exists "workspace members manage event years" on public.event_years;
drop policy if exists "event members manage days" on public.event_days;
drop policy if exists "event members manage stages" on public.stages;
drop policy if exists "event members manage bands" on public.bands;
drop policy if exists "event members manage schedule acts" on public.schedule_acts;
drop policy if exists "event members manage slots" on public.performance_slots;
drop policy if exists "event members manage auto designs" on public.auto_designs;
drop policy if exists "event members manage assets" on public.asset_files;
drop policy if exists "event members manage exports" on public.generated_exports;
drop policy if exists "event members read changelog" on public.change_log;
drop policy if exists "workspace members read event years" on public.event_years;
drop policy if exists "owners create event years" on public.event_years;
drop policy if exists "owners update event years" on public.event_years;
drop policy if exists "owners delete event years" on public.event_years;
drop policy if exists "event members read days" on public.event_days;
drop policy if exists "owners manage days" on public.event_days;
drop policy if exists "event members read stages" on public.stages;
drop policy if exists "owners manage stages" on public.stages;
drop policy if exists "event members read bands" on public.bands;
drop policy if exists "owners and editors manage bands" on public.bands;
drop policy if exists "event members read schedule acts" on public.schedule_acts;
drop policy if exists "owners and editors manage schedule acts" on public.schedule_acts;
drop policy if exists "event members read slots" on public.performance_slots;
drop policy if exists "owners and editors manage slots" on public.performance_slots;
drop policy if exists "event members read auto designs" on public.auto_designs;
drop policy if exists "owners manage auto designs" on public.auto_designs;
drop policy if exists "event members read assets" on public.asset_files;
drop policy if exists "owners manage all asset records" on public.asset_files;
drop policy if exists "editors manage band asset records" on public.asset_files;
drop policy if exists "event members read exports" on public.generated_exports;
drop policy if exists "event members create exports" on public.generated_exports;

create policy "workspace members read workspaces"
on public.workspaces for select
using (public.is_workspace_member(id));

create policy "workspace members read memberships"
on public.workspace_members for select
using (
  user_id = auth.uid()
  or public.has_workspace_role(workspace_id, array['owner'])
);

create policy "workspace members read event years"
on public.event_years for select
using (public.is_workspace_member(workspace_id))
;

create policy "owners create event years"
on public.event_years for insert
with check (public.has_workspace_role(workspace_id, array['owner']));

create policy "owners update event years"
on public.event_years for update
using (public.has_workspace_role(workspace_id, array['owner']))
with check (public.has_workspace_role(workspace_id, array['owner']));

create policy "owners delete event years"
on public.event_years for delete
using (public.has_workspace_role(workspace_id, array['owner']));

create policy "event members read days"
on public.event_days for select
using (public.is_event_year_member(event_year_id))
;

create policy "owners manage days"
on public.event_days for all
using (public.has_event_year_role(event_year_id, array['owner']))
with check (public.has_event_year_role(event_year_id, array['owner']));

create policy "event members read stages"
on public.stages for select
using (public.is_event_year_member(event_year_id))
;

create policy "owners manage stages"
on public.stages for all
using (public.has_event_year_role(event_year_id, array['owner']))
with check (public.has_event_year_role(event_year_id, array['owner']));

create policy "event members read bands"
on public.bands for select
using (public.is_event_year_member(event_year_id))
;

create policy "owners and editors manage bands"
on public.bands for all
using (public.has_event_year_role(event_year_id, array['owner', 'editor']))
with check (public.has_event_year_role(event_year_id, array['owner', 'editor']));

create policy "event members read schedule acts"
on public.schedule_acts for select
using (public.is_event_year_member(event_year_id))
;

create policy "owners and editors manage schedule acts"
on public.schedule_acts for all
using (public.has_event_year_role(event_year_id, array['owner', 'editor']))
with check (public.has_event_year_role(event_year_id, array['owner', 'editor']));

create policy "event members read slots"
on public.performance_slots for select
using (public.is_event_year_member(event_year_id))
;

create policy "owners and editors manage slots"
on public.performance_slots for all
using (public.has_event_year_role(event_year_id, array['owner', 'editor']))
with check (public.has_event_year_role(event_year_id, array['owner', 'editor']));

create policy "event members read auto designs"
on public.auto_designs for select
using (public.is_event_year_member(event_year_id))
;

create policy "owners manage auto designs"
on public.auto_designs for all
using (public.has_event_year_role(event_year_id, array['owner']))
with check (public.has_event_year_role(event_year_id, array['owner']));

create policy "event members read assets"
on public.asset_files for select
using (public.is_event_year_member(event_year_id))
;

create policy "owners manage all asset records"
on public.asset_files for all
using (public.has_event_year_role(event_year_id, array['owner']))
with check (public.has_event_year_role(event_year_id, array['owner']));

create policy "editors manage band asset records"
on public.asset_files for all
using (
  owner_table = 'bands'
  and public.has_event_year_role(event_year_id, array['editor'])
)
with check (
  owner_table = 'bands'
  and public.has_event_year_role(event_year_id, array['editor'])
);

create policy "event members read exports"
on public.generated_exports for select
using (public.is_event_year_member(event_year_id))
;

create policy "event members create exports"
on public.generated_exports for insert
with check (public.is_event_year_member(event_year_id));

create policy "event members read changelog"
on public.change_log for select
using (
  event_year_id is null
  or public.is_event_year_member(event_year_id)
);

-- Data API privileges.
-- Because "Automatically expose new tables" is disabled in Supabase project
-- settings, authenticated users need explicit table/function privileges in
-- addition to RLS policies.

grant usage on schema public to authenticated;

grant select, insert, update, delete on table public.workspaces to authenticated;
grant select, insert, update, delete on table public.workspace_members to authenticated;
grant select, insert, update, delete on table public.event_years to authenticated;
grant select, insert, update, delete on table public.event_days to authenticated;
grant select, insert, update, delete on table public.stages to authenticated;
grant select, insert, update, delete on table public.bands to authenticated;
grant select, insert, update, delete on table public.schedule_acts to authenticated;
grant select, insert, update, delete on table public.performance_slots to authenticated;
grant select, insert, update, delete on table public.auto_designs to authenticated;
grant select, insert, update, delete on table public.asset_files to authenticated;
grant select, insert, update, delete on table public.generated_exports to authenticated;
grant select on table public.change_log to authenticated;

grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_event_year_member(uuid) to authenticated;
grant execute on function public.has_workspace_role(uuid, text[]) to authenticated;
grant execute on function public.has_event_year_role(uuid, text[]) to authenticated;

-- Private Storage bucket policies for client-side uploads/downloads.
-- Objects are scoped by the first path segment:
-- event-years/{event_year_id}/...

drop policy if exists "event members read assets" on storage.objects;
drop policy if exists "event members upload assets" on storage.objects;
drop policy if exists "event members update assets" on storage.objects;
drop policy if exists "event members delete assets" on storage.objects;

create policy "event members read assets"
on storage.objects for select
to authenticated
using (
  bucket_id = 'nummirock-assets'
  and (storage.foldername(name))[1] = 'event-years'
  and public.is_event_year_member(((storage.foldername(name))[2])::uuid)
);

create policy "event members upload assets"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'nummirock-assets'
  and (storage.foldername(name))[1] = 'event-years'
  and (
    public.has_event_year_role(((storage.foldername(name))[2])::uuid, array['owner'])
    or (
      (storage.foldername(name))[3] = 'bands'
      and public.has_event_year_role(((storage.foldername(name))[2])::uuid, array['editor'])
    )
  )
);

create policy "event members update assets"
on storage.objects for update
to authenticated
using (
  bucket_id = 'nummirock-assets'
  and (storage.foldername(name))[1] = 'event-years'
  and (
    public.has_event_year_role(((storage.foldername(name))[2])::uuid, array['owner'])
    or (
      (storage.foldername(name))[3] = 'bands'
      and public.has_event_year_role(((storage.foldername(name))[2])::uuid, array['editor'])
    )
  )
)
with check (
  bucket_id = 'nummirock-assets'
  and (storage.foldername(name))[1] = 'event-years'
  and (
    public.has_event_year_role(((storage.foldername(name))[2])::uuid, array['owner'])
    or (
      (storage.foldername(name))[3] = 'bands'
      and public.has_event_year_role(((storage.foldername(name))[2])::uuid, array['editor'])
    )
  )
);

create policy "event members delete assets"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'nummirock-assets'
  and (storage.foldername(name))[1] = 'event-years'
  and (
    public.has_event_year_role(((storage.foldername(name))[2])::uuid, array['owner'])
    or (
      (storage.foldername(name))[3] = 'bands'
      and public.has_event_year_role(((storage.foldername(name))[2])::uuid, array['editor'])
    )
  )
);
