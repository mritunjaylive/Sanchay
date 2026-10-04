-- ================================================================
-- Migration: Receipts Storage Bucket, Storage Policies, Quota RPC
-- @see Sanchay_spec.md section 11.3 & FIX_PROMPTS.md Prompt 10
-- ================================================================

-- 1. Create the private 'receipts' storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'receipts',
  'receipts',
  false,
  1572864, -- 1.5 MB limit
  array['image/webp', 'image/jpeg']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 1572864,
  allowed_mime_types = array['image/webp', 'image/jpeg'];

-- 2. Storage policies on storage.objects

-- Drop prior policies if they exist to be idempotent
drop policy if exists "receipts_insert_own" on storage.objects;
drop policy if exists "receipts_select_own" on storage.objects;
drop policy if exists "receipts_update_own" on storage.objects;
drop policy if exists "receipts_delete_own" on storage.objects;

create policy "receipts_insert_own"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipts_select_own"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipts_update_own"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "receipts_delete_own"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'receipts'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 3. Quota check RPC: 100 MB per user
create or replace function public.check_attachment_quota(size_bytes bigint)
returns boolean
language plpgsql
security invoker
as $$
declare
  v_user_id uuid := auth.uid();
  v_current_total bigint;
  c_max_bytes constant bigint := 104857600; -- 100 MB in bytes
begin
  if v_user_id is null then
    raise exception 'Unauthorized';
  end if;

  if size_bytes < 0 then
    raise exception 'Invalid size_bytes: %', size_bytes;
  end if;

  select coalesce(sum(a.size_bytes), 0)
    into v_current_total
    from public.attachments a
   where a.user_id = v_user_id
     and a.deleted_at is null;

  return (v_current_total + size_bytes) <= c_max_bytes;
end;
$$;
