-- Correção para instalações em que o usuário do Auth foi criado antes da migration inicial.
insert into public.profiles (id, full_name)
select
  id,
  coalesce(raw_user_meta_data ->> 'full_name', split_part(email, '@', 1))
from auth.users
on conflict (id) do nothing;
