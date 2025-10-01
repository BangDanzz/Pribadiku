const puppeteer = require("puppeteer");
const fs = require("fs/promises");

const getProductsShopee = async (page) => {
  let shopee = [];
  let i = 1;
  let val = 400;
  while (i < 11) {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    shopee = await page.evaluate(() => {
      return Array.from(
        document.querySelectorAll(
          ".col-xs-2-4.shopee-search-item-result__item"
        ),
        (e) => ({
          productLink: e.querySelector("a")?.href,
          productImage: e
            .querySelector(".tWpFe2 .VTjd7p.whIxGK .yvbeD6.KUUypF img")
            ?.getAttribute("src"),
          // productLocation: e.querySelector(
          //   ".tWpFe2 .VTjd7p.whIxGK .KMyn8J .zGGwiV"
          // )?.innerText,
          productName: e.querySelector(".tWpFe2 .VTjd7p.whIxGK .KMyn8J .dpiR4u")
            ?.textContent,
          productPrice: e.querySelector(
            ".tWpFe2 .VTjd7p.whIxGK .KMyn8J .hpDKMN"
          )?.textContent,
          productSold: e.querySelector(".tWpFe2 .VTjd7p.whIxGK .KMyn8J .ZnrnMl")
            ?.textContent,
        })
      );
    });
    await page.evaluate(`window.scrollTo(0,${val})`);
    val += 400;
    i += 1;
  }
  return shopee;
};

const getProductsLazada = async (page) => {
  let lazada = [];
  let i = 1;
  let val = 400;
  while (i < 12) {
    await new Promise((resolve) => setTimeout(resolve, 1500));

    lazada = await page.evaluate(() => {
      return Array.from(document.querySelectorAll(".Bm3ON "), (e) => ({
        shop: "lazada",
        productLink: e.querySelector("._95X4G a")?.href,
        productImage: e
          .querySelector(".ICdUp ._95X4G .picture-wrapper img")
          ?.getAttribute("src"),
        productName: e.querySelector(".buTCk .RfADt a")?.innerText,
        productPrice: e.querySelector(".buTCk .aBrP0")?.textContent,
        productSold: e.querySelector(".buTCk ._6uN7R ._1cEkb")?.textContent,
        // productTotalRating: e.querySelector(
        //   ".buTCk ._6uN7R .mdmmT._32vUv .qzqFw"
        // )?.innerText,
        // productLocation: e.querySelector(".buTCk ._6uN7R .oa6ri ")?.innerText,
      }));
    });
    await page.evaluate(`window.scrollTo(0,${val})`);
    val += 400;
    i += 1;
  }

  return lazada;
};

const getProduct = async (url) => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();

  let products;

  await page.goto(url, { waitUntil: "networkidle2" });
  if (url.includes("shopee")) {
    products = await getProductsShopee(page);
  } else {
    products = await getProductsLazada(page);
  }
  await browser.close();

  return products;
};

module.exports = { getProduct };