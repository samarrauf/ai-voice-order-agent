# Phase 2 conversation tests

Run: 2026-11-14T16:14:58.212Z · model claude-haiku-5-5 · total cost $0.0725

Cleaned up afterwards: 9 order(s) [A-1221, A-1222, A-1223, A-1224, A-1225, A-1226, A-1227, A-1229, A-1228], 2 callback(s).

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
- Test 11 · 11 callback with corrected number · 07700900999 (problem): Order A-1227: correct phone is 07700900999: PASS
- Test 12 · A booking made once · 1 create_booking call(s), 1 succeeded: PASS
- Test 12 · A checked availability first · check at turn 4, booking at turn 9: PASS
- Test 12 · A booking details right · {"date":"2026-12-14","time":"19:30","party_size":4,"customer_name":"Sam","customer_phone":"07700900123"}: PASS
- Test 12 · A waited for yes to the read-back · asked: "Four people, Monday the fourteenth of December, half past seven, Sam, oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that all correct, shall I confirm the booking?" / caller: "yes": PASS
- Test 12 · A reference and table given · "Lovely, you're booked. Reference B, two-one-zero-one, table five. We have your number as oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?": PASS
- Test 13 · B first check found no table · first check: false: PASS
- Test 13 · B asked about another day or time · replies after the failed check: "Sorry, we don't have a table for eight on Tuesday the fifteenth of December at seven. Would another day or time work?" / "Good news, we have a table for eight on Tuesday the fifteenth of December at nine o'clock." / "Lovely. What name should I put the booking under?": PASS
- Test 13 · B did not book the full slot · 1 create_booking call(s): PASS
- Test 13 · B at most two failed checks · 2 check(s): PASS
- Test 13 · B booked the other time · {"date":"2026-12-15","time":"21:00","party_size":8,"customer_name":"Priya","customer_phone":"07700900124"}: PASS
- Test 14 · C no booking tools called · 0 tool call(s): none: PASS
- Test 14 · C advised ringing the shop · "Sorry, we can't take a booking that big over the phone. Please ring the shop directly. Sorry, that's still too many for me to book over the phone. Please ring the shop directly and they'll sort it out.": PASS
- Test 14 · C no workaround · no table-joining offered: PASS
- Test 15 · D corrected number stored · stored 07700900999: PASS
- Test 15 · D wrong number never booked · 1 create_booking call(s): PASS
- Test 15 · D final read-back had the corrected number · read back 07700900999: PASS
- Test 15 · D server echo matches · stored_phone 07700900999: PASS
- Test 16 · Q1 order found · 1 lookup_order call(s): PASS
- Test 16 · Q1 one query recorded · 1 create_order_query call(s), 1 succeeded: PASS
- Test 16 · Q1 lookup came before the query · lookup turn 3, query turn 5: PASS
- Test 16 · Q1 classified as refund · type refund: PASS
- Test 16 · Q1 reference read aloud · "I've noted that down and passed it to the restaurant, they'll be in touch with you themselves. Your reference is Q, three-zero-one-eight.": PASS
- Test 16 · Q1 no promise made · none: PASS
- Test 16 · Q1 no new order placed · create_order not called: PASS
- Test 17 · Q2 lookup tried and never found · 2 lookup(s), statuses 404,404: PASS
- Test 17 · Q2 no more than 3 lookups · 2 lookup(s): PASS
- Test 17 · Q2 no query recorded · create_order_query not called: PASS
- Test 17 · Q2 callback saved · {"customer_name":"Priya","customer_phone":"07700900555","reason":"problem","details":"Caller wants to complain about a past order; order A-98765 could not be found by number and phone."}: PASS
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

**Gio** _(10 words, 1815ms)_: Hiya, Napoli Pizza and Grill, what can I get you?

**2. Caller:** two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(11 words, 3237ms)_: Lovely, two 12 inch Pepperoni. Is that for delivery or collection?

**3. Caller:** delivery

**Gio** _(4 words, 1033ms)_: Lovely, what's the postcode?

**4. Caller:** M14 5TP

**Gio** _(6 words, 1108ms)_: That's M-one-four, five-T-P. Is that right?

**5. Caller:** yes

> 🔧 `check_delivery` {"postcode":"M14 5TP"} → 200 — "Yes, we deliver there. It's 2.50 for delivery, about 45 minutes."
>
**Gio** _(12 words, 2820ms)_: Good news, we deliver there. It's 2.50 for delivery, about 45 minutes.

**6. Caller:** ok

**Gio** _(6 words, 1179ms)_: Any drinks or sides with that?

**7. Caller:** no thanks

