do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'Users can update own subject material files'
  ) then
    create policy "Users can update own subject material files"
      on storage.objects for update
      using (
        bucket_id = 'subject-materials'
        and auth.uid()::text = (storage.foldername(name))[1]
      )
      with check (
        bucket_id = 'subject-materials'
        and auth.uid()::text = (storage.foldername(name))[1]
      );
  end if;
end $$;
