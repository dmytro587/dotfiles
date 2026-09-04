(() => {
  const form = document.querySelector("#research-form");
  const submitButton = document.querySelector("#submit-button");
  const cancelButton = document.querySelector("#cancel-button");
  const sessionPanel = document.querySelector("#session-panel");
  const statusLine = document.querySelector("#status-line");
  const questionPanel = document.querySelector("#question-panel");
  const errorMessage = document.querySelector("#error-message");
  const sessionActions = document.querySelector("#session-actions");
  const exportLink = document.querySelector("#export-link");
  const catalogRoot = document.querySelector("#catalog-root");
  const readinessMessage = document.querySelector("#readiness-message");
  const readinessValue = document.querySelector("#goods-research-readiness").textContent;
  const deliveryMarket = form.elements.deliveryMarket;
  const localMarketOnly = form.elements.localMarketOnly;
  const budgetMin = form.elements.budgetMin;
  const budgetMax = form.elements.budgetMax;
  const budgetCurrency = form.elements.budgetCurrency;
  const localMarketCurrency = form.elements.localMarketCurrency;
  const localMarketCurrencyField = document.querySelector("#local-market-currency-field");
  const deliveryMarketHint = document.querySelector("#delivery-market-hint");

  let current = null;
  let eventSource = null;
  let markets = new Map();

  function element(name, options = {}, children = []) {
    const node = document.createElement(name);
    if (options.className) {
      node.className = options.className;
    }
    if (options.text !== undefined) {
      node.textContent = options.text;
    }
    if (options.type) {
      node.type = options.type;
    }
    for (const [attribute, value] of Object.entries(options.attributes ?? {})) {
      node.setAttribute(attribute, String(value));
    }
    for (const child of children) {
      node.append(child);
    }
    return node;
  }

  function sessionStorageKey(id) {
    return `goods-research:${id}`;
  }

  function idFromHash() {
    return new URLSearchParams(location.hash.slice(1)).get("session");
  }

  function setSessionHash(id) {
    const hash = new URLSearchParams({ session: id });
    history.replaceState(null, "", `#${hash.toString()}`);
  }

  function endpoint(action) {
    return `/api/sessions/${encodeURIComponent(current.id)}/${action}?token=${encodeURIComponent(current.token)}`;
  }

  function setRunning(running) {
    submitButton.disabled = running;
    cancelButton.hidden = !running;
  }


  function option(value, label) {
    return new Option(label, value);
  }

  function syncLocalMarketCurrency() {
    const market = markets.get(deliveryMarket.value);
    localMarketCurrencyField.hidden = !localMarketOnly.checked;
    localMarketCurrency.required = false;
    localMarketCurrency.replaceChildren();
    if (!localMarketOnly.checked) {
      localMarketCurrency.disabled = true;
      return;
    }
    if (!market) {
      localMarketCurrency.append(option("", "Select a delivery country first"));
      localMarketCurrency.disabled = true;
      return;
    }
    if (market.currencies.length === 1) {
      const currency = market.currencies[0];
      localMarketCurrency.append(option(currency.code, `Automatically use ${currency.code}`));
      localMarketCurrency.disabled = true;
      return;
    }
    localMarketCurrency.append(option("", "Select local market currency"));
    for (const currency of market.currencies) {
      localMarketCurrency.append(option(currency.code, currency.code));
    }
    localMarketCurrency.disabled = false;
    localMarketCurrency.required = true;
  }

  function syncLocalMarketRequirement() {
    deliveryMarket.required = localMarketOnly.checked;
    syncLocalMarketCurrency();
  }

  async function loadMarkets() {
    try {
      const value = await responseJson(await fetch("/api/markets", { cache: "no-store" }));
      if (!Array.isArray(value.markets)) {
        throw new Error("The current delivery-country data was invalid.");
      }
      markets = new Map(
        value.markets
          .filter(
            (market) =>
              typeof market.country === "string" &&
              Array.isArray(market.currencies) &&
              market.currencies.every(
                (currency) =>
                  typeof currency.code === "string" &&
                  /^[A-Z]{3}$/.test(currency.code) &&
                  Number.isInteger(currency.minorUnits),
              ),
          )
          .map((market) => [market.country, market]),
      );
      deliveryMarket.replaceChildren(option("", "Select delivery country"));
      for (const market of markets.values()) {
        deliveryMarket.append(option(market.country, market.country));
      }
      deliveryMarket.disabled = false;
      localMarketOnly.disabled = false;
      deliveryMarketHint.textContent = "Current ISO 4217 country and currency data.";
    } catch {
      deliveryMarket.replaceChildren(option("", "Current delivery-country data is unavailable"));
      deliveryMarket.disabled = true;
      localMarketOnly.checked = false;
      localMarketOnly.disabled = true;
      deliveryMarketHint.textContent = "Local-market research is unavailable until current country and currency data can be loaded.";
    }
    syncLocalMarketRequirement();
  }


  function syncBudgetRange() {
    const hasBudgetBound = budgetMin.value !== "" || budgetMax.value !== "";
    budgetCurrency.required = hasBudgetBound;
    const minimum = budgetMin.valueAsNumber;
    const maximum = budgetMax.valueAsNumber;
    budgetMax.setCustomValidity(
      Number.isFinite(minimum) && Number.isFinite(maximum) && maximum < minimum
        ? "Maximum budget must be greater than or equal to minimum budget."
        : "",
    );
  }

  function normalizeBudgetCurrency() {
    budgetCurrency.value = budgetCurrency.value.trim().toUpperCase();
  }
  function setStatus(text) {
    sessionPanel.hidden = false;
    statusLine.textContent = text;
  }

  function showError(text) {
    sessionPanel.hidden = false;
    errorMessage.hidden = false;
    errorMessage.textContent = text;
  }

  function clearError() {
    errorMessage.hidden = true;
    errorMessage.textContent = "";
  }

  function closeEvents() {
    eventSource?.close();
    eventSource = null;
  }

  function requestOptions(method, body) {
    return {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    };
  }

  async function responseJson(response) {
    const value = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(value.error ?? "The local research service rejected the request.");
    }
    return value;
  }

  function renderQuestion(question) {
    questionPanel.replaceChildren();
    questionPanel.hidden = false;
    questionPanel.append(element("h3", { text: question.question }));
    questionPanel.append(element("p", { text: question.reason }));

    const answer = element("input", {
      attributes: {
        type: "text",
        maxlength: "2000",
        required: "",
        placeholder: "Your answer",
        "aria-label": "Clarification answer",
      },
    });
    const options = element("div", { className: "answer-options" });
    for (const suggestion of question.suggestedAnswers) {
      const button = element("button", { type: "button", text: suggestion });
      button.addEventListener("click", () => {
        answer.value = suggestion;
        answer.focus();
      });
      options.append(button);
    }
    const answerForm = element("form", { className: "form-actions" });
    answerForm.append(answer, element("button", { className: "button", type: "submit", text: "Continue research" }));
    answerForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      if (!answer.value.trim()) {
        answer.focus();
        return;
      }
      await sendAnswer(answer.value.trim());
    });
    questionPanel.append(options, answerForm);
    answer.focus();
  }

  async function showResult() {
    if (!current) {
      return;
    }
    const result = await responseJson(await fetch(endpoint("result"), { cache: "no-store" }));
    questionPanel.hidden = true;
    setStatus("Verified catalog ready.");
    setRunning(false);
    sessionActions.hidden = false;
    exportLink.href = endpoint("export");
    exportLink.referrerPolicy = "no-referrer";
    globalThis.GoodsResearchCatalog.renderCatalog(catalogRoot, result, (candidate) => {
      if (!candidate.imageUrl || candidate.imageUnavailableReason) {
        return null;
      }
      return `/api/sessions/${encodeURIComponent(current.id)}/images/${encodeURIComponent(candidate.id)}?token=${encodeURIComponent(current.token)}`;
    });
  }

  function connectEvents() {
    closeEvents();
    if (!current) {
      return;
    }
    eventSource = new EventSource(endpoint("events"));
    eventSource.addEventListener("progress", (event) => {
      const data = JSON.parse(event.data);
      const labels = {
        starting: "Starting the local research agent.",
        "researching-category": "Researching the category and rubric.",
        "searching-candidates": "Searching candidate offers.",
        "verifying-offers": "Verifying exact offers, prices, and availability.",
        "checking-images": "Checking exact product images.",
        "waiting-for-answer": "Waiting for your one clarification answer.",
        "building-catalog": "Building the verified catalog.",
        complete: "Verified catalog ready.",
        failed: "Research could not produce a verified catalog.",
      };
      setStatus(labels[data.stage] ?? "Research is in progress.");
    });
    eventSource.addEventListener("clarification", (event) => {
      setStatus("One clarification is needed before ranking.");
      renderQuestion(JSON.parse(event.data));
    });
    eventSource.addEventListener("complete", async () => {
      closeEvents();
      try {
        await showResult();
      } catch (error) {
        setRunning(false);
        showError(error.message);
      }
    });
    eventSource.addEventListener("failed", (event) => {
      closeEvents();
      setRunning(false);
      showError(JSON.parse(event.data).message);
    });
    eventSource.addEventListener("cancelled", (event) => {
      closeEvents();
      setRunning(false);
      questionPanel.hidden = true;
      setStatus(`Research ${JSON.parse(event.data).reason}.`);
    });
    eventSource.addEventListener("error", () => {
      if (eventSource?.readyState !== EventSource.CLOSED) {
        setStatus("Connection interrupted; reconnecting to the local research session.");
      }
    });
  }

  async function sendAnswer(answer) {
    clearError();
    questionPanel.hidden = true;
    setStatus("Sending your clarification to the same research session.");
    try {
      await responseJson(await fetch(endpoint("answer"), requestOptions("POST", { answer })));
      setStatus("Research resumed with your clarification.");
    } catch (error) {
      showError(error.message);
      questionPanel.hidden = false;
    }
  }

  async function cancelResearch() {
    if (!current) {
      return;
    }
    cancelButton.disabled = true;
    try {
      await responseJson(await fetch(endpoint("cancel"), requestOptions("POST", {})));
    } catch (error) {
      showError(error.message);
    } finally {
      cancelButton.disabled = false;
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearError();
    questionPanel.hidden = true;
    sessionActions.hidden = true;
    catalogRoot.replaceChildren();
    const formData = new FormData(form);
    const brief = Object.fromEntries(formData.entries());
    brief.localMarketOnly = localMarketOnly.checked;
    brief.localMarketCurrency = localMarketCurrency.value;
    setRunning(true);
    setStatus("Starting the local research agent.");
    try {
      const started = await responseJson(await fetch("/api/research", requestOptions("POST", brief)));
      current = { id: started.sessionId, token: started.token };
      sessionStorage.setItem(sessionStorageKey(current.id), current.token);
      setSessionHash(current.id);
      connectEvents();
    } catch (error) {
      setRunning(false);
      showError(error.message);
    }
  });

  cancelButton.addEventListener("click", cancelResearch);
  deliveryMarket.addEventListener("change", syncLocalMarketCurrency);
  localMarketOnly.addEventListener("change", syncLocalMarketRequirement);
  syncLocalMarketRequirement();
  budgetMin.addEventListener("input", syncBudgetRange);
  budgetMax.addEventListener("input", syncBudgetRange);
  budgetCurrency.addEventListener("change", normalizeBudgetCurrency);
  syncBudgetRange();
  void loadMarkets();



  try {
    const readiness = JSON.parse(readinessValue);
    if (readiness) {
      readinessMessage.hidden = false;
      readinessMessage.textContent = readiness;
      submitButton.disabled = true;
      return;
    }
  } catch {
    readinessMessage.hidden = false;
    readinessMessage.textContent = "The local research page could not read its readiness state.";
    submitButton.disabled = true;
    return;
  }

  const savedId = idFromHash();
  const savedToken = savedId && sessionStorage.getItem(sessionStorageKey(savedId));
  if (savedId && savedToken) {
    current = { id: savedId, token: savedToken };
    setRunning(true);
    setStatus("Restoring the local research session.");
    showResult().then(
      () => closeEvents(),
      () => connectEvents(),
    );
  }
})();
