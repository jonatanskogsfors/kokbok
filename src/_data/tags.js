import { loadTags } from "../_utils/cook-reader.js";

export default function () {
  const recipesDir = process.env.RECIPES_DIR ?? "../cookbook-recipes";
  try {
    return loadTags(recipesDir);
  } catch {
    console.warn(`[tags] Kunde inte läsa RECIPES_DIR="${recipesDir}" – returnerar tom lista.`);
    return [];
  }
}
