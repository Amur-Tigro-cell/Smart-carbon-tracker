/* =============================================
   data.js — Emission factors & static content
   ============================================= */

/* kg CO₂e per unit */
const EMISSION_FACTORS = {
  transport: {
    car_petrol:   0.192,   // per km
    car_diesel:   0.171,
    car_electric: 0.053,
    car_hybrid:   0.108,
    motorcycle:   0.114,
    bus:          0.089,
    train:        0.041,
    flight_short: 0.255,
    flight_long:  0.195,
    bicycle:      0.000,
  },
  electricity: {
    electricity_grid: 0.233,  // per kWh (world avg)
    electricity_solar: 0.020,
    renewable_electricity: 0.015,
  },
  home_energy: {
    natural_gas:       0.202,
    heating_oil:       0.267,
    coal:              0.341,
    lpg:               0.214,
    district_heating:  0.180,
  },
  food: {
    beef:       27.0,   // per kg
    lamb:       25.0,
    pork:        7.6,
    chicken:     6.9,
    fish:        6.1,
    dairy:       3.2,
    eggs:        4.5,
    vegetables:  2.0,
    fruits:      1.1,
    grains:      2.7,
    legumes:     0.9,
  },
  shopping: {
    clothing:        33.0,  // per $100 spent → scaled
    electronics:     70.0,
    furniture:       25.0,
    books_paper:      4.0,
    plastic_goods:   30.0,
    metal_goods:     40.0,
    online_delivery:  0.5, // per parcel/unit treated as "amount"=1
  },
  waste: {
    general_waste: 0.57,   // per kg
    recycling:    -0.15,   // negative = offset
    composting:   -0.10,
    food_waste:    1.30,
  },
};

/* Category metadata */
const CATEGORY_META = {
  transport:   { label: 'Transport',   icon: '🚗', color: '#3b82f6' },
  electricity: { label: 'Electricity', icon: '⚡', color: '#f59e0b' },
  food:        { label: 'Food',        icon: '🍽️', color: '#ec4899' },
  shopping:    { label: 'Shopping',    icon: '🛍️', color: '#8b5cf6' },
  home_energy: { label: 'Home Energy', icon: '🏠', color: '#14b8a6' },
  waste:       { label: 'Waste',       icon: '🗑️', color: '#6b7280' },
};

/* Unit labels per category */
const UNIT_LABELS = {
  transport:   'km',
  electricity: 'kWh',
  food:        'kg',
  shopping:    'USD',
  home_energy: 'kWh',
  waste:       'kg',
};

/* Quick-add presets */
const PRESETS = [
  { label: 'Daily commute (car, 20km)', cat: 'transport', type: 'car_petrol',  amount: 20,   note: 'Daily commute' },
  { label: 'Return flight (short haul)', cat: 'transport', type: 'flight_short', amount: 500,  note: 'Short haul return' },
  { label: 'Weekly electricity (30 kWh)', cat: 'electricity', type: 'electricity_grid', amount: 30, note: 'Weekly electricity' },
  { label: 'Beef meal (250g)',            cat: 'food',      type: 'beef',       amount: 0.25, note: 'Beef meal' },
  { label: 'Chicken meal (200g)',         cat: 'food',      type: 'chicken',    amount: 0.2,  note: 'Chicken meal' },
  { label: 'Weekly groceries ($80)',      cat: 'shopping',  type: 'clothing',   amount: 80,   note: 'Weekly groceries' },
  { label: 'Home heating (25 kWh)',       cat: 'home_energy', type: 'natural_gas', amount: 25, note: 'Home heating' },
];

