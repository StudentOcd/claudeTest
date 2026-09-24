# Leve: gentle fat-loss coach for a sensitive gut

Leve is a small personal web app (it works on your phone too). It turns a fat-loss plan into daily actions:

- **Daily targets.** Calories, protein, fat, carbs and fibre from your profile. Weeks 1–2 are an easier "settle" phase, then a moderate deficit. Every week it checks your weight trend and suggests adjustments.
- **Nutrition you can check.** Every food's values come from **CIQUAL 2025** (ANSES), the EU food composition table, calculated like EU labels. When Leve has read the label of the product you actually buy, it uses that label instead, after sanity checks.
- **Meal plan with exact quantities.** 24 simple recipes, all dairy-free with no onion, garlic or sweeteners (one optional lactose-free test recipe for later). Portions are rescaled to your targets: raw weights, cooked weights, eggs, slices and teaspoons. Each recipe has step-by-step cooking (air fryer, oven, pan, saucepan), batch-cooking suggestions and a one-tap meal swap.
- **Gradual gut transition.** Three phases: *Settle → Build → Expand*. A 30-second symptom check (bloating, pain, urgency, reflux, Bristol stool type) keeps you in a phase or moves you on. Leve also flags foods that may be triggers.
- **Shopping list with real products.** Every food is linked to real **Pingo Doce**, **Auchan** and **Mercadona** products, with their **photos**, prices and price per kg. A built-in crawler downloads them from the stores' online shops. The list works out packs to buy, the cost per store and what's left over. Tap any item for a product sheet: big photo, alternatives from the same shelf, and your own receipt prices.
- **Label checker.** Flags lactose, sugar alcohols (sorbitol, maltitol…), sweeteners, onion/garlic, inulin and more, in Portuguese labels. It works on store product pages, Open Food Facts barcodes or any pasted ingredient list.
- **Weight trend.** A smoothed trend line, weekly rate, waist tracking, and a maintenance estimate learned from your own data.
- **Hevy integration.** Syncs your workouts and shows sessions per week and strength trends (estimated 1RM). It can **create the 3×/week full-body programme in your Hevy app** and syncs body weight both ways.

Everything runs on your own computer. Your data stays in one file (`data/leve.json`).

---

## 1. Start it

