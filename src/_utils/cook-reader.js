import { Parser } from "@cooklang/cooklang";
import { readFileSync, readdirSync } from "fs";
import { join, basename, extname, dirname, resolve } from "path";

const parser = new Parser();

export function slugify(name) {
  return name
    .toLowerCase()
    .replace(/å/g, "a")
    .replace(/ä/g, "a")
    .replace(/ö/g, "o")
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function formatQuantity(qty) {
  if (!qty) return null;
  const val = qty.value;
  let str = "";
  if (val.type === "number") {
    const n = val.value;
    if (n.type === "regular")  str = String(n.value);
    else if (n.type === "fraction") str = n.whole ? `${n.whole} ${n.num}/${n.den}` : `${n.num}/${n.den}`;
    else if (n.type === "range") str = `${n.start}–${n.end}`;
  } else if (val.type === "text") {
    str = val.value;
  }
  return qty.unit ? `${str} ${qty.unit}` : str || null;
}

function resolveItems(items, ingredients, cookware, timers) {
  return items.map((item) => {
    if (item.type === "text") return item;
    if (item.type === "ingredient") {
      const ing = ingredients[item.index];
      return { type: "ingredient", name: ing.alias ?? ing.name, quantity: formatQuantity(ing.quantity) };
    }
    if (item.type === "cookware") {
      const cw = cookware[item.index];
      return { type: "cookware", name: cw.alias ?? cw.name };
    }
    if (item.type === "timer") {
      const t = timers[item.index];
      return { type: "timer", name: t.name, quantity: formatQuantity(t.quantity) };
    }
    return item;
  });
}

function parseRecipe(filePath) {
  const source = readFileSync(filePath, "utf-8");
  const raw = JSON.parse(parser.parse_full(source, true).value);

  const meta = raw.raw_metadata?.map ?? {};
  const title = meta.title ?? basename(filePath, ".cook");
  const tags = Array.isArray(meta.tags) ? meta.tags : (meta.tags ? String(meta.tags).split(",").map((t) => t.trim()) : []);

  const ingredients = raw.ingredients
    .filter((ing) => ing.relation?.relation?.type === "definition")
    .map((ing) => ({
      name: ing.alias ?? ing.name,
      quantity: formatQuantity(ing.quantity),
      note: ing.note ?? null,
    }));

  const cookware = raw.cookware
    .filter((cw) => cw.relation?.type === "definition")
    .map((cw) => ({
      name: cw.alias ?? cw.name,
      quantity: formatQuantity(cw.quantity),
      note: cw.note ?? null,
    }));

  const sections = raw.sections.map((section) => ({
    name: section.name ?? null,
    steps: section.content
      .filter((c) => c.type === "step")
      .map((c) => ({
        number: c.value.number,
        parts: resolveItems(c.value.items, raw.ingredients, raw.cookware, raw.timers),
      })),
  }));

  return { title, tags, meta, ingredients, cookware, sections };
}

function findCategoryDirs(dir) {
  const categories = new Set();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const subDir = join(dir, entry.name);
      const hasCook = readdirSync(subDir, { withFileTypes: true }).some(
        (f) => f.isFile() && extname(f.name) === ".cook"
      );
      if (hasCook) categories.add(resolve(subDir));
    }
  }
  return categories;
}

function findCookFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      results.push(...findCookFiles(join(dir, entry.name)));
    } else if (entry.isFile() && extname(entry.name) === ".cook") {
      results.push(join(dir, entry.name));
    }
  }
  return results;
}

export function loadRecipes(recipesDir) {
  const cookFiles = findCookFiles(recipesDir);
  const categoryDirs = findCategoryDirs(recipesDir);

  return cookFiles
    .map((filePath) => {
      const { title, tags, meta, ingredients, cookware, sections } = parseRecipe(filePath);

      const parentDir = resolve(dirname(filePath));
      const isCategory = categoryDirs.has(parentDir);
      const category = isCategory ? basename(parentDir) : null;
      const categorySlug = category ? slugify(category) : null;

      return {
        slug: slugify(basename(filePath, ".cook")),
        title,
        tags,
        category,
        categorySlug,
        servings: meta.servings ?? null,
        description: meta.description ?? null,
        ingredients,
        cookware,
        sections,
      };
    })
    .sort((a, b) => a.title.localeCompare(b.title, "sv"));
}

export function loadCategories(recipesDir) {
  const recipes = loadRecipes(recipesDir);
  const map = new Map();
  for (const recipe of recipes) {
    if (!recipe.category) continue;
    if (!map.has(recipe.categorySlug)) {
      map.set(recipe.categorySlug, { name: recipe.category, slug: recipe.categorySlug, recipes: [] });
    }
    map.get(recipe.categorySlug).recipes.push(recipe);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "sv"));
}
