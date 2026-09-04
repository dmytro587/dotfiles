(() => {
  function element(name, options = {}, children = []) {
    const node = document.createElement(name);
    if (options.className) {
      node.className = options.className;
    }
    if (options.text !== undefined) {
      node.textContent = options.text;
    }
    if (options.id) {
      node.id = options.id;
    }
    if (options.type) {
      node.type = options.type;
    }
    if (options.hidden !== undefined) {
      node.hidden = options.hidden;
    }
    if (options.attributes) {
      for (const [name, value] of Object.entries(options.attributes)) {
        node.setAttribute(name, String(value));
      }
    }
    for (const child of children) {
      node.append(child);
    }
    return node;
  }

  function externalLink(text, href, className = "") {
    return element("a", {
      className,
      text,
      attributes: {
        href,
        target: "_blank",
        rel: "noopener noreferrer",
      },
    });
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
  }

  function labelForAvailability(status) {
    return {
      in_stock: "In stock",
      limited: "Limited stock",
      preorder: "Preorder",
    }[status] ?? status;
  }

  function textForCandidate(candidate) {
    return [
      candidate.brand,
      candidate.name,
      candidate.variant,
      candidate.seller,
      candidate.description,
      candidate.price.display,
      candidate.availability.display,
      candidate.rankingReason,
      ...candidate.verifiedFacts.flatMap((fact) => [fact.label, fact.value]),
      ...candidate.pros.map((item) => item.text),
      ...candidate.cons.map((item) => item.text),
      ...candidate.unknowns,
    ].join(" ").toLocaleLowerCase();
  }

  function makeList(title, items, className) {
    const section = element("section", { className });
    section.append(element("h4", { text: title }));
    if (items.length === 0) {
      section.append(element("p", { className: "quiet", text: "None recorded." }));
      return section;
    }
    const list = element("ul");
    for (const item of items) {
      list.append(element("li", { text: typeof item === "string" ? item : item.text }));
    }
    section.append(list);
    return section;
  }

  function makeImage(candidate, imageResolver) {
    const visual = element("div", { className: "product-visual" });
    if (candidate.rank !== null) {
      visual.append(element("span", { className: "rank", text: String(candidate.rank).padStart(2, "0") }));
    }
    const source = candidate.imageUrl && imageResolver(candidate);
    if (source) {
      visual.append(
        element("img", {
          className: "product-image",
          attributes: {
            src: source,
            alt: candidate.imageAlt ?? `${candidate.brand} ${candidate.name}`,
            loading: "lazy",
          },
        }),
      );
      return visual;
    }
    const reason = candidate.imageUnavailableReason ?? "No exact image was provided for this offer.";
    visual.append(
      element("div", {
        className: "product-placeholder",
        text: "Exact image unavailable",
        attributes: { role: "img", "aria-label": reason },
      }),
    );
    return visual;
  }

  function makeFacts(candidate) {
    const section = element("section", { className: "facts-section" });
    section.append(element("h4", { text: "Verified facts" }));
    if (candidate.verifiedFacts.length === 0) {
      section.append(element("p", { className: "quiet", text: "No facts were recorded." }));
      return section;
    }
    const facts = element("dl", { className: "facts-list" });
    for (const fact of candidate.verifiedFacts) {
      const entry = element("div");
      entry.append(element("dt", { text: fact.label }));
      const value = element("dd", { text: `${fact.value} ` });
      value.append(externalLink("Source", fact.sourceUrl, "fact-source"));
      entry.append(value);
      facts.append(entry);
    }
    section.append(facts);
    return section;
  }

  function makeCard(candidate, result, imageResolver) {
    const card = element("article", { className: "catalog-card" });
    card.append(makeImage(candidate, imageResolver));

    const body = element("div", { className: "card-body" });
    const heading = element("div", { className: "card-heading" });
    const title = element("div");
    title.append(element("p", { className: "brand", text: candidate.brand }));
    title.append(element("h3", { text: candidate.name }));
    title.append(element("p", { className: "variant", text: `${candidate.variant} · ${candidate.seller}` }));
    heading.append(title);
    heading.append(element("p", { className: "price", text: candidate.price.display }));
    body.append(heading);

    const badges = element("div", { className: "badges", attributes: { "aria-label": "Offer status" } });
    if (candidate.id === result.recommendationCandidateId) {
      badges.append(element("span", { className: "badge recommendation", text: "Recommended" }));
    }
    badges.append(
      element("span", {
        className: `badge availability ${candidate.availability.status}`,
        text: labelForAvailability(candidate.availability.status),
      }),
    );
    badges.append(
      element("span", {
        className: `badge ${candidate.price.completeness === "full" ? "full-price" : "partial-price"}`,
        text: candidate.price.completeness === "full" ? "Full price" : "Partial price",
      }),
    );
    if (candidate.unknowns.length > 0 || candidate.imageUnavailableReason) {
      badges.append(element("span", { className: "badge unknown", text: "Has unknowns" }));
    }
    body.append(badges);

    body.append(element("p", { className: "description", text: candidate.description }));
    const priceDetail = element("p", { className: "price-detail", text: `Price checked: ${candidate.price.display}` });
    if (candidate.price.components.length > 0) {
      priceDetail.append(
        element("span", {
          className: "quiet",
          text: ` (${candidate.price.components.map((component) => component.display).join("; ")})`,
        }),
      );
    }
    body.append(priceDetail);
    body.append(
      element("p", {
        className: "availability-detail",
        text: `${candidate.availability.display} · checked ${formatTime(candidate.availability.checkedAt)}`,
      }),
    );

    body.append(makeFacts(candidate));
    body.append(makeList("Pros", candidate.pros, "reason-list pros"));
    body.append(makeList("Cons", candidate.cons, "reason-list cons"));

    const unknowns = [...candidate.unknowns];
    if (candidate.imageUnavailableReason) {
      unknowns.push(candidate.imageUnavailableReason);
    }
    body.append(makeList("Unknowns", unknowns, "reason-list unknowns"));
    body.append(
      element("p", {
        className: "ranking-reason",
        text: `Ranking basis: ${candidate.rankingReason}`,
      }),
    );

    const actions = element("div", { className: "card-actions" });
    actions.append(externalLink("Open exact product", candidate.productUrl, "action primary-action"));
    for (const source of candidate.sourceLinks) {
      actions.append(externalLink(`Evidence: ${source.label}`, source.url, "action secondary-action"));
    }
    body.append(actions);
    card.append(body);
    return card;
  }

  function makeRubric(result) {
    const section = element("section", { className: "rubric-panel", attributes: { "aria-label": "Research rubric" } });
    const groups = [
      ["Hard gates", result.rubric.hardGates],
      ["Preferences", result.rubric.preferences],
      ["Assumptions", result.rubric.assumptions],
    ];
    for (const [title, values] of groups) {
      const group = element("div", { className: "rubric-group" });
      group.append(element("h3", { text: title }));
      if (values.length === 0) {
        group.append(element("p", { className: "quiet", text: "None." }));
      } else {
        const list = element("ul");
        for (const value of values) {
          list.append(element("li", { text: value }));
        }
        group.append(list);
      }
      section.append(group);
    }
    return section;
  }

  function makeNoMatch(result) {
    const section = element("section", { className: "no-match", attributes: { "aria-live": "polite" } });
    section.append(element("h2", { text: "No verified match" }));
    section.append(element("p", { text: "No candidate passed every hard gate with a verified direct offer." }));
    const list = element("ul");
    for (const reason of result.noMatchReasons) {
      list.append(element("li", { text: reason }));
    }
    section.append(list);
    return section;
  }

  function formatBudgetBounds(currency, budgetMin, budgetMax) {
    if (budgetMin !== null && budgetMax !== null) {
      return `${currency} ${budgetMin}–${budgetMax}`;
    }
    if (budgetMin !== null) {
      return `at least ${currency} ${budgetMin}`;
    }
    return `up to ${currency} ${budgetMax}`;
  }

  function renderCatalog(root, result, imageResolver = () => null) {
    root.replaceChildren();
    root.className = "research-catalog";

    const hero = element("header", { className: "catalog-hero" });
    hero.append(element("p", { className: "eyebrow", text: "Verified goods research" }));
    hero.append(element("h2", { text: result.title }));
    hero.append(element("p", { className: "request-summary", text: result.requestSummary }));
    hero.append(
      element("p", {
        className: "checked-meta",
        text: `Checked ${formatTime(result.checkedAt)} · ${result.market.deliveryCountry}${result.market.deliveryRegion ? `, ${result.market.deliveryRegion}` : ""}${result.market.currency ? ` · ${result.market.currency}` : ""}${result.market.retailerScope === "local_only" ? " · Local retailers only" : ""}`,
      }),
    );
    if (result.market.budgetConversion) {
      const conversion = result.market.budgetConversion;
      hero.append(
        element("p", {
          className: "checked-meta",
          text: `Budget conversion: ${formatBudgetBounds(conversion.sourceCurrency, conversion.sourceBudgetMin, conversion.sourceBudgetMax)} → ${formatBudgetBounds(conversion.targetCurrency, conversion.budgetMin, conversion.budgetMax)} · ${conversion.provider} · ${conversion.effectiveDate}`,
        }),
      );
    }
    root.append(hero, makeRubric(result));

    if (result.status === "no_match") {
      root.append(makeNoMatch(result));
      return;
    }

    const controls = element("section", { className: "catalog-controls", attributes: { "aria-label": "Search and filter catalog" } });
    const searchLabel = element("label", { className: "search-label", text: "Search verified offers" });
    const search = element("input", {
      className: "catalog-search",
      type: "search",
      attributes: { placeholder: "Brand, model, fact, price, or tradeoff" },
    });
    searchLabel.htmlFor = "catalog-search";
    search.id = "catalog-search";
    controls.append(searchLabel, search);

    const filters = [
      ["all", "All offers"],
      ["recommended", "Recommended"],
      ["full-price", "Full price"],
      ["unknowns", "Has unknowns"],
    ];
    const filterBar = element("div", { className: "filters", attributes: { "aria-label": "Catalog filters" } });
    const count = element("p", { className: "result-count", attributes: { "aria-live": "polite" } });
    let activeFilter = "all";
    const catalog = element("section", { className: "catalog-grid", attributes: { "aria-label": "Verified products" } });

    function matches(candidate) {
      if (activeFilter === "recommended" && candidate.id !== result.recommendationCandidateId) {
        return false;
      }
      if (activeFilter === "full-price" && candidate.price.completeness !== "full") {
        return false;
      }
      if (activeFilter === "unknowns" && candidate.unknowns.length === 0 && !candidate.imageUnavailableReason) {
        return false;
      }
      return textForCandidate(candidate).includes(search.value.trim().toLocaleLowerCase());
    }

    function renderCards() {
      const candidates = result.candidates.filter(matches);
      catalog.replaceChildren(...candidates.map((candidate) => makeCard(candidate, result, imageResolver)));
      count.textContent = `${candidates.length} ${candidates.length === 1 ? "offer" : "offers"} shown`;
    }

    for (const [filter, label] of filters) {
      const button = element("button", {
        className: "filter-button",
        type: "button",
        text: label,
        attributes: { "aria-pressed": String(filter === activeFilter) },
      });
      button.addEventListener("click", () => {
        activeFilter = filter;
        for (const child of filterBar.children) {
          child.setAttribute("aria-pressed", String(child.dataset.filter === filter));
        }
        renderCards();
      });
      button.dataset.filter = filter;
      filterBar.append(button);
    }
    search.addEventListener("input", renderCards);
    controls.append(filterBar, count);
    root.append(controls, catalog);
    renderCards();
  }

  globalThis.GoodsResearchCatalog = { renderCatalog };
})();
