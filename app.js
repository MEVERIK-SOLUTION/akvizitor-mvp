// AKVIZITOR MVP – Property Quick Calculator
// V1: orientační výpočet ceny podle typu, plochy, lokality a stavu.
// Pozn.: hodnoty jsou zjednodušené (kalibrujeme později datovým modelem).

(function () {
  "use strict";

  const form = document.getElementById("calculator-form");
  const resultBox = document.getElementById("result");
  const priceOutput = document.getElementById("priceOutput");
  const summaryOutput = document.getElementById("summaryOutput");

  const elType = document.getElementById("propertyType");
  const elArea = document.getElementById("area");
  const elLocality = document.getElementById("locality");
  const elCondition = document.getElementById("condition");
  const exportBtn = document.getElementById("exportJsonBtn");
  const resetBtn = document.getElementById("resetBtn");
  
  // --- ZÁKLADNÍ MODEL (V1) ---
  // Jednotková cena (CZK / m²) – pro "dobrý stav" v referenční lokalitě (okres)
  const basePricePerM2 = {
    byt: 65000,
    dum: 52000,
    pozemek: 3500
  };

  // Multiplikátory podle lokality
  const localityFactor = {
    praha: 1.55,
    kraj: 1.25,
    okres: 1.0,
    venkov: 0.85
  };

  // Multiplikátory podle stavu
  const conditionFactor = {
    novostavba: 1.15,
    dobry: 1.0,
    pred_rekonstrukci: 0.8
  };

  // Pomocné formátování CZK
  function formatCZK(value) {
    const rounded = Math.round(value);
    return rounded.toLocaleString("cs-CZ") + " Kč";
  }

  function validateInputs() {
    const type = elType.value.trim();
    const locality = elLocality.value.trim();
    const condition = elCondition.value.trim();

    const areaRaw = String(elArea.value || "").trim();
    const area = Number(areaRaw);

    if (!type || !locality || !condition) return { ok: false, message: "Vyplň prosím všechna pole." };
    if (!Number.isFinite(area) || area <= 0) return { ok: false, message: "Zadej prosím platnou plochu (m²)." };

    return { ok: true, data: { type, area, locality, condition } };
  }

  function calculatePrice({ type, area, locality, condition }) {
    const base = basePricePerM2[type];
    const lf = localityFactor[locality];
    const cf = conditionFactor[condition];

    // Bezpečnost: kdyby někdo upravil DOM
    if (!base || !lf || !cf) return null;

    const unit = base * lf * cf;
    const total = unit * area;

    return {
      unitPrice: unit,
      totalPrice: total
    };
  }

  function typeLabel(type) {
    if (type === "byt") return "byt";
    if (type === "dum") return "rodinný dům";
    if (type === "pozemek") return "pozemek";
    return "nemovitost";
  }

  function localityLabel(locality) {
    if (locality === "praha") return "Praha";
    if (locality === "kraj") return "krajské město";
    if (locality === "okres") return "okresní město";
    if (locality === "venkov") return "venkov";
    return "lokalita";
  }

  function conditionLabel(condition) {
    if (condition === "novostavba") return "novostavba";
    if (condition === "dobry") return "dobrý stav";
    if (condition === "pred_rekonstrukci") return "před rekonstrukcí";
    return "stav";
  }

  function buildSummary({ type, area, locality, condition }, calc) {
    const t = typeLabel(type);
    const loc = localityLabel(locality);
    const cond = conditionLabel(condition);

    const unitFormatted = formatCZK(calc.unitPrice);
    const totalFormatted = formatCZK(calc.totalPrice);

    return `Orientační ocenění pro ${t} o ploše ${area.toLocaleString("cs-CZ")} m² v lokalitě (${loc}), stav: ${cond}.
Jednotková cena vychází na ~${unitFormatted} / m².
Odhadovaná celková cena je ${totalFormatted}.`;
  }

  function showResult(priceText, summaryText) {
    priceOutput.textContent = priceText;
    summaryOutput.textContent = summaryText;
    resultBox.hidden = false;
    resultBox.scrollIntoView({ behavior: "smooth", block: "start" });
  }
let lastCalculation = null;

  function exportToJson() {
  if (!lastCalculation) {
    alert("Nejprve proveď kalkulaci.");
    return;
  }

   const jsonString = JSON.stringify(lastCalculation, null, 2);
   const blob = new Blob([jsonString], { type: "application/json" });
   const url = URL.createObjectURL(blob);

   const a = document.createElement("a");
   a.href = url;
   const d = new Date();
const y = d.getFullYear();
const m = String(d.getMonth() + 1).padStart(2, "0");
const day = String(d.getDate()).padStart(2, "0");
const safeType = (lastCalculation?.input?.type || "nemovitost");
a.download = `akvizitor-${safeType}-${y}-${m}-${day}.json`;
   document.body.appendChild(a);
   a.click();
   document.body.removeChild(a);

   URL.revokeObjectURL(url);
  }

exportBtn.addEventListener("click", exportToJson);
  form.addEventListener("submit", (e) => {
    e.preventDefault();

    const v = validateInputs();
    if (!v.ok) {
      showResult("Nelze spočítat", v.message);
      return;
    }

    const calc = calculatePrice(v.data);
    if (!calc) {
      showResult("Nelze spočítat", "Interní chyba modelu. Zkus změnit vstupy.");
      return;
    }
resetBtn.addEventListener("click", () => {
  form.reset();
  resultBox.hidden = true;
  lastCalculation = null;
});
    const totalText = `≈ ${formatCZK(calc.totalPrice)}`;
const summary = buildSummary(v.data, calc);

// uložíme poslední výpočet pro export
lastCalculation = {
  meta: {
    app: "AKVIZITOR MVP",
    version: "1.0.0",
    generatedAt: new Date().toISOString()
  },
  input: v.data,
  calculation: {
    unitPrice: Math.round(calc.unitPrice),
    totalPrice: Math.round(calc.totalPrice)
  },
  summary
};

showResult(totalText, summary);
  });
})();