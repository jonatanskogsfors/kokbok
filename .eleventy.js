import { mkdirSync, copyFileSync } from "fs";
import { join } from "path";
import { getImageCopyJobs } from "./src/_utils/cook-reader.js";
import QRCode from "qrcode";

export default function (eleventyConfig) {
  // Kopiera statiska filer
  eleventyConfig.addPassthroughCopy("static");

  // Kopiera receptbilder till _site/bilder/[slug].[ext]
  eleventyConfig.on("eleventy.before", () => {
    const recipesDir = process.env.RECIPES_DIR ?? "../cookbook-recipes";
    try {
      const jobs = getImageCopyJobs(recipesDir);
      if (jobs.length) {
        mkdirSync("_site/bilder", { recursive: true });
        for (const { src, dest } of jobs) {
          copyFileSync(src, join("_site", dest));
        }
      }
    } catch (e) {
      console.warn("[bilder] Kunde inte kopiera receptbilder:", e.message);
    }
  });

  // Renderar ett stegs parts till HTML och tar bort mellanslag före skiljetecken
  eleventyConfig.addFilter("renderParts", (parts) => {
    const html = parts.map((part) => {
      if (part.type === "text") return part.value;
      if (part.type === "ingredient") {
        let qtyHtml = "";
        if (part.quantity) {
          const rq = part.rawQuantity;
          const attrs = rq
            ? ` data-amount="${rq.amount}" data-unit="${rq.unit || ""}"${rq.amountMax ? ` data-amount-max="${rq.amountMax}"` : ""}`
            : "";
          qtyHtml = ` (<span class="quantity"${attrs}>${part.quantity}</span>)`;
        }
        return `<span class="ingredient">${part.name}${qtyHtml}</span>`;
      }
      if (part.type === "cookware")
        return `<span class="cookware">${part.name}</span>`;
      if (part.type === "timer")
        return `<span class="timer">${part.name ? part.name + ": " : ""}${part.quantity}</span>`;
      return "";
    }).join(" ");
    return html
      .replace(/  +/g, " ")
      .replace(/ ([.,;:!?)»\]])/g, "$1");
  });

  // QR-kod som inline SVG
  eleventyConfig.addNunjucksAsyncFilter("qrcode", async (url, callback) => {
    try {
      const svg = await QRCode.toString(url, { type: "svg", margin: 1, width: 150 });
      callback(null, svg);
    } catch (e) {
      callback(e);
    }
  });

  // Recept utan kategori
  eleventyConfig.addFilter("withoutCategory", (recipes) =>
    Array.from(recipes).filter((r) => !r.category)
  );

  // Slugify för taggar i templates
  eleventyConfig.addFilter("slugify", (str) =>
    str
      .toLowerCase()
      .replace(/å/g, "a")
      .replace(/ä/g, "a")
      .replace(/ö/g, "o")
      .replace(/\s+/g, "-")
      .replace(/[^a-z0-9-]/g, "")
  );

  return {
    pathPrefix: process.env.ELEVENTY_PATH_PREFIX ?? "/",
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data",
    },
    templateFormats: ["njk", "md", "html"],
    markdownTemplateEngine: "njk",
    htmlTemplateEngine: "njk",
  };
}
