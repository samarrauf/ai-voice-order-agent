-- 0010_restaurant_branding.sql — theme-able branding for the dashboard (Phase 3c).
-- Paste into the Supabase SQL Editor and run once.
--
-- Each restaurant gets a tagline, an optional parent group name ("by ...")
-- and five theme colours (hex codes). The dashboard reads these to colour
-- itself and to show the splash screen. Existing rows (Napoli) pick up the
-- defaults automatically: no parent group, no tagline.
--
-- The check constraints only allow 6-digit hex codes like #1E293B, so a typo
-- can never break the dashboard styling.
--
-- No GRANT statements (CLAUDE.md rule 8). RLS settings are unchanged.

alter table public.restaurants
  add column if not exists tagline           text,
  add column if not exists parent_group_name text,
  add column if not exists theme_primary     text not null default '#1E293B',
  add column if not exists theme_accent      text not null default '#3B82F6',
  add column if not exists theme_secondary   text not null default '#64748B',
  add column if not exists theme_background  text not null default '#FFFFFF',
  add column if not exists theme_text        text not null default '#1A1A1A';

alter table public.restaurants
  add constraint restaurants_theme_hex_check check (
    theme_primary    ~ '^#[0-9A-Fa-f]{6}$' and
    theme_accent     ~ '^#[0-9A-Fa-f]{6}$' and
    theme_secondary  ~ '^#[0-9A-Fa-f]{6}$' and
    theme_background ~ '^#[0-9A-Fa-f]{6}$' and
    theme_text       ~ '^#[0-9A-Fa-f]{6}$'
  );
