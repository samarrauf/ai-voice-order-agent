# Phase 2 conversation tests

Run: 2026-11-12T10:18:11.820Z · model claude-haiku-5-5 · total cost $0.0259

Cleaned up afterwards: 7 order(s) [A-1109, A-1110, A-1111, A-1112, A-1113, A-1114, A-1115], 1 callback(s).

## Pass / fail

| Test | Result | Failed checks |
|---|---|---|
| 1. Full delivery order | ✅ PASS | — |
| 2. Changes of mind, collection | ✅ PASS | — |
| 3. Allergen question mid-order | ✅ PASS | — |
| 4. Postcode outside area | ✅ PASS | — |
| 5. Below delivery minimum | ✅ PASS | — |
| 6. What do you have? | ✅ PASS | — |
| 7. Item not on menu | ✅ PASS | — |
| 8. Are you a real person? | ✅ PASS | — |
| 9. Stubborn caller | ✅ PASS | — |
| 10. Confirmation refused | ✅ PASS | — |
| 11. Correction after placing | ✅ PASS | — |

## Failures in detail

- none

## Scenario checks

- Test 1 · order completed · 1 order(s) placed: PASS
- Test 2 · order completed · 1 order(s) placed: PASS
- Test 2 · changes kept · placed 2x 10 inch Margherita, 1x Garlic Bread: PASS
- Test 3 · 6 resume after interruption · after "ok carry on": "Is that for delivery or collection?": PASS
- Test 3 · running order kept · placed [{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]: PASS
- Test 4 · refused delivery · 1 check_delivery call(s): PASS
- Test 5 · switched to collection · placed as pickup: PASS
- Test 9 · 5 garlic bread question ≤ 2 times · asked 2 time(s): PASS
- Test 9 · 5 picked a default or offered callback · moved on: PASS
- Test 10 · 10 original (2) not placed · placed quantities: [3]: PASS
- Test 10 · 10 previewed again with 3 · 1 preview(s) after the correction: PASS
- Test 10 · 10 read back again · asked 'Is that all correct?' again: PASS
- Test 10 · 10 corrected order placed once · 1 order(s) placed: PASS
- Test 11 · 11 no second order · 1 order(s) placed: PASS
- Test 11 · 11 callback with corrected number · 07700900999 (problem): Order A-1115: correct phone is 07700900999 (original was 07700900123): PASS

## Test 1: Full delivery order

**1. Caller:** hi

**Gio** _(10 words, 1368ms)_: Hiya, Napoli Pizza and Grill, what can I get you?

**2. Caller:** two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(11 words, 2914ms)_: Two 12 inch Pepperoni, lovely. Any drinks or sides with that?

**3. Caller:** no thanks

**Gio** _(7 words, 1277ms)_: Brilliant. Is that for delivery or collection?

**4. Caller:** delivery

**Gio** _(4 words, 1394ms)_: Lovely, what's the postcode?

**5. Caller:** M14 5TP

**Gio** _(6 words, 1350ms)_: That's M-one-four, five-T-P. Is that right?

**6. Caller:** yes

> 🔧 `check_delivery` {"postcode":"M14 5TP"} → 200 — "Yes, we deliver there. It's 2.50 for delivery, about 45 minutes."
>
**Gio** _(12 words, 2842ms)_: Good news, we deliver there. It's 2.50 for delivery, about 45 minutes.

**7. Caller:** ok

**Gio** _(9 words, 1227ms)_: Lovely. What name should I put the order under?

**8. Caller:** Sarah

**Gio** _(10 words, 1582ms)_: Thanks Sarah. What's the best contact number for the order?

**9. Caller:** 07700900123

**Gio** _(8 words, 1433ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**10. Caller:** yes

**Gio** _(9 words, 1346ms)_: Lovely. What's the first line of the delivery address?

**11. Caller:** 12 Oak Road

**Gio** _(3 words, 3284ms)_: Cash or card?

**12. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"delivery","customer_name":"Sarah","customer_phone":"07700900123","delivery_address":"12 Oak Road","delivery_postcode":"M14 5TP","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for delivery to M14 5TP. That comes to 24.48 in total, including 2.50 delivery. Is that all correct?"
>
**Gio** _(24 words, 3335ms)_: So that's two 12 inch pepperoni, for delivery to M14 5TP. That comes to 24.48 in total, including 2.50 delivery. Is that all correct?

**13. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"delivery","customer_name":"Sarah","customer_phone":"07700900123","delivery_address":"12 Oak Road","delivery_postcode":"M14 5TP","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1109, delivering to M-one-four, five-T-P in about 45 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three."
>
**Gio** _(18 words, 3906ms)_: Lovely, that's placed, order number A-1109. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**14. Caller:** yes

**Gio** _(9 words, 1671ms)_: And it's going to M-one-four, five-T-P. Is that right?

**15. Caller:** yes

**Gio** _(8 words, 1393ms)_: Brilliant, about 45 minutes then. Thanks Sarah, bye!

## Test 2: Changes of mind, collection

**1. Caller:** one margherita please

> 🔧 `search_menu` {"query":"margherita"} → 200 — "Margherita — ten inch is 7.99, twelve inch 9.99, fourteen inch 11.99."
>
**Gio** _(11 words, 3044ms)_: Lovely. Which size would you like: 10, 12 or 14 inch?

**2. Caller:** 10 inch

**Gio** _(10 words, 1148ms)_: Ten inch Margherita, lovely. Any drinks or sides with that?

**3. Caller:** actually make that two

**Gio** _(12 words, 1537ms)_: Two ten inch Margheritas, no problem. Is that for delivery or collection?

**4. Caller:** and add a garlic bread

> 🔧 `search_menu` {"query":"garlic bread"} → 200 — "Garlic Bread is 3.99."
>
**Gio** _(16 words, 3345ms)_: Got it. Plain garlic bread at 3.99, or would you like it with cheese for 4.99?

**5. Caller:** plain please

**Gio** _(10 words, 1499ms)_: Plain garlic bread, lovely. Is that for delivery or collection?

**6. Caller:** collection

**Gio** _(10 words, 1351ms)_: Brilliant, collection it is. What name is the order under?

**7. Caller:** Tom

**Gio** _(11 words, 1315ms)_: Lovely, Tom. What's the best phone number to reach you on?

**8. Caller:** 07700900124

**Gio** _(8 words, 1494ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**9. Caller:** yes

**Gio** _(4 words, 1146ms)_: Brilliant. Cash or card?

**10. Caller:** card

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Tom","customer_phone":"07700900124","payment_method":"card_on_delivery","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":2,"size_name":"10 inch"},{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "So that's two ten inch margherita and one garlic bread, for collection. That comes to 19.97 in total. Is that all correct?"
>
**Gio** _(22 words, 3610ms)_: So that's two ten inch Margheritas and one garlic bread, for collection. That comes to 19.97 in total. Is that all correct?

**11. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Tom","customer_phone":"07700900124","payment_method":"card_on_delivery","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":2,"size_name":"10 inch"},{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "Perfect, order number A-1110, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-four."
>
**Gio** _(18 words, 3720ms)_: Lovely, that's placed, order number A-1110. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**12. Caller:** yes

**Gio** _(8 words, 1464ms)_: Brilliant, about 20 minutes then. Thanks Tom, bye!

## Test 3: Allergen question mid-order

**1. Caller:** two pepperoni please

> 🔧 `search_menu` {"query":"pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(14 words, 3449ms)_: Two pepperoni pizzas, lovely. What size would you like, ten, twelve or fourteen inch?

**2. Caller:** 12 inch

**Gio** _(11 words, 1596ms)_: Two 12 inch pepperoni, brilliant. Any drinks or sides with that?

**3. Caller:** does it have nuts?

**Gio** _(20 words, 1851ms)_: I can't confirm allergens over the phone. Would you like someone from the shop to call you back about it?

**4. Caller:** ok carry on

**Gio** _(6 words, 1454ms)_: Is that for delivery or collection?

**5. Caller:** collection

**Gio** _(12 words, 1503ms)_: Lovely, collection it is. What name should I put the order under?

**6. Caller:** Raj

**Gio** _(10 words, 1563ms)_: Thanks Raj. What's the best contact number for the order?

**7. Caller:** 07700900126

**Gio** _(8 words, 1474ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-six. Is that right?

**8. Caller:** yes

**Gio** _(3 words, 1309ms)_: Cash or card?

**9. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Raj","customer_phone":"07700900126","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(17 words, 6379ms)_: So that's two 12 inch pepperoni, for collection, coming to 21.98 in total. Is that all correct?

**10. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Raj","customer_phone":"07700900126","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1111, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-six."
>
**Gio** _(18 words, 3439ms)_: Lovely, that's placed, order number A-1111. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-six. Is that right?

**11. Caller:** yes

**Gio** _(12 words, 1192ms)_: Brilliant, it'll be ready in about 20 minutes then. Thanks Raj, bye!

## Test 4: Postcode outside area

**1. Caller:** hi

**Gio** _(10 words, 1744ms)_: Hiya, Napoli Pizza and Grill, what can I get you?

**2. Caller:** delivery to SW1A 1AA

**Gio** _(6 words, 1466ms)_: That's S-W-one-A, one-A-A. Is that right?

**3. Caller:** yes

> 🔧 `check_delivery` {"postcode":"SW1A 1AA"} → 200 — "Sorry, we don't deliver to that postcode, but you're welcome to collect. Would you like to do collection?"
>
**Gio** _(18 words, 2639ms)_: Sorry, we don't deliver to that postcode, but you're welcome to collect. Would you like to do collection?

**4. Caller:** no thanks then, bye

**Gio** _(10 words, 1554ms)_: No worries, thanks for calling Napoli Pizza and Grill. Bye!

## Test 5: Below delivery minimum

**1. Caller:** one 10 inch margherita

> 🔧 `search_menu` {"query":"10 inch margherita"} → 200 — "Margherita — ten inch is 7.99, twelve inch 9.99, fourteen inch 11.99."
>
**Gio** _(13 words, 2313ms)_: Lovely, one 10 inch Margherita at 7.99. Is that for delivery or collection?

**2. Caller:** delivery to M14 5TP

**Gio** _(6 words, 1425ms)_: That's M-one-four, five-T-P. Is that right?

**3. Caller:** yes

> 🔧 `check_delivery` {"postcode":"M14 5TP"} → 200 — "Yes, we deliver there. It's 2.50 for delivery, about 45 minutes."
>
**Gio** _(12 words, 2709ms)_: Good news, we deliver there. It's 2.50 for delivery, about 45 minutes.

**4. Caller:** ok

**Gio** _(6 words, 1118ms)_: Any drinks or sides with that?

**5. Caller:** no thanks

**Gio** _(9 words, 1317ms)_: Brilliant. What name shall I put the order under?

**6. Caller:** Ann

**Gio** _(11 words, 981ms)_: Lovely, thanks Ann. What's the best contact number for the order?

**7. Caller:** 07700900125

**Gio** _(8 words, 1271ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-five. Is that right?

**8. Caller:** yes

**Gio** _(9 words, 1169ms)_: Thanks. What's the first line of the delivery address?

**9. Caller:** 4 Elm Street

**Gio** _(3 words, 1139ms)_: Cash or card?

**10. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"delivery","customer_name":"Ann","customer_phone":"07700900125","payment_method":"cash","delivery_address":"4 Elm Street","delivery_postcode":"M14 5TP","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":1,"size_name":"10 inch"}]} → 400 — "Sorry, the minimum for delivery is 12.00. You need another 4.01 to reach it. Would you like to add something, or collect instead?"
>
**Gio** _(21 words, 4463ms)_: Sorry, the delivery minimum is 12.00, so you need another 4.01. Would you like to add something, or switch to collection?

**11. Caller:** I'll just collect it then

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Ann","customer_phone":"07700900125","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":1,"size_name":"10 inch"}]} → 200 — "So that's one ten inch margherita, for collection. That comes to 7.99 in total. Is that all correct?"
>
**Gio** _(20 words, 2961ms)_: So that's one 10 inch Margherita for collection, coming to 7.99 in total, paid by cash. Is that all correct?

**12. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Ann","customer_phone":"07700900125","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":1,"size_name":"10 inch"}]} → 200 — "Perfect, order number A-1112, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-five."
>
**Gio** _(18 words, 4195ms)_: Lovely, that's placed, order number A-1112. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-five. Is that right?

**13. Caller:** yes

**Gio** _(11 words, 1223ms)_: Brilliant, that'll be ready in about 20 minutes. Thanks Ann, bye!

## Test 6: What do you have?

**1. Caller:** what do you have?

**Gio** _(15 words, 1464ms)_: Hiya, we do pizzas, kebabs, garlic bread, sides, drinks and desserts. What do you fancy?

## Test 7: Item not on menu

**1. Caller:** do you have sushi?

> 🔧 `search_menu` {"query":"sushi"} → 200 — "I don't have that one — we do classic pizzas, kebabs and sides. What are you after?"
>
**Gio** _(18 words, 2658ms)_: Sorry, we don't do sushi. We do pizzas, kebabs, sides, drinks and desserts. What can I get you?

## Test 8: Are you a real person?

**1. Caller:** am I talking to a real person?

**Gio** _(17 words, 1055ms)_: I'm an AI assistant. I can take your order just the same. What can I get you?

**2. Caller:** ok, two pepperoni then

> 🔧 `search_menu` {"query":"pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(14 words, 2674ms)_: Two pepperoni pizzas, lovely. What size would you like, ten, twelve or fourteen inch?

**3. Caller:** 12 inch

**Gio** _(11 words, 1849ms)_: Two 12 inch Pepperoni, brilliant. Any drinks or sides with that?

## Test 9: Stubborn caller

**1. Caller:** one garlic bread

> 🔧 `search_menu` {"query":"garlic bread"} → 200 — "Garlic Bread is 3.99."
>
**Gio** _(15 words, 2856ms)_: Garlic bread is 3.99. Would you like plain, or with cheese or cheese and jalapenos?

**2. Caller:** umm

**Gio** _(15 words, 1044ms)_: No worries, take your time. Plain garlic bread, or would you like it with cheese?

**3. Caller:** dunno

**Gio** _(16 words, 1276ms)_: No worries, I'll put you down for plain garlic bread. Any drinks or sides with that?

**4. Caller:** no thanks

**Gio** _(7 words, 1169ms)_: Lovely. Is that for delivery or collection?

**5. Caller:** collection

**Gio** _(12 words, 1149ms)_: Brilliant, collection it is. What name shall I put the order under?

**6. Caller:** Lee

**Gio** _(10 words, 1249ms)_: Thanks Lee. What's the best contact number for the order?

**7. Caller:** 07700900127

**Gio** _(8 words, 1354ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-seven. Is that right?

**8. Caller:** yes

**Gio** _(3 words, 1131ms)_: Cash or card?

**9. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Lee","customer_phone":"07700900127","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "So that's one garlic bread, for collection. That comes to 3.99 in total. Is that all correct?"
>
**Gio** _(18 words, 3403ms)_: So that's one garlic bread for collection, coming to 3.99 in total, paying cash. Is that all correct?

**10. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Lee","customer_phone":"07700900127","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "Perfect, order number A-1113, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-seven."
>
**Gio** _(18 words, 3607ms)_: Lovely, that's placed, order number A-1113. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-seven. Is that right?

**11. Caller:** yes

**Gio** _(8 words, 1350ms)_: Brilliant, about 20 minutes then. Thanks Lee, bye!

## Test 10: Confirmation refused

**1. Caller:** two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(15 words, 2430ms)_: Two 12 inch Pepperoni pizzas at 10.99 each. Lovely. Any drinks or sides with that?

**2. Caller:** no thanks

**Gio** _(7 words, 1034ms)_: Brilliant. Is that for delivery or collection?

**3. Caller:** collection

**Gio** _(7 words, 1173ms)_: Lovely, collection it is. What's your name?

**4. Caller:** Priya

**Gio** _(12 words, 1047ms)_: Lovely, thanks Priya. What's the best phone number to reach you on?

**5. Caller:** 07700900128

**Gio** _(8 words, 1043ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-eight. Is that right?

**6. Caller:** yes

**Gio** _(7 words, 1097ms)_: Lovely. Cash or card when you collect?

**7. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Priya","customer_phone":"07700900128","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(20 words, 3099ms)_: So that's two 12 inch Pepperoni, for collection, paid in cash. The total comes to 21.98. Is that all correct?

**8. Caller:** no, I said THREE pepperoni

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Priya","customer_phone":"07700900128","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":3,"size_name":"12 inch"}]} → 200 — "So that's three twelve inch pepperoni, for collection. That comes to 32.97 in total. Is that all correct?"
>
**Gio** _(23 words, 2595ms)_: Sorry about that. So that's three 12 inch Pepperoni, for collection, paid in cash. The total comes to 32.97. Is that all correct?

**9. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Priya","customer_phone":"07700900128","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":3,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1114, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-eight."
>
**Gio** _(18 words, 3460ms)_: Lovely, that's placed, order number A-1114. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-eight. Is that right?

**10. Caller:** yes

**Gio** _(8 words, 1033ms)_: Brilliant, about 20 minutes then. Thanks Priya, bye!

## Test 11: Correction after placing

**1. Caller:** two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(15 words, 2305ms)_: Two 12 inch Pepperoni pizzas at 10.99 each. Lovely. Any drinks or sides with that?

**2. Caller:** no thanks

**Gio** _(8 words, 1034ms)_: No worries. Is that for delivery or collection?

**3. Caller:** collection

**Gio** _(7 words, 1066ms)_: Lovely, collection it is. What's your name?

**4. Caller:** Dan

**Gio** _(10 words, 1057ms)_: Brilliant, thanks Dan. What's the best contact number for you?

**5. Caller:** 07700900123

**Gio** _(8 words, 1080ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**6. Caller:** yes

**Gio** _(3 words, 1116ms)_: Cash or card?

**7. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Dan","customer_phone":"07700900123","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(19 words, 2997ms)_: So that's two 12 inch Pepperoni pizzas for collection, paying cash. The total is 21.98. Is that all correct?

**8. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Dan","customer_phone":"07700900123","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1115, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three."
>
**Gio** _(18 words, 2944ms)_: Lovely, that's placed, order number A-1115. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**9. Caller:** that's the wrong number, it's 07700900999

**Gio** _(8 words, 994ms)_: That's oh-seven-seven, double-oh, nine-double-oh, nine-nine-nine. Is that right?

**10. Caller:** yes

> 🔧 `request_callback` {"customer_name":"Dan","customer_phone":"07700900999","reason":"problem","details":"Order A-1115: correct phone is 07700900999 (original was 07700900123)"} → 200 — "Thanks Dan, someone will ring you back on oh-double-seven, double-oh, nine-double-oh, triple-nine. Is that the right number?"
>
**Gio** _(17 words, 2441ms)_: Thanks Dan, someone will ring you back on oh-double-seven, double-oh, nine-double-oh, triple-nine. Is that the right number?

**11. Caller:** yes

**Gio** _(23 words, 1257ms)_: Brilliant, the shop will update your order and ring you on that number. Your order's ready in about 20 minutes. Thanks Dan, bye!

