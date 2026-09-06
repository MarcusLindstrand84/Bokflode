import { formatSek } from "../money.js";

export default function BalanceBlock({ title, rows, total }) {
  return (
    <article className="card">
      <h3>{title}</h3>
      <ul className="list-plain">
        {rows.length === 0 && <li className="muted">Inget saldo</li>}
        {rows.map((r) => (
          <li key={r.number}>
            <span>{r.number} {r.name}</span>
            <span className="tabular">{formatSek(r.balance)}</span>
          </li>
        ))}
      </ul>
      {total != null && (
        <p className="row-between" style={{ marginTop: "var(--space-3)", borderTop: "1px solid var(--line)", paddingTop: "var(--space-3)", fontWeight: 600 }}>
          Summa <span className="tabular">{formatSek(total)}</span>
        </p>
      )}
    </article>
  );
}
