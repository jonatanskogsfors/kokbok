export default {
  date: new Date().toLocaleString("sv-SE", {
    year: "numeric", month: "numeric", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  }),
};