/* Eco Tips */
const ECO_TIPS = [
  // Transport
  { cat: 'transport', emoji: '🚲', title: 'Switch to cycling or walking', desc: 'Cycling or walking instead of driving for short trips under 5km can dramatically cut your transport emissions.', saving: 'Save up to 2.4 kg CO₂e per 12 km avoided' },
  { cat: 'transport', emoji: '🚌', title: 'Use public transport', desc: 'A bus or train emits 3–5× less CO₂ per passenger than a petrol car for the same journey.', saving: 'Save ~1.0 kg CO₂e per 10 km' },
  { cat: 'transport', emoji: '🔌', title: 'Consider an electric vehicle', desc: 'EVs emit 60–70% less CO₂ per km than petrol cars, even accounting for the grid mix.', saving: 'Save ~1.4 kg CO₂e per 10 km vs petrol' },
  { cat: 'transport', emoji: '🏠', title: 'Work from home when possible', desc: 'A single work-from-home day avoids your round-trip commute emissions entirely.', saving: 'Average 2–4 kg CO₂e per avoided commute day' },
  { cat: 'transport', emoji: '✈️', title: 'Reduce air travel', desc: 'A single long-haul flight can equal months of driving. Consider trains or video calls.', saving: '~1–3 tonnes CO₂e per avoided long-haul flight' },
  // Electricity
  { cat: 'electricity', emoji: '💡', title: 'Switch to LED lighting', desc: 'LEDs use 75–80% less electricity than incandescent bulbs and last much longer.', saving: 'Save ~40 kg CO₂e per year per household' },
  { cat: 'electricity', emoji: '🌞', title: 'Install solar panels', desc: 'Rooftop solar can supply most of a household\'s electricity needs with near-zero operational emissions.', saving: 'Save 1–2 tonnes CO₂e per year' },
  { cat: 'electricity', emoji: '🔋', title: 'Use a smart power strip', desc: 'Standby electronics consume 5–10% of home electricity. Smart strips cut standby power automatically.', saving: 'Save 50–100 kg CO₂e per year' },
  // Home energy
  { cat: 'home_energy', emoji: '🌡️', title: 'Lower your thermostat', desc: 'Turning your heating down by 1°C can reduce household heating energy use by about 8–10%.', saving: 'Save ~230 kg CO₂e per year' },
  { cat: 'home_energy', emoji: '🪟', title: 'Improve home insulation', desc: 'Better insulation reduces the amount of fuel needed for heating and cooling throughout the year.', saving: 'Save 10–25% on home energy emissions' },
  // Food
  { cat: 'food', emoji: '🥗', title: 'Eat more plant-based meals', desc: 'Plant-based foods emit 10–50× less CO₂ than red meat. Even one meat-free day per week helps.', saving: 'Save ~52 kg CO₂e per year (1 day/week)' },
  { cat: 'food', emoji: '🐄', title: 'Cut back on beef', desc: 'Beef produces far more emissions than any other food. Swapping to chicken or legumes makes a big difference.', saving: 'Save ~20 kg CO₂e per kg of beef avoided' },
  { cat: 'food', emoji: '🌱', title: 'Buy local and seasonal food', desc: 'Food transport accounts for ~6% of food emissions. Local and seasonal produce tends to have lower food miles.', saving: 'Save 5–10% on food emissions' },
  { cat: 'food', emoji: '🥕', title: 'Reduce food waste', desc: 'About 30% of food produced is wasted, responsible for 8% of global emissions. Plan meals and use leftovers.', saving: 'Save 50–200 kg CO₂e per year' },
  // Shopping
  { cat: 'shopping', emoji: '👗', title: 'Buy second-hand clothing', desc: 'The fashion industry emits 10% of global CO₂. Buying second-hand cuts garment emissions by up to 80%.', saving: 'Save ~15 kg CO₂e per second-hand garment' },
  { cat: 'shopping', emoji: '📱', title: 'Keep electronics longer', desc: 'Manufacturing a smartphone emits ~70 kg CO₂e. Keeping it one extra year halves its annual footprint.', saving: 'Save 35+ kg CO₂e per extra year of use' },
  { cat: 'shopping', emoji: '♻️', title: 'Choose products with minimal packaging', desc: 'Packaging waste is a significant contributor to manufacturing emissions. Opt for bulk or refillable options.', saving: 'Variable, typically 10–30% of product footprint' },
  // Waste
  { cat: 'shopping', emoji: '🗑️', title: 'Recycle correctly', desc: 'Recycling aluminium uses 95% less energy than producing it from scratch. Always separate waste correctly.', saving: 'Save ~10 kg CO₂e per kg of aluminium recycled' },
  { cat: 'food', emoji: '🌿', title: 'Start composting', desc: 'Food waste in landfill produces methane, a potent greenhouse gas. Composting dramatically reduces this.', saving: 'Save ~0.5 kg CO₂e per kg composted' },
  { cat: 'shopping', emoji: '🔄', title: 'Repair before replacing', desc: 'Repairing broken items instead of buying new avoids the full manufacturing carbon cost of the replacement.', saving: 'Save 50–100% of new product emissions' },
];

/* Type-to-tip mapping for personalised recommendations */
const TIP_TYPE_MAP = {
  'Switch to cycling or walking':           ['car_petrol','car_diesel','car_hybrid','motorcycle'],
  'Use public transport':                   ['car_petrol','car_diesel','car_hybrid','motorcycle'],
  'Consider an electric vehicle':           ['car_petrol','car_diesel','car_hybrid'],
  'Work from home when possible':           ['car_petrol','car_diesel','car_hybrid','motorcycle'],
  'Reduce air travel':                      ['flight_short','flight_long'],
  'Switch to LED lighting':                 ['electricity_grid'],
  'Install solar panels':                   ['electricity_grid','electricity_solar'],
  'Use a smart power strip':                ['electricity_grid'],
  'Lower your thermostat':                  ['natural_gas','heating_oil','coal','lpg','district_heating'],
  'Improve home insulation':                ['natural_gas','heating_oil','coal','lpg'],
  'Eat more plant-based meals':             ['beef','lamb','pork','dairy'],
  'Cut back on beef':                       ['beef','lamb'],
  'Buy local and seasonal food':            ['vegetables','fruits'],
  'Reduce food waste':                      ['beef','lamb','pork','chicken','fish','dairy','eggs','vegetables','fruits','grains','legumes'],
  'Buy second-hand clothing':               ['clothing'],
  'Keep electronics longer':                ['electronics'],
  'Choose products with minimal packaging': ['plastic_goods','furniture','metal_goods','online_delivery','clothing','books_paper'],
  'Recycle correctly':                      ['clothing','electronics','furniture','plastic_goods','metal_goods'],
  'Start composting':                       ['vegetables','legumes','grains','fruits'],
  'Repair before replacing':                ['electronics','furniture','clothing','metal_goods'],
};
