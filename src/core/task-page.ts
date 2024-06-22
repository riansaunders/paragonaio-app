import cheerio from "cheerio";

export class TaskPage {
  url: string;
  html: string;
  document: cheerio.Root;

  constructor(url: string, html: string) {
    this.url = decodeURI(url);
    this.html = html;
    this.document = cheerio.load(html);
  }

  removeAllExceptSelectorFromHtml(selector: string) {
    const page = Object.assign({}, this);
    const checkpoint = page.document(selector);

    const bad = "cdn.shopify.com";
    page
      .document("body")
      .children()
      .each((_, c) => {
        const el = cheerio(c);
        const href = el.attr("href") || "";
        const src = el.attr("src") || "";
        if (
          !el.is("script") ||
          src.includes(bad) ||
          src.includes("klaviyo") ||
          src.includes("zendesk") ||
          src.includes("shopify/") ||
          src.includes("zdassets") ||
          src.includes("myshopify.com") ||
          src.includes("usercentrics") ||
          el.attr("dns-prefetch") ||
          el.attr("name") === "commit" ||
          (el.is("script") && el.html()?.toLowerCase().includes("asyncload")) ||
          (el.is("script") && el.hasClass("analytics"))
        ) {
          el.remove();
        }
      });
    page
      .document("head")
      .children()
      .each((_, c) => {
        const el = cheerio(c);
        const href = el.attr("href") || "";
        const src = el.attr("src") || "";
        if (
          href.includes(bad) ||
          src.includes(bad) ||
          src.includes("storefront.min.js") ||
          src.includes("klaviyo") ||
          src.includes("zendesk") ||
          src.includes("shopify/") ||
          src.includes("zdassets") ||
          src.includes("myshopify.com") ||
          src.includes("usercentrics") ||
          el.attr("dns-prefetch") ||
          (el.is("script") && el.html()?.toLowerCase().includes("asyncload")) ||
          (el.is("script") && el.hasClass("analytics"))
        ) {
          el.remove();
        }
      });

    page.document("body").append(checkpoint);

    return page.document.html();
  }

  setDocValue(selector: string, value: string) {
    this.document(`[name='${selector}']`).val(value);
  }
  setDocValueAll(selector: string, value: string) {
    this.document(`[name='${selector}']`).each((_, e) => cheerio(e).val(value));
  }

  getDocValue(selector: string) {
    return this.document(`[name='${selector}']`).val();
  }
}
