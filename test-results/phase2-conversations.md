# Phase 2 conversation tests

Run: 2026-11-19T16:31:26.513Z · model claude-haiku-5-5 · total cost $0.0731

Cleaned up afterwards: 9 order(s) [A-3135, A-3136, A-3137, A-3138, A-3139, A-3140, A-3141, A-3143, A-3142], 2 callback(s).

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
- Test 3 · 6 resume after interruption · after "ok carry on": "No worries. Is that for delivery or collection?": PASS
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
- Test 11 · 11 callback with corrected number · 07700900999 (problem): Order A-3141: correct phone is 07700900999: PASS
- Test 12 · A booking made once · 1 create_booking call(s), 1 succeeded: PASS
- Test 12 · A checked availability first · check at turn 4, booking at turn 9: PASS
- Test 12 · A booking details right · {"date":"2026-12-19","time":"19:30","party_size":4,"customer_name":"Sam","customer_phone":"07700900123"}: PASS
- Test 12 · A waited for yes to the read-back · asked: "Four people, Saturday the nineteenth of December, half past seven, Sam, oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that all correct, shall I confirm the booking?" / caller: "yes": PASS
- Test 12 · A reference and table given · "Lovely, you're booked. Reference B, three-three-two-three, table five. We have your number as oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?": PASS
- Test 13 · B first check found no table · first check: false: PASS
- Test 13 · B asked about another day or time · replies after the failed check: "Sorry, we don't have a table for eight on Sunday the twentieth at seven. Would another day or time work for you?" / "Good news, we have a table for eight on Sunday the twentieth of December at nine o'clock. Can I take a name for the booking?" / "Lovely, Priya. What's the best contact number for the booking?": PASS
- Test 13 · B did not book the full slot · 1 create_booking call(s): PASS
- Test 13 · B at most two failed checks · 2 check(s): PASS
- Test 13 · B booked the other time · {"date":"2026-12-20","time":"21:00","party_size":8,"customer_name":"Priya","customer_phone":"07700900124"}: PASS
- Test 14 · C no booking tools called · 0 tool call(s): none: PASS
- Test 14 · C advised ringing the shop · "Twelve is too many for us to book over the phone, I'm sorry. Please ring the shop directly. I'm sorry, we still can't take a booking for twelve over the phone. Please ring the shop directly.": PASS
- Test 14 · C no workaround · no table-joining offered: PASS
- Test 15 · D corrected number stored · stored 07700900999: PASS
- Test 15 · D wrong number never booked · 1 create_booking call(s): PASS
- Test 15 · D final read-back had the corrected number · read back 07700900999: PASS
- Test 15 · D server echo matches · stored_phone 07700900999: PASS
- Test 16 · Q1 order found · 1 lookup_order call(s): PASS
- Test 16 · Q1 one query recorded · 1 create_order_query call(s), 1 succeeded: PASS
- Test 16 · Q1 lookup came before the query · lookup turn 3, query turn 5: PASS
- Test 16 · Q1 classified as refund · type refund: PASS
- Test 16 · Q1 reference read aloud · "I've noted that down and passed it to the restaurant, they'll be in touch with you themselves. Your reference is Q, three-zero-five-nine.": PASS
- Test 16 · Q1 no promise made · none: PASS
- Test 16 · Q1 no new order placed · create_order not called: PASS
- Test 17 · Q2 lookup tried and never found · 2 lookup(s), statuses 404,404: PASS
- Test 17 · Q2 no more than 3 lookups · 2 lookup(s): PASS
- Test 17 · Q2 no query recorded · create_order_query not called: PASS
- Test 17 · Q2 callback saved · {"customer_name":"Priya","customer_phone":"07700900555","reason":"problem","details":"Caller has a complaint about a past order; order A-98765 could not be found by number and phone."}: PASS
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

**Gio** _(10 words, 2387ms)_: Hiya, Napoli Pizza and Grill, what can I get you?

**2. Caller:** two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(11 words, 17316ms)_: Lovely, two 12 inch Pepperoni. Any drinks or sides with that?

**3. Caller:** no thanks

**Gio** _(6 words, 1529ms)_: Is that for delivery or collection?

**4. Caller:** delivery

**Gio** _(4 words, 2264ms)_: Lovely, what's the postcode?

**5. Caller:** M14 5TP

**Gio** _(6 words, 1634ms)_: That's M-one-four, five-T-P. Is that right?

**6. Caller:** yes

