import { useState } from "react";
import { api } from "../api.js";

export default function LoginView({ expired, onLoggedIn }) {
  const [username, setUsername] = useState("bokflode");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api.login(username, password);
      if (!res?.ok) {
        setError(res?.error || "Kunde inte logga in.");
        return;
      }
      onLoggedIn(res.username);
    } catch {
      setError("Kunde inte nå servern. Försök igen.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-shell">
      <form onSubmit={submit} className="card login-card stack">
        <div>
          <p className="kicker">Bokflöde</p>
          <h1 className="title" style={{ fontSize: "1.75rem" }}>Logga in</h1>
          <p className="lede">
            {expired
              ? "Sessionen har gått ut. Logga in igen för att fortsätta."
              : "Byråns register är skyddat. Ange användarnamn och lösenord."}
          </p>
        </div>
        <label className="lbl">Användarnamn
          <input
            className="field"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="lbl">Lösenord
          <input
            className="field"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        {error && <p className="stamp" role="alert">{error}</p>}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? "Loggar in…" : "Logga in"}
        </button>
      </form>
    </div>
  );
}
