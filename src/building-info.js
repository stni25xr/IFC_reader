import { createExportActions, openLauncher } from "./shared/export-actions.js";

const demoData = {
  badge: "Demo data (mock) – not from IFC",
  subtitle: "Multi-residential building (demo)",
  general: {
    "Building name": "Brf Solgläntan",
    "Address": "Solgläntan 12, 123 45 Sundbyvik",
    "Municipality": "Sundbyvik kommun",
    "Building type": "Flerbostadshus",
    "Year of build": "2014",
    "Renovations": "2022 ventilation balancing"
  },
  sizes: {
    "Site size": "3,850 m²",
    "Building footprint": "980 m²",
    "Gross floor area (BTA)": "6,400 m²",
    "Living area (BOA)": "5,300 m²",
    "Ancillary area (BIA)": "620 m²",
    "Height": "18.5 m",
    "Storeys": "6 + basement",
    "Roof type": "Sadeltak",
    "Roof slope": "14°"
  },
  apartments: {
    "Total apartments": "72",
    "1 rok": "12",
    "2 rok": "28",
    "3 rok": "22",
    "4 rok": "10",
    "Average size": "74 m²"
  },
  envelope: {
    "Wall U-value": "0.18 W/m²K",
    "Roof U-value": "0.12 W/m²K",
    "Floor U-value": "0.15 W/m²K",
    "Window U-value": "1.0 W/m²K",
    "Air tightness": "0.30 l/s·m² @50Pa"
  },
  energy: {
    "Heating": "Fjärrvärme",
    "Ventilation": "FTX",
    "Domestic hot water": "Fjärrvärme + VVC",
    "Energy performance": "68 kWh/m² Atemp, year",
    "Atemp": "5,900 m²",
    "Solar PV": "35 kWp",
    "EV chargers": "12"
  },
  fire: {
    "Fire class": "Br1",
    "Stairwells": "2",
    "Elevators": "2",
    "Accessibility": "Fully accessible entrances"
  },
  materials: {
    "Structure": "Betongstomme",
    "Facade": "Tegel + trädetaljer",
    "Roof": "Plåt"
  },
  propertySets: {
    "Pset_BuildingCommon": {
      "Owner": "Brf Solgläntan",
      "Management": "Sundbyvik Förvaltning AB",
      "Maintenance plan": "2024–2034"
    },
    "Pset_Sustainability": {
      "Certification": "Miljöbyggnad Silver",
      "Solar coverage": "~12% of annual demand",
      "Lifecycle focus": "Low maintenance facade"
    }
  },
  quantities: {
    "Gross volume": "18,200 m³",
    "Envelope area": "4,150 m²",
    "Glazed area": "1,050 m²"
  },
  maintenance: {
    "2024": "Facade inspection + sealant review",
    "2026": "Roof repainting (plåt)",
    "2028": "Stairwell LED retrofit",
    "2030": "Elevator modernization"
  },
  sustainability: {
    "Certification": "Miljöbyggnad Silver",
    "Focus": "Low energy + indoor comfort",
    "Monitoring": "Monthly energy follow-up"
  }
};

const section = document.getElementById("building-info");
const grid = document.getElementById("info-grid");
const accordion = document.getElementById("info-accordion");
const launcherBtn = document.getElementById("launcher-btn");
const exportBtn = document.getElementById("export-btn");
const backBtn = document.getElementById("info-back");
const downloadBtn = document.getElementById("info-download");

const exportActions = createExportActions({
  getModels: () => [],
  wasmBasePath: `${import.meta.env.BASE_URL}wasm/`,
  statusEl: document.getElementById("status"),
  exportBtn: document.getElementById("export-btn")
});
const downloadHtml = exportActions.downloadHtml;

if (exportBtn) exportBtn.disabled = true;
const addCard = (title, value) => {
  const card = document.createElement("div");
  card.className = "info-card";
  const h3 = document.createElement("h3");
  h3.textContent = title;
  const p = document.createElement("p");
  p.textContent = value;
  card.appendChild(h3);
  card.appendChild(p);
  grid.appendChild(card);
};

const addAccordion = (title, entries) => {
  const details = document.createElement("details");
  const summary = document.createElement("summary");
  summary.textContent = title;
  details.appendChild(summary);
  const table = document.createElement("table");
  Object.entries(entries).forEach(([key, value]) => {
    const row = document.createElement("tr");
    const k = document.createElement("td");
    const v = document.createElement("td");
    k.textContent = key;
    v.textContent = value;
    row.appendChild(k);
    row.appendChild(v);
    table.appendChild(row);
  });
  details.appendChild(table);
  accordion.appendChild(details);
};

if (grid) {
  Object.entries({
    ...demoData.general,
    ...demoData.sizes,
    ...demoData.apartments,
    ...demoData.envelope,
    ...demoData.energy,
    ...demoData.fire,
    ...demoData.materials
  }).forEach(([key, value]) => addCard(key, value));
}

if (accordion) {
  addAccordion("Property Sets", flattenGroups(demoData.propertySets));
  addAccordion("Quantities", demoData.quantities);
  addAccordion("Maintenance plan highlights", demoData.maintenance);
  addAccordion("Sustainability certification", demoData.sustainability);
}

function flattenGroups(groups) {
  const out = {};
  Object.entries(groups).forEach(([groupName, values]) => {
    Object.entries(values).forEach(([key, value]) => {
      out[`${groupName} • ${key}`] = value;
    });
  });
  return out;
}

if (launcherBtn) launcherBtn.addEventListener("click", openLauncher);
if (exportBtn) exportBtn.addEventListener("click", downloadHtml);
if (backBtn) backBtn.addEventListener("click", () => {
  const base = import.meta.env.BASE_URL || "/";
  window.location.href = base;
});
if (downloadBtn) downloadBtn.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(demoData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "brf-solglantan-demo.json";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});
