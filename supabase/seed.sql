-- seed.sql — demo data for "Napoli Pizza & Grill" (fictional Manchester takeaway).
-- Safe to re-run: deletes the demo restaurant's data, then re-inserts it with fixed UUIDs.
-- Paste into the Supabase SQL Editor and run. Requires 0001_init.sql to have been run first.
--
-- UUID scheme (all fixed so tests can rely on them):
--   restaurant      11111111-1111-1111-1111-111111111111
--   categories      22222222-0000-0000-0000-0000000000NN
--   menu items      33333333-0000-0000-0000-0000000000NN
--   item sizes      44444444-0000-0000-0000-0000000000NN
--   item options    55555555-0000-0000-0000-0000000000NN

begin;

-- =========================================================
-- Clean out previous demo data (reverse dependency order)
-- NOTE: this also removes demo orders/calls for this restaurant.
-- =========================================================
delete from public.order_items
  where order_id in (select id from public.orders where restaurant_id = '11111111-1111-1111-1111-111111111111');
delete from public.orders       where restaurant_id = '11111111-1111-1111-1111-111111111111';
delete from public.calls        where restaurant_id = '11111111-1111-1111-1111-111111111111';
delete from public.item_options where restaurant_id = '11111111-1111-1111-1111-111111111111';
delete from public.item_sizes
  where menu_item_id in (select id from public.menu_items where restaurant_id = '11111111-1111-1111-1111-111111111111');
delete from public.menu_items      where restaurant_id = '11111111-1111-1111-1111-111111111111';
delete from public.menu_categories where restaurant_id = '11111111-1111-1111-1111-111111111111';
delete from public.restaurants     where id = '11111111-1111-1111-1111-111111111111';

-- =========================================================
-- Restaurant
-- opening_hours: per weekday, list of {open, close} in local time (Europe/London).
-- A close of "00:00" means midnight at the end of that day.
-- =========================================================
insert into public.restaurants
  (id, name, phone, address_line, city, postcode, timezone, currency,
   is_accepting_orders, opening_hours, delivery_radius_miles, delivery_fee, min_order_value)
values (
  '11111111-1111-1111-1111-111111111111',
  'Napoli Pizza & Grill',
  '0161 496 0198',
  '214 Wilmslow Road',
  'Manchester',
  'M14 5RT',
  'Europe/London',
  'GBP',
  true,
  '{
    "mon": [{"open": "16:00", "close": "23:00"}],
    "tue": [{"open": "16:00", "close": "23:00"}],
    "wed": [{"open": "16:00", "close": "23:00"}],
    "thu": [{"open": "16:00", "close": "23:00"}],
    "fri": [{"open": "16:00", "close": "00:00"}],
    "sat": [{"open": "16:00", "close": "00:00"}],
    "sun": [{"open": "16:00", "close": "22:30"}]
  }'::jsonb,
  4,
  2.50,
  12.00
);

