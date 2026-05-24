export default function Skeleton() {
  return (
    <div className="report">
      <p className="meta sk-line" style={{ width: '70%' }}>&nbsp;</p>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <section className="card" key={n}>
          <h2><span className="num">§{n}</span> <span className="sk-text">Loading…</span></h2>
          <div className="stats">
            <div className="stat"><div className="lbl sk-line">&nbsp;</div><div className="val sk-line">&nbsp;</div></div>
            <div className="stat"><div className="lbl sk-line">&nbsp;</div><div className="val sk-line">&nbsp;</div></div>
            <div className="stat"><div className="lbl sk-line">&nbsp;</div><div className="val sk-line">&nbsp;</div></div>
            <div className="stat"><div className="lbl sk-line">&nbsp;</div><div className="val sk-line">&nbsp;</div></div>
          </div>
        </section>
      ))}
    </div>
  );
}