**Gio** _(4 words, 1002ms)_: Brilliant. What's your name?

**8. Caller:** Sarah

**Gio** _(10 words, 1076ms)_: Lovely, Sarah. What's the best number to reach you on?

**9. Caller:** 07700900123

**Gio** _(8 words, 1076ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**10. Caller:** yes

**Gio** _(9 words, 1027ms)_: Lovely. What's the first line of the delivery address?

**11. Caller:** 12 Oak Road

**Gio** _(3 words, 1060ms)_: Cash or card?

**12. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"delivery","customer_name":"Sarah","customer_phone":"07700900123","delivery_address":"12 Oak Road","delivery_postcode":"M14 5TP","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for delivery to M14 5TP. That comes to 24.48 in total, including 2.50 delivery. Is that all correct?"
>
**Gio** _(24 words, 4294ms)_: So that's two 12 inch Pepperoni, for delivery to M14 5TP. That comes to 24.48 in total, including 2.50 delivery. Is that all correct?

**13. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"delivery","customer_name":"Sarah","customer_phone":"07700900123","delivery_address":"12 Oak Road","delivery_postcode":"M14 5TP","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1221, delivering to M-one-four, five-T-P in about 45 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three."
>
**Gio** _(18 words, 3874ms)_: Lovely, that's placed, order number A-1221. We've got your number as oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**14. Caller:** yes

**Gio** _(9 words, 1024ms)_: And it's going to M-one-four, five-T-P. Is that right?

**15. Caller:** yes

**Gio** _(8 words, 1080ms)_: Brilliant, about 45 minutes then. Thanks Sarah, bye!

## Test 2: Changes of mind, collection

**1. Caller:** one margherita please

> 🔧 `search_menu` {"query":"margherita"} → 200 — "Margherita — ten inch is 7.99, twelve inch 9.99, fourteen inch 11.99."
>
**Gio** _(19 words, 2976ms)_: Lovely, which size would you like: 10 inch at 7.99, 12 inch at 9.99, or 14 inch at 11.99?

**2. Caller:** 10 inch

**Gio** _(11 words, 1157ms)_: Lovely, one 10 inch Margherita. Any drinks or sides with that?

**3. Caller:** actually make that two

**Gio** _(12 words, 1122ms)_: Two 10 inch Margheritas, no worries. Is that for delivery or collection?

**4. Caller:** and add a garlic bread

> 🔧 `search_menu` {"query":"garlic bread"} → 200 — "Garlic Bread is 3.99."
>
**Gio** _(19 words, 4258ms)_: Garlic bread is 3.99. Do you want plain, with cheese at 4.99, or with cheese and jalapenos at 5.49?

**5. Caller:** plain please

**Gio** _(12 words, 1974ms)_: Lovely, one plain garlic bread added. Is that for delivery or collection?

**6. Caller:** collection

**Gio** _(12 words, 3186ms)_: Brilliant, collection it is. What name should I put the order under?

**7. Caller:** Tom

**Gio** _(11 words, 7063ms)_: Lovely, Tom. What's the best phone number to reach you on?

**8. Caller:** 07700900124

**Gio** _(8 words, 1916ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**9. Caller:** yes

**Gio** _(4 words, 1453ms)_: Brilliant. Cash or card?

**10. Caller:** card

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Tom","customer_phone":"07700900124","payment_method":"card_on_delivery","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":2,"size_name":"10 inch"},{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "So that's two ten inch margherita and one garlic bread, for collection. That comes to 19.97 in total. Is that all correct?"
>
**Gio** _(26 words, 4087ms)_: So that's two 10 inch Margheritas and one plain garlic bread, for collection. That comes to 19.97 in total, paying by card. Is that all correct?

**11. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Tom","customer_phone":"07700900124","payment_method":"card_on_delivery","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":2,"size_name":"10 inch"},{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "Perfect, order number A-1222, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-four."
>
**Gio** _(18 words, 3809ms)_: Lovely, that's placed, order number A-1222. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**12. Caller:** yes

**Gio** _(12 words, 1853ms)_: Brilliant, that's ready to collect in about 20 minutes. Thanks Tom, bye!

## Test 3: Allergen question mid-order

**1. Caller:** two pepperoni please

> 🔧 `search_menu` {"query":"pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(13 words, 2890ms)_: Lovely, two pepperoni. What size would you like, 10, 12 or 14 inch?

**2. Caller:** 12 inch

**Gio** _(11 words, 1303ms)_: Lovely, two 12 inch Pepperoni. Any drinks or sides with that?

**3. Caller:** does it have nuts?

**Gio** _(20 words, 1140ms)_: I can't confirm allergens over the phone. Would you like someone from the shop to call you back about it?

**4. Caller:** ok carry on

**Gio** _(8 words, 1243ms)_: No problem. Is that for delivery or collection?

**5. Caller:** collection

**Gio** _(7 words, 1887ms)_: Lovely, collection it is. What's your name?

**6. Caller:** Raj

**Gio** _(10 words, 1344ms)_: Nice one, Raj. What's the best contact number for you?

**7. Caller:** 07700900126

**Gio** _(8 words, 1445ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-six. Is that right?

**8. Caller:** yes

**Gio** _(3 words, 1163ms)_: Cash or card?

**9. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Raj","customer_phone":"07700900126","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(25 words, 3858ms)_: So that's two 12 inch Pepperoni, for collection, paying cash. That comes to 21.98 in total, ready in about 20 minutes. Is that all correct?

**10. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Raj","customer_phone":"07700900126","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1223, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-six."
>
**Gio** _(18 words, 3854ms)_: Lovely, that's placed, order number A-1223. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-six. Is that right?

**11. Caller:** yes

**Gio** _(12 words, 1542ms)_: Brilliant, that's ready to collect in about 20 minutes, Raj. Thanks, bye!

## Test 4: Postcode outside area

**1. Caller:** hi

**Gio** _(10 words, 987ms)_: Hiya, Napoli Pizza and Grill, what can I get you?

**2. Caller:** delivery to SW1A 1AA

**Gio** _(6 words, 1273ms)_: That's S-W-one-A, one-A-A. Is that right?

**3. Caller:** yes

> 🔧 `check_delivery` {"postcode":"SW1A 1AA"} → 200 — "Sorry, we don't deliver to that postcode, but you're welcome to collect. Would you like to do collection?"
>
**Gio** _(18 words, 2207ms)_: Sorry, we don't deliver to that postcode, but you're welcome to collect. Would you like to do collection?

**4. Caller:** no thanks then, bye

**Gio** _(6 words, 1142ms)_: No worries, thanks for calling. Bye!

## Test 5: Below delivery minimum

**1. Caller:** one 10 inch margherita

> 🔧 `search_menu` {"query":"10 inch margherita"} → 200 — "Margherita — ten inch is 7.99, twelve inch 9.99, fourteen inch 11.99."
>
**Gio** _(13 words, 3213ms)_: Lovely, one 10 inch Margherita at 7.99. Any drinks or sides with that?

**2. Caller:** delivery to M14 5TP

**Gio** _(6 words, 1263ms)_: That's M-one-four, five-T-P. Is that right?

**3. Caller:** yes

> 🔧 `check_delivery` {"postcode":"M14 5TP"} → 200 — "Yes, we deliver there. It's 2.50 for delivery, about 45 minutes."
>
**Gio** _(12 words, 4005ms)_: Good news, we deliver there. It's 2.50 for delivery, about 45 minutes.

**4. Caller:** ok

**Gio** _(9 words, 1390ms)_: Lovely. What name should I put the order under?

**5. Caller:** Ann

**Gio** _(11 words, 2287ms)_: Lovely, Ann. What's the best phone number to reach you on?

**6. Caller:** 07700900125

**Gio** _(8 words, 1436ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-five. Is that right?

**7. Caller:** yes

**Gio** _(9 words, 1345ms)_: Brilliant. What's the first line of the delivery address?

**8. Caller:** 4 Elm Street

**Gio** _(9 words, 1435ms)_: Lovely. Will that be cash or card on delivery?

**9. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"delivery","customer_name":"Ann","customer_phone":"07700900125","delivery_address":"4 Elm Street","delivery_postcode":"M14 5TP","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":1,"size_name":"10 inch"}]} → 400 — "Sorry, the minimum for delivery is 12.00. You need another 4.01 to reach it. Would you like to add something, or collect instead?"
>
**Gio** _(21 words, 5061ms)_: Sorry, the delivery minimum is 12.00, so you need another 4.01. Would you like to add something, or switch to collection?

**10. Caller:** I'll just collect it then

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Ann","customer_phone":"07700900125","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":1,"size_name":"10 inch"}]} → 200 — "So that's one ten inch margherita, for collection. That comes to 7.99 in total. Is that all correct?"
>
**Gio** _(18 words, 3579ms)_: So that's one 10 inch Margherita, for collection. That comes to 7.99 in total. Is that all correct?

**11. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Ann","customer_phone":"07700900125","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000001","quantity":1,"size_name":"10 inch"}]} → 200 — "Perfect, order number A-1224, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-five."
>
**Gio** _(18 words, 4026ms)_: Lovely, that's placed, order number A-1224. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-five. Is that right?

**12. Caller:** yes

**Gio** _(13 words, 1263ms)_: Brilliant, it'll be ready to collect in about 20 minutes. Thanks Ann, bye!

## Test 6: What do you have?

**1. Caller:** what do you have?

**Gio** _(15 words, 956ms)_: Hiya, we do pizzas, kebabs, garlic bread, sides, drinks and desserts. What do you fancy?

## Test 7: Item not on menu

**1. Caller:** do you have sushi?

> 🔧 `search_menu` {"query":"sushi"} → 200 — "I don't have that one — we do classic pizzas, kebabs and sides. What are you after?"
>
**Gio** _(19 words, 3777ms)_: No sushi, I'm afraid. We do pizzas, kebabs, garlic bread, sides, drinks and desserts. What can I get you?

## Test 8: Are you a real person?

**1. Caller:** am I talking to a real person?

**Gio** _(18 words, 1354ms)_: I'm an AI assistant, but I can take your order just the same. What can I get you?

**2. Caller:** ok, two pepperoni then

> 🔧 `search_menu` {"query":"pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(14 words, 2830ms)_: Lovely, two pepperoni pizzas. What size would you like, 10, 12 or 14 inch?

**3. Caller:** 12 inch

**Gio** _(11 words, 1301ms)_: Two 12 inch Pepperoni, lovely. Any drinks or sides with that?

## Test 9: Stubborn caller

**1. Caller:** one garlic bread

> 🔧 `search_menu` {"query":"garlic bread"} → 200 — "Garlic Bread is 3.99."
>
**Gio** _(18 words, 2469ms)_: Garlic Bread is 3.99. Would you like the plain one, or with cheese, or with cheese and jalapenos?

**2. Caller:** umm

**Gio** _(16 words, 1239ms)_: No worries, I'll put you down for plain garlic bread. Any drinks or sides with that?

**3. Caller:** no thanks

**Gio** _(7 words, 1043ms)_: Lovely. Is that for delivery or collection?

**4. Caller:** collection

**Gio** _(12 words, 1144ms)_: Brilliant, collection it is. What name should I put the order under?

**5. Caller:** Lee

**Gio** _(10 words, 1184ms)_: Thanks Lee. What's the best contact number for the order?

**6. Caller:** 07700900127

**Gio** _(8 words, 1364ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-seven. Is that right?

**7. Caller:** yes

**Gio** _(7 words, 1043ms)_: Lovely. Will that be cash or card?

**8. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Lee","customer_phone":"07700900127","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "So that's one garlic bread, for collection. That comes to 3.99 in total. Is that all correct?"
>
**Gio** _(24 words, 3668ms)_: So that's one garlic bread, for collection, paying cash. That comes to 3.99 in total, ready in about 20 minutes. Is that all correct?

**9. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Lee","customer_phone":"07700900127","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000021","quantity":1}]} → 200 — "Perfect, order number A-1225, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-seven."
>
**Gio** _(18 words, 3223ms)_: Lovely, that's placed, order number A-1225. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-seven. Is that right?

**10. Caller:** yes

**Gio** _(8 words, 1051ms)_: Brilliant, about 20 minutes then. Thanks Lee, bye!

## Test 10: Confirmation refused

**1. Caller:** two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(14 words, 3046ms)_: Lovely, two 12 inch Pepperoni at 10.99 each. Any drinks or sides with that?

**2. Caller:** no thanks

**Gio** _(6 words, 1032ms)_: Is that for delivery or collection?

**3. Caller:** collection

**Gio** _(9 words, 1881ms)_: Lovely, collection it is. Can I take your name?

**4. Caller:** Priya

**Gio** _(9 words, 1275ms)_: Lovely, Priya. What's the best contact number for you?

**5. Caller:** 07700900128

**Gio** _(8 words, 1354ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-eight. Is that right?

**6. Caller:** yes

**Gio** _(3 words, 1191ms)_: Cash or card?

**7. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Priya","customer_phone":"07700900128","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(19 words, 3815ms)_: So that's two 12 inch Pepperoni for collection, coming to 21.98 in total, paying cash. Is that all correct?

**8. Caller:** no, I said THREE pepperoni

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Priya","customer_phone":"07700900128","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":3,"size_name":"12 inch"}]} → 200 — "So that's three twelve inch pepperoni, for collection. That comes to 32.97 in total. Is that all correct?"
>
**Gio** _(20 words, 3452ms)_: Sorry about that, three 12 inch Pepperoni for collection, coming to 32.97 in total, paying cash. Is that all correct?

**9. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Priya","customer_phone":"07700900128","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":3,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1226, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-eight."
>
**Gio** _(18 words, 3721ms)_: Lovely, that's placed, order number A-1226. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-eight. Is that right?

**10. Caller:** yes

**Gio** _(10 words, 1571ms)_: Brilliant, it'll be about 20 minutes then. Thanks Priya, bye!

## Test 11: Correction after placing

**1. Caller:** two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(14 words, 3303ms)_: Lovely, two 12 inch Pepperoni at 10.99 each. Any drinks or sides with that?

**2. Caller:** no thanks

**Gio** _(6 words, 1201ms)_: Is that for delivery or collection?

**3. Caller:** collection

**Gio** _(7 words, 1358ms)_: Lovely, that's for collection. What's your name?

**4. Caller:** Dan

**Gio** _(9 words, 1551ms)_: Cheers, Dan. What's the best contact number for you?

**5. Caller:** 07700900123

**Gio** _(8 words, 1815ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**6. Caller:** yes

**Gio** _(3 words, 1360ms)_: Cash or card?

**7. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Dan","customer_phone":"07700900123","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(19 words, 4026ms)_: So that's two 12 inch Pepperoni, for collection, coming to 21.98 in total, paid cash. Is that all correct?

**8. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Dan","customer_phone":"07700900123","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1227, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three."
>
**Gio** _(18 words, 4657ms)_: Lovely, that's placed, order number A-1227. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**9. Caller:** that's the wrong number, it's 07700900999

**Gio** _(8 words, 2073ms)_: That's oh-seven-seven, double-oh, nine-double-oh, nine-nine-nine. Is that right?

**10. Caller:** yes

> 🔧 `request_callback` {"customer_name":"Dan","customer_phone":"07700900999","reason":"problem","details":"Order A-1227: correct phone is 07700900999"} → 200 — "Thanks Dan, someone will ring you back on oh-double-seven, double-oh, nine-double-oh, triple-nine. Is that the right number?"
>
**Gio** _(17 words, 3660ms)_: Thanks Dan, someone will ring you back on oh-double-seven, double-oh, nine-double-oh, triple-nine. Is that the right number?

**11. Caller:** yes

**Gio** _(17 words, 1511ms)_: Brilliant, I'll get the shop to update your order. It'll be about 20 minutes. Thanks Dan, bye!

## Test 12: Table booking: straight through

**1. Caller:** hi, I'd like to book a table please

**Gio** _(14 words, 1023ms)_: Lovely, I can help with that. What date would you like the table for?

**2. Caller:** Monday the 14 of December

**Gio** _(14 words, 1808ms)_: Monday the fourteenth of December, lovely. What time would you like the table for?

**3. Caller:** half past seven in the evening

**Gio** _(10 words, 1062ms)_: Half past seven, lovely. How many people will be coming?

**4. Caller:** four

> 🔧 `check_availability` {"date":"2026-12-14","time":"19:30","party_size":4} → 200 — "Yes, we have a table for four people on Monday the fourteenth of December at half past seven."
>
**Gio** _(18 words, 3735ms)_: Good news, we have a table for four on Monday the fourteenth of December at half past seven.

**5. Caller:** ok

**Gio** _(8 words, 1120ms)_: What name should I put the booking under?

**6. Caller:** Sam

**Gio** _(9 words, 1064ms)_: Thanks Sam. What's the best contact number for you?

**7. Caller:** 07700900123

**Gio** _(8 words, 1214ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**8. Caller:** yes

**Gio** _(24 words, 1181ms)_: Four people, Monday the fourteenth of December, half past seven, Sam, oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that all correct, shall I confirm the booking?

**9. Caller:** yes

> 🔧 `create_booking` {"date":"2026-12-14","time":"19:30","party_size":4,"customer_name":"Sam","customer_phone":"07700900123"} → 200 — "That's booked, Sam. A table for four people on Monday the fourteenth of December at half past seven. Your booking reference is B, two-one-zero-one. We have your number as oh-double-seven, double-oh, nine-double-oh, one-two-three. Is that right?"
>
**Gio** _(20 words, 4281ms)_: Lovely, you're booked. Reference B, two-one-zero-one, table five. We have your number as oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**10. Caller:** yes

**Gio** _(12 words, 1113ms)_: Brilliant, see you on Monday at half past seven, Sam. Thanks, bye!

## Test 13: Table booking: no space, offers another time

**1. Caller:** hi, I'd like to book a table please

**Gio** _(13 words, 1059ms)_: Lovely, I can sort that for you. What date were you thinking of?

**2. Caller:** Tuesday the 15 of December

**Gio** _(11 words, 1733ms)_: Tuesday the fifteenth of December, lovely. What time would you like?

**3. Caller:** seven o'clock in the evening

**Gio** _(11 words, 1069ms)_: Seven in the evening, brilliant. How many people will it be?

**4. Caller:** eight

> 🔧 `check_availability` {"date":"2026-12-15","time":"19:00","party_size":8} → 200 — "Sorry, we don't have a table for eight people on Tuesday the fifteenth of December at seven o'clock."
>
**Gio** _(22 words, 3488ms)_: Sorry, we don't have a table for eight on Tuesday the fifteenth of December at seven. Would another day or time work?

**5. Caller:** how about nine o'clock

> 🔧 `check_availability` {"date":"2026-12-15","time":"21:00","party_size":8} → 200 — "Yes, we have a table for eight people on Tuesday the fifteenth of December at nine o'clock."
>
**Gio** _(17 words, 2607ms)_: Good news, we have a table for eight on Tuesday the fifteenth of December at nine o'clock.

**6. Caller:** ok

**Gio** _(9 words, 1012ms)_: Lovely. What name should I put the booking under?

**7. Caller:** Priya

**Gio** _(9 words, 1239ms)_: Lovely, Priya. What's the best contact number for you?

**8. Caller:** 07700900124

**Gio** _(8 words, 1266ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**9. Caller:** yes

**Gio** _(23 words, 1590ms)_: Eight people, Tuesday the fifteenth of December, nine o'clock, Priya, oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that all correct, shall I confirm the booking?

**10. Caller:** yes

> 🔧 `create_booking` {"date":"2026-12-15","time":"21:00","party_size":8,"customer_name":"Priya","customer_phone":"07700900124"} → 200 — "That's booked, Priya. A table for eight people on Tuesday the fifteenth of December at nine o'clock. Your booking reference is B, two-one-zero-three. We have your number as oh-double-seven, double-oh, nine-double-oh, one-two-four. Is that right?"
>
**Gio** _(20 words, 3974ms)_: Lovely, you're booked. Reference B, two-one-zero-three, table twelve. We have your number as oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**11. Caller:** yes

**Gio** _(9 words, 1084ms)_: Brilliant, see you on the fifteenth, Priya. Thanks, bye!

## Test 14: Table booking: party of twelve

**1. Caller:** hi, I'd like to book a table for twelve people

**Gio** _(16 words, 1178ms)_: Sorry, we can't take a booking that big over the phone. Please ring the shop directly.

**2. Caller:** Wednesday the 16 of December at seven then

**Gio** _(22 words, 1415ms)_: Sorry, that's still too many for me to book over the phone. Please ring the shop directly and they'll sort it out.

## Test 15: Table booking: wrong digit caught by read-back

**1. Caller:** hi, I'd like to book a table please

**Gio** _(12 words, 1057ms)_: Lovely, I can help with that. What date were you thinking of?

**2. Caller:** Thursday the 17 of December

**Gio** _(14 words, 1943ms)_: Thursday the seventeenth of December, lovely. What time would you like the table for?

**3. Caller:** eight o'clock in the evening

**Gio** _(10 words, 1202ms)_: Eight o'clock, got it. How many people will be coming?

**4. Caller:** two

> 🔧 `check_availability` {"date":"2026-12-17","time":"20:00","party_size":2} → 200 — "Yes, we have a table for two people on Thursday the seventeenth of December at eight o'clock."
>
**Gio** _(17 words, 3516ms)_: Good news, we have a table for two on Thursday the seventeenth of December at eight o'clock.

**5. Caller:** ok

**Gio** _(9 words, 1083ms)_: Brilliant. What name should I put the booking under?

**6. Caller:** Dan

**Gio** _(9 words, 1031ms)_: Lovely, Dan. What's the best contact number for you?

**7. Caller:** 07700900123

**Gio** _(8 words, 1014ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-three. Is that right?

**8. Caller:** no, that's wrong, it's 07700900999

**Gio** _(8 words, 1217ms)_: That's oh-seven-seven, double-oh, nine-double-oh, nine-nine-nine. Is that right?

**9. Caller:** yes

**Gio** _(23 words, 1224ms)_: Two people, Thursday the seventeenth of December, eight o'clock, Dan, oh-seven-seven, double-oh, nine-double-oh, nine-nine-nine. Is that all correct, shall I confirm the booking?

**10. Caller:** yes

> 🔧 `create_booking` {"date":"2026-12-17","time":"20:00","party_size":2,"customer_name":"Dan","customer_phone":"07700900999"} → 200 — "That's booked, Dan. A table for two people on Thursday the seventeenth of December at eight o'clock. Your booking reference is B, two-one-zero-four. We have your number as oh-double-seven, double-oh, nine-double-oh, triple-nine. Is that right?"
>
**Gio** _(20 words, 4224ms)_: Lovely, you're booked. Reference B, two-one-zero-four, table one. We have your number as oh-seven-seven, double-oh, nine-double-oh, nine-nine-nine. Is that right?

**11. Caller:** yes

**Gio** _(11 words, 1195ms)_: Brilliant, see you on the seventeenth, Dan. Thanks for calling, bye!

## Test 16: Order query: refund request recorded

**1. Caller:** hi, I'd like a refund on an order I had

**Gio** _(8 words, 1022ms)_: Sorry to hear that. What's the order number?

**2. Caller:** A-1228

**Gio** _(7 words, 1039ms)_: And the phone number you ordered with?

**3. Caller:** 07700900555

> 🔧 `lookup_order` {"order_number":"A-1228","customer_phone":"07700900555"} → 200 — "I found your pickup order from 14 November: 2 Margherita. The total was 17.98. Its status is completed."
>
**Gio** _(15 words, 2676ms)_: I found your order A-1228 from today, two Margherita, total 17.98. Is that the one?

**4. Caller:** yes, that's the one

**Gio** _(3 words, 1197ms)_: What's the problem?

**5. Caller:** the pizza arrived cold and I want a refund

> 🔧 `create_order_query` {"order_number":"A-1228","customer_phone":"07700900555","query_type":"refund","description":"the pizza arrived cold and I want a refund"} → 200 — "I've noted that down and passed it to the team. Your reference is Q 3018. Someone will come back to you; I can't promise any outcome myself."
>
**Gio** _(22 words, 3148ms)_: I've noted that down and passed it to the restaurant, they'll be in touch with you themselves. Your reference is Q, three-zero-one-eight.

**6. Caller:** ok

**Gio** _(10 words, 1457ms)_: Is there anything else I can help you with today?

**7. Caller:** no, that's everything

**Gio** _(11 words, 1095ms)_: Brilliant, thanks for letting us know. Have a lovely day, bye!

## Test 17: Order query: wrong order number, callback offered

**1. Caller:** hi, I want to complain about an order I had

**Gio** _(19 words, 1011ms)_: Sorry to hear that. Is this about an order you've already placed, or would you like a new order?

**2. Caller:** no, that's it

**Gio** _(9 words, 938ms)_: Thanks for bearing with me. What's the order number?

**3. Caller:** A-98765

**Gio** _(7 words, 1027ms)_: And the phone number you ordered with?

**4. Caller:** 07700900555

> 🔧 `lookup_order` {"order_number":"A-98765","customer_phone":"07700900555"} → 404 — "Sorry, I can't find an order with those details. Could you check the order number and the phone number you ordered with?"
>
**Gio** _(14 words, 2953ms)_: Sorry, I can't find that one. Could you give me the order number again?

**5. Caller:** A-98765

> 🔧 `lookup_order` {"order_number":"A-98765","customer_phone":"07700900555"} → 404 — "Sorry, I can't find an order with those details. Could you check the order number and the phone number you ordered with?"
>
**Gio** _(18 words, 2911ms)_: Sorry, I still can't find that order. Could you give me the phone number you ordered with again?

**6. Caller:** 07700900555

**Gio** _(19 words, 1305ms)_: I'm still not finding that order, sorry. Shall I get someone from the shop to ring you about it?

**7. Caller:** yes please

**Gio** _(4 words, 1067ms)_: Brilliant. What's your name?

**8. Caller:** Priya

**Gio** _(10 words, 1004ms)_: Thanks, Priya. What's the best number to ring you on?

**9. Caller:** 07700900555

**Gio** _(8 words, 1077ms)_: That's oh-seven-seven, double-oh, nine-double-oh, five-five-five. Is that right?

**10. Caller:** yes

> 🔧 `request_callback` {"customer_name":"Priya","customer_phone":"07700900555","reason":"problem","details":"Caller wants to complain about a past order; order A-98765 could not be found by number and phone."} → 200 — "Thanks Priya, someone will ring you back on oh-double-seven, double-oh, nine-double-oh, triple-five. Is that the right number?"
>
**Gio** _(17 words, 3773ms)_: Thanks Priya, someone will ring you back on oh-double-seven, double-oh, nine-double-oh, triple-five. Is that the right number?

**11. Caller:** yes

**Gio** _(14 words, 990ms)_: Brilliant, someone from the shop will be in touch with you. Thanks Priya, bye!

## Test 18: Order query: pushing for a refund promise

**1. Caller:** hi, I need a refund on an order I had

**Gio** _(8 words, 1105ms)_: Sorry to hear that. What's the order number?

**2. Caller:** A-1228

**Gio** _(7 words, 1284ms)_: And the phone number you ordered with?

**3. Caller:** 07700900555

> 🔧 `lookup_order` {"order_number":"A-1228","customer_phone":"07700900555"} → 200 — "I found your pickup order from 14 November: 2 Margherita. The total was 17.98. Its status is completed."
>
**Gio** _(14 words, 2708ms)_: I found order A-1228 from today: two Margherita, total 17.98. Is that the one?

**4. Caller:** yes, that's the one

**Gio** _(3 words, 1160ms)_: What's the problem?

**5. Caller:** the pizza was cold and the base was soggy

> 🔧 `create_order_query` {"order_number":"A-1228","customer_phone":"07700900555","query_type":"refund","description":"the pizza was cold and the base was soggy"} → 200 — "I've noted that down and passed it to the team. Your reference is Q 3019. Someone will come back to you; I can't promise any outcome myself."
>
**Gio** _(22 words, 4342ms)_: I've noted that down and passed it to the restaurant, they'll be in touch with you themselves. Your reference is Q, three-zero-one-nine.

**6. Caller:** but I'll definitely get my money back, won't I?

**Gio** _(18 words, 1191ms)_: I can't promise anything myself, that's for the owner to decide, but they'll have everything you've told me.

**7. Caller:** ok

**Gio** _(9 words, 1097ms)_: Thanks for your patience. Have a good one, bye!

## Test 19: Order query: past order mentioned while ordering

**1. Caller:** hi, two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(11 words, 2997ms)_: Lovely, two 12 inch Pepperoni. Any drinks or sides with that?

**2. Caller:** last time my order was wrong by the way

**Gio** _(19 words, 1154ms)_: Sorry to hear that. Is this about an order you've already placed, or would you like a new order?

**3. Caller:** no, that's it

**Gio** _(13 words, 1162ms)_: Brilliant, I'll carry on with your order. Is that for delivery or collection?

**4. Caller:** collection

**Gio** _(12 words, 1260ms)_: Lovely, collection it is. What name should I put the order under?

**5. Caller:** Tom

**Gio** _(11 words, 1096ms)_: Thanks Tom. What's the best phone number to reach you on?

**6. Caller:** 07700900124

**Gio** _(8 words, 1180ms)_: That's oh-seven-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**7. Caller:** yes

**Gio** _(6 words, 1076ms)_: Lovely. Cash or card on collection?

**8. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"pickup","customer_name":"Tom","customer_phone":"07700900124","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for collection. That comes to 21.98 in total. Is that all correct?"
>
**Gio** _(19 words, 3667ms)_: So that's two 12 inch Pepperoni, for collection, paying cash. The total comes to 21.98. Is that all correct?

**9. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"pickup","customer_name":"Tom","customer_phone":"07700900124","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1229, ready to collect in about 20 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-four."
>
**Gio** _(18 words, 3209ms)_: Lovely, that's placed, order number A-1229. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-four. Is that right?

**10. Caller:** yes

**Gio** _(8 words, 1069ms)_: Brilliant, about 20 minutes then. Thanks Tom, bye!

## Test 20: Order query: right order number, wrong phone

**1. Caller:** hi, I want a refund on an order I had

**Gio** _(8 words, 2085ms)_: Sorry to hear that. What's the order number?

**2. Caller:** A-1228

**Gio** _(7 words, 1473ms)_: And the phone number you ordered with?

**3. Caller:** 07700900777

> 🔧 `lookup_order` {"order_number":"A-1228","customer_phone":"07700900777"} → 404 — "Sorry, I can't find an order with those details. Could you check the order number and the phone number you ordered with?"
>
**Gio** _(14 words, 4175ms)_: Sorry, I can't find that one. Could you check the order number for me?

**4. Caller:** A-1228

> 🔧 `lookup_order` {"order_number":"A-1228","customer_phone":"07700900777"} → 404 — "Sorry, I can't find an order with those details. Could you check the order number and the phone number you ordered with?"
>
**Gio** _(22 words, 3522ms)_: Sorry, I still can't find an order with those details. Shall I get someone from the shop to ring you about it?

**5. Caller:** no thanks

**Gio** _(12 words, 1980ms)_: No worries. Is there anything else I can help you with today?

**6. Caller:** no, that's everything

**Gio** _(7 words, 1267ms)_: No worries, have a lovely day. Bye!

