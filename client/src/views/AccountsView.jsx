import { useEffect, useState } from "react";
import { api } from "../api.js";
import { typeLabel } from "../money.js";

export default function AccountsView() {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.accounts()
      .then(setRows)
      .catch(() => setError("Kunde inte hämta kontoplanen."));
  }, []);

  return (
    <div className="stack">
      <div>
        <h2>Kontoplan</h2>
        <p className="lede">Förenklad BAS-kontoplan för ett litet bolag. Moms 25 % där det anges.</p>
      </div>
      {error ? (
        <p className="stamp">{error}</p>
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead><tr><th>Konto</th><th>Namn</th><th>Typ</th><th>Moms</th></tr></thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.number}>
                  <td className="tabular" style={{ fontWeight: 600 }}>{a.number}</td>
                  <td>{a.name}</td>
                  <td>{typeLabel(a.type)}</td>
                  <td>{a.vat == null ? "—" : `${a.vat} %`}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
