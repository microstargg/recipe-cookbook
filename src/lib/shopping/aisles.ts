/** UK supermarket sections, keyword classification and per-store walking order. Client-safe. */

export const AISLES = {
  produce: "Fruit & veg",
  bakery: "Bakery",
  meat: "Meat & fish",
  dairy: "Dairy & eggs",
  chilled: "Chilled & deli",
  dry: "Pasta, rice & grains",
  tins: "Tins & jars",
  sauces: "Sauces, stock & condiments",
  world: "World foods",
  spices: "Herbs & spices",
  baking: "Baking",
  snacks: "Cereal & snacks",
  drinks: "Drinks",
  frozen: "Frozen",
  household: "Household",
  other: "Other",
  pantry: "Check you have",
} as const;

export type AisleKey = keyof typeof AISLES;

export const AISLE_KEYS = Object.keys(AISLES) as AisleKey[];

export function isAisleKey(v: unknown): v is AisleKey {
  return typeof v === "string" && v in AISLES;
}

export const STORES = {
  lidl: "Lidl",
  morrisons: "Morrisons",
  mands: "M&S",
} as const;

export type StoreKey = keyof typeof STORES;

/**
 * Rough walking order for a typical store of each chain. Layouts vary by branch, so this is
 * a sensible default rather than gospel. `pantry` and `other` always sit at the end.
 */
export const STORE_ORDER: Record<StoreKey, AisleKey[]> = {
  // Veg at the door, bakery next to it, chilled down one wall, middle aisles, freezers last.
  lidl: ["produce", "bakery", "meat", "chilled", "dairy", "dry", "tins", "sauces", "world", "spices", "baking", "snacks", "drinks", "frozen", "household"],
  // Market Street (veg, bakery, counters) first, then grocery aisles, frozen near the tills.
  morrisons: ["produce", "bakery", "meat", "dairy", "chilled", "tins", "dry", "sauces", "world", "spices", "baking", "snacks", "drinks", "household", "frozen"],
  // Food halls: produce and bakery, big chilled section, small cupboard section, frozen last.
  mands: ["produce", "bakery", "meat", "chilled", "dairy", "dry", "tins", "sauces", "world", "spices", "baking", "snacks", "drinks", "frozen", "household"],
};

export function orderedAisles(store: StoreKey): AisleKey[] {
  return [...STORE_ORDER[store], "other", "pantry"];
}

/** Things most kitchens already have; listed under "Check you have" rather than in the trolley list. */
const PANTRY = new Set([
  "salt",
  "sea salt",
  "pepper",
  "black pepper",
  "salt and pepper",
  "salt and black pepper",
  "ground black pepper",
  "water",
  "boiling water",
  "cold water",
  "warm water",
  "ice",
  "olive oil",
  "extra virgin olive oil",
  "vegetable oil",
  "sunflower oil",
  "rapeseed oil",
  "oil",
  "cooking spray",
  "cooking oil",
]);

export function isPantryStaple(normalizedName: string): boolean {
  return PANTRY.has(normalizedName);
}

/**
 * Keyword → aisle. Multi-word phrases are checked before single words and the longest match
 * wins, so "coconut milk" beats "milk" and "garlic powder" beats "garlic".
 */
