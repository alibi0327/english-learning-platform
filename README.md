# English Path

Учебная платформа на GitHub Pages + Supabase.

## Уже реализовано

- вход по email/паролю через Supabase Auth;
- роли `student`, `teacher`, `admin`;
- блокировка аккаунта;
- админ-панель;
- создание пользователей из админки через Supabase Edge Function;
- выдача доступа к A1–C1;
- 5 стартовых уроков A1;
- словарь;
- обязательный тест, проходной балл 80%;
- последовательная разблокировка уроков;
- сохранение прогресса и попыток тестов в Supabase;
- адаптация под телефон/планшет/ПК.

## 1. Конфигурация

`js/config.js` уже содержит ваш Project URL и Publishable key.

Никогда не вставляйте `service_role` или Secret key в GitHub.

## 2. SQL

Базовые таблицы уже были созданы ранее.

Дополнительно выполните:
`supabase/sql/02_admin_hardening.sql`

через Supabase → SQL Editor.

## 3. Edge Functions — обязательно для создания пользователей из админки

Файлы функций находятся:

- `supabase/functions/admin-create-user/index.ts`
- `supabase/functions/admin-set-access/index.ts`

Самый простой способ развернуть:

1. Установить Supabase CLI.
2. В терминале в папке проекта:
   `supabase login`
3. Привязать проект:
   `supabase link --project-ref legqlbdzfjxtwzdodeya`
4. Развернуть функции:
   `supabase functions deploy admin-create-user`
   `supabase functions deploy admin-set-access`

`SUPABASE_SERVICE_ROLE_KEY` хранится только на стороне Supabase Edge Functions и не попадает на GitHub Pages.

## 4. GitHub Pages

Загрузите содержимое архива в корень репозитория `english-learning-platform`.

Затем:

Settings → Pages → Build and deployment
- Source: Deploy from a branch
- Branch: main
- Folder: / (root)

После публикации откройте:
`https://alibi0327.github.io/english-learning-platform/`

## 5. Первый вход

Ваш пользователь `alibi0327@gmail.com` уже должен иметь роль `admin`.

После входа вы попадёте в `admin.html`.

## Важно про безопасность тестов

Текущая версия проверяет ответы в браузере и подходит как MVP/учебная платформа.
Если потребуется защита от технического обхода тестов через DevTools, следующий этап — перенести проверку ответов в Edge Function и хранить ключи ответов только на сервере.
