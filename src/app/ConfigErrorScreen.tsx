export function renderConfigError(container: HTMLElement, message: string): never {
  container.innerHTML = "";
  const root = document.createElement("div");
  root.style.cssText =
    "min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;background:#FFF9ED;color:#202522;";
  const card = document.createElement("div");
  card.style.cssText =
    "max-width:560px;width:100%;border:1px solid #E8E0D0;border-radius:16px;background:#fff;box-shadow:0 20px 60px rgba(101,27,36,0.12);overflow:hidden;";
  const header = document.createElement("div");
  header.style.cssText =
    "padding:24px 28px;background:linear-gradient(135deg,#9F2028 0%,#651B24 100%);color:#fff;";
  const title = document.createElement("h1");
  title.style.cssText = "margin:0;font-family:Playfair Display,serif;font-size:22px;letter-spacing:0.2px;";
  title.textContent = "Nellore Diwali Dhamaka — Configuration Error";
  header.appendChild(title);
  const body = document.createElement("div");
  body.style.cssText = "padding:24px 28px;display:flex;flex-direction:column;gap:12px;";
  const p = document.createElement("p");
  p.style.cssText = "margin:0;font-size:14px;line-height:1.7;";
  p.textContent =
    "This build cannot start safely because its Firebase configuration is missing or points at the wrong project. The application never substitutes sample data.";
  const pre = document.createElement("pre");
  pre.style.cssText =
    "margin:0;padding:16px;border-radius:12px;background:#FFF9ED;border:1px solid #E8E0D0;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;word-break:break-word;";
  pre.textContent = message;
  const help = document.createElement("p");
  help.style.cssText = "margin:0;font-size:13px;color:#6B706D;";
  help.textContent =
    "Check VITE_APP_MODE, the VITE_FIREBASE_* variables and the .firebaserc aliases for this environment, then rebuild. See README → Environments.";
  body.appendChild(p);
  body.appendChild(pre);
  body.appendChild(help);
  card.appendChild(header);
  card.appendChild(body);
  root.appendChild(card);
  container.appendChild(root);
  document.title = "Nellore Diwali Dhamaka — Configuration Error";
  throw new Error(message);
}
