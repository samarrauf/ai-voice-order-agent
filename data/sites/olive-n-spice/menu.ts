// =====================================================================
// Olive 'n Spice: the menu
// ---------------------------------------------------------------------
// Typed copy of the restaurant's PDF menu. All prices are in Pakistani
// rupees (whole numbers, no decimals).
//
// Shape:  group  ->  category  ->  item
//   e.g.  "Starters" -> "Soup" -> "Hot n Sour Soup"
//
// The website reads this file directly, and the same file will later be
// used to import the menu into the database, so keep it tidy:
//   - `id`s are unique, lower-case, and never change once published.
//   - `notes` are for US (things to confirm with the client). They are
//     never shown on the website.
// =====================================================================

/** 0 = not spicy, 1 = mild, 2 = medium, 3 = hot. */
export type SpiceLevel = 0 | 1 | 2 | 3;

export type MenuPrice = {
  /** What this price is for: a size or serving, e.g. `10"`, "2 Person", "Single Patty". Missing when the item has one plain price (or the PDF does not name the size). */
  label?: string;
  /** Price in rupees. */
  amount: number;
};

export type MenuItem = {
  id: string;
  name: string;
  description?: string;
  /** One entry for a single price; several for sizes / servings. */
  prices: MenuPrice[];
  spiceLevel: SpiceLevel;
  chefSpecial: boolean;
  /** Portion shown next to the name, e.g. "8 pcs". */
  serving?: string;
  /** Choices the guest makes when ordering, e.g. ["Spicy", "Mild"]. */
  options?: string[];
  /** Internal notes (not shown on the website). */
  notes?: string[];
};

export type MenuExtra = {
  /** What kind of add-on this is, as printed on the menu, e.g. "Side option". */
  label?: string;
  /** e.g. "Extra topping", "Fish Crackers". */
  name: string;
  prices: MenuPrice[];
};

export type MenuCategory = {
  id: string;
  name: string;
  /** Shorter name for tight spaces (the home page carousel), e.g. "Wok" for "Chinese Wok". */
  shortName?: string;
  /** A line shown under the category title, e.g. "Served with fries". */
  note?: string;
  /** Side dishes the guest picks one of, e.g. Fries | Mashed Potato | Rice. */
  sideOptions?: string[];
  /** Paid add-ons for the whole category. */
  extras?: MenuExtra[];
  /** Column headings when every item is priced per size, e.g. ["2 Person", "4 Person"]. */
  priceLabels?: string[];
  items: MenuItem[];
};

export type MenuGroup = {
  id: string;
  name: string;
  categories: MenuCategory[];
};

const CONFIRM_SIZES = "CONFIRM: the PDF shows two prices but does not name the two sizes.";
const CONFIRM_PIECES = "CONFIRM: piece count as read from the PDF, please double-check.";

