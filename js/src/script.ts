const CONTACT_EMAIL = "[E-POSTI AADRESS]";
const menuButton = document.querySelector<HTMLButtonElement>(".menu");
const nav = document.querySelector<HTMLElement>("#nav");
const form = document.querySelector<HTMLFormElement>("#contact-form");
const status = document.querySelector<HTMLElement>("#form-status");
const audience = document.querySelector<HTMLSelectElement>("#audience");
const year = document.querySelector<HTMLElement>("#year");

menuButton?.addEventListener("click", () => {
  const open = menuButton.getAttribute("aria-expanded") === "true";
  menuButton.setAttribute("aria-expanded", String(!open));
  nav?.classList.toggle("is-open", !open);
});
nav?.querySelectorAll<HTMLAnchorElement>("a").forEach(link => link.addEventListener("click", () => {
  nav.classList.remove("is-open");
  menuButton?.setAttribute("aria-expanded", "false");
}));
document.querySelectorAll<HTMLAnchorElement>("a[data-audience]").forEach(link => link.addEventListener("click", () => {
  if (audience) audience.value = link.dataset.audience === "ettevõte" ? "business" : "individual";
}));
if (year) year.textContent = String(new Date().getFullYear());

form?.addEventListener("submit", event => {
  event.preventDefault();
  if (!status) return;
  status.classList.remove("success");
  if (!form.reportValidity()) {
    status.textContent = "Palun täida nõutud väljad ja anna andmete kasutamiseks nõusolek.";
    return;
  }
  if (CONTACT_EMAIL.includes("[")) {
    status.textContent = "Kontakt-aadress pole veel seadistatud. Veebilehe omanik peab lisama toimiva e-posti aadressi.";
    return;
  }
  const data = new FormData(form);
  const audienceLabel = data.get("audience") === "business" ? "Ettevõte või korteriühistu" : "Eraisik";
  const subject = `Auvõlg OÜ päring — ${String(data.get("interest"))}`;
  const body = [`Päringu esitaja: ${audienceLabel}`, `Teema: ${String(data.get("interest"))}`, `Nimi: ${String(data.get("name"))}`, `E-post: ${String(data.get("email"))}`, "", "Lühikirjeldus:", String(data.get("message") || "(kirjeldus puudub)")].join("\n");
  status.textContent = "Avan e-posti rakenduses kirja mustandi. Kiri saadetakse alles siis, kui vajutad seal „Saada“.";
  status.classList.add("success");
  window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
});
