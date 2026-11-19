-- 0016_receipt_branding.sql
-- Extra optional contact/branding details printed on the customer bill
-- (header logo, footer contact lines). All columns are nullable text, so
-- existing rows (Napoli) are untouched and keep working with no values.
-- RLS stays enabled; no GRANT statements are needed.

alter table public.restaurants
  add column if not exists logo_url            text,
  add column if not exists whatsapp_number     text,
  add column if not exists website_url         text,
  add column if not exists instagram_handle    text,
  add column if not exists facebook_url        text,
  add column if not exists receipt_footer_note text;

-- ---------------------------------------------------------------------------
-- SAMPLE for P9 (do NOT run now): when the Olive 'n Spice row is created, set
-- its branding like this (adjust the values and the where-clause to the row):
--
--   update public.restaurants
--   set logo_url            = '/brand/olive-n-spice-logo.png',
--       theme_primary       = '#3E5030',
--       theme_accent        = '#C9A227',
--       address_line        = 'Lahore Road, beside Golden Palm, Sargodha',
--       phone               = '0313 7179700',
--       website_url         = 'https://olive-n-spice.vercel.app',
--       instagram_handle    = '@olivenspice_',
--       facebook_url        = 'https://facebook.com/theolivenspice',
--       receipt_footer_note = 'Thank you for dining with us!'
--       -- whatsapp_number: add when the restaurant has one
--   where name = 'Olive ''n Spice';
--
-- The same values can be given in the insert statement when the row is made.
-- ---------------------------------------------------------------------------
