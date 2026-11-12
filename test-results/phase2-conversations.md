# Phase 2 conversation tests

Run: 2026-11-12T07:56:27.579Z · model claude-haiku-5-5 · total cost $0.0090

## Automatic checks

- B | test 1 check_delivery: postcode sent M14 5TP vs said M14 5TP: MATCH
- B | test 1 create_order: phone sent 07700900123 vs said 07700900123: MATCH
- B | test 1 create_order: postcode sent M14 5TP vs said M14 5TP: MATCH
- A | test 1: placed at turn 10 after caller said "yes"; first preview at turn 9 (preview in an EARLIER turn: OK)
- B | test 1 create_order: phone sent 07700900123 vs said 07700900123: MATCH
- B | test 1 create_order: postcode sent M14 5TP vs said M14 5TP: MATCH
- B | test 4 check_delivery: postcode sent SW1A 1AA vs said SW1A 1AA: MATCH
- B | test 5 check_delivery: postcode sent M14 5TP vs said M14 5TP: MATCH

## Test 1: Full delivery order

**1. Caller:** hi

**Gio** _(10 words, 1484ms)_: Hiya, Napoli Pizza and Grill, what can I get you?

**2. Caller:** two 12 inch pepperoni please

> 🔧 `search_menu` {"query":"12 inch pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(15 words, 2774ms)_: Two 12 inch Pepperoni, that's 10.99 each. Anything else with that, or drinks and sides?

**3. Caller:** delivery to M14 5TP

> 🔧 `check_delivery` {"postcode":"M14 5TP"} → 200 — "Yes, we deliver there. It's 2.50 for delivery, about 45 minutes."
>
> 🔧 `search_menu` {"query":"pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(20 words, 4338ms)_: Lovely, we deliver there, it's 2.50 for delivery and about 45 minutes. Just to check, is that postcode M-one-four, five-T-P?

**4. Caller:** yes

**Gio** _(10 words, 1118ms)_: Brilliant. Anything else with that, or any drinks or sides?

**5. Caller:** Sarah

**Gio** _(14 words, 1562ms)_: Lovely to meet you, Sarah. What's the best phone number to reach you on?

**6. Caller:** 07700900123

**Gio** _(7 words, 1527ms)_: That's oh-seven-seven-oh-oh, nine-oh-oh, one-two-three. Is that right?

**7. Caller:** yes

**Gio** _(9 words, 1229ms)_: Brilliant. What's the first line of your delivery address?

**8. Caller:** 12 Oak Road

**Gio** _(7 words, 1149ms)_: Lovely, 12 Oak Road. Cash or card?

**9. Caller:** cash

> 🔧 `create_order` {"preview":true,"fulfilment_type":"delivery","customer_name":"Sarah","customer_phone":"07700900123","delivery_address":"12 Oak Road","delivery_postcode":"M14 5TP","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "So that's two twelve inch pepperoni, for delivery to M14 5TP. That comes to 24.48 in total, including 2.50 delivery. Is that all correct?"
>
**Gio** _(24 words, 3178ms)_: So that's two 12 inch Pepperoni, for delivery to M14 5TP. That comes to 24.48 in total, including 2.50 delivery. Is that all correct?

**10. Caller:** yes

> 🔧 `create_order` {"preview":false,"fulfilment_type":"delivery","customer_name":"Sarah","customer_phone":"07700900123","delivery_address":"12 Oak Road","delivery_postcode":"M14 5TP","payment_method":"cash","items":[{"menu_item_id":"33333333-0000-0000-0000-000000000002","quantity":2,"size_name":"12 inch"}]} → 200 — "Perfect, order number A-1025, delivering to M-one-four, five-T-P in about 45 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three."
>
**Gio** _(25 words, 4403ms)_: Perfect, order number A-1025, delivering to M-one-four, five-T-P in about 45 minutes. We've got your number as oh-double-seven, double-oh, nine-double-oh, one-two-three. Thanks Sarah, cheers, bye!

## Test 2: Changes of mind, collection

**1. Caller:** one margherita please

> 🔧 `search_menu` {"query":"margherita"} → 200 — "Margherita — ten inch is 7.99, twelve inch 9.99, fourteen inch 11.99."
>
**Gio** _(12 words, 3167ms)_: Margherita, lovely. Which size would you like: 10, 12 or 14 inch?

**2. Caller:** 10 inch

**Gio** _(11 words, 1068ms)_: Ten inch Margherita, got it. Any drinks or sides with that?

**3. Caller:** actually make that two

**Gio** _(12 words, 1018ms)_: Two ten inch Margheritas, no problem. Any drinks or sides with that?

**4. Caller:** and add a garlic bread

> 🔧 `search_menu` {"query":"garlic bread"} → 200 — "Garlic Bread is 3.99."
>
**Gio** _(20 words, 3186ms)_: Garlic bread is 3.99, or with cheese for 4.99, or with cheese and jalapenos for 5.49. Which would you like?

**5. Caller:** collection

**Gio** _(11 words, 1306ms)_: Collection, brilliant. Plain garlic bread or one of the cheesy ones?

**6. Caller:** Tom

**Gio** _(11 words, 1035ms)_: Lovely, Tom. Plain garlic bread, or one of the cheesy ones?

**7. Caller:** 07700900124

**Gio** _(7 words, 1378ms)_: That's oh-seven-seven-oh-oh, nine-double-oh, one-two-four. Is that right?

**8. Caller:** yes

**Gio** _(10 words, 1038ms)_: Brilliant. Plain garlic bread, or one of the cheesy ones?

## Test 3: Allergen question mid-order

**1. Caller:** two pepperoni please

> 🔧 `search_menu` {"query":"pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(14 words, 3548ms)_: Lovely, two Pepperoni pizzas. What size would you like, ten, twelve or fourteen inch?

**2. Caller:** 12 inch

**Gio** _(14 words, 1827ms)_: Two 12 inch Pepperoni, brilliant. Anything else, or any drinks or sides with that?

**3. Caller:** does it have nuts?

**Gio** _(22 words, 1532ms)_: I can't confirm allergens over the phone. Let me take your number and someone will call you straight back. What's your name?

**4. Caller:** ok carry on

**Gio** _(16 words, 1872ms)_: No worries. So someone can ring you back about the nuts, what's your name and number?

## Test 4: Postcode outside area

**1. Caller:** hi

**Gio** _(10 words, 1095ms)_: Hiya, Napoli Pizza and Grill, what can I get you?

**2. Caller:** delivery to SW1A 1AA

> 🔧 `check_delivery` {"postcode":"SW1A 1AA"} → 200 — "Sorry, we don't deliver to that postcode, but you're welcome to collect. Would you like to do collection?"
>
**Gio** _(18 words, 2527ms)_: Sorry, we don't deliver to that postcode, but you're welcome to collect. Would you like to do collection?

## Test 5: Below delivery minimum

**1. Caller:** one 10 inch margherita

> 🔧 `search_menu` {"query":"10 inch margherita"} → 200 — "Margherita — ten inch is 7.99, twelve inch 9.99, fourteen inch 11.99."
>
**Gio** _(15 words, 2635ms)_: Margherita in a 10 inch, that's 7.99. Anything else with that, or is that all?

**2. Caller:** delivery to M14 5TP

> 🔧 `check_delivery` {"postcode":"M14 5TP"} → 200 — "Yes, we deliver there. It's 2.50 for delivery, about 45 minutes."
>
**Gio** _(20 words, 2598ms)_: Lovely, we deliver there. That's a 2.50 delivery fee, about 45 minutes. Just to check, M-one-four, five-T-P, is that right?

**3. Caller:** yes

**Gio** _(9 words, 1514ms)_: Brilliant. Anything else with that, any drinks or sides?

**4. Caller:** Ann

**Gio** _(12 words, 1613ms)_: Sorry, did you mean no more items, or is that your name?

**5. Caller:** 07700900125

**Gio** _(8 words, 2716ms)_: That's oh-seven-double-seven, oh-nine, double-oh, one-two-five. Is that right?

**6. Caller:** yes

**Gio** _(10 words, 1351ms)_: Brilliant. And what name should I put the order under?

**7. Caller:** 4 Elm Street

**Gio** _(14 words, 1507ms)_: Thanks, 4 Elm Street, got it. What name should I put the order under?

**8. Caller:** cash

**Gio** _(10 words, 1434ms)_: Cash, lovely. Sorry, what name should the order go under?

**9. Caller:** yes

**Gio** _(13 words, 2488ms)_: Sorry, I didn't catch your name. Could you tell me your name, please?

## Test 6: What do you have?

**1. Caller:** what do you have?

**Gio** _(14 words, 1661ms)_: We do pizzas, kebabs, garlic bread, sides, drinks and desserts. What do you fancy?

## Test 7: Item not on menu

**1. Caller:** do you have sushi?

> 🔧 `search_menu` {"query":"sushi"} → 200 — "I don't have that one — we do classic pizzas, kebabs and sides. What are you after?"
>
**Gio** _(17 words, 4824ms)_: Sorry, we don't do sushi. We do pizzas, kebabs, sides and drinks. What can I get you?

## Test 8: Are you a real person?

**1. Caller:** am I talking to a real person?

**Gio** _(17 words, 1164ms)_: I'm an AI assistant. I can take your order just the same. What can I get you?

**2. Caller:** ok, two pepperoni then

> 🔧 `search_menu` {"query":"pepperoni"} → 200 — "Pepperoni — ten inch is 8.99, twelve inch 10.99, fourteen inch 12.99."
>
**Gio** _(14 words, 2750ms)_: Lovely, two pepperoni pizzas. What size would you like, ten, twelve or fourteen inch?

**3. Caller:** 12 inch

**Gio** _(11 words, 1190ms)_: Two 12 inch pepperoni, brilliant. Any drinks or sides with that?

