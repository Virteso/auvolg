const menuButton = document.querySelector<HTMLButtonElement>(".menu");
const nav = document.querySelector<HTMLElement>("#nav");
const form = document.querySelector<HTMLFormElement>("#contact-form");
// Don't name this `status`: `window.status` is a legacy string property and
// non-minified builds would assign into it instead of creating a local binding.
const formStatus = document.getElementById("form-status");
const audience = document.querySelector<HTMLSelectElement>("#audience");
const year = document.querySelector<HTMLElement>("#year");
const submitButton = form?.querySelector<HTMLButtonElement>("button[type=submit]");

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

// Send each submission exactly once, then block resubmits for a cooldown.
const COOLDOWN_MINUTES=0.1
const COOLDOWN_MS = COOLDOWN_MINUTES * 60 * 1000;
const LAST_SENT_KEY = "contactLastSent";
// Storage can be blocked (privacy modes, sandboxed frames). The cooldown is
// best-effort and must never stop the form handler from being registered.
const readLastSent = (): number => {
  try {
    return Number(localStorage.getItem(LAST_SENT_KEY) ?? 0);
  } catch {
    return 0;
  }
};
const writeLastSent = (value: number) => {
  try {
    localStorage.setItem(LAST_SENT_KEY, String(value));
  } catch {
    // Ignore: sending still works without a local cooldown.
  }
};
const cooldownLeft = (): number => {
  const elapsed = Date.now() - readLastSent();
  return elapsed >= COOLDOWN_MS ? 0 : Math.ceil((COOLDOWN_MS - elapsed) / 1000);
};
const fmtWait = (s: number) =>
  s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} sek`;

const setBusy = (busy: boolean) => {
  if (submitButton) submitButton.disabled = busy;
  form?.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>("input, select, textarea")
    .forEach(el => { el.disabled = busy; });
};

const applyCooldown = () => {
  if (!formStatus || !submitButton) return;
  const secs = cooldownLeft();
  if (secs > 0 && submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = `Kiri saadetud — uus võimalik ${fmtWait(secs)} pärast`;
  }
};

applyCooldown();
setInterval(applyCooldown, 1000);

form?.addEventListener("submit", async event => {
  event.preventDefault();
  if (!formStatus) return;
  if (cooldownLeft() > 0) return;
  formStatus.classList.remove("success");
  if (!form.reportValidity()) {
    formStatus.textContent = "Palun täida nõutud väljad ja anna andmete kasutamiseks nõusolek.";
    return;
  }

  const data = new FormData(form);
  const payload = {
    audience: String(data.get("audience") ?? ""),
    interest: String(data.get("interest") ?? ""),
    name: String(data.get("name") ?? ""),
    email: String(data.get("email") ?? ""),
    message: String(data.get("message") ?? ""),
    consent: (data.get("consent") ?? "") !== "",
  };

  setBusy(true);
  formStatus.textContent = "Saadan kirja…";

  try {
    // Abort if the relay hangs; nginx/mailer timeouts complement this.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 35_000);
    const response = await fetch("/api/contact", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (response.ok) {
      writeLastSent(Date.now());
      formStatus.textContent = "Kiri on saadetud. Vastame esimesel võimalusel.";
      formStatus.classList.add("success");
      form.reset();
    } else {
      const err = (await response.json().catch(() => ({}))) as { error?: string };
      const messages: Record<number, string> = {
        400: "Palun kontrolli sisestatud andmeid.",
        429: "Liiga palju päringuid lühikese aja jooksul. Proovi hiljem uuesti.",
        502: "Kirja saatmine ebaõnnestus. Proovi mõne minuti pärast või kirjuta otse e-postile.",
        503: "Server on hetkel kättesaamatu. Proovi mõne minuti pärast uuesti.",
      };
      formStatus.textContent = messages[response.status] ?? "Midagi läks valesti. Proovi hiljem uuesti.";
      if (err.error === "consent_required") formStatus.textContent = "Palun anna andmete kasutamiseks nõusolek.";
    }
  } catch {
    formStatus.textContent = "Võrguvea. Kontrolli ühendust ja proovi uuesti.";
  } finally {
    setBusy(false);
    applyCooldown();
  }
});