You need [Node.js](https://nodejs.org) **20 or newer**. There are no other dependencies and no `npm install`.

```bash
git clone <this repo> leve && cd leve
npm start
```

Open **http://localhost:3000**. The first screen is pre-filled with your details (26 y, 167 cm, 95 kg, sedentary, lifting 3×/week). Press **Start my plan today**.

On the first start Leve fetches the real products and their photos from Pingo Doce, Auchan and Mercadona in the background, about 5–10 minutes. The progress shows on the Today and Shop tabs. Until a photo arrives, a food shows a plain tile.

## 2. Use it on your phone

Run Leve on your computer so the phone can reach it (a password is required whenever Leve listens on the network):

```bash
HOST=0.0.0.0 APP_PASSWORD=choose-something npm start
# Windows PowerShell:  $env:HOST="0.0.0.0"; $env:APP_PASSWORD="choose-something"; npm start
```

The terminal prints an address like `http://192.168.1.20:3000`. Open it on your phone (same Wi-Fi) and log in with any username plus that password. Then add it to your home screen.

To use it **inside the supermarket, away from home Wi-Fi**, install [Tailscale](https://tailscale.com) (free) on both devices. Your phone then reaches the computer from anywhere. With `tailscale serve`, you also get HTTPS, which turns on offline mode and camera barcode scanning.

## 3. Connect Hevy (optional)

Hevy's API requires **Hevy Pro**.

1. On the web, open [hevy.com/settings?developer](https://hevy.com/settings?developer) and create an API key.
2. In Leve, go to **Gym → paste the key → Connect**. Your workouts sync and appear with charts.
3. Press **Create these routines in Hevy** to add the two full-body routines (A and B) to your Hevy app.
4. Optionally, turn on **Send each new weigh-in to Hevy**.

The key is stored only on your Leve server and is never sent back to the browser.

## 4. Real products, photos and prices

| Store | Products and photos | Prices |
|---|---|---|
| **Pingo Doce** | pingodoce.pt product pages and shelves | Live from the product page |
| **Auchan** | auchan.pt product pages and shelves | Live (Lisbon reference prices) |
| **Mercadona** | Its Spanish online shop, tienda.mercadona.es (same Hacendado products) | Spanish prices as a **guide**, plus your receipt prices and [Open Prices](https://prices.openfoodfacts.org) |

- **Shop → Update** (or the automatic first run) crawls the stores for every food in your plan. It finds products in the **sitemaps** the stores publish for crawlers (about 10,000 food products at Pingo Doce and 28,000 at Auchan), keeps only names that really are that food, and reads the best few product pages. From each page it saves the photo (400 px), name, price, price per kg, pack size, barcode and the **nutrition label**, in `data/products/`. Photos are served by Leve itself, so they also work offline in the supermarket.
- **Nutrition labels** are read from the store page. Pingo Doce shows them as a table, Auchan as one sentence, and both are handled. When a page has no label but has a barcode, the label comes from **Open Food Facts** for that exact barcode, which is how Mercadona products get theirs. Fresh meat, fish and loose fruit and vegetables have no label (the law doesn't require one), so they use CIQUAL.
- Products a store no longer sells are dropped automatically. The product your list uses is your pick first, then the best-matching real product on sale, with the store's own brand first.
- A product only counts for a food if its name says so: "Peito/Bife de Peru" is never filed under chicken, "Ovos Moles" is not eggs, and "Atum em azeite" is not tuna in water.
- The crawler follows each store's `robots.txt`: it never touches their search or checkout pages, and waits 1.5–2 s between pages. Results are cached for 12 hours (sitemaps for 24 hours).
- **Tap an item** for its product sheet. Switch stores, pick another product from the shelf (with photos), open it on the store website, or type the shelf or receipt price. Your prices always win.
- **Products** (search icon, top right) shows all your plan's products with photos, searches the stores or Open Food Facts, and checks barcodes and labels for your gut triggers.
- These are **unofficial** readers of public pages, for personal use. Store websites change, so if something stops working, run the diagnostic below. Please respect the stores' terms of use.

Crawl from the command line (same result as **Update**):

```bash
npm run crawl                                    # all foods, all three stores → data/products/
npm run crawl -- --store pingodoce,auchan --food chicken_breast,eggs
npm run crawl -- --out public/products           # bundle the photos with the app (e.g. before deploying)
```

The computer running Leve needs internet access to `www.pingodoce.pt`, `www.auchan.pt`, `tienda.mercadona.es` and `prod-mercadona.imgix.net`. Set `LEVE_AUTO_CRAWL=0` to turn off the automatic first run.

Check every connection from your computer:

```bash
npm run check:connectors                      # stores, Open Food Facts, Open Prices
HEVY_API_KEY=your-key npm run check:connectors # + Hevy
```

It prints ✓/✗ per connector and saves the raw store pages in `data/debug/`, so parsers can be fixed if a website changed.

## 5. Where the numbers come from

- **Per 100 g values:** [CIQUAL 2025](https://ciqual.anses.fr) (ANSES, France). Energy follows EU Regulation 1169/2011 and carbohydrates exclude fibre, exactly as on Portuguese labels. Each food cites its CIQUAL code (`src/core/reference-nutrition.js`, generated by `npm run build:nutrition -- path/to/CIQUAL2025_ENG_2025_11_03.csv`; never edited by hand). A test checks every food's energy against its own protein, carbs, fat, fibre and organic acids.
- **Product labels:** after **Shop → Update**, the label of the product you buy replaces the reference for that food. It is used only if its energy matches its macros and it is no more than 40% below or 60% above the reference, which catches per-portion columns and misread tables. You can turn this off in **Settings → Food preferences**. Each product sheet shows your plan's values, the label and CIQUAL side by side.
- **Weighing:** recipes give raw weights for meat, fish and vegetables (after peeling), dry weights for rice, pasta and oats, and drained weight for tuna. The "≈ cooked" hint is measured from CIQUAL raw vs cooked entries. By that measure rice cooks to about 2.3× its dry weight and chicken breast to about 0.78× its raw weight.
- **Peel and pieces:** the edible share and weight per piece (egg, banana, orange…) come from USDA SR28. The shopping list adds the peel back and rounds up, so you never buy less than the plan needs.

## 6. Settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `HOST` | `127.0.0.1` | `0.0.0.0` to allow other devices (needs `APP_PASSWORD`) |
| `APP_PASSWORD` | – | Password for the whole app (HTTP basic auth) |
| `DATA_DIR` | `./data` | Where `leve.json` and the cache live |
| `ALLOW_NO_PASSWORD` | – | `1` to allow network access without a password (trusted networks only) |
| `LEVE_AUTO_CRAWL` | `1` | `0` to skip fetching products and photos when none are downloaded yet |

**Backups:** use **Settings → Download backup** (the Hevy key is left out), or copy `data/leve.json`.

## 7. Docker (optional)

```bash
docker build -t leve .
docker run -d -p 3000:3000 -e APP_PASSWORD=choose-something -v leve-data:/data --name leve leve
```

## 8. Development

```bash
npm test          # 84 unit + integration tests (node:test, no dependencies)
npm run dev       # restart on file changes
```

```
src/core/        shared logic, used by the server, the browser and the tests
  nutrition.js   BMR/TDEE, targets, phases, meal budgets
  weight.js      trend, weekly rate, adaptive maintenance, weekly check-in
  foods.js       food catalogue: nutrition, gut notes, pack sizes, estimated prices
  recipes.js     recipes with steps
  planner.js     portion scaling and daily/weekly plans
  shopping.js    shopping list, packs, costs per store
  products.js    real Pingo Doce / Auchan products for each food
  reference-nutrition.js  CIQUAL 2025 values per food (generated)
  labels.js      product label checks and label-over-reference nutrition
  match.js       which store product names count as which food
  gut.js         label scanner, symptom scoring, trigger finder
  training.js    Hevy workout stats, programme, routine payloads
server/          zero-dependency HTTP server, JSON storage, API and connectors
  crawler.js     store crawler: products, photos, prices → data/products/
public/          the web app (vanilla JS modules, installable PWA; Plus Jakarta Sans + Lucide icons)
scripts/         connector diagnostic, crawler CLI
test/            tests
```

## Disclaimer

Leve gives general nutrition and training guidance. It is not medical advice. With ongoing gut symptoms, see your doctor (GP / *médico de família*). Get a coeliac blood test **before** cutting out gluten. A dietitian (*nutricionista*) can guide a proper low-FODMAP trial. The Gut tab lists red-flag symptoms that need a doctor promptly.
