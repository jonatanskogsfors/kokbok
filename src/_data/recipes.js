import { loadRecipes } from "../_utils/cook-reader.js";

export default function () {
  const recipesDir = process.env.RECIPES_DIR ?? "../cookbook-recipes";
  try {
    return loadRecipes(recipesDir);
  } catch {
    console.warn(`[recipes] Kunde inte läsa RECIPES_DIR="${recipesDir}" – returnerar tom lista.`);
    return [];
  }
}