const KEYWORDS: Record<Exclude<AisleKey, "other" | "pantry">, string[]> = {
  produce: [
    "apple", "avocado", "banana", "basil", "bean sprout", "beetroot", "blackberry", "blueberry",
    "broccoli", "brussels sprout", "butternut squash", "cabbage", "carrot", "cauliflower", "celeriac",
    "celery", "cherry tomato", "chilli", "chili", "chive", "clementine", "coriander", "courgette",
    "cucumber", "dill", "fennel", "garlic", "ginger", "grape", "green bean", "kale", "leek",
    "lemon", "lemongrass", "lettuce", "lime", "mango", "mint", "mushroom", "onion", "orange",
    "pak choi", "parsley", "parsnip", "pea shoot", "pear", "pepper", "pineapple", "plum",
    "pomegranate", "potato", "radish", "raspberry", "rocket", "rosemary", "sage", "salad",
    "shallot", "spinach", "spring onion", "squash", "strawberry", "sugar snap", "swede",
    "sweet potato", "sweetcorn", "thyme", "tomato", "turnip", "watercress", "mangetout",
    "aubergine", "asparagus", "bok choy", "corn on the cob", "red onion", "scallion",
    "jalapeno", "baby spinach", "new potato", "salad leaves",
  ],
  bakery: [
    "bread", "baguette", "bagel", "brioche", "bun", "ciabatta", "croissant", "crumpet",
    "english muffin", "flatbread", "focaccia", "naan", "pitta", "pita", "roll", "sourdough",
    "tortilla", "wrap", "wholemeal bread", "burger bun", "tortilla wrap",
  ],
  meat: [
    "bacon", "beef", "chicken", "chorizo", "cod", "duck", "fish", "gammon", "haddock", "ham",
    "lamb", "mackerel", "mince", "pancetta", "pork", "prawn", "salmon", "sausage", "sea bass",
    "shrimp", "steak", "tuna steak", "turkey", "venison", "chicken breast", "chicken thigh",
    "beef mince", "pork mince", "lardons", "salami", "prosciutto", "scallop", "mussel", "squid",
  ],
  dairy: [
    "butter", "cheddar", "cheese", "cream", "creme fraiche", "crème fraîche", "double cream",
    "egg", "feta", "goat cheese", "greek yoghurt", "greek yogurt", "gruyere", "halloumi",
    "mascarpone", "milk", "mozzarella", "parmesan", "ricotta", "single cream", "sour cream",
    "yoghurt", "yogurt", "cream cheese", "soft cheese", "paneer", "oat milk", "almond milk",
    "skyr", "quark", "grana padano", "pecorino", "buttermilk",
  ],
  chilled: [
    "hummus", "houmous", "tofu", "fresh pasta", "gnocchi", "pastry", "puff pastry",
    "shortcrust pastry", "filo", "pesto", "tzatziki", "guacamole", "olives", "tempeh",
    "orange juice", "smoked salmon", "cooked chicken", "falafel",
  ],
  dry: [
    "basmati", "bulgur", "couscous", "egg noodle", "farfalle", "fusilli", "lasagne", "linguine",
    "macaroni", "noodle", "oats", "orzo", "pasta", "penne", "porridge oats", "quinoa", "rice",
    "rice noodle", "rigatoni", "spaghetti", "tagliatelle", "lentil", "red lentil", "pearl barley",
    "risotto rice", "arborio", "jasmine rice", "rolled oats", "polenta",
  ],
  tins: [
    "baked beans", "black beans", "borlotti", "butter beans", "cannellini", "chickpea",
    "chopped tomatoes", "coconut milk", "coconut cream", "kidney beans", "passata",
    "plum tomatoes", "tinned tomatoes", "tomato puree", "tomato purée", "tomato paste",
    "tuna", "sweetcorn tin", "jar", "pickle", "capers", "sun-dried tomato", "sundried tomato",
    "roasted peppers", "jalapenos jar", "anchovies", "gherkin",
  ],
  sauces: [
    "barbecue sauce", "bbq sauce", "bouillon", "chutney", "dijon", "gravy", "honey", "jam",
    "ketchup", "mayo", "mayonnaise", "mustard", "peanut butter", "stock", "stock cube",
    "vinegar", "balsamic", "worcestershire", "hot sauce", "sriracha", "tahini", "maple syrup",
    "marmalade", "golden syrup", "red wine vinegar", "white wine vinegar", "cider vinegar",
    "chicken stock", "beef stock", "vegetable stock", "stock pot", "salad cream",
  ],
  world: [
    "soy sauce", "fish sauce", "oyster sauce", "hoisin", "mirin", "miso", "curry paste",
    "thai red curry paste", "thai green curry paste", "gochujang", "rice vinegar", "sesame oil",
    "tortilla chips", "taco", "fajita", "harissa", "tamarind", "sweet chilli sauce", "teriyaki",
    "panko", "kecap manis", "rice paper", "coconut aminos", "chipotle", "nori", "wasabi",
    "tikka paste", "korma paste", "garam masala paste",
  ],
  spices: [
    "bay leaf", "bay leaves", "cardamom", "cayenne", "chilli flakes", "chilli powder",
    "cinnamon", "clove", "cumin", "curry powder", "dried oregano", "dried thyme", "fennel seed",
    "garam masala", "garlic powder", "ground coriander", "ground cumin", "ground ginger",
    "mixed herbs", "mixed spice", "mustard seed", "nutmeg", "onion powder", "oregano",
    "paprika", "smoked paprika", "star anise", "sumac", "turmeric", "za'atar", "italian seasoning",
    "chinese five spice", "five spice", "cajun", "peppercorns", "allspice", "dried chilli",
    "red pepper flakes", "dried basil", "dried parsley", "saffron", "vanilla",
  ],
  baking: [
    "baking powder", "bicarbonate", "brown sugar", "caster sugar", "chocolate", "cocoa",
    "cornflour", "corn starch", "cornstarch", "desiccated coconut", "dried fruit", "flour",
    "icing sugar", "plain flour", "raisins", "self-raising flour", "sugar", "sultanas", "yeast",
    "almonds", "cashews", "nuts", "pecans", "pine nuts", "walnuts", "seeds", "chia",
    "sesame seeds", "flaxseed", "ground almonds", "dark chocolate", "chocolate chips",
    "vanilla extract", "golden caster sugar", "muscovado", "dates", "dried apricots",
    "pumpkin seeds", "sunflower seeds", "peanuts",
  ],
  snacks: [
    "cereal", "granola", "muesli", "crackers", "crisps", "biscuits", "rice cakes",
    "cereal bar", "popcorn", "breadsticks", "oatcakes", "weetabix", "cornflakes",
  ],
  drinks: [
    "beer", "coffee", "juice", "lemonade", "red wine", "sparkling water", "tea", "tonic",
    "white wine", "wine", "squash drink", "cider", "kombucha", "tea bags",
  ],
  frozen: [
    "frozen", "ice cream", "frozen peas", "peas", "frozen berries", "frozen spinach",
    "fish fingers", "oven chips", "frozen sweetcorn", "edamame", "frozen prawns",
  ],
  household: [
    "bin bags", "cling film", "foil", "kitchen roll", "baking paper", "washing up liquid",
    "dishwasher tablets", "toilet roll", "sponges", "freezer bags", "tin foil", "parchment",
    "detergent", "bleach",
  ],
};