-- =========================================================
-- Categories
-- =========================================================
insert into public.menu_categories (id, restaurant_id, name, sort_order) values
  ('22222222-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Pizzas',        1),
  ('22222222-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'Garlic Breads', 2),
  ('22222222-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'Kebabs',        3),
  ('22222222-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'Sides',         4),
  ('22222222-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'Drinks',        5),
  ('22222222-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'Desserts',      6);

-- =========================================================
-- Pizzas (base_price = 10 inch price; real prices live in item_sizes)
-- Aliases = what speech-to-text actually produces on a phone line.
-- =========================================================
insert into public.menu_items
  (id, restaurant_id, category_id, name, description, base_price, aliases, is_vegetarian, spice_level, sort_order) values
  ('33333333-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Margherita', 'Tomato sauce and mozzarella.', 7.99,
   '{margarita,margerita,"cheese and tomato","plain cheese","just cheese"}', true, null, 1),
  ('33333333-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Pepperoni', 'Mozzarella and loads of pepperoni.', 8.99,
   '{peperoni,pepproni,"pepper only",pepperony,"pepperoni one"}', false, null, 2),
  ('33333333-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Hawaiian', 'Ham and pineapple.', 8.99,
   '{hawaian,"ham and pineapple","pineapple one","hawaii","ham pineapple"}', false, null, 3),
  ('33333333-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Meat Feast', 'Pepperoni, ham, chicken, spicy beef and sausage.', 10.99,
   '{"meat fest","meet feast","meaty one","meat lovers","all the meat"}', false, null, 4),
  ('33333333-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Vegetarian', 'Mushrooms, onions, peppers, sweetcorn and olives.', 9.49,
   '{veggie,"veg one","vegetable pizza","veggie supreme",vegetarion}', true, null, 5),
  ('33333333-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'BBQ Chicken', 'BBQ sauce base, chicken, onions and peppers.', 9.99,
   '{"barbecue chicken","barbeque chicken","b b q chicken","chicken barbecue",bbq}', false, null, 6),
  ('33333333-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Four Cheese', 'Mozzarella, cheddar, red leicester and blue cheese.', 9.49,
   '{"4 cheese","for cheese","four cheeses","quattro formaggi","cheesy one"}', true, null, 7),
  ('33333333-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Spicy Chicken', 'Chicken, jalapenos, red onion and chilli.', 9.99,
   '{"spicey chicken","hot chicken","chicken spicy","chilli chicken","spice chicken"}', false, 2, 8),
  ('33333333-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Tandoori Chicken', 'Tandoori chicken, onions, peppers and mint drizzle.', 9.99,
   '{"tandori chicken",tanduri,tandoori,"tandoor chicken","tandoori one"}', false, 1, 9),
  ('33333333-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Seafood', 'Tuna, prawns, anchovies and red onion.', 11.49,
   '{"sea food","see food","fish pizza","tuna and prawn","prawn one"}', false, null, 10),
  ('33333333-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Diavola', 'Spicy salami, chillies and jalapenos.', 9.99,
   '{diavolo,diablo,diavla,"devil pizza","hot pepperoni"}', false, 3, 11),
  ('33333333-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Mushroom', 'Mozzarella and mushrooms.', 8.49,
   '{mushrooms,"mush room","mushroom one",funghi}', true, null, 12),
  ('33333333-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Chicken Tikka', 'Chicken tikka, onions, peppers and green chillies.', 9.99,
   '{"chicken tika","chicken ticker","tikka chicken",tikka,"chicken tikker"}', false, 1, 13),
  ('33333333-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000001',
   'Napoli Special', 'Pepperoni, chicken, spicy beef, mushrooms, peppers and jalapenos.', 12.99,
   '{"house special",napoli,"the special","napoly special","neapoli special"}', false, 1, 14);

-- Pizza sizes (absolute prices, not deltas). NN = pizza number * 10 + size (1=10", 2=12", 3=14").
insert into public.item_sizes (id, menu_item_id, name, price, is_default, sort_order) values
  -- Margherita
  ('44444444-0000-0000-0000-000000000011', '33333333-0000-0000-0000-000000000001', '10 inch',  7.99, false, 1),
  ('44444444-0000-0000-0000-000000000012', '33333333-0000-0000-0000-000000000001', '12 inch',  9.99, true,  2),
  ('44444444-0000-0000-0000-000000000013', '33333333-0000-0000-0000-000000000001', '14 inch', 11.99, false, 3),
  -- Pepperoni
  ('44444444-0000-0000-0000-000000000021', '33333333-0000-0000-0000-000000000002', '10 inch',  8.99, false, 1),
  ('44444444-0000-0000-0000-000000000022', '33333333-0000-0000-0000-000000000002', '12 inch', 10.99, true,  2),
  ('44444444-0000-0000-0000-000000000023', '33333333-0000-0000-0000-000000000002', '14 inch', 12.99, false, 3),
  -- Hawaiian
  ('44444444-0000-0000-0000-000000000031', '33333333-0000-0000-0000-000000000003', '10 inch',  8.99, false, 1),
  ('44444444-0000-0000-0000-000000000032', '33333333-0000-0000-0000-000000000003', '12 inch', 10.99, true,  2),
  ('44444444-0000-0000-0000-000000000033', '33333333-0000-0000-0000-000000000003', '14 inch', 12.99, false, 3),
  -- Meat Feast
  ('44444444-0000-0000-0000-000000000041', '33333333-0000-0000-0000-000000000004', '10 inch', 10.99, false, 1),
  ('44444444-0000-0000-0000-000000000042', '33333333-0000-0000-0000-000000000004', '12 inch', 13.49, true,  2),
  ('44444444-0000-0000-0000-000000000043', '33333333-0000-0000-0000-000000000004', '14 inch', 15.99, false, 3),
  -- Vegetarian
  ('44444444-0000-0000-0000-000000000051', '33333333-0000-0000-0000-000000000005', '10 inch',  9.49, false, 1),
  ('44444444-0000-0000-0000-000000000052', '33333333-0000-0000-0000-000000000005', '12 inch', 11.49, true,  2),
  ('44444444-0000-0000-0000-000000000053', '33333333-0000-0000-0000-000000000005', '14 inch', 13.49, false, 3),
  -- BBQ Chicken
  ('44444444-0000-0000-0000-000000000061', '33333333-0000-0000-0000-000000000006', '10 inch',  9.99, false, 1),
  ('44444444-0000-0000-0000-000000000062', '33333333-0000-0000-0000-000000000006', '12 inch', 12.49, true,  2),
  ('44444444-0000-0000-0000-000000000063', '33333333-0000-0000-0000-000000000006', '14 inch', 14.99, false, 3),
  -- Four Cheese
  ('44444444-0000-0000-0000-000000000071', '33333333-0000-0000-0000-000000000007', '10 inch',  9.49, false, 1),
  ('44444444-0000-0000-0000-000000000072', '33333333-0000-0000-0000-000000000007', '12 inch', 11.49, true,  2),
  ('44444444-0000-0000-0000-000000000073', '33333333-0000-0000-0000-000000000007', '14 inch', 13.99, false, 3),
  -- Spicy Chicken
  ('44444444-0000-0000-0000-000000000081', '33333333-0000-0000-0000-000000000008', '10 inch',  9.99, false, 1),
  ('44444444-0000-0000-0000-000000000082', '33333333-0000-0000-0000-000000000008', '12 inch', 12.49, true,  2),
  ('44444444-0000-0000-0000-000000000083', '33333333-0000-0000-0000-000000000008', '14 inch', 14.99, false, 3),
  -- Tandoori Chicken
  ('44444444-0000-0000-0000-000000000091', '33333333-0000-0000-0000-000000000009', '10 inch',  9.99, false, 1),
  ('44444444-0000-0000-0000-000000000092', '33333333-0000-0000-0000-000000000009', '12 inch', 12.49, true,  2),
  ('44444444-0000-0000-0000-000000000093', '33333333-0000-0000-0000-000000000009', '14 inch', 14.99, false, 3),
  -- Seafood
  ('44444444-0000-0000-0000-000000000101', '33333333-0000-0000-0000-000000000010', '10 inch', 11.49, false, 1),
  ('44444444-0000-0000-0000-000000000102', '33333333-0000-0000-0000-000000000010', '12 inch', 14.49, true,  2),
  ('44444444-0000-0000-0000-000000000103', '33333333-0000-0000-0000-000000000010', '14 inch', 17.49, false, 3),
  -- Diavola
  ('44444444-0000-0000-0000-000000000111', '33333333-0000-0000-0000-000000000011', '10 inch',  9.99, false, 1),
  ('44444444-0000-0000-0000-000000000112', '33333333-0000-0000-0000-000000000011', '12 inch', 12.49, true,  2),
  ('44444444-0000-0000-0000-000000000113', '33333333-0000-0000-0000-000000000011', '14 inch', 14.99, false, 3),
  -- Mushroom
  ('44444444-0000-0000-0000-000000000121', '33333333-0000-0000-0000-000000000012', '10 inch',  8.49, false, 1),
  ('44444444-0000-0000-0000-000000000122', '33333333-0000-0000-0000-000000000012', '12 inch', 10.49, true,  2),
  ('44444444-0000-0000-0000-000000000123', '33333333-0000-0000-0000-000000000012', '14 inch', 12.49, false, 3),
  -- Chicken Tikka
  ('44444444-0000-0000-0000-000000000131', '33333333-0000-0000-0000-000000000013', '10 inch',  9.99, false, 1),
  ('44444444-0000-0000-0000-000000000132', '33333333-0000-0000-0000-000000000013', '12 inch', 12.49, true,  2),
  ('44444444-0000-0000-0000-000000000133', '33333333-0000-0000-0000-000000000013', '14 inch', 14.99, false, 3),
  -- Napoli Special
  ('44444444-0000-0000-0000-000000000141', '33333333-0000-0000-0000-000000000014', '10 inch', 12.99, false, 1),
  ('44444444-0000-0000-0000-000000000142', '33333333-0000-0000-0000-000000000014', '12 inch', 15.99, true,  2),
  ('44444444-0000-0000-0000-000000000143', '33333333-0000-0000-0000-000000000014', '14 inch', 18.99, false, 3);

-- =========================================================
-- Garlic Breads, Kebabs, Sides, Drinks, Desserts
-- =========================================================
insert into public.menu_items
  (id, restaurant_id, category_id, name, description, base_price, aliases, is_vegetarian, spice_level, sort_order) values
  -- Garlic Breads
  ('33333333-0000-0000-0000-000000000021', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000002',
   'Garlic Bread', '10 inch garlic pizza bread.', 3.99,
   '{"garlic","plain garlic bread","garlic pizza bread","garlick bread"}', true, null, 1),
  ('33333333-0000-0000-0000-000000000022', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000002',
   'Garlic Bread with Cheese', '10 inch garlic bread topped with mozzarella.', 4.99,
   '{"cheesy garlic bread","garlic cheese","garlic bread cheese","cheese garlic bread"}', true, null, 2),
  ('33333333-0000-0000-0000-000000000023', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000002',
   'Garlic Bread with Cheese & Jalapenos', '10 inch garlic bread, mozzarella and jalapenos.', 5.49,
   '{"garlic bread jalapenos","spicy garlic bread","hallapeno garlic bread","jalapeno garlic bread"}', true, 2, 3),

  -- Kebabs (served in naan with salad and sauce)
  ('33333333-0000-0000-0000-000000000031', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000003',
   'Lamb Doner Kebab', 'Lamb doner in naan with salad and sauce.', 7.49,
   '{"doner","donner","donna kebab","doner kebab","lamb donner"}', false, null, 1),
  ('33333333-0000-0000-0000-000000000032', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000003',
   'Chicken Doner Kebab', 'Chicken doner in naan with salad and sauce.', 7.49,
   '{"chicken donner","chicken donna","chicken doner"}', false, null, 2),
  ('33333333-0000-0000-0000-000000000033', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000003',
   'Chicken Shish Kebab', 'Grilled marinated chicken pieces in naan.', 8.99,
   '{"chicken shish","chicken sheesh","shish chicken","chicken shis"}', false, null, 3),
  ('33333333-0000-0000-0000-000000000034', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000003',
   'Lamb Shish Kebab', 'Grilled marinated lamb pieces in naan.', 9.49,
   '{"lamb shish","lamb sheesh","shish lamb"}', false, null, 4),
  ('33333333-0000-0000-0000-000000000035', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000003',
   'Mixed Kebab', 'Lamb doner, chicken doner and chicken shish in naan.', 9.99,
   '{"mix kebab","mixed","mixed meat kebab","mixed grill"}', false, null, 5),
  ('33333333-0000-0000-0000-000000000036', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000003',
   'Kofte Kebab', 'Grilled minced lamb skewers in naan.', 8.49,
   '{"kofta","cofta","kofte","kofta kebab","minced lamb kebab"}', false, null, 6),

  -- Sides
  ('33333333-0000-0000-0000-000000000041', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000004',
   'Chips', 'Regular portion of chips.', 2.99,
   '{"fries","chip","portion of chips","french fries"}', true, null, 1),
  ('33333333-0000-0000-0000-000000000042', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000004',
   'Cheesy Chips', 'Chips topped with melted cheese.', 3.99,
   '{"cheese chips","chips and cheese","chips cheese","cheesy fries"}', true, null, 2),
  ('33333333-0000-0000-0000-000000000043', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000004',
   'Chicken Wings (6)', 'Six spicy chicken wings.', 5.49,
   '{"wings","hot wings","chicken wing","six wings","buffalo wings"}', false, 2, 3),
  ('33333333-0000-0000-0000-000000000044', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000004',
   'Onion Rings', 'Eight battered onion rings.', 3.29,
   '{"onion ring","rings","onion rins"}', true, null, 4),
  ('33333333-0000-0000-0000-000000000045', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000004',
   'Coleslaw', 'Tub of creamy coleslaw.', 1.49,
   '{"slaw","cole slaw","coal slaw"}', true, null, 5),

  -- Drinks
  ('33333333-0000-0000-0000-000000000051', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000005',
   'Coca-Cola Can', '330ml can.', 1.20,
   '{"coke","can of coke","coca cola","cola"}', true, null, 1),
  ('33333333-0000-0000-0000-000000000052', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000005',
   'Diet Coke Can', '330ml can.', 1.20,
   '{"diet coke","diet","diet cola","can of diet coke"}', true, null, 2),
  ('33333333-0000-0000-0000-000000000053', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000005',
   'Fanta Orange Can', '330ml can.', 1.20,
   '{"fanta","orange fanta","orange","orange pop"}', true, null, 3),
  ('33333333-0000-0000-0000-000000000054', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000005',
   'Sprite Can', '330ml can.', 1.20,
   '{"sprite","lemonade","lemon and lime","sprit"}', true, null, 4),
  ('33333333-0000-0000-0000-000000000055', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000005',
   'Coca-Cola 1.5L Bottle', '1.5 litre bottle.', 3.49,
   '{"big coke","bottle of coke","large coke","one and a half litre coke","big bottle of coke"}', true, null, 5),
  ('33333333-0000-0000-0000-000000000056', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000005',
   'Bottled Water', '500ml still water.', 1.00,
   '{"water","still water","bottle of water"}', true, null, 6),

  -- Desserts
  ('33333333-0000-0000-0000-000000000061', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000006',
   'Chocolate Fudge Cake', 'Warm slice of chocolate fudge cake.', 3.99,
   '{"chocolate cake","fudge cake","choc cake","chocolate fudge"}', true, null, 1),
  ('33333333-0000-0000-0000-000000000062', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000006',
   'Strawberry Cheesecake', 'Slice of New York style strawberry cheesecake.', 3.99,
   '{"cheesecake","cheese cake","strawberry cheese cake"}', true, null, 2),
  ('33333333-0000-0000-0000-000000000063', '11111111-1111-1111-1111-111111111111', '22222222-0000-0000-0000-000000000006',
   'Vanilla Ice Cream Tub', '500ml tub of vanilla ice cream.', 4.49,
   '{"ice cream","vanilla","tub of ice cream","icecream"}', true, null, 3);

-- =========================================================
-- Pizza options (attached to the Pizzas category, so every pizza gets them)
-- =========================================================
insert into public.item_options
  (id, restaurant_id, menu_item_id, category_id, group_name, name, price_delta, max_select) values
  -- Extra toppings (customer may add several)
  ('55555555-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', null, '22222222-0000-0000-0000-000000000001', 'Extra toppings', 'Extra Cheese',   1.00, 12),
  ('55555555-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', null, '22222222-0000-0000-0000-000000000001', 'Extra toppings', 'Pepperoni',      1.20, 12),
  ('55555555-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', null, '22222222-0000-0000-0000-000000000001', 'Extra toppings', 'Ham',            1.20, 12),
  ('55555555-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', null, '22222222-0000-0000-0000-000000000001', 'Extra toppings', 'Chicken',        1.50, 12),
  ('55555555-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', null, '22222222-0000-0000-0000-000000000001', 'Extra toppings', 'Spicy Beef',     1.50, 12),
  ('55555555-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', null, '22222222-0000-0000-0000-000000000001', 'Extra toppings', 'Mushrooms',      0.80, 12),
  ('55555555-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', null, '22222222-0000-0000-0000-000000000001', 'Extra toppings', 'Red Onion',      0.80, 12),
  ('55555555-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', null, '22222222-0000-0000-0000-000000000001', 'Extra toppings', 'Green Peppers',  0.80, 12),
  ('55555555-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', null, '22222222-0000-0000-0000-000000000001', 'Extra toppings', 'Sweetcorn',      0.80, 12),
  ('55555555-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', null, '22222222-0000-0000-0000-000000000001', 'Extra toppings', 'Jalapenos',      0.90, 12),
  ('55555555-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', null, '22222222-0000-0000-0000-000000000001', 'Extra toppings', 'Black Olives',   0.90, 12),
  ('55555555-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', null, '22222222-0000-0000-0000-000000000001', 'Extra toppings', 'Pineapple',      0.80, 12),
  -- Crust (pick exactly one)
  ('55555555-0000-0000-0000-000000000021', '11111111-1111-1111-1111-111111111111', null, '22222222-0000-0000-0000-000000000001', 'Crust',          'Classic',        0.00, 1),
  ('55555555-0000-0000-0000-000000000022', '11111111-1111-1111-1111-111111111111', null, '22222222-0000-0000-0000-000000000001', 'Crust',          'Stuffed',        2.00, 1);

commit;
