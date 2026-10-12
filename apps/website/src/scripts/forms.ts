/**
 * Waitlist and contact forms: validation messages, submission, and clear feedback.
 *
 * Accessibility: errors are linked to their fields (aria-describedby), the first invalid field receives focus, and
 * the result is announced through a polite live region. Privacy: nothing is sent until the visitor presses the
 * button, and only the fields on screen are sent.
 */

interface ApiError {
  error?: { code?: string; message?: string; details?: Array<{ path: string; message: string }> };
}

let apiUrlPromise: Promise<string> | null = null;
/** The API address comes from /config.json at run time, so one build works on any deployment. */
function apiUrl(): Promise<string> {
  apiUrlPromise ??= fetch("/config.json", { cache: "no-cache" })
    .then((r) => (r.ok ? (r.json() as Promise<{ apiUrl?: string }>) : { apiUrl: "" }))
    .then((c) => (c.apiUrl ?? "").replace(/\/+$/, ""))
    .catch(() => "");
  return apiUrlPromise;
}

const FIELD_MESSAGES: Record<string, string> = {
  email: "Please enter a valid email address.",
  name: "Please enter your name.",
  message: "Please write a message of at least a few words.",
  consent: "Please tick the box to continue.",
};

function setFieldError(form: HTMLFormElement, name: string, message: string | null) {
  const field = form.elements.namedItem(name) as HTMLInputElement | null;
  const error = field ? form.querySelector<HTMLElement>(`#${CSS.escape(field.id)}-error`) : null;
  if (!field || !error) return;
  if (message) {
    error.textContent = message;
    error.hidden = false;
    field.setAttribute("aria-invalid", "true");
  } else {
    error.textContent = "";
    error.hidden = true;
    field.removeAttribute("aria-invalid");
  }
}

function showStatus(form: HTMLFormElement, kind: "ok" | "error", message: string) {
  const status = form.querySelector<HTMLElement>("[data-status]");
  if (!status) return;
  status.textContent = message;
  status.className = `form-status form-status--${kind}`;
  status.hidden = false;
}

async function submit(form: HTMLFormElement) {
  const kind = form.dataset.form as "waitlist" | "contact";
  const data = new FormData(form);
  const names = kind === "waitlist" ? ["email", "consent"] : ["name", "email", "message", "consent"];

  // Check the fields ourselves so the messages are consistent and linked to each field.
  let firstInvalid: HTMLElement | null = null;
  for (const name of names) {
    const field = form.elements.namedItem(name) as HTMLInputElement;
    const ok = field instanceof HTMLInputElement && field.type === "checkbox" ? field.checked : field.checkValidity();
    setFieldError(form, name, ok ? null : (FIELD_MESSAGES[name] ?? "Please check this field."));
    if (!ok) firstInvalid ??= field;
  }
  if (firstInvalid) {
    firstInvalid.focus();
    return;
  }

  const button = form.querySelector<HTMLButtonElement>('button[type="submit"]')!;
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Sending…";

  try {
    const base = await apiUrl();
    if (!base) {
      showStatus(form, "error", "The sign-up service is not connected yet. Please try again later.");
      return;
    }
    const body: Record<string, unknown> = Object.fromEntries(data.entries());
    body.consent = true;
    if (kind === "waitlist") body.source = location.pathname;
    for (const key of Object.keys(body)) if (body[key] === "") delete body[key];

    const response = await fetch(`${base}/v1/public/${kind}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

    if (response.status === 204) {
      form.reset();
      showStatus(form, "ok", kind === "waitlist" ? "Thank you! You are on the list. We will email you when early access opens." : "Thank you! Your message has been sent. We will reply by email.");
      return;
    }
    if (response.status === 429) {
      showStatus(form, "error", "Too many attempts from your connection. Please wait a minute and try again.");
      return;
    }
    if (response.status === 400) {
      const parsed = (await response.json().catch(() => ({}))) as ApiError;
      let focused = false;
      for (const detail of parsed.error?.details ?? []) {
        if (names.includes(detail.path)) {
          setFieldError(form, detail.path, FIELD_MESSAGES[detail.path] ?? detail.message);
          if (!focused) (form.elements.namedItem(detail.path) as HTMLElement | null)?.focus();
          focused = true;
        }
      }
      showStatus(form, "error", "Please check the highlighted fields and try again.");
      return;
    }
    showStatus(form, "error", "Sorry, something went wrong on our side. Please try again in a moment.");
  } catch {
    showStatus(form, "error", "We could not reach the server. Please check your connection and try again.");
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

document.querySelectorAll<HTMLFormElement>("form[data-form]").forEach((form) => {
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit(form);
  });
  // Clear an error as soon as the person starts fixing the field.
  form.addEventListener("input", (event) => {
    const target = event.target as HTMLInputElement;
    if (target.name) setFieldError(form, target.name, null);
  });
});