const KEYWORD_INDEX: { phrase: string; aisle: AisleKey; re: RegExp }[] = Object.entries(KEYWORDS)
  .flatMap(([aisle, phrases]) =>
    phrases.map((phrase) => ({
      phrase,
      aisle: aisle as AisleKey,
      // Allow simple plurals: "carrot" matches "carrots", "berry" matches "berries".
      re: new RegExp(
        `(^|[^a-z])${phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/y$/, "(y|ies)")}(e?s)?($|[^a-z])`,
        "i",
      ),
    })),
  )
  .sort((a, b) => b.phrase.length - a.phrase.length);

/** Units that mean "it comes in a tin or jar" regardless of the ingredient. */
const TIN_UNITS = new Set(["can", "tin", "jar"]);

export function classifyByKeyword(normalizedName: string, unit?: string | null): AisleKey {
  if (isPantryStaple(normalizedName)) return "pantry";
  if (/\bfrozen\b/i.test(normalizedName)) return "frozen";
  if (/\b(tinned|canned)\b/i.test(normalizedName)) return "tins";
  if (unit && TIN_UNITS.has(unit)) {
    // A tin of coconut milk/tomatoes/beans etc.
    return "tins";
  }
  for (const k of KEYWORD_INDEX) {
    if (k.re.test(normalizedName)) return k.aisle;
  }
  return "other";
}
