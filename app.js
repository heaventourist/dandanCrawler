// open -n -a /Applications/Google\ Chrome.app/Contents/MacOS/Google\ Chrome --args --user-data-dir="/tmp/chrome_dev_test" --disable-web-security

const URL = "https://www.dandanzan.com";
const CACHE_FILE_NAME = "dandanCache.json";
const PARSER = new DOMParser();
const LIMIT = 2983;
const USE_LOCAL = true;
const MAX_CONCURRENT_FETCH = 100;
const PAGE_SIZE = 20;

let localData = {};
let localCACHE_FILE_NAMEIndex = 0;
let currentFetchNumber = 0;
let currentView = [];
let currentViewIndex = 0;
let currentClassification = "";
let currentCountry = "";
let currentYear = "";
let currentTitle = "";
let currentRate = "";

const onLoad = async (event) => {
  const form = document.getElementById("form");
  form.addEventListener("submit", onFormSubmit);
  const prevTop = document.getElementById("prev-page-top");
  const nextTop = document.getElementById("next-page-top");
  const prevBottom = document.getElementById("prev-page-bottom");
  const nextBottom = document.getElementById("next-page-bottom");
  [prevTop, prevBottom].forEach((element) =>
    element.addEventListener("click", () => {
      if (currentViewIndex - PAGE_SIZE >= 0) {
        currentViewIndex -= PAGE_SIZE;
        render();
      }
    })
  );
  [nextTop, nextBottom].forEach((element) =>
    element.addEventListener("click", () => {
      if (currentViewIndex + PAGE_SIZE < currentView.length) {
        currentViewIndex += PAGE_SIZE;
        render();
      }
    })
  );
  const response = await fetch(CACHE_FILE_NAME);
  localData = await response.json();
  Object.keys(localStorage).forEach((k) => {
    localData[k] = JSON.parse(localStorage.getItem(k));
  });

  if (USE_LOCAL) {
    currentView = Object.values(localData);
  } else {
    const tmp = await Promise.all(
      range(1, LIMIT).map(async (i) => {
        const url =
          i == 1 ? URL + "/dianying/" : URL + `/dianying/index_${i}.html`;
        return parentRunner(url);
      })
    );
    currentView = tmp.flat().filter((item) => !!item);

    saveToLocal(currentView);
    localStorage.clear();
  }

  render();
};

const onFormSubmit = async (event) => {
  event.preventDefault();
  const content = document.getElementById("content");
  content.querySelectorAll("li").forEach((item) => content.removeChild(item));

  const listElement = document.createElement("li");
  const pendingElement = document.createTextNode("Fetching actively...");
  listElement.appendChild(pendingElement);
  content.appendChild(listElement);

  const classification = event.target.elements.classification.value;
  const country = event.target.elements.country.value;
  const year = event.target.elements.year.value;
  const title = event.target.elements.title.value;
  const rate = event.target.elements.rate.value;
  const startIndex = event.target.elements.startIndex.value;

  if (
    (classification && currentClassification !== classification) ||
    (country && currentCountry !== country) ||
    (year && currentYear !== year) ||
    (title && currentTitle !== title) ||
    (rate && currentRate !== rate) ||
    (startIndex && currentViewIndex !== parseInt(startIndex) * PAGE_SIZE)
  ) {
    currentClassification = classification || currentClassification;
    currentCountry = country || currentCountry;
    currentYear = year || currentYear;
    currentTitle = title || currentTitle;
    currentRate = rate || currentRate;
    currentViewIndex = startIndex
      ? parseInt(startIndex) * PAGE_SIZE
      : currentViewIndex;
    currentView = currentView.filter(
      (item) =>
        (!classification || item.type.includes(classification)) &&
        (!country || item.country.includes(country)) &&
        (!year || item.year.includes(year)) &&
        (!title || item.title.includes(title)) &&
        (!rate || parseFloat(rate) <= parseFloat(item.rate))
    );
  }

  render();
};

const render = () => {
  const info = document.getElementById("info");
  info.querySelectorAll("p").forEach((item) => info.removeChild(item));
  const pageNumberElement = document.createElement("p");
  const pageNumber = document.createTextNode(
    `Total page number: ${Math.ceil(currentView.length / PAGE_SIZE)}`
  );
  const currentPageElement = document.createElement("p");
  const currentPage = document.createTextNode(
    `Current page: ${currentViewIndex / PAGE_SIZE}`
  );
  pageNumberElement.appendChild(pageNumber);
  currentPageElement.appendChild(currentPage);
  info.appendChild(pageNumberElement);
  info.appendChild(currentPageElement);
  addListToDom(
    currentView.slice(currentViewIndex, currentViewIndex + PAGE_SIZE)
  );
};

const parentRunner = async (href) => {
  try {
    if (currentFetchNumber > MAX_CONCURRENT_FETCH) {
      await sleep(1000);
      return parentRunner(href);
    }
    // console.log(`parent href: ${href}`);
    const response = await myFetch(href);
    const text = await response.text();
    return parseParentText(text);
  } catch (error) {
    console.log(error);
    await sleep(1000);
    return parentRunner(href);
  }
};

