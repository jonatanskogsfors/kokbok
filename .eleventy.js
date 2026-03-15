export default function (eleventyConfig) {
  // Kopiera statiska filer
  eleventyConfig.addPassthroughCopy("static");

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