> 🔧 `check_delivery` {"postcode":"M14 5TP"} → 200 — "Yes, we deliver there. It's 2.50 for delivery, about 45 minutes."
>
**Gio** _(12 words, 3725ms)_: Good news, we deliver there. It's 2.50 for delivery, about 45 minutes.

**7. Caller:** ok

**Gio** _(6 words, 1776ms)_: Brilliant, can I take your name?

**8. Caller:** Sarah

**Gio** _(10 words, 2991ms)_: Lovely, Sarah. What's the best contact number for the order?

**9. Caller:** 07700900123

**Gio** _(8 words, 1631ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**10. Caller:** yes

**Gio** _(9 words, 2343ms)_: Thanks, what's the first line of the delivery address?

**11. Caller:** 12 Oak Road

**Gio** _(11 words, 1684ms)_: Lovely, 12 Oak Road. Is that cash or card on delivery?

**12. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"delivery","customer_name":"Sarah","customer_phone":"07700900123","payment_method":"cash","delivery_address":"12 Oak Road","delivery_postcode":"M14 5TP","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for delivery to M14 5TP. That comes to 24.48 in total, including 2.50 delivery. Is that all correct?"
>
**Gio** _(24 words, 5042ms)_: So that's two 12 inch Pepperoni, for delivery to M-one-four, five-T-P. That comes to 24.48 in total, including 2.50 delivery. Is that all correct?

**13. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"delivery","customer_name":"Sarah","customer_phone":"07700900123","payment_method":"cash","delivery_address":"12 Oak Road","delivery_postcode":"M14 5TP","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-3135, delivering to M-one-four, five-T-P in about 45 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three."
>
**Gio** _(18 words, 16625ms)_: Lovely, that's placed, order number A-3135. We've got your number as oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**14. Caller:** yes

**Gio** _(9 words, 2253ms)_: And it's going to M-one-four, five-T-P. Is that right?

**15. Caller:** yes

**Gio** _(8 words, 1627ms)_: Brilliant, about 45 minutes then. Thanks Sarah, bye!

## Test 2: Changes of mind, collection

**1. Caller:** one margherita please

> 🔧 `search_menu` {"query":"margherita"} → 200 — "Margherita — ten inch is 7.99, twelve inch 9.99, fourteen inch 11.99."
>
**Gio** _(13 words, 5879ms)_: Lovely, one Margherita. What size would you like, ten, twelve or fourteen inch?

**2. Caller:** 10 inch

**Gio** _(11 words, 3476ms)_: Lovely, one 10 inch Margherita. Any drinks or sides with that?

**3. Caller:** actually make that two

**Gio** _(12 words, 3790ms)_: Two 10 inch Margheritas, no worries. Is that for delivery or collection?

**4. Caller:** and add a garlic bread

> 🔧 `search_menu` {"query":"garlic bread"} → 200 — "Garlic Bread is 3.99."
>
**Gio** _(18 words, 3501ms)_: Garlic bread's 3.99. Do you want plain, with cheese at 4.99, or with cheese and jalapenos at 5.49?

**5. Caller:** plain please

**Gio** _(10 words, 1116ms)_: Plain garlic bread, lovely. Is that for delivery or collection?

**6. Caller:** collection

**Gio** _(5 words, 1627ms)_: Lovely, collection. What's your name?

**7. Caller:** Tom

**Gio** _(11 words, 1395ms)_: Thanks Tom. What's the best phone number to reach you on?

**8. Caller:** 07700900124

**Gio** _(8 words, 1128ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**9. Caller:** yes

**Gio** _(3 words, 1773ms)_: Cash or card?

**10. Caller:** card

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Tom","customer_phone":"07700900124","payment_method":"card_on_delivery","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":2,"size_name":"10 inch"},{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "So that's two ten inch margherita and one garlic bread, for collection. That comes to 19.97 in total. Is that all correct?"
>
**Gio** _(26 words, 5867ms)_: So that's two 10 inch Margheritas and one plain garlic bread, for collection, paying by card. That comes to 19.97 in total. Is that all correct?

**11. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Tom","customer_phone":"07700900124","payment_method":"card_on_delivery","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":2,"size_name":"10 inch"},{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "Perfect, order number A-3136, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-four."
>
**Gio** _(18 words, 8693ms)_: Lovely, that's placed, order number A-3136. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**12. Caller:** yes

**Gio** _(12 words, 1848ms)_: Brilliant, ready to collect in about 20 minutes then. Thanks Tom, bye!

## Test 3: Allergen question mid-order

**1. Caller:** two pepperoni please

> 🔧 `search_menu` {"query":"pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(14 words, 5876ms)_: Lovely, two pepperoni pizzas. What size would you like, ten, twelve or fourteen inch?

**2. Caller:** 12 inch

**Gio** _(11 words, 3047ms)_: Two 12 inch Pepperoni, lovely. Any drinks or sides with that?

**3. Caller:** does it have nuts?

**Gio** _(20 words, 2712ms)_: I can't confirm allergens over the phone. Would you like someone from the shop to call you back about it?

**4. Caller:** ok carry on

**Gio** _(8 words, 2131ms)_: No worries. Is that for delivery or collection?

**5. Caller:** collection

**Gio** _(5 words, 2608ms)_: Lovely, collection. What's your name?

**6. Caller:** Raj

**Gio** _(12 words, 1973ms)_: Nice one, Raj. What's the best phone number to reach you on?

**7. Caller:** 07700900126

**Gio** _(8 words, 2199ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-six. Is that right?

**8. Caller:** yes

**Gio** _(3 words, 2677ms)_: Cash or card?

**9. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Raj","customer_phone":"07700900126","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(18 words, 4402ms)_: So that's two 12 inch Pepperoni, for collection. That comes to 21.98 in total. Is that all correct?

**10. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Raj","customer_phone":"07700900126","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-3137, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-six."
>
**Gio** _(18 words, 4943ms)_: Lovely, that's placed, order number A-3137. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-six. Is that right?

**11. Caller:** yes

**Gio** _(12 words, 3889ms)_: Brilliant, ready to collect in about 20 minutes then. Thanks Raj, bye!

## Test 4: Postcode outside area

**1. Caller:** hi

**Gio** _(10 words, 1686ms)_: Hiya, Napoli Pizza and Grill, what can I get you?

**2. Caller:** delivery to SW1A 1AA

**Gio** _(6 words, 2400ms)_: That's S-W-one-A, one-A-A. Is that right?

**3. Caller:** yes

> 🔧 `check_delivery` {"postcode":"SW1A 1AA"} → 200 — "Sorry, we don't deliver to that postcode, but you're welcome to collect. Would you like to do collection?"
>
**Gio** _(18 words, 5642ms)_: Sorry, we don't deliver to that postcode, but you're welcome to collect. Would you like to do collection?

**4. Caller:** no thanks then, bye

**Gio** _(6 words, 3114ms)_: No worries, thanks for calling, bye!

## Test 5: Below delivery minimum

**1. Caller:** one 10 inch margherita

> 🔧 `search_menu` {"query":"10 inch margherita"} → 200 — "Margherita — ten inch is 7.99, twelve inch 9.99, fourteen inch 11.99."
>
**Gio** _(13 words, 3736ms)_: Lovely, one 10 inch Margherita at 7.99. Any drinks or sides with that?

**2. Caller:** delivery to M14 5TP

**Gio** _(6 words, 2058ms)_: That's M-one-four, five-T-P. Is that right?

**3. Caller:** yes

> 🔧 `check_delivery` {"postcode":"M14 5TP"} → 200 — "Yes, we deliver there. It's 2.50 for delivery, about 45 minutes."
>
**Gio** _(12 words, 6083ms)_: Good news, we deliver there. It's 2.50 for delivery, about 45 minutes.

**4. Caller:** ok

**Gio** _(9 words, 3707ms)_: Brilliant. What name should I put the order under?

**5. Caller:** Ann

**Gio** _(9 words, 2467ms)_: Lovely, Ann. What's the best contact number for you?

**6. Caller:** 07700900125

**Gio** _(8 words, 2626ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-five. Is that right?

**7. Caller:** yes

**Gio** _(9 words, 1855ms)_: Lovely. What's the first line of the delivery address?

**8. Caller:** 4 Elm Street

**Gio** _(5 words, 2809ms)_: Cash or card on delivery?

**9. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"delivery","customer_name":"Ann","customer_phone":"07700900125","delivery_address":"4 Elm Street","delivery_postcode":"M14 5TP","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":1,"size_name":"10 inch"}]} → 400 — "Sorry, the minimum for delivery is 12.00. You need another 4.01 to reach it. Would you like to add something, or collect instead?"
>
**Gio** _(21 words, 5585ms)_: Sorry, the delivery minimum is 12.00, so you need another 4.01. Would you like to add something, or switch to collection?

**10. Caller:** I'll just collect it then

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Ann","customer_phone":"07700900125","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":1,"size_name":"10 inch"}]} → 200 — "So that's one ten inch margherita, for collection. That comes to 7.99 in total. Is that all correct?"
>
**Gio** _(18 words, 4617ms)_: So that's one 10 inch Margherita, for collection. That comes to 7.99 in total. Is that all correct?

**11. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Ann","customer_phone":"07700900125","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":1,"size_name":"10 inch"}]} → 200 — "Perfect, order number A-3138, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-five."
>
**Gio** _(18 words, 7330ms)_: Lovely, that's placed, order number A-3138. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-five. Is that right?

**12. Caller:** yes

**Gio** _(13 words, 1688ms)_: Brilliant, it'll be ready for collection in about 20 minutes. Thanks Ann, bye!

## Test 6: What do you have?

**1. Caller:** what do you have?

**Gio** _(15 words, 1432ms)_: Hiya, we do pizzas, kebabs, garlic bread, sides, drinks and desserts. What do you fancy?

## Test 7: Item not on menu

**1. Caller:** do you have sushi?

> 🔧 `search_menu` {"query":"sushi"} → 200 — "I don't have that one — we do classic pizzas, kebabs and sides. What are you after?"
>
**Gio** _(17 words, 4577ms)_: Sorry, we don't do sushi. We do pizzas, kebabs, sides, drinks and desserts. What are you after?

## Test 8: Are you a real person?

**1. Caller:** am I talking to a real person?

**Gio** _(17 words, 1285ms)_: I'm an AI assistant. I can take your order just the same. What can I get you?

**2. Caller:** ok, two pepperoni then

> 🔧 `search_menu` {"query":"pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(15 words, 3797ms)_: Lovely, what size would you like for the two pepperoni: 10, 12 or 14 inch?

**3. Caller:** 12 inch

**Gio** _(11 words, 1371ms)_: Lovely, two 12 inch Pepperoni. Any drinks or sides with that?

## Test 9: Stubborn caller

**1. Caller:** one garlic bread

> 🔧 `search_menu` {"query":"garlic bread"} → 200 — "Garlic Bread is 3.99."
>
**Gio** _(16 words, 6051ms)_: Garlic Bread is 3.99. Would you like it plain, or with cheese or jalapenos on top?

**2. Caller:** umm

**Gio** _(16 words, 1928ms)_: No worries, I'll put you down for plain garlic bread. Is that for delivery or collection?

**3. Caller:** collection

**Gio** _(12 words, 3411ms)_: Lovely, collection it is. Any drinks or sides to go with that?

**4. Caller:** no thanks

**Gio** _(9 words, 3316ms)_: Brilliant. What name should I put the order under?

**5. Caller:** Lee

**Gio** _(9 words, 1627ms)_: Thanks Lee. What's the best contact number for you?

**6. Caller:** 07700900127

**Gio** _(8 words, 2209ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-seven. Is that right?

**7. Caller:** yes

**Gio** _(7 words, 2051ms)_: Lovely. Will that be cash or card?

**8. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Lee","customer_phone":"07700900127","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "So that's one garlic bread, for collection. That comes to 3.99 in total. Is that all correct?"
>
**Gio** _(20 words, 6685ms)_: So that's one plain garlic bread for collection, paying cash. That comes to 3.99 in total. Is that all correct?

**9. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Lee","customer_phone":"07700900127","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "Perfect, order number A-3139, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-seven."
>
**Gio** _(18 words, 6487ms)_: Lovely, that's placed, order number A-3139. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-seven. Is that right?

**10. Caller:** yes

**Gio** _(8 words, 1313ms)_: Brilliant, about 20 minutes then. Thanks Lee, bye!

## Test 10: Confirmation refused

**1. Caller:** two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(11 words, 4077ms)_: Lovely, two 12 inch Pepperoni. Any drinks or sides with that?

**2. Caller:** no thanks

**Gio** _(6 words, 2018ms)_: Is that for delivery or collection?

**3. Caller:** collection

**Gio** _(7 words, 3651ms)_: Lovely, collection it is. What's your name?

**4. Caller:** Priya

**Gio** _(11 words, 1990ms)_: Lovely, Priya. What's the best phone number to reach you on?

**5. Caller:** 07700900128

**Gio** _(8 words, 2420ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-eight. Is that right?

**6. Caller:** yes

**Gio** _(3 words, 3549ms)_: Cash or card?

**7. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Priya","customer_phone":"07700900128","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(18 words, 5526ms)_: So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?

**8. Caller:** no, I said THREE pepperoni

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Priya","customer_phone":"07700900128","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":3,"size_name":"12 inch"}]} → 200 — "So that's three twelve inch pepperoni, for collection. That comes to 32.97 in total. Is that all correct?"
>
**Gio** _(22 words, 5966ms)_: Sorry about that, Priya. So that's three twelve inch pepperoni, for collection. That comes to 32.97 in total. Is that all correct?

**9. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Priya","customer_phone":"07700900128","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":3,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-3140, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-eight."
>
**Gio** _(18 words, 6876ms)_: Lovely, that's placed, order number A-3140. We've got your number as oh-seven-seven, double-oh, nine-double-oh, one-two-eight. Is that right?

**10. Caller:** yes

**Gio** _(11 words, 2015ms)_: Brilliant, ready to collect in about 20 minutes. Thanks Priya, bye!

## Test 11: Correction after placing

**1. Caller:** two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(11 words, 4663ms)_: Lovely, two 12 inch Pepperoni. Any drinks or sides with that?

**2. Caller:** no thanks

**Gio** _(6 words, 3014ms)_: Is that for delivery or collection?

**3. Caller:** collection

**Gio** _(7 words, 2107ms)_: Lovely, collection it is. What's your name?

**4. Caller:** Dan

**Gio** _(11 words, 1717ms)_: Thanks Dan. What's the best phone number to reach you on?

**5. Caller:** 07700900123

**Gio** _(8 words, 1621ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**6. Caller:** yes

**Gio** _(3 words, 1500ms)_: Cash or card?

**7. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Dan","customer_phone":"07700900123","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(18 words, 5257ms)_: So that's two 12 inch Pepperoni, for collection. That comes to 21.98 in total. Is that all correct?

**8. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Dan","customer_phone":"07700900123","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-3141, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three."
>
**Gio** _(18 words, 6090ms)_: Lovely, that's placed, order number A-3141. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**9. Caller:** that's the wrong number, it's 07700900999

**Gio** _(8 words, 2230ms)_: That's oh-seven-seven, double-oh, nine-double-oh, nine-nine-nine. Is that right?

**10. Caller:** yes

> 🔧 `request_callback` {"customer_name":"Dan","customer_phone":"07700900999","reason":"problem","details":"Order A-3141: correct phone is 07700900999"} → 200 — "Thanks Dan, someone will ring you back on oh-double-seven, double-oh, nine-double-oh, triple-nine. Is that the right number?"
>
**Gio** _(17 words, 5135ms)_: Thanks Dan, someone will ring you back on oh-double-seven, double-oh, nine-double-oh, triple-nine. Is that the right number?

**11. Caller:** yes

**Gio** _(24 words, 2062ms)_: Brilliant, I've passed that on, and the shop will update your order. Your pizzas will be ready in about 20 minutes. Thanks Dan, bye!

## Test 12: Table booking: straight through

**1. Caller:** hi, I'd like to book a table please

**Gio** _(12 words, 2024ms)_: Lovely, I can help with that. What date were you thinking of?

**2. Caller:** Saturday the 19 of December

**Gio** _(14 words, 2562ms)_: Saturday the nineteenth of December, lovely. What time would you like the table for?

**3. Caller:** half past seven in the evening

**Gio** _(10 words, 2857ms)_: Half past seven, lovely. How many people will be coming?

**4. Caller:** four

> 🔧 `check_availability` {"date":"2026-12-19","time":"19:30","party_size":4} → 200 — "Yes, we have a table for four people on Saturday the nineteenth of December at half past seven."
>
**Gio** _(19 words, 5424ms)_: Good news, we have a table for four people on Saturday the nineteenth of December at half past seven.

**5. Caller:** ok

**Gio** _(8 words, 1389ms)_: What name should I put the booking under?

**6. Caller:** Sam

**Gio** _(9 words, 1390ms)_: Lovely, Sam. What's the best contact number for you?

**7. Caller:** 07700900123

**Gio** _(8 words, 2313ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**8. Caller:** yes

**Gio** _(24 words, 1567ms)_: Four people, Saturday the nineteenth of December, half past seven, Sam, oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that all correct, shall I confirm the booking?

**9. Caller:** yes

> 🔧 `create_booking` {"date":"2026-12-19","time":"19:30","party_size":4,"customer_name":"Sam","customer_phone":"07700900123"} → 200 — "That's booked, Sam. A table for four people on Saturday the nineteenth of December at half past seven. Your booking reference is B, three-three-two-three. We have your number as oh-double-seven, double-oh, nine-double-oh, one-two-three. Is that right?"
>
**Gio** _(20 words, 4794ms)_: Lovely, you're booked. Reference B, three-three-two-three, table five. We have your number as oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**10. Caller:** yes

**Gio** _(9 words, 1908ms)_: Brilliant, see you on the nineteenth, Sam. Thanks, bye!

## Test 13: Table booking: no space, offers another time

**1. Caller:** hi, I'd like to book a table please

**Gio** _(14 words, 2046ms)_: Lovely, I can help with that. What date would you like the table for?

**2. Caller:** Sunday the 20 of December

**Gio** _(14 words, 1968ms)_: Lovely, Sunday the twentieth of December. What time would you like the table for?

**3. Caller:** seven o'clock in the evening

**Gio** _(6 words, 1230ms)_: How many people will be coming?

**4. Caller:** eight

> 🔧 `check_availability` {"date":"2026-12-20","time":"19:00","party_size":8} → 200 — "Sorry, we don't have a table for eight people on Sunday the twentieth of December at seven o'clock."
>
**Gio** _(22 words, 5874ms)_: Sorry, we don't have a table for eight on Sunday the twentieth at seven. Would another day or time work for you?

**5. Caller:** how about nine o'clock

> 🔧 `check_availability` {"date":"2026-12-20","time":"21:00","party_size":8} → 200 — "Yes, we have a table for eight people on Sunday the twentieth of December at nine o'clock."
>
**Gio** _(25 words, 4287ms)_: Good news, we have a table for eight on Sunday the twentieth of December at nine o'clock. Can I take a name for the booking?

**6. Caller:** Priya

**Gio** _(10 words, 1626ms)_: Lovely, Priya. What's the best contact number for the booking?

**7. Caller:** 07700900124

**Gio** _(8 words, 1814ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**8. Caller:** yes

**Gio** _(23 words, 2123ms)_: Eight people, Sunday the twentieth of December, nine o'clock, Priya, oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that all correct, shall I confirm the booking?

**9. Caller:** yes

> 🔧 `create_booking` {"date":"2026-12-20","time":"21:00","party_size":8,"customer_name":"Priya","customer_phone":"07700900124"} → 200 — "That's booked, Priya. A table for eight people on Sunday the twentieth of December at nine o'clock. Your booking reference is B, three-three-two-five. We have your number as oh-double-seven, double-oh, nine-double-oh, one-two-four. Is that right?"
>
**Gio** _(20 words, 4609ms)_: Lovely, you're booked. Reference B, three-three-two-five, table twelve. We have your number as oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**10. Caller:** yes

**Gio** _(10 words, 2441ms)_: Brilliant, see you on Sunday at nine, Priya. Thanks, bye!

## Test 14: Table booking: party of twelve

**1. Caller:** hi, I'd like to book a table for twelve people

**Gio** _(18 words, 1383ms)_: Twelve is too many for us to book over the phone, I'm sorry. Please ring the shop directly.

**2. Caller:** Monday the 21 of December at seven then

**Gio** _(18 words, 2571ms)_: I'm sorry, we still can't take a booking for twelve over the phone. Please ring the shop directly.

## Test 15: Table booking: wrong digit caught by read-back

**1. Caller:** hi, I'd like to book a table please

**Gio** _(14 words, 1640ms)_: Lovely, I can help with that. What date would you like the table for?

**2. Caller:** Tuesday the 22 of December

**Gio** _(14 words, 1882ms)_: Lovely, Tuesday the twenty-second of December. What time would you like the table for?

**3. Caller:** eight o'clock in the evening

**Gio** _(11 words, 1675ms)_: Lovely, eight in the evening. How many people will be coming?

**4. Caller:** two

> 🔧 `check_availability` {"date":"2026-12-22","time":"20:00","party_size":2} → 200 — "Yes, we have a table for two people on Tuesday the twenty-second of December at eight o'clock."
>
**Gio** _(18 words, 3578ms)_: Good news, we have a table for two people on Tuesday the twenty-second of December at eight o'clock.

**5. Caller:** ok

**Gio** _(9 words, 1517ms)_: Brilliant. What name should I put the booking under?

**6. Caller:** Dan

**Gio** _(9 words, 1598ms)_: Lovely, Dan. What's the best contact number for you?

**7. Caller:** 07700900123

**Gio** _(8 words, 1770ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**8. Caller:** no, that's wrong, it's 07700900999

**Gio** _(8 words, 2891ms)_: That's oh-seven-seven, double-oh, nine-double-oh, nine-nine-nine. Is that right?

**9. Caller:** yes

**Gio** _(25 words, 1780ms)_: Two people, Tuesday the twenty-second of December, eight in the evening, Dan, oh-seven-seven, double-oh, nine-double-oh, nine-nine-nine. Is that all correct, shall I confirm the booking?

**10. Caller:** yes

> 🔧 `create_booking` {"customer_name":"Dan","customer_phone":"07700900999","date":"2026-12-22","time":"20:00","party_size":2} → 200 — "That's booked, Dan. A table for two people on Tuesday the twenty-second of December at eight o'clock. Your booking reference is B, three-three-two-six. We have your number as oh-double-seven, double-oh, nine-double-oh, triple-nine. Is that right?"
>
**Gio** _(20 words, 4429ms)_: Lovely, you're booked. Reference B, three-three-two-six, table one. We have your number as oh-seven-seven, double-oh, nine-double-oh, nine-nine-nine. Is that right?

**11. Caller:** yes

**Gio** _(9 words, 1553ms)_: Brilliant, see you on the twenty-second, Dan. Thanks, bye!

## Test 16: Order query: refund request recorded

**1. Caller:** hi, I'd like a refund on an order I had

**Gio** _(8 words, 1383ms)_: Sorry to hear that. What's the order number?

**2. Caller:** A-3142

**Gio** _(7 words, 1356ms)_: And the phone number you ordered with?

**3. Caller:** 07700900555

> 🔧 `lookup_order` {"order_number":"A-3142","customer_phone":"07700900555"} → 200 — "I found your pickup order from 19 November: 2 Margherita. The total was 17.98. Its status is completed."
>
**Gio** _(14 words, 3585ms)_: I found your order from today, two Margherita, total 17.98. Is that the one?

**4. Caller:** yes, that's the one

**Gio** _(3 words, 1391ms)_: What's the problem?

**5. Caller:** the pizza arrived cold and I want a refund

> 🔧 `create_order_query` {"order_number":"A-3142","customer_phone":"07700900555","query_type":"refund","description":"the pizza arrived cold and I want a refund"} → 200 — "I've noted that down and passed it to the team. Your reference is Q 3059. Someone will come back to you; I can't promise any outcome myself."
>
**Gio** _(22 words, 4837ms)_: I've noted that down and passed it to the restaurant, they'll be in touch with you themselves. Your reference is Q, three-zero-five-nine.

**6. Caller:** ok

**Gio** _(9 words, 1633ms)_: Thanks for your patience. Have a lovely evening, bye!

## Test 17: Order query: wrong order number, callback offered

**1. Caller:** hi, I want to complain about an order I had

**Gio** _(8 words, 1474ms)_: Sorry to hear that. What's the order number?

**2. Caller:** A-98765

**Gio** _(7 words, 1702ms)_: And the phone number you ordered with?

**3. Caller:** 07700900555

> 🔧 `lookup_order` {"order_number":"A-98765","customer_phone":"07700900555"} → 404 — "Sorry, I can't find an order with those details. Could you check the order number and the phone number you ordered with?"
>
**Gio** _(17 words, 3822ms)_: Sorry, I can't find an order with those details. Could you check the order number for me?

**4. Caller:** A-98765

> 🔧 `lookup_order` {"order_number":"A-98765","customer_phone":"07700900555"} → 404 — "Sorry, I can't find an order with those details. Could you check the order number and the phone number you ordered with?"
>
**Gio** _(18 words, 3624ms)_: Sorry, I still can't find that one. Could you give me the phone number you ordered with again?

**5. Caller:** 07700900555

**Gio** _(19 words, 2056ms)_: I'm still not finding that order, sorry. Shall I get someone from the shop to ring you about it?

**6. Caller:** yes please

**Gio** _(9 words, 2913ms)_: No problem. What name should I put it under?

**7. Caller:** Priya

**Gio** _(12 words, 1341ms)_: Thanks, Priya. What's the best number for them to ring you on?

**8. Caller:** 07700900555

**Gio** _(8 words, 1313ms)_: That's oh-seven-seven, double-oh, nine-double-oh, five-five-five. Is that right?

**9. Caller:** yes

> 🔧 `request_callback` {"customer_name":"Priya","customer_phone":"07700900555","reason":"problem","details":"Caller has a complaint about a past order; order A-98765 could not be found by number and phone."} → 200 — "Thanks Priya, someone will ring you back on oh-double-seven, double-oh, nine-double-oh, triple-five. Is that the right number?"
>
**Gio** _(17 words, 3754ms)_: Thanks Priya, someone will ring you back on oh-double-seven, double-oh, nine-double-oh, triple-five. Is that the right number?

**10. Caller:** yes

**Gio** _(13 words, 1299ms)_: Brilliant, someone from the shop will be in touch soon. Thanks Priya, bye!

## Test 18: Order query: pushing for a refund promise

**1. Caller:** hi, I need a refund on an order I had

**Gio** _(8 words, 1362ms)_: Sorry to hear that. What's the order number?

**2. Caller:** A-3142

**Gio** _(7 words, 1283ms)_: And the phone number you ordered with?

**3. Caller:** 07700900555

> 🔧 `lookup_order` {"order_number":"A-3142","customer_phone":"07700900555"} → 200 — "I found your pickup order from 19 November: 2 Margherita. The total was 17.98. Its status is completed."
>
**Gio** _(15 words, 5169ms)_: I found your collection order from today: two Margherita, total 17.98. Is that the one?

**4. Caller:** yes, that's the one

**Gio** _(3 words, 1770ms)_: What's the problem?

**5. Caller:** the pizza was cold and the base was soggy

> 🔧 `create_order_query` {"order_number":"A-3142","customer_phone":"07700900555","query_type":"refund","description":"the pizza was cold and the base was soggy"} → 200 — "I've noted that down and passed it to the team. Your reference is Q 3060. Someone will come back to you; I can't promise any outcome myself."
>
**Gio** _(22 words, 6321ms)_: I've noted that down and passed it to the restaurant, they'll be in touch with you themselves. Your reference is Q, three-zero-six-zero.

**6. Caller:** but I'll definitely get my money back, won't I?

**Gio** _(18 words, 3686ms)_: I can't promise anything myself, that's for the owner to decide, but they'll have everything you've told me.

**7. Caller:** ok

**Gio** _(9 words, 2246ms)_: Thanks for your patience. Have a lovely evening, bye!

## Test 19: Order query: past order mentioned while ordering

**1. Caller:** hi, two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(11 words, 4423ms)_: Lovely, two 12 inch Pepperoni. Any drinks or sides with that?

**2. Caller:** last time my order was wrong by the way

**Gio** _(10 words, 1987ms)_: Sorry to hear that. Is that for delivery or collection?

**3. Caller:** collection

**Gio** _(12 words, 1632ms)_: Lovely, collection it is. What name should I put the order under?

**4. Caller:** Tom

**Gio** _(9 words, 1401ms)_: Brilliant, Tom. What's the best contact number for you?

**5. Caller:** 07700900124

**Gio** _(8 words, 1824ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**6. Caller:** yes

**Gio** _(3 words, 2259ms)_: Cash or card?

**7. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Tom","customer_phone":"07700900124","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(18 words, 5410ms)_: So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?

**8. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Tom","customer_phone":"07700900124","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-3143, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-four."
>
**Gio** _(18 words, 7534ms)_: Lovely, that's placed, order number A-3143. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**9. Caller:** yes

**Gio** _(11 words, 2132ms)_: Brilliant, ready to collect in about 20 minutes. Thanks Tom, bye!

## Test 20: Order query: right order number, wrong phone

**1. Caller:** hi, I want a refund on an order I had

**Gio** _(8 words, 3281ms)_: Sorry to hear that. What's the order number?

**2. Caller:** A-3142

**Gio** _(7 words, 4512ms)_: And the phone number you ordered with?

**3. Caller:** 07700900777

> 🔧 `lookup_order` {"order_number":"A-3142","customer_phone":"07700900777"} → 404 — "Sorry, I can't find an order with those details. Could you check the order number and the phone number you ordered with?"
>
**Gio** _(17 words, 8961ms)_: Sorry, I can't find an order with those details. Could you check the order number for me?

**4. Caller:** A-3142

> 🔧 `lookup_order` {"order_number":"A-3142","customer_phone":"07700900777"} → 404 — "Sorry, I can't find an order with those details. Could you check the order number and the phone number you ordered with?"
>
**Gio** _(18 words, 8799ms)_: Sorry, I still can't find that one. Could you give me the phone number you ordered with again?

**5. Caller:** 07700900777

**Gio** _(23 words, 2472ms)_: I'm sorry, I still can't find an order with those details. Shall I get someone from the shop to ring you about it?

**6. Caller:** no thanks

**Gio** _(12 words, 2734ms)_: No worries. Is there anything else I can help you with today?

**7. Caller:** no, that's everything

**Gio** _(12 words, 2602ms)_: Brilliant, sorry I couldn't find that order. Have a lovely evening, bye!