const childRunner = async (href) => {
  try {
    if (currentFetchNumber > MAX_CONCURRENT_FETCH) {
      await sleep(1000);
      return childRunner(href);
    }
    // console.log(`child href: ${href}`);
    const response = await myFetch(href);
    const text = await response.text();

    return parseChildText(text, href);
  } catch (error) {
    console.log(error);
    await sleep(1000);
    return childRunner(href);
  }
};

const myFetch = async (href) => {
  currentFetchNumber++;
  const response = await fetch(href);
  currentFetchNumber--;
  return response;
};

const parseParentText = async (text) => {
  const doc = PARSER.parseFromString(text, "text/html");
  const list = [
    ...doc.querySelectorAll(
      "body>div.container>div.lists div.lists-content>ul li"
    ),
  ];
  return Promise.all(
    list.map(async (li, index) => {
      const path = li.querySelector("a").getAttribute("href");
      if (!path) {
        return null;
      }
      const href = URL + path;
      if (localData.hasOwnProperty(href)) {
        return localData[href];
      }
      const item = await childRunner(href);
      localData[href] = item;
      try {
        localStorage.setItem(href, JSON.stringify(item));
      } catch (error) {
        console.log(error);
        if (isQuotaExceededError(error)) {
          saveToLocal(localData);
          localStorage.clear();
        } else {
          throw error;
        }
      }
      return item;
    })
  );
};

const parseChildText = (text, href) => {
  const doc = PARSER.parseFromString(text, "text/html");
  const title = doc.querySelector(
    "header.product-header>h1.product-title"
  ).textContent;
  const imgSrc =
    URL + doc.querySelector("header.product-header>img").getAttribute("src");
  const extraInfo = [
    ...doc.querySelectorAll("header.product-header>h1.product-title>span"),
  ].map((ele) => ele.textContent);
  const year = extraInfo[0];
  const rate = extraInfo[2];
  const excerpt = [
    ...doc.querySelectorAll("header.product-header>div.product-excerpt"),
  ].map((ex) => ex.querySelector("span").textContent);

  return {
    title,
    director: excerpt[0],
    characters: excerpt[1],
    type: excerpt[2],
    country: excerpt[3],
    alias: excerpt[4],
    intro: excerpt[5],
    year,
    rate,
    href,
    imgSrc,
  };
};

const addListToDom = (list) => {
  const content = document.getElementById("content");
  content.querySelectorAll("li").forEach((item) => content.removeChild(item));
  list.forEach((info) => {
    const listElement = document.createElement("li");
    const title = document.createTextNode(`Title: ${info.title}`);
    const director = document.createTextNode(`Director: ${info.director}`);
    const characters = document.createTextNode(
      `Characters: ${info.characters}`
    );
    const type = document.createTextNode(`Type: ${info.type}`);
    const country = document.createTextNode(`Country: ${info.country}`);
    const alias = document.createTextNode(`Alias: ${info.alias}`);
    const intro = document.createTextNode(`Introduction: ${info.intro}`);
    const year = document.createTextNode(`year: ${info.year}`);
    const rate = document.createTextNode(`Rate: ${info.rate}`);

    const href = document.createElement("a");
    href.appendChild(title);
    href.title = info.title;
    href.href = info.href;
    href.target = "_blank";

    const img = document.createElement("img");
    img.src = info.imgSrc;

    listElement.appendChild(href);

    [
      img,
      director,
      characters,
      type,
      country,
      alias,
      intro,
      year,
      rate,
    ].forEach((text) => {
      const element = document.createElement("p");
      element.appendChild(text);
      listElement.appendChild(element);
    });

    content.appendChild(listElement);
  });
  window.scrollTo(0, 0);
};

const saveToLocal = (content) => {
  let result = {};
  if (Array.isArray(content)) {
    content.forEach((item) => {
      result[item.href] = item;
    });
  } else if (typeof content === "object") {
    result = content;
  } else {
    throw new Error(`Unsupported type: ${typeof content}`);
  }
  let a = document.createElement("a");
  a.href = window.URL.createObjectURL(
    new Blob([JSON.stringify(result, null, 2)], { type: "text/plain" })
  );
  a.download = CACHE_FILE_NAME + "_" + localCACHE_FILE_NAMEIndex;
  localCACHE_FILE_NAMEIndex++;
  a.click();
};

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Determines whether an error is a QuotaExceededError.
 *
 * Browsers love throwing slightly different variations of QuotaExceededError
 * (this is especially true for old browsers/versions), so we need to check
 * different fields and values to ensure we cover every edge-case.
 *
 * @param err - The error to check
 * @return Is the error a QuotaExceededError?
 */
function isQuotaExceededError(err) {
  return (
    err instanceof DOMException &&
    // everything except Firefox
    (err.code === 22 ||
      // Firefox
      err.code === 1014 ||
      // test name field too, because code might not be present
      // everything except Firefox
      err.name === "QuotaExceededError" ||
      // Firefox
      err.name === "NS_ERROR_DOM_QUOTA_REACHED")
  );
}

const range = (start, stop, step = 1) => {
  const length = Math.ceil((stop - start) / step);
  return Array.from({ length }, (_, i) => i * step + start);
};

addEventListener("load", onLoad);