export const menu: MenuGroup[] = [
  // -------------------------------------------------------------------
  {
    id: "starters",
    name: "Starters",
    categories: [
      {
        id: "appetizer",
        name: "Appetizer",
        items: [
          { id: "appetizer-french-fries", name: "French Fries", description: "Olive'n Spice special plain fries.", prices: [{ amount: 299 }], spiceLevel: 0, chefSpecial: false },
          { id: "appetizer-masala-fries", name: "Masala Fries", description: "French fries tossed in spicy & tangy seasoning.", prices: [{ amount: 349 }], spiceLevel: 2, chefSpecial: false },
          { id: "appetizer-garlic-mayo-fries", name: "Garlic Mayo Fries", description: "Fries served with garlic mayo sauce.", prices: [{ amount: 399 }], spiceLevel: 0, chefSpecial: false },
          { id: "appetizer-loaded-fries", name: "Loaded Fries", description: "Fries topped with cheese, grill chicken and good good sauce.", prices: [{ amount: 699 }], spiceLevel: 0, chefSpecial: true },
          { id: "appetizer-plain-wings", name: "Plain Wings", description: "Crispy wings.", prices: [{ amount: 599 }, { amount: 1099 }], spiceLevel: 0, chefSpecial: false, notes: [CONFIRM_SIZES] },
          { id: "appetizer-peri-peri-wings", name: "Peri Peri Wings", description: "Crispy wings in peri peri sauce.", prices: [{ amount: 699 }, { amount: 1199 }], spiceLevel: 2, chefSpecial: false, notes: [CONFIRM_SIZES] },
          { id: "appetizer-bbq-wings", name: "BBQ Wings", description: "Oven-baked wings in BBQ sauce.", prices: [{ amount: 699 }, { amount: 1199 }], spiceLevel: 0, chefSpecial: false, notes: [CONFIRM_SIZES] },
          { id: "appetizer-honey-mustard-wings", name: "Honey Mustard Wings", description: "Crispy wings in honey mustard sauce.", prices: [{ amount: 1199 }], spiceLevel: 0, chefSpecial: false },
          { id: "appetizer-finger-fish-with-fries", name: "Finger Fish with Fries", description: "Golden fried fish served with fries and tartar sauce.", prices: [{ amount: 1499 }], spiceLevel: 0, chefSpecial: false, serving: "8 pcs", notes: [CONFIRM_PIECES] },
          { id: "appetizer-honey-mustard-bites", name: "Honey Mustard Bites", description: "Crispy chicken in honey mustard sauce.", prices: [{ amount: 699 }], spiceLevel: 0, chefSpecial: false, serving: "8 pcs", notes: [CONFIRM_PIECES] },
          { id: "appetizer-dynamite-bites", name: "Dynamite Bites", description: "Crispy chicken in dynamite sauce.", prices: [{ amount: 699 }], spiceLevel: 0, chefSpecial: false },
          { id: "appetizer-hot-chilli-bites", name: "Hot Chilli Bites", description: "Crispy chicken in chilli sauce.", prices: [{ amount: 699 }], spiceLevel: 2, chefSpecial: false },
          { id: "appetizer-mexican-tacos", name: "Mexican Tacos", description: "Tacos filled with Mexican-style chicken, fresh vegetables and spicy sauces.", prices: [{ amount: 799 }], spiceLevel: 0, chefSpecial: false, serving: "10 pcs", notes: [CONFIRM_PIECES] },
        ],
      },
      {
        id: "chinese-appetizer",
        name: "Chinese Appetizer",
        items: [
          { id: "chinese-appetizer-dhaka-chicken", name: "Dhaka Chicken", prices: [{ amount: 899 }], spiceLevel: 0, chefSpecial: false },
          { id: "chinese-appetizer-honey-mustard-wings", name: "Honey Mustard Wings", prices: [{ amount: 1099 }], spiceLevel: 0, chefSpecial: false, serving: "10 pcs" },
          { id: "chinese-appetizer-peri-peri-wings", name: "Peri Peri Wings", prices: [{ amount: 1099 }], spiceLevel: 2, chefSpecial: false },
          { id: "chinese-appetizer-dynamite-chicken", name: "Dynamite Chicken", description: "Golden fried chicken coated in our signature super dynamite sauce.", prices: [{ amount: 799 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
      {
        id: "tenders",
        name: "Tenders",
        items: [
          { id: "tenders-8-pc-tender-chicken", name: "8 Pc Tender Chicken", description: "Crispy chicken strips.", prices: [{ amount: 1199 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
      {
        id: "soup",
        name: "Soup",
        priceLabels: ["2 Person", "4 Person"],
        extras: [{ label: "Side option", name: "Fish Crackers", prices: [{ amount: 350 }] }],
        items: [
          { id: "soup-olive-n-spice-b-19-soup", name: "Olive n Spice B-19 Soup", description: "Minced chicken, shrimp, fish and black mushroom with dark soy sauce.", prices: [{ label: "2 Person", amount: 899 }, { label: "4 Person", amount: 1649 }], spiceLevel: 0, chefSpecial: true },
          { id: "soup-hot-szechuan-soup", name: "Hot Szechuan Soup", description: "Minced chicken, fish & black mushroom with hot sauce.", prices: [{ label: "2 Person", amount: 899 }, { label: "4 Person", amount: 1499 }], spiceLevel: 1, chefSpecial: false },
          { id: "soup-thai-chicken-soup", name: "Thai Chicken Soup", description: "Minced chicken and green chilli.", prices: [{ label: "2 Person", amount: 749 }, { label: "4 Person", amount: 1399 }], spiceLevel: 1, chefSpecial: false },
          { id: "soup-hot-n-sour-soup", name: "Hot n Sour Soup", description: "Minced chicken, egg, vegetables and chicken stock.", prices: [{ label: "2 Person", amount: 749 }, { label: "4 Person", amount: 1399 }], spiceLevel: 0, chefSpecial: false },
          { id: "soup-chicken-corn-soup", name: "Chicken Corn Soup", description: "Chicken stock, egg, chicken and sweet corn.", prices: [{ label: "2 Person", amount: 749 }, { label: "4 Person", amount: 1399 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: "pasta-continental",
    name: "Pasta & Continental",
    categories: [
      {
        id: "pasta",
        name: "Pasta",
        items: [
          { id: "pasta-alfredo-pasta", name: "Alfredo Pasta", description: "White sauce pasta with chicken strips & garlic bread.", prices: [{ amount: 1099 }], spiceLevel: 0, chefSpecial: false, options: ["Spicy", "Mild"] },
          { id: "pasta-crunch-pasta", name: "Crunch Pasta", description: "White sauce pasta with crunchy fillet.", prices: [{ amount: 999 }], spiceLevel: 0, chefSpecial: false },
          { id: "pasta-oven-baked-pasta", name: "Oven Baked Pasta", description: "Macaroni pasta with tikka chicken, veggies and sauces.", prices: [{ amount: 799 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
      {
        id: "continental",
        name: "Continental",
        shortName: "Steaks",
        sideOptions: ["Fries", "Mashed Potato", "Rice"],
        items: [
          { id: "continental-olive-n-spice-steak", name: "Olive n Spice Steak", description: "Chicken served with Moroccan and tarragon sauce with sauté veg.", prices: [{ amount: 1649 }], spiceLevel: 0, chefSpecial: true },
          { id: "continental-moroccan-steak", name: "Moroccan Steak", description: "Chicken served with Moroccan sauce & sauté veg.", prices: [{ amount: 1549 }], spiceLevel: 0, chefSpecial: false },
          { id: "continental-tarragon-steak", name: "Tarragon Steak", description: "Chicken served with tarragon sauce & sauté veg.", prices: [{ amount: 1549 }], spiceLevel: 0, chefSpecial: false },
          { id: "continental-jalapeno-steak", name: "Jalapeño Steak", description: "Chicken served with jalapeño sauce & sauté veg.", prices: [{ amount: 1549 }], spiceLevel: 0, chefSpecial: false },
          { id: "continental-mushroom-steak", name: "Mushroom Steak", description: "Chicken served with mushroom sauce & sauté veg.", prices: [{ amount: 1549 }], spiceLevel: 0, chefSpecial: false },
          { id: "continental-pepper-steak", name: "Pepper Steak", description: "Chicken served with black pepper sauce & sauté veg.", prices: [{ amount: 1549 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
      {
        id: "stuffed-chicken",
        name: "Stuffed Chicken",
        sideOptions: ["Fries", "Mashed Potato", "Rice"],
        items: [
          { id: "stuffed-chicken-polo-chicken", name: "Polo Chicken", description: "Deep-fried chicken stuffed with cheese, spinach or Moroccan sauce, served with sauté veg.", prices: [{ amount: 1799 }], spiceLevel: 0, chefSpecial: true },
          { id: "stuffed-chicken-cheesy-spinach", name: "Cheesy Spinach", description: "Deep-fried chicken stuffed with spinach & Moroccan sauce, served with sauté veg.", prices: [{ amount: 1699 }], spiceLevel: 0, chefSpecial: false },
          { id: "stuffed-chicken-florentine-chicken", name: "Florentine Chicken", description: "Grilled chicken stuffed with Moroccan sauce and sauté veg.", prices: [{ amount: 1649 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: "chinese",
    name: "Chinese",
    categories: [
      {
        id: "chinese-wok",
        name: "Chinese Wok",
        shortName: "Wok",
        items: [
          { id: "chinese-wok-olive-n-spice-special-chicken", name: "Olive n Spice Special Chicken", prices: [{ amount: 1399 }], spiceLevel: 0, chefSpecial: true },
          { id: "chinese-wok-kung-pao-chicken", name: "Kung Pao Chicken", prices: [{ amount: 1399 }], spiceLevel: 0, chefSpecial: false },
          { id: "chinese-wok-thai-cashewnut-chicken", name: "Thai Cashewnut Chicken", prices: [{ amount: 1399 }], spiceLevel: 0, chefSpecial: false },
          { id: "chinese-wok-thai-oyster-chicken", name: "Thai Oyster Chicken", prices: [{ amount: 1399 }], spiceLevel: 0, chefSpecial: false },
          { id: "chinese-wok-roasted-almond-chicken", name: "Roasted Almond Chicken", prices: [{ amount: 1399 }], spiceLevel: 0, chefSpecial: false },
          { id: "chinese-wok-black-pepper-chicken", name: "Black Pepper Chicken", prices: [{ amount: 1399 }], spiceLevel: 0, chefSpecial: false },
          { id: "chinese-wok-chicken-chilli-dry", name: "Chicken Chilli Dry", prices: [{ amount: 1399 }], spiceLevel: 2, chefSpecial: false },
          { id: "chinese-wok-chicken-manchurian", name: "Chicken Manchurian", prices: [{ amount: 1399 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
      {
        id: "rice-noodles",
        name: "Rice & Noodles",
        items: [
          { id: "rice-noodles-olive-n-spice-special-chicken-rice", name: "Olive n Spice Special Chicken Rice", prices: [{ amount: 1299 }], spiceLevel: 0, chefSpecial: true },
          { id: "rice-noodles-chicken-rice", name: "Chicken Rice", prices: [{ amount: 1199 }], spiceLevel: 0, chefSpecial: false },
          { id: "rice-noodles-egg-fried-rice", name: "Egg Fried Rice", prices: [{ amount: 1199 }], spiceLevel: 0, chefSpecial: false },
          { id: "rice-noodles-vegetable-rice", name: "Vegetable Rice", prices: [{ amount: 1199 }], spiceLevel: 0, chefSpecial: false },
          { id: "rice-noodles-masala-rice", name: "Masala Rice", prices: [{ amount: 1099 }], spiceLevel: 1, chefSpecial: false },
          { id: "rice-noodles-olive-n-spice-special-chowmein", name: "Olive n Spice Special Chowmein", prices: [{ amount: 1099 }], spiceLevel: 0, chefSpecial: false },
          { id: "rice-noodles-chicken-chowmein", name: "Chicken Chowmein", prices: [{ amount: 1099 }], spiceLevel: 0, chefSpecial: false },
          { id: "rice-noodles-vegetable-chowmein", name: "Vegetable Chowmein", prices: [{ amount: 999 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
      {
        id: "chinese-deal",
        name: "Chinese Deal",
        items: [
          { id: "chinese-deal-chinese-deal", name: "Chinese Deal", description: "Rice + Any Type of Chinese Wok + Chowmein", prices: [{ amount: 1499 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: "fast-food",
    name: "Fast Food",
    categories: [
      {
        id: "pizza",
        name: "Pizza",
        priceLabels: ['10"', '14"', '17"'],
        extras: [{ name: "Extra topping", prices: [{ label: '10"', amount: 199 }, { label: '14"', amount: 299 }, { label: '17"', amount: 399 }] }],
        items: [
          { id: "pizza-olive-n-spice-special-pizza", name: "Olive n Spice Special Pizza", description: "Chicken tikka, cheese chicken with veggies and signature sauce.", prices: [{ label: '10"', amount: 1399 }, { label: '14"', amount: 1999 }, { label: '17"', amount: 2699 }], spiceLevel: 0, chefSpecial: false },
          { id: "pizza-crown-crust-pizza", name: "Crown Crust Pizza", description: "Chicken, cheese with signature sauce, veggies & kebab.", prices: [{ label: '10"', amount: 1299 }, { label: '14"', amount: 1899 }, { label: '17"', amount: 2599 }], spiceLevel: 0, chefSpecial: false },
          { id: "pizza-malai-boti-pizza", name: "Malai Boti Pizza", description: "Malai boti chicken, tomato, jalapeno with signature sauce.", prices: [{ label: '10"', amount: 1299 }, { label: '14"', amount: 1899 }, { label: '17"', amount: 2599 }], spiceLevel: 0, chefSpecial: false },
          { id: "pizza-tikka-pizza", name: "Tikka Pizza", description: "Chicken tikka, tomato, onion with Italian sauce.", prices: [{ label: '10"', amount: 1199 }, { label: '14"', amount: 1799 }, { label: '17"', amount: 2399 }], spiceLevel: 0, chefSpecial: false },
          { id: "pizza-fajita-pizza", name: "Fajita Pizza", description: "Chicken fajita, onion, capsicum, olive with Italian sauce.", prices: [{ label: '10"', amount: 1199 }, { label: '14"', amount: 1799 }, { label: '17"', amount: 2399 }], spiceLevel: 0, chefSpecial: false },
          { id: "pizza-cheese-stick-pizza", name: "Cheese Stick Pizza", description: "Chicken tikka, bell pepper, tomato, olive with signature sauce.", prices: [{ label: '10"', amount: 1299 }], spiceLevel: 0, chefSpecial: false, notes: ['Only available in 10".'] },
          { id: "pizza-cheese-lover-pizza", name: "Cheese Lover Pizza", description: "Cheese & olive with Italian sauce.", prices: [{ label: '10"', amount: 1199 }, { label: '14"', amount: 1799 }, { label: '17"', amount: 2399 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
      {
        id: "burger",
        name: "Burger",
        note: "Served with fries",
        items: [
          { id: "burger-olive-n-spice-special-burger", name: "Olive n Spice Special Burger", description: "Grilled chicken with cheese sauce.", prices: [{ amount: 1049 }], spiceLevel: 0, chefSpecial: false },
          { id: "burger-good-good-burger", name: "Good Good Burger", description: "Zinger patty with Good Good sauce & cheese.", prices: [{ amount: 699 }], spiceLevel: 0, chefSpecial: false },
          { id: "burger-classic-supreme-burger", name: "Classic Supreme Burger", prices: [{ label: "Single Patty", amount: 599 }, { label: "Double Patty", amount: 799 }], spiceLevel: 0, chefSpecial: false },
          { id: "burger-grill-burger", name: "Grill Burger", prices: [{ amount: 749 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
      {
        id: "wraps",
        name: "Wraps",
        items: [
          { id: "wraps-olive-n-spice-special-wrap", name: "Olive n Spice Special Wrap", description: "Tender chicken served with veggie and signature sauce.", prices: [{ amount: 899 }], spiceLevel: 0, chefSpecial: false },
          { id: "wraps-grill-wrap", name: "Grill Wrap", prices: [{ amount: 799 }], spiceLevel: 0, chefSpecial: false },
          { id: "wraps-good-good-wrap", name: "Good Good Wrap", description: "Tender chicken served with veggie & Good Good sauce.", prices: [{ amount: 749 }], spiceLevel: 0, chefSpecial: false },
          { id: "wraps-classic-wrap", name: "Classic Wrap", prices: [{ amount: 699 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
      {
        id: "sandwich",
        name: "Sandwich",
        note: "Served with fries",
        items: [
          { id: "sandwich-olive-n-spice-grill-sandwich", name: "Olive n Spice Grill Sandwich", description: "Sandwich bread with grilled chicken, topped with BBQ sauce, veggie, tomato, onion & signature sauce.", prices: [{ amount: 1149 }], spiceLevel: 0, chefSpecial: false },
          { id: "sandwich-classic-club-sandwich", name: "Classic Club Sandwich", description: "Grilled chicken, egg, veggie and cheese slices.", prices: [{ amount: 1099 }], spiceLevel: 0, chefSpecial: false },
          { id: "sandwich-melted-cheese-sandwich", name: "Melted Cheese Sandwich", description: "Crispy chicken topped with signature sauce.", prices: [{ amount: 949 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: "mughlai-bbq",
    name: "Mughlai & BBQ",
    categories: [
      {
        id: "murgh-handi",
        name: "Murgh Handi",
        note: "Per plate",
        items: [
          { id: "murgh-handi-desi-murgh-qorma", name: "Desi Murgh Qorma (Desi Ghee)", prices: [{ amount: 1199 }], spiceLevel: 0, chefSpecial: false },
          { id: "murgh-handi-chicken-handi", name: "Chicken Handi", prices: [{ amount: 1849 }], spiceLevel: 0, chefSpecial: false },
          { id: "murgh-handi-chicken-handi-white", name: "Chicken Handi (White)", prices: [{ amount: 1849 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
      {
        id: "shahi-mutton",
        name: "Shahi Mutton",
        note: "Per plate",
        items: [
          { id: "shahi-mutton-mutton-qorma", name: "Mutton Qorma (Desi Ghee)", prices: [{ amount: 1399 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
      {
        id: "bbq",
        name: "BBQ",
        items: [
          { id: "bbq-chicken-tikka-boti", name: "Chicken Tikka Boti", prices: [{ amount: 1249 }], spiceLevel: 0, chefSpecial: false, serving: "12 pcs" },
          { id: "bbq-chicken-malai-boti", name: "Chicken Malai Boti", prices: [{ amount: 1349 }], spiceLevel: 0, chefSpecial: false, serving: "12 pcs" },
          { id: "bbq-chicken-kalmi-tikka", name: "Chicken Kalmi Tikka", prices: [{ amount: 1399 }], spiceLevel: 0, chefSpecial: false, serving: "4 pcs" },
          { id: "bbq-chicken-seekh-kabab", name: "Chicken Seekh Kabab", prices: [{ amount: 1099 }], spiceLevel: 0, chefSpecial: false, serving: "6 pcs" },
          { id: "bbq-chicken-tikka", name: "Chicken Tikka", prices: [{ label: "Leg", amount: 499 }, { label: "Chest", amount: 549 }], spiceLevel: 0, chefSpecial: false },
          { id: "bbq-whole-chicken", name: "Whole Chicken", prices: [{ amount: 1599 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
      {
        id: "raita",
        name: "Raita",
        items: [
          { id: "raita-mint-raita", name: "Mint Raita", prices: [{ amount: 199 }], spiceLevel: 0, chefSpecial: false },
          { id: "raita-zeera-raita", name: "Zeera Raita", prices: [{ amount: 199 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
      {
        id: "tandoor",
        name: "Tandoor",
        note: "Per head",
        items: [
          { id: "tandoor-tandoori-roti", name: "Tandoori Roti", prices: [{ amount: 99 }], spiceLevel: 0, chefSpecial: false },
          { id: "tandoor-plain-naan", name: "Plain Naan", prices: [{ amount: 95 }], spiceLevel: 0, chefSpecial: false },
          { id: "tandoor-roghni-naan", name: "Roghni Naan", prices: [{ amount: 125 }], spiceLevel: 0, chefSpecial: false },
          { id: "tandoor-garlic-naan", name: "Garlic Naan", prices: [{ amount: 145 }], spiceLevel: 0, chefSpecial: false },
          { id: "tandoor-kalonji-naan", name: "Kalonji Naan", prices: [{ amount: 145 }], spiceLevel: 0, chefSpecial: false },
          { id: "tandoor-tandoori-paratha", name: "Tandoori Paratha", prices: [{ amount: 195 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
    ],
  },

  // -------------------------------------------------------------------
  {
    id: "desserts-drinks",
    name: "Desserts & Drinks",
    categories: [
      {
        id: "dessert",
        name: "Dessert",
        items: [
          { id: "dessert-molten-lava-with-ice-cream", name: "Molten Lava with Ice Cream", prices: [{ amount: 749 }], spiceLevel: 0, chefSpecial: false },
          { id: "dessert-chocolate-brownie", name: "Chocolate Brownie", prices: [{ amount: 249 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
      {
        id: "beverages",
        name: "Beverages",
        items: [
          { id: "beverages-mint-margarita", name: "Mint Margarita", prices: [{ amount: 275 }], spiceLevel: 0, chefSpecial: false },
          { id: "beverages-fresh-lime", name: "Fresh Lime", prices: [{ amount: 225 }], spiceLevel: 0, chefSpecial: false },
          { id: "beverages-coke-sprite-tin", name: "Coke / Sprite Tin", prices: [{ amount: 199 }], spiceLevel: 0, chefSpecial: false },
          { id: "beverages-nestle-water-large", name: "Nestle Water (Large)", prices: [{ amount: 149 }], spiceLevel: 0, chefSpecial: false },
          { id: "beverages-nestle-water-small", name: "Nestle Water (Small)", prices: [{ amount: 89 }], spiceLevel: 0, chefSpecial: false },
          { id: "beverages-nestle-juice", name: "Nestle Juice", prices: [{ amount: 119 }], spiceLevel: 0, chefSpecial: false },
        ],
      },
    ],
  },
];

/** Printed at the bottom of the menu (from the PDF). */
export const menuFootnote = "Service charges 7%. All prices are exclusive of govt. taxes.";

export const spiceLabels: Record<SpiceLevel, string> = {
  0: "Not spicy",
  1: "Mild",
  2: "Medium",
  3: "Hot",
};

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** 1099 -> "1,099" (thousands comma). Written by hand so the server and every browser print exactly the same text. */
export function formatAmount(amount: number): string {
  return String(Math.round(amount)).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
}

/** 1099 -> "Rs 1,099" */
export function formatRs(amount: number): string {
  return `Rs ${formatAmount(amount)}`;
}

/** Short one-line price: "Rs 299", or "Rs 599 / 1,099" when there are sizes. */
export function formatPriceLine(prices: MenuPrice[]): string {
  return `Rs ${prices.map((p) => formatAmount(p.amount)).join(" / ")}`;
}

export type ChefSpecial = { item: MenuItem; category: MenuCategory; group: MenuGroup };

/** Every item marked as a chef's special, with the category and group it belongs to. */
export function getChefSpecials(): ChefSpecial[] {
  const specials: ChefSpecial[] = [];
  for (const group of menu) {
    for (const category of group.categories) {
      for (const item of category.items) {
        if (item.chefSpecial) specials.push({ item, category, group });
      }
    }
  }
  return specials;
}
