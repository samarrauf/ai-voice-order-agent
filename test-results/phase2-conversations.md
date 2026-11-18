# Phase 2 conversation tests

Run: 2026-11-18T11:03:44.555Z · model claude-haiku-5-5 · total cost $0.0714

Cleaned up afterwards: 9 order(s) [A-1842, A-1843, A-1844, A-1845, A-1846, A-1847, A-1848, A-1850, A-1849], 2 callback(s).

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
| 12. Table booking: straight through | ✅ PASS | — |
| 13. Table booking: no space, offers another time | ✅ PASS | — |
| 14. Table booking: party of twelve | ✅ PASS | — |
| 15. Table booking: wrong digit caught by read-back | ✅ PASS | — |
| 16. Order query: refund request recorded | ✅ PASS | — |
| 17. Order query: wrong order number, callback offered | ✅ PASS | — |
| 18. Order query: pushing for a refund promise | ✅ PASS | — |
| 19. Order query: past order mentioned while ordering | ✅ PASS | — |
| 20. Order query: right order number, wrong phone | ✅ PASS | — |

## Failures in detail

- none

## Scenario checks

- Test 1 · order completed · 1 order(s) placed: PASS
- Test 2 · order completed · 1 order(s) placed: PASS
- Test 2 · changes kept · placed 2x 10 inch Margherita, 1x Garlic Bread: PASS
- Test 3 · 6 resume after interruption · after "ok carry on": "No problem. Is that for delivery or collection?": PASS
- Test 3 · running order kept · placed [{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]: PASS
- Test 4 · refused delivery · 1 check_delivery call(s): PASS
- Test 5 · switched to collection · placed as pickup: PASS
- Test 9 · 5 garlic bread question ≤ 2 times · asked 1 time(s): PASS
- Test 9 · 5 picked a default or offered callback · moved on: PASS
- Test 10 · 10 original (2) not placed · placed quantities: [3]: PASS
- Test 10 · 10 previewed again with 3 · 1 preview(s) after the correction: PASS
- Test 10 · 10 read back again · asked 'Is that all correct?' again: PASS
- Test 10 · 10 corrected order placed once · 1 order(s) placed: PASS
- Test 11 · 11 no second order · 1 order(s) placed: PASS
- Test 11 · 11 callback with corrected number · 07700900999 (problem): Order A-1848: correct phone is 07700900999, number on order was wrong: PASS
- Test 12 · A booking made once · 1 create_booking call(s), 1 succeeded: PASS
- Test 12 · A checked availability first · check at turn 4, booking at turn 9: PASS
- Test 12 · A booking details right · {"customer_name":"Sam","customer_phone":"07700900123","date":"2026-12-18","time":"19:30","party_size":4}: PASS
- Test 12 · A waited for yes to the read-back · asked: "Four people, Friday the eighteenth of December, half past seven, Sam, oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that all correct, shall I confirm the booking?" / caller: "yes": PASS
- Test 12 · A reference and table given · "Lovely, you're booked. Reference B, two-seven-eight-six, table five. We have your number as oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?": PASS
- Test 13 · B first check found no table · first check: false: PASS
- Test 13 · B asked about another day or time · replies after the failed check: "Sorry, we don't have a table for eight on Saturday the nineteenth of December at seven. Would another day or time work?" / "Good news, we have a table for eight on Saturday the nineteenth of December at nine. Can I take a name for the booking?" / "Lovely, Priya. What's the best contact number for the booking?": PASS
- Test 13 · B did not book the full slot · 1 create_booking call(s): PASS
- Test 13 · B at most two failed checks · 2 check(s): PASS
- Test 13 · B booked the other time · {"date":"2026-12-19","time":"21:00","party_size":8,"customer_name":"Priya","customer_phone":"07700900124"}: PASS
- Test 14 · C no booking tools called · 0 tool call(s): none: PASS
- Test 14 · C advised ringing the shop · "Sorry, we can't take a booking that big over the phone. Please ring the shop directly. I'm sorry, we still can't take a party of twelve over the phone. Please ring the shop directly.": PASS
- Test 14 · C no workaround · no table-joining offered: PASS
- Test 15 · D corrected number stored · stored 07700900999: PASS
- Test 15 · D wrong number never booked · 1 create_booking call(s): PASS
- Test 15 · D final read-back had the corrected number · read back 07700900999: PASS
- Test 15 · D server echo matches · stored_phone 07700900999: PASS
- Test 16 · Q1 order found · 1 lookup_order call(s): PASS
- Test 16 · Q1 one query recorded · 1 create_order_query call(s), 1 succeeded: PASS
- Test 16 · Q1 lookup came before the query · lookup turn 3, query turn 5: PASS
- Test 16 · Q1 classified as refund · type refund: PASS
- Test 16 · Q1 reference read aloud · "I've noted that down and passed it to the restaurant, they'll be in touch with you themselves. Your reference is Q, three-zero-four-four.": PASS
- Test 16 · Q1 no promise made · none: PASS
- Test 16 · Q1 no new order placed · create_order not called: PASS
- Test 17 · Q2 lookup tried and never found · 2 lookup(s), statuses 404,404: PASS
- Test 17 · Q2 no more than 3 lookups · 2 lookup(s): PASS
- Test 17 · Q2 no query recorded · create_order_query not called: PASS
- Test 17 · Q2 callback saved · {"customer_name":"Priya","customer_phone":"07700900555","reason":"problem","details":"Caller wants to complain about past order A-98765; order could not be found by number and phone."}: PASS
- Test 17 · Q2 did not say which detail was wrong · no reason given: PASS
- Test 18 · Q3 caller pushed · at turn 6: PASS
- Test 18 · Q3 no promise of a refund · none: PASS
- Test 18 · Q3 said it is for the owner to decide · reply: "I can't promise anything myself, that's for the owner to decide, but they'll have everything you've told me.": PASS
- Test 18 · Q3 recorded once · one create_order_query: PASS
- Test 19 · Q4 lookup_order not called · 0 lookup_order call(s): PASS
- Test 19 · Q4 no query recorded · create_order_query not called: PASS
- Test 19 · order completed · 1 order(s) placed: PASS
- Test 20 · Q5 lookup refused every time · 2 lookup(s), statuses 404,404: PASS
- Test 20 · Q5 nothing about the order revealed · no order details spoken: PASS
- Test 20 · Q5 did not say the phone was the wrong part · generic 'can't find it' only: PASS
- Test 20 · Q5 no query recorded · create_order_query not called: PASS

## Test 1: Full delivery order

**1. Caller:** hi

**Gio** _(10 words, 1604ms)_: Hiya, Napoli Pizza and Grill, what can I get you?

**2. Caller:** two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(11 words, 2197ms)_: Lovely, two 12 inch Pepperoni. Any drinks or sides with that?

**3. Caller:** no thanks

**Gio** _(6 words, 1022ms)_: Is that for delivery or collection?

**4. Caller:** delivery

**Gio** _(4 words, 926ms)_: Lovely, what's the postcode?

**5. Caller:** M14 5TP

**Gio** _(6 words, 933ms)_: That's M-one-four, five-T-P. Is that right?

**6. Caller:** yes

> 🔧 `check_delivery` {"postcode":"M14 5TP"} → 200 — "Yes, we deliver there. It's 2.50 for delivery, about 45 minutes."
>
**Gio** _(12 words, 2323ms)_: Good news, we deliver there. It's 2.50 for delivery, about 45 minutes.

**7. Caller:** ok

**Gio** _(7 words, 918ms)_: Brilliant, can I take your name, please?

**8. Caller:** Sarah

**Gio** _(9 words, 933ms)_: Lovely, Sarah. What's the best contact number for you?

**9. Caller:** 07700900123

**Gio** _(8 words, 914ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**10. Caller:** yes

**Gio** _(10 words, 1074ms)_: What's the first line of the address for the delivery?

**11. Caller:** 12 Oak Road

**Gio** _(4 words, 1194ms)_: Lovely, cash or card?

**12. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"delivery","customer_name":"Sarah","customer_phone":"07700900123","delivery_address":"12 Oak Road","delivery_postcode":"M14 5TP","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for delivery to M14 5TP. That comes to 24.48 in total, including 2.50 delivery. Is that all correct?"
>
**Gio** _(24 words, 3037ms)_: So that's two 12 inch Pepperoni, for delivery to M14 5TP. That comes to 24.48 in total, including 2.50 delivery. Is that all correct?

**13. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"delivery","customer_name":"Sarah","customer_phone":"07700900123","delivery_address":"12 Oak Road","delivery_postcode":"M14 5TP","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1842, delivering to M-one-four, five-T-P in about 45 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three."
>
**Gio** _(18 words, 3305ms)_: Lovely, that's placed, order number A-1842. We've got your number as oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**14. Caller:** yes

**Gio** _(9 words, 1052ms)_: And it's going to M-one-four, five-T-P. Is that right?

**15. Caller:** yes

**Gio** _(8 words, 969ms)_: Brilliant, about 45 minutes then. Thanks Sarah, bye!

## Test 2: Changes of mind, collection

**1. Caller:** one margherita please

> 🔧 `search_menu` {"query":"margherita"} → 200 — "Margherita — ten inch is 7.99, twelve inch 9.99, fourteen inch 11.99."
>
**Gio** _(13 words, 2754ms)_: Lovely, which size would you like: 10 inch, 12 inch or 14 inch?

**2. Caller:** 10 inch

**Gio** _(11 words, 1460ms)_: Lovely, one 10 inch Margherita. Any drinks or sides with that?

**3. Caller:** actually make that two

**Gio** _(11 words, 1067ms)_: Lovely, two 10 inch Margheritas. Is that for delivery or collection?

**4. Caller:** and add a garlic bread

> 🔧 `search_menu` {"query":"garlic bread"} → 200 — "Garlic Bread is 3.99."
>
**Gio** _(13 words, 2510ms)_: Garlic bread is 3.99, or with cheese it's 4.99. Which would you like?

**5. Caller:** plain please

**Gio** _(12 words, 1070ms)_: Lovely, one plain garlic bread added. Is that for delivery or collection?

**6. Caller:** collection

**Gio** _(12 words, 1043ms)_: Lovely, collection it is. What name should I put the order under?

**7. Caller:** Tom

**Gio** _(12 words, 1109ms)_: Brilliant, thanks Tom. What's the best phone number to reach you on?

**8. Caller:** 07700900124

**Gio** _(8 words, 984ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**9. Caller:** yes

**Gio** _(8 words, 1056ms)_: Lovely, and cash or card when you collect?

**10. Caller:** card

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Tom","customer_phone":"07700900124","payment_method":"card_on_delivery","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":2,"size_name":"10 inch"},{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "So that's two ten inch margherita and one garlic bread, for collection. That comes to 19.97 in total. Is that all correct?"
>
**Gio** _(21 words, 3449ms)_: So that's two 10 inch Margheritas and one plain garlic bread, for collection. The total is 19.97. Is that all correct?

**11. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Tom","customer_phone":"07700900124","payment_method":"card_on_delivery","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":2,"size_name":"10 inch"},{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "Perfect, order number A-1843, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-four."
>
**Gio** _(18 words, 3700ms)_: Lovely, that's placed, order number A-1843. We've got your number as oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**12. Caller:** yes

**Gio** _(11 words, 1197ms)_: Brilliant, that'll be ready in about 20 minutes, Tom. Thanks, bye!

## Test 3: Allergen question mid-order

**1. Caller:** two pepperoni please

> 🔧 `search_menu` {"query":"pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(14 words, 2326ms)_: Lovely, two Pepperoni pizzas. What size would you like, ten, twelve or fourteen inch?

**2. Caller:** 12 inch

**Gio** _(11 words, 976ms)_: Lovely, two 12 inch Pepperoni. Any drinks or sides with that?

**3. Caller:** does it have nuts?

**Gio** _(20 words, 1098ms)_: I can't confirm allergens over the phone. Would you like someone from the shop to call you back about it?

**4. Caller:** ok carry on

**Gio** _(8 words, 950ms)_: No problem. Is that for delivery or collection?

**5. Caller:** collection

**Gio** _(8 words, 1246ms)_: Lovely, collection. Can I take your name, please?

**6. Caller:** Raj

**Gio** _(10 words, 1064ms)_: Thanks Raj. What's the best contact number for the order?

**7. Caller:** 07700900126

**Gio** _(8 words, 972ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-six. Is that right?

**8. Caller:** yes

**Gio** _(4 words, 1037ms)_: Brilliant. Cash or card?

**9. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Raj","customer_phone":"07700900126","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(18 words, 2841ms)_: So that's two 12 inch Pepperoni, for collection. That comes to 21.98 in total. Is that all correct?

**10. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Raj","customer_phone":"07700900126","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1844, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-six."
>
**Gio** _(18 words, 3424ms)_: Lovely, that's placed, order number A-1844. We've got your number as oh-seven-seven, double-oh, nine-double-oh, one-two-six. Is that right?

**11. Caller:** yes

**Gio** _(12 words, 1006ms)_: Brilliant, that's ready to collect in about 20 minutes. Thanks Raj, bye!

## Test 4: Postcode outside area

**1. Caller:** hi

**Gio** _(10 words, 1067ms)_: Hiya, Napoli Pizza and Grill, what can I get you?

**2. Caller:** delivery to SW1A 1AA

**Gio** _(6 words, 1024ms)_: That's S-W-one-A, one-A-A. Is that right?

**3. Caller:** yes

> 🔧 `check_delivery` {"postcode":"SW1A 1AA"} → 200 — "Sorry, we don't deliver to that postcode, but you're welcome to collect. Would you like to do collection?"
>
**Gio** _(18 words, 2072ms)_: Sorry, we don't deliver to that postcode, but you're welcome to collect. Would you like to do collection?

**4. Caller:** no thanks then, bye

**Gio** _(10 words, 984ms)_: No worries, thanks for calling Napoli Pizza and Grill. Bye!

## Test 5: Below delivery minimum

**1. Caller:** one 10 inch margherita

> 🔧 `search_menu` {"query":"10 inch margherita"} → 200 — "Margherita — ten inch is 7.99, twelve inch 9.99, fourteen inch 11.99."
>
**Gio** _(12 words, 2217ms)_: Lovely, one 10 inch Margherita, 7.99. Any drinks or sides with that?

**2. Caller:** delivery to M14 5TP

**Gio** _(6 words, 1028ms)_: That's M-one-four, five-T-P. Is that right?

**3. Caller:** yes

> 🔧 `check_delivery` {"postcode":"M14 5TP"} → 200 — "Yes, we deliver there. It's 2.50 for delivery, about 45 minutes."
>
**Gio** _(12 words, 2191ms)_: Good news, we deliver there. It's 2.50 for delivery, about 45 minutes.

**4. Caller:** ok

**Gio** _(9 words, 1160ms)_: Brilliant. What name should I put the order under?

**5. Caller:** Ann

**Gio** _(9 words, 1153ms)_: Lovely, Ann. What's the best contact number for you?

**6. Caller:** 07700900125

**Gio** _(8 words, 1237ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-five. Is that right?

**7. Caller:** yes

**Gio** _(10 words, 1107ms)_: Thanks, Ann. What's the first line of the delivery address?

**8. Caller:** 4 Elm Street

**Gio** _(4 words, 1192ms)_: Lovely. Cash or card?

**9. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"delivery","customer_name":"Ann","customer_phone":"07700900125","payment_method":"cash","delivery_address":"4 Elm Street","delivery_postcode":"M14 5TP","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":1,"size_name":"10 inch"}]} → 400 — "Sorry, the minimum for delivery is 12.00. You need another 4.01 to reach it. Would you like to add something, or collect instead?"
>
**Gio** _(20 words, 3222ms)_: Sorry, the delivery minimum is 12.00, so you need another 4.01. Would you like to add something, or collect instead?

**10. Caller:** I'll just collect it then

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Ann","customer_phone":"07700900125","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":1,"size_name":"10 inch"}]} → 200 — "So that's one ten inch margherita, for collection. That comes to 7.99 in total. Is that all correct?"
>
**Gio** _(18 words, 2646ms)_: So that's one 10 inch Margherita, for collection. That comes to 7.99 in total. Is that all correct?

**11. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Ann","customer_phone":"07700900125","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":1,"size_name":"10 inch"}]} → 200 — "Perfect, order number A-1845, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-five."
>
**Gio** _(18 words, 2986ms)_: Lovely, that's placed, order number A-1845. We've got your number as oh-seven-seven, double-oh, nine-double-oh, one-two-five. Is that right?

**12. Caller:** yes

**Gio** _(13 words, 996ms)_: Brilliant, that'll be ready for collection in about 20 minutes. Thanks Ann, bye!

## Test 6: What do you have?

**1. Caller:** what do you have?

**Gio** _(16 words, 1408ms)_: Hiya, we do pizzas, kebabs, garlic bread, sides, drinks and desserts. What can I get you?

## Test 7: Item not on menu

**1. Caller:** do you have sushi?

> 🔧 `search_menu` {"query":"sushi"} → 200 — "I don't have that one — we do classic pizzas, kebabs and sides. What are you after?"
>
**Gio** _(18 words, 2751ms)_: I'm afraid we don't do sushi. We do pizzas, kebabs, sides and drinks. What can I get you?

## Test 8: Are you a real person?

**1. Caller:** am I talking to a real person?

**Gio** _(17 words, 1221ms)_: I'm an AI assistant. I can take your order just the same. What can I get you?

**2. Caller:** ok, two pepperoni then

> 🔧 `search_menu` {"query":"pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(14 words, 2234ms)_: What size would you like for the two pepperoni, 10, 12 or 14 inch?

**3. Caller:** 12 inch

**Gio** _(11 words, 1261ms)_: Lovely, two 12 inch Pepperoni. Any drinks or sides with that?

## Test 9: Stubborn caller

**1. Caller:** one garlic bread

> 🔧 `search_menu` {"query":"garlic bread"} → 200 — "Garlic Bread is 3.99."
>
**Gio** _(12 words, 2230ms)_: Garlic bread is 3.99. Would you like cheese on that, or plain?

**2. Caller:** umm

**Gio** _(19 words, 1127ms)_: No worries, I'll put you down for plain garlic bread. Anything to drink or on the side with that?

**3. Caller:** no thanks

**Gio** _(7 words, 994ms)_: Lovely. Is that for delivery or collection?

**4. Caller:** collection

**Gio** _(12 words, 1165ms)_: Brilliant, collection it is. What name should I put the order under?

**5. Caller:** Lee

**Gio** _(11 words, 1406ms)_: Thanks, Lee. What's the best phone number to reach you on?

**6. Caller:** 07700900127

**Gio** _(8 words, 988ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-seven. Is that right?

**7. Caller:** yes

**Gio** _(3 words, 1061ms)_: Cash or card?

**8. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Lee","customer_phone":"07700900127","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "So that's one garlic bread, for collection. That comes to 3.99 in total. Is that all correct?"
>
**Gio** _(19 words, 3649ms)_: So that's one garlic bread, for collection, paying cash. That comes to 3.99 in total. Is that all correct?

**9. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Lee","customer_phone":"07700900127","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "Perfect, order number A-1846, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-seven."
>
**Gio** _(18 words, 3721ms)_: Lovely, that's placed, order number A-1846. We've got your number as oh-seven-seven, double-oh, nine-double-oh, one-two-seven. Is that right?

**10. Caller:** yes

**Gio** _(12 words, 1198ms)_: Brilliant, it'll be ready in about 20 minutes then. Thanks Lee, bye!

## Test 10: Confirmation refused

**1. Caller:** two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(11 words, 2161ms)_: Lovely, two 12 inch Pepperoni. Any drinks or sides with that?

**2. Caller:** no thanks

**Gio** _(7 words, 972ms)_: Brilliant. Is that for delivery or collection?

**3. Caller:** collection

**Gio** _(7 words, 956ms)_: Lovely, collection it is. What's your name?

**4. Caller:** Priya

**Gio** _(9 words, 1080ms)_: Lovely, Priya. What's the best contact number for you?

**5. Caller:** 07700900128

**Gio** _(8 words, 1225ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-eight. Is that right?

**6. Caller:** yes

**Gio** _(3 words, 1010ms)_: Cash or card?

**7. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Priya","customer_phone":"07700900128","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(18 words, 3047ms)_: So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?

**8. Caller:** no, I said THREE pepperoni

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Priya","customer_phone":"07700900128","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":3,"size_name":"12 inch"}]} → 200 — "So that's three twelve inch pepperoni, for collection. That comes to 32.97 in total. Is that all correct?"
>
**Gio** _(22 words, 2582ms)_: Sorry about that, Priya. So that's three twelve inch pepperoni, for collection. That comes to 32.97 in total. Is that all correct?

**9. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Priya","customer_phone":"07700900128","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":3,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1847, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-eight."
>
**Gio** _(18 words, 2981ms)_: Lovely, that's placed, order number A-1847. We've got your number as oh-seven-seven, double-oh, nine-double-oh, one-two-eight. Is that right?

**10. Caller:** yes

**Gio** _(13 words, 1351ms)_: Brilliant, it'll be ready for collection in about 20 minutes. Thanks Priya, bye!

## Test 11: Correction after placing

**1. Caller:** two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(11 words, 2210ms)_: Lovely, two 12 inch Pepperoni. Any drinks or sides with that?

**2. Caller:** no thanks

**Gio** _(6 words, 921ms)_: Is that for delivery or collection?

**3. Caller:** collection

**Gio** _(12 words, 979ms)_: Brilliant, collection it is. What name should I put the order under?

**4. Caller:** Dan

**Gio** _(11 words, 1054ms)_: Lovely, Dan. What's the best phone number to reach you on?

**5. Caller:** 07700900123

**Gio** _(8 words, 968ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**6. Caller:** yes

**Gio** _(3 words, 1018ms)_: Cash or card?

**7. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Dan","customer_phone":"07700900123","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(18 words, 2976ms)_: So that's two 12 inch Pepperoni, for collection. That comes to 21.98 in total. Is that all correct?

**8. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Dan","customer_phone":"07700900123","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1848, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three."
>
**Gio** _(18 words, 3225ms)_: Lovely, that's placed, order number A-1848. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**9. Caller:** that's the wrong number, it's 07700900999

**Gio** _(8 words, 1383ms)_: That's oh-seven-seven, double-oh, nine-double-oh, nine-nine-nine. Is that right?

**10. Caller:** yes

> 🔧 `request_callback` {"customer_name":"Dan","customer_phone":"07700900999","reason":"problem","details":"Order A-1848: correct phone is 07700900999, number on order was wrong"} → 200 — "Thanks Dan, someone will ring you back on oh-double-seven, double-oh, nine-double-oh, triple-nine. Is that the right number?"
>
**Gio** _(17 words, 2602ms)_: Thanks Dan, someone will ring you back on oh-double-seven, double-oh, nine-double-oh, triple-nine. Is that the right number?

**11. Caller:** yes

**Gio** _(22 words, 1053ms)_: Brilliant, the shop will update your order and sort the number out. Your order's ready in about 20 minutes. Thanks Dan, bye!

## Test 12: Table booking: straight through

**1. Caller:** hi, I'd like to book a table please

**Gio** _(14 words, 944ms)_: Lovely, I can help with that. What date would you like the table for?

**2. Caller:** Friday the 18 of December

**Gio** _(14 words, 1318ms)_: Friday the eighteenth of December, lovely. What time would you like the table for?

**3. Caller:** half past seven in the evening

**Gio** _(10 words, 927ms)_: Half past seven, lovely. How many people will be coming?

**4. Caller:** four

> 🔧 `check_availability` {"date":"2026-12-18","time":"19:30","party_size":4} → 200 — "Yes, we have a table for four people on Friday the eighteenth of December at half past seven."
>
**Gio** _(19 words, 2643ms)_: Good news, we have a table for four people on Friday the eighteenth of December at half past seven.

**5. Caller:** ok

**Gio** _(9 words, 995ms)_: Brilliant. What name should I put the booking under?

**6. Caller:** Sam

**Gio** _(10 words, 1109ms)_: Lovely, Sam. What's the best contact number for the booking?

**7. Caller:** 07700900123

**Gio** _(8 words, 1042ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**8. Caller:** yes

**Gio** _(24 words, 1187ms)_: Four people, Friday the eighteenth of December, half past seven, Sam, oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that all correct, shall I confirm the booking?

**9. Caller:** yes

> 🔧 `create_booking` {"customer_name":"Sam","customer_phone":"07700900123","date":"2026-12-18","time":"19:30","party_size":4} → 200 — "That's booked, Sam. A table for four people on Friday the eighteenth of December at half past seven. Your booking reference is B, two-seven-eight-six. We have your number as oh-double-seven, double-oh, nine-double-oh, one-two-three. Is that right?"
>
**Gio** _(20 words, 3011ms)_: Lovely, you're booked. Reference B, two-seven-eight-six, table five. We have your number as oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**10. Caller:** yes

**Gio** _(12 words, 1179ms)_: Brilliant, see you on Friday at half past seven, Sam. Thanks, bye!

## Test 13: Table booking: no space, offers another time

**1. Caller:** hi, I'd like to book a table please

**Gio** _(14 words, 1118ms)_: Lovely, I can help with that. What date would you like the table for?

**2. Caller:** Saturday the 19 of December

**Gio** _(14 words, 1679ms)_: Saturday the nineteenth of December, lovely. What time would you like the table for?

**3. Caller:** seven o'clock in the evening

**Gio** _(6 words, 1062ms)_: How many people will be coming?

**4. Caller:** eight

> 🔧 `check_availability` {"date":"2026-12-19","time":"19:00","party_size":8} → 200 — "Sorry, we don't have a table for eight people on Saturday the nineteenth of December at seven o'clock."
>
**Gio** _(22 words, 2959ms)_: Sorry, we don't have a table for eight on Saturday the nineteenth of December at seven. Would another day or time work?

**5. Caller:** how about nine o'clock

> 🔧 `check_availability` {"date":"2026-12-19","time":"21:00","party_size":8} → 200 — "Yes, we have a table for eight people on Saturday the nineteenth of December at nine o'clock."
>
**Gio** _(24 words, 2593ms)_: Good news, we have a table for eight on Saturday the nineteenth of December at nine. Can I take a name for the booking?

**6. Caller:** Priya

**Gio** _(10 words, 1381ms)_: Lovely, Priya. What's the best contact number for the booking?

**7. Caller:** 07700900124

**Gio** _(8 words, 965ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**8. Caller:** yes

**Gio** _(23 words, 1307ms)_: Eight people, Saturday the nineteenth of December, nine o'clock, Priya, oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that all correct, shall I confirm the booking?

**9. Caller:** yes

> 🔧 `create_booking` {"date":"2026-12-19","time":"21:00","party_size":8,"customer_name":"Priya","customer_phone":"07700900124"} → 200 — "That's booked, Priya. A table for eight people on Saturday the nineteenth of December at nine o'clock. Your booking reference is B, two-seven-eight-eight. We have your number as oh-double-seven, double-oh, nine-double-oh, one-two-four. Is that right?"
>
**Gio** _(20 words, 3146ms)_: Lovely, you're booked. Reference B, two-seven-eight-eight, table twelve. We have your number as oh-double-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**10. Caller:** yes

**Gio** _(9 words, 1089ms)_: Brilliant, see you Saturday at nine, Priya. Thanks, bye!

## Test 14: Table booking: party of twelve

**1. Caller:** hi, I'd like to book a table for twelve people

**Gio** _(16 words, 1034ms)_: Sorry, we can't take a booking that big over the phone. Please ring the shop directly.

**2. Caller:** Sunday the 20 of December at seven then

**Gio** _(18 words, 1357ms)_: I'm sorry, we still can't take a party of twelve over the phone. Please ring the shop directly.

## Test 15: Table booking: wrong digit caught by read-back

**1. Caller:** hi, I'd like to book a table please

**Gio** _(12 words, 1469ms)_: Lovely, I can help with that. What date were you thinking of?

**2. Caller:** Monday the 21 of December

**Gio** _(14 words, 1760ms)_: Monday the twenty-first of December, lovely. What time would you like the table for?

**3. Caller:** eight o'clock in the evening

**Gio** _(10 words, 992ms)_: Eight o'clock, got it. How many people will be coming?

**4. Caller:** two

> 🔧 `check_availability` {"date":"2026-12-21","time":"20:00","party_size":2} → 200 — "Yes, we have a table for two people on Monday the twenty-first of December at eight o'clock."
>
**Gio** _(17 words, 2518ms)_: Good news, we have a table for two on Monday the twenty-first of December at eight o'clock.

**5. Caller:** ok

**Gio** _(9 words, 1198ms)_: Brilliant. What name should I put the booking under?

**6. Caller:** Dan

**Gio** _(9 words, 980ms)_: Lovely, Dan. What's the best contact number for you?

**7. Caller:** 07700900123

**Gio** _(8 words, 921ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**8. Caller:** no, that's wrong, it's 07700900999

**Gio** _(8 words, 1149ms)_: That's oh-seven-seven, double-oh, nine-double-oh, nine-nine-nine. Is that right?

**9. Caller:** yes

**Gio** _(23 words, 1185ms)_: Two people, Monday the twenty-first of December, eight o'clock, Dan, oh-seven-seven, double-oh, nine-double-oh, nine-nine-nine. Is that all correct, shall I confirm the booking?

**10. Caller:** yes

> 🔧 `create_booking` {"date":"2026-12-21","time":"20:00","party_size":2,"customer_name":"Dan","customer_phone":"07700900999"} → 200 — "That's booked, Dan. A table for two people on Monday the twenty-first of December at eight o'clock. Your booking reference is B, two-seven-eight-nine. We have your number as oh-double-seven, double-oh, nine-double-oh, triple-nine. Is that right?"
>
**Gio** _(20 words, 3831ms)_: Lovely, you're booked. Reference B, two-seven-eight-nine, table one. We have your number as oh-seven-seven, double-oh, nine-double-oh, nine-nine-nine. Is that right?

**11. Caller:** yes

**Gio** _(9 words, 1277ms)_: Brilliant, see you on the twenty-first, Dan. Thanks, bye!

## Test 16: Order query: refund request recorded

**1. Caller:** hi, I'd like a refund on an order I had

**Gio** _(8 words, 1049ms)_: Sorry to hear that. What's the order number?

**2. Caller:** A-1849

**Gio** _(7 words, 1038ms)_: And the phone number you ordered with?

**3. Caller:** 07700900555

> 🔧 `lookup_order` {"order_number":"A-1849","customer_phone":"07700900555"} → 200 — "I found your pickup order from 18 November: 2 Margherita. The total was 17.98. Its status is completed."
>
**Gio** _(14 words, 2944ms)_: I found order A-1849 from today, two Margherita, total 17.98. Is that the one?

**4. Caller:** yes, that's the one

**Gio** _(3 words, 955ms)_: What's the problem?

**5. Caller:** the pizza arrived cold and I want a refund

> 🔧 `create_order_query` {"order_number":"A-1849","customer_phone":"07700900555","query_type":"refund","description":"Pizza arrived cold and wants a refund"} → 200 — "I've noted that down and passed it to the team. Your reference is Q 3044. Someone will come back to you; I can't promise any outcome myself."
>
**Gio** _(22 words, 3417ms)_: I've noted that down and passed it to the restaurant, they'll be in touch with you themselves. Your reference is Q, three-zero-four-four.

**6. Caller:** ok

**Gio** _(8 words, 1124ms)_: Thanks for calling Napoli Pizza and Grill. Bye!

## Test 17: Order query: wrong order number, callback offered

**1. Caller:** hi, I want to complain about an order I had

**Gio** _(8 words, 1038ms)_: Sorry to hear that. What's the order number?

**2. Caller:** A-98765

**Gio** _(7 words, 2088ms)_: And the phone number you ordered with?

**3. Caller:** 07700900555

> 🔧 `lookup_order` {"order_number":"A-98765","customer_phone":"07700900555"} → 404 — "Sorry, I can't find an order with those details. Could you check the order number and the phone number you ordered with?"
>
**Gio** _(17 words, 3047ms)_: Sorry, I can't find an order with those details. Could you give me the order number again?

**4. Caller:** A-98765

> 🔧 `lookup_order` {"order_number":"A-98765","customer_phone":"07700900555"} → 404 — "Sorry, I can't find an order with those details. Could you check the order number and the phone number you ordered with?"
>
**Gio** _(20 words, 3548ms)_: I'm still not finding that one, I'm afraid. Shall I get someone from the shop to ring you about it?

**5. Caller:** yes please

**Gio** _(9 words, 1092ms)_: Lovely. What name should I put the callback under?

**6. Caller:** Priya

**Gio** _(10 words, 993ms)_: Thanks, Priya. What's the best number to ring you on?

**7. Caller:** 07700900555

**Gio** _(8 words, 1131ms)_: That's oh-seven-seven, double-oh, nine-double-oh, five-five-five. Is that right?

**8. Caller:** yes

> 🔧 `request_callback` {"customer_name":"Priya","customer_phone":"07700900555","reason":"problem","details":"Caller wants to complain about past order A-98765; order could not be found by number and phone."} → 200 — "Thanks Priya, someone will ring you back on oh-double-seven, double-oh, nine-double-oh, triple-five. Is that the right number?"
>
**Gio** _(17 words, 2831ms)_: Thanks Priya, someone will ring you back on oh-double-seven, double-oh, nine-double-oh, triple-five. Is that the right number?

**9. Caller:** yes

**Gio** _(13 words, 1046ms)_: Brilliant, someone from the shop will be in touch soon. Thanks Priya, bye!

## Test 18: Order query: pushing for a refund promise

**1. Caller:** hi, I need a refund on an order I had

**Gio** _(8 words, 1121ms)_: Sorry to hear that. What's the order number?

**2. Caller:** A-1849

**Gio** _(7 words, 1002ms)_: And the phone number you ordered with?

**3. Caller:** 07700900555

> 🔧 `lookup_order` {"order_number":"A-1849","customer_phone":"07700900555"} → 200 — "I found your pickup order from 18 November: 2 Margherita. The total was 17.98. Its status is completed."
>
**Gio** _(17 words, 2653ms)_: I found order A-1849 from today, 2 Margherita, with a total of 17.98. Is that the one?

**4. Caller:** yes, that's the one

**Gio** _(3 words, 1303ms)_: What's the problem?

**5. Caller:** the pizza was cold and the base was soggy

> 🔧 `create_order_query` {"order_number":"A-1849","customer_phone":"07700900555","query_type":"refund","description":"the pizza was cold and the base was soggy"} → 200 — "I've noted that down and passed it to the team. Your reference is Q 3045. Someone will come back to you; I can't promise any outcome myself."
>
**Gio** _(22 words, 2812ms)_: I've noted that down and passed it to the restaurant, they'll be in touch with you themselves. Your reference is Q, three-zero-four-five.

**6. Caller:** but I'll definitely get my money back, won't I?

**Gio** _(18 words, 991ms)_: I can't promise anything myself, that's for the owner to decide, but they'll have everything you've told me.

**7. Caller:** ok

**Gio** _(13 words, 967ms)_: Thanks for your patience. Is there anything else I can help with today?

**8. Caller:** no, that's everything

**Gio** _(9 words, 948ms)_: Brilliant, thanks for calling, have a lovely day. Bye!

## Test 19: Order query: past order mentioned while ordering

**1. Caller:** hi, two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(14 words, 2120ms)_: Lovely, two 12 inch Pepperoni at 10.99 each. Any drinks or sides with that?

**2. Caller:** last time my order was wrong by the way

**Gio** _(6 words, 2049ms)_: Is that for delivery or collection?

**3. Caller:** collection

**Gio** _(7 words, 1006ms)_: Lovely, collection it is. What's your name?

**4. Caller:** Tom

**Gio** _(11 words, 989ms)_: Brilliant, Tom. What's the best phone number to reach you on?

**5. Caller:** 07700900124

**Gio** _(8 words, 939ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**6. Caller:** yes

**Gio** _(3 words, 903ms)_: Cash or card?

**7. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Tom","customer_phone":"07700900124","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(17 words, 2793ms)_: So that's two 12 inch Pepperoni, for collection, cash. The total is 21.98. Is that all correct?

**8. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Tom","customer_phone":"07700900124","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1850, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-four."
>
**Gio** _(18 words, 3444ms)_: Lovely, that's placed, order number A-1850. We've got your number as oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**9. Caller:** yes

**Gio** _(10 words, 964ms)_: Brilliant, that'll be about 20 minutes then. Thanks Tom, bye!

## Test 20: Order query: right order number, wrong phone

**1. Caller:** hi, I want a refund on an order I had

**Gio** _(8 words, 1056ms)_: Sorry to hear that. What's the order number?

**2. Caller:** A-1849

**Gio** _(7 words, 1039ms)_: And the phone number you ordered with?

**3. Caller:** 07700900777

> 🔧 `lookup_order` {"order_number":"A-1849","customer_phone":"07700900777"} → 404 — "Sorry, I can't find an order with those details. Could you check the order number and the phone number you ordered with?"
>
**Gio** _(17 words, 2291ms)_: Sorry, I can't find an order with those details. Could you check the order number for me?

**4. Caller:** A-1849

**Gio** _(7 words, 1094ms)_: And the phone number you ordered with?

**5. Caller:** 07700900777

> 🔧 `lookup_order` {"order_number":"A-1849","customer_phone":"07700900777"} → 404 — "Sorry, I can't find an order with those details. Could you check the order number and the phone number you ordered with?"
>
**Gio** _(19 words, 2442ms)_: Sorry, I still can't find that order. Shall I get someone from the shop to ring you about it?

**6. Caller:** no thanks

**Gio** _(12 words, 1073ms)_: No worries. Is there anything else I can help you with today?

**7. Caller:** no, that's everything

**Gio** _(12 words, 1057ms)_: No worries, sorry I couldn't find it. Have a lovely day, bye!

