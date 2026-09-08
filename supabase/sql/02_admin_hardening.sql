-- Дополнительное усиление для админ-панели.
-- Выполняйте после базового SQL, который уже был создан.

-- Индексы
create index if not exists idx_course_access_user on public.course_access(user_id);
create index if not exists idx_lesson_progress_user on public.lesson_progress(user_id);
create index if not exists idx_quiz_results_user on public.quiz_results(user_id);
create index if not exists idx_quiz_results_lesson on public.quiz_results(user_id, lesson_key);

-- updated_at автоматически для profiles
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute procedure public.set_updated_at();

drop trigger if exists lesson_progress_set_updated_at on public.lesson_progress;
create trigger lesson_progress_set_updated_at
before update on public.lesson_progress
for each row execute procedure public.set_updated_at();
