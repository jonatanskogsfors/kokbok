import { loadCategories } from "../_utils/cook-reader.js";

export default function () {
  const recipesDir = process.env.RECIPES_DIR ?? "../cookbook-recipes";
  try {
    return loadCategories(recipesDir);
  } catch {
    console.warn(`[categories] Kunde inte läsa RECIPES_DIR="${recipesDir}" – returnerar tom lista.`);
    return [];
  }
}
