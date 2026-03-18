import { Parser } from "@cooklang/cooklang";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join, basename, extname, dirname, resolve, sep, relative } from "path";

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".avif"];

export function findRecipeImage(cookFilePath) {
  const dir = dirname(cookFilePath);
  const base = basename(cookFilePath, ".cook");
  for (const ext of IMAGE_EXTS) {
    const candidate = join(dir, base + ext);
    if (existsSync(candidate)) return { path: candidate, ext };
  }
  return null;
}

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

function extractRawQuantity(qty) {
  if (!qty?.value) return null;
  const v = qty.value;
  if (v.type !== "number") return null;
  const n = v.value;
  if (n.type === "regular") return { amount: n.value, unit: qty.unit ?? null };
  if (n.type === "fraction") return { amount: (n.whole || 0) + n.num / n.den, unit: qty.unit ?? null };
  if (n.type === "range") return { amount: n.start, amountMax: n.end, unit: qty.unit ?? null };
  return null;
}

function formatQuantity(qty) {
  if (!qty) return null;
  const val = qty.value;
  let str = "";
  if (val.type === "number") {
    const n = val.value;
    if (n.type === "regular")  str = String(n.value);
    else if (n.type === "fraction") str = n.whole ? `${n.whole}\u00A0${n.num}/${n.den}` : `${n.num}/${n.den}`;
    else if (n.type === "range") str = `${n.start}–${n.end}`;
  } else if (val.type === "text") {
    str = val.value;
  }
  return qty.unit ? `${str}\u00A0${qty.unit}` : str || null;
}

function resolveItems(items, ingredients, cookware, timers, inlineQuantities) {
  return items.map((item) => {
    if (item.type === "text") return item;
    if (item.type === "ingredient") {
      const ing = ingredients[item.index];
      return { type: "ingredient", name: ing.alias ?? ing.name, quantity: formatQuantity(ing.quantity), rawQuantity: extractRawQuantity(ing.quantity) };
    }
    if (item.type === "cookware") {
      const cw = cookware[item.index];
      return { type: "cookware", name: cw.alias ?? cw.name };
    }
    if (item.type === "timer") {
      const t = timers[item.index];
      return { type: "timer", name: t.name, quantity: formatQuantity(t.quantity) };
    }
    if (item.type === "inlineQuantity") {
      return { type: "text", value: formatQuantity(inlineQuantities[item.index]) ?? "" };
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
      rawQuantity: extractRawQuantity(ing.quantity),
      note: ing.note ?? null,
    }));

  const cookware = raw.cookware
    .filter((cw) => cw.relation?.type === "definition")
    .map((cw) => ({
      name: cw.alias ?? cw.name,
      quantity: formatQuantity(cw.quantity),
      rawQuantity: extractRawQuantity(cw.quantity),
      note: cw.note ?? null,
    }));

  const sections = raw.sections.map((section) => {
    const ingIndices = new Set();
    const cwIndices = new Set();

    const steps = section.content
      .filter((c) => c.type === "step")
      .map((c) => {
        for (const item of c.value.items) {
          if (item.type === "ingredient") ingIndices.add(item.index);
          if (item.type === "cookware") cwIndices.add(item.index);
        }
        return {
          number: c.value.number,
          parts: resolveItems(c.value.items, raw.ingredients, raw.cookware, raw.timers, raw.inline_quantities ?? []),
        };
      });

    const sectionIngredients = [...ingIndices]
      .filter((i) => raw.ingredients[i]?.relation?.relation?.type === "definition")
      .map((i) => {
        const ing = raw.ingredients[i];
        return { name: ing.alias ?? ing.name, quantity: formatQuantity(ing.quantity), rawQuantity: extractRawQuantity(ing.quantity), note: ing.note ?? null };
      });

    const sectionCookware = [...cwIndices]
      .filter((i) => raw.cookware[i]?.relation?.type === "definition")
      .map((i) => {
        const cw = raw.cookware[i];
        return { name: cw.alias ?? cw.name, quantity: formatQuantity(cw.quantity), rawQuantity: extractRawQuantity(cw.quantity), note: cw.note ?? null };
      });

    return { name: section.name ?? null, steps, ingredients: sectionIngredients, cookware: sectionCookware };
  });

  const image = findRecipeImage(filePath);
  const ingredientSectionCount = sections.filter((s) => s.ingredients.length).length;
  const cookwareSectionCount = sections.filter((s) => s.cookware.length).length;

  return { title, tags, meta, ingredients, cookware, sections, ingredientSectionCount, cookwareSectionCount, imageExt: image?.ext ?? null };
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
      const { title, tags, meta, ingredients, cookware, sections, ingredientSectionCount, cookwareSectionCount, imageExt } = parseRecipe(filePath);

      const parentDir = resolve(dirname(filePath));
      const isCategory = categoryDirs.has(parentDir);
      const category = isCategory ? basename(parentDir) : null;
      const categorySlug = category ? slugify(category) : null;

      const relativePath = relative(recipesDir, filePath)
        .split(sep)
        .map(encodeURIComponent)
        .join("/");
      const rawFileUrl = `https://raw.githubusercontent.com/jonatanskogsfors/receptbok/main/${relativePath}`;

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
        ingredientSectionCount,
        cookwareSectionCount,
        imageUrl: imageExt ? `/bilder/${slugify(basename(filePath, ".cook"))}${imageExt}` : null,
        rawFileUrl,
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

export function getImageCopyJobs(recipesDir) {
  const cookFiles = findCookFiles(recipesDir);
  const jobs = [];
  for (const filePath of cookFiles) {
    const image = findRecipeImage(filePath);
    if (image) {
      const slug = slugify(basename(filePath, ".cook"));
      jobs.push({ src: image.path, dest: `bilder/${slug}${image.ext}` });
    }
  }
  return jobs;
}

export function loadTags(recipesDir) {
  const recipes = loadRecipes(recipesDir);
  const map = new Map();
  for (const recipe of recipes) {
    for (const tag of recipe.tags) {
      const slug = slugify(tag);
      if (!map.has(slug)) {
        map.set(slug, { name: tag, slug, recipes: [] });
      }
      map.get(slug).recipes.push(recipe);
    }
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "sv"));
}
