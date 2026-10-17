import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { SALES } from "@/data/sales";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Painel de Vendas Porsche — Dashboard comercial" },
      { name: "description", content: "Dashboard interativo de vendas Porsche: o que vende, onde e quando." },
      { property: "og:title", content: "Painel de Vendas Porsche" },
      { property: "og:description", content: "O que vende, onde e quando — dashboard para gestores comerciais." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

const TODAY = "2026-10-17";
const LINES = ["911", "718", "Cayenne", "Macan", "Panamera", "Taycan"] as const;
type Fuel = "Gasolina" | "Híbrido" | "Elétrico";

const lineOf = (m: string) => LINES.find((l) => m.startsWith(l)) ?? "Outros";
const fuelOf = (m: string): Fuel =>
  /e-hybrid/i.test(m) ? "Híbrido" : /electric/i.test(m) || m.startsWith("Taycan") ? "Elétrico" : "Gasolina";

const DATA = SALES.map(([id, date, model, year, price, pay, city, state, status]) => ({
  id, date, model, year, price, pay, city, state, status,
  line: lineOf(model), fuel: fuelOf(model), future: date > TODAY,
}));
type Sale = (typeof DATA)[number];

const usd = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const usdShort = (n: number) =>
  n >= 1e6 ? `US$ ${(n / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 2 })} mi` : usd(n);
const uniq = <T,>(a: T[]) => [...new Set(a)].sort();
const leaders = (rows: Sale[], key: (s: Sale) => string | number) => {
  const m = new Map<string | number, number>();
  rows.forEach((r) => m.set(key(r), (m.get(key(r)) ?? 0) + 1));
  const max = Math.max(0, ...m.values());
  return { max, names: [...m].filter(([, v]) => v === max).map(([k]) => k), map: m };
};
const PT_STATUS: Record<string, string> = {
  Delivered: "Entregue", Pending: "Pendente", "In Transit": "Em trânsito", Cancelled: "Cancelada",
  "Awaiting Delivery": "Aguardando entrega", "Pending Approval": "Aguardando aprovação", Shipped: "Despachada",
  "Awaiting Pickup": "Aguardando retirada", "Pending Review": "Em análise", "Awaiting Review": "Aguardando análise",
};
const STATUS_MODES = { active: "Excluir canceladas", all: "Todas", delivered: "Somente entregues", cancelled: "Somente canceladas" };

const EMPTY = { line: "", model: "", year: "", city: "", pay: "", from: "", to: "", status: "active", future: "flag" };

function Index() {
  const [f, setF] = useState(EMPTY);
  const [dark, setDark] = useState(false);
  useEffect(() => { document.documentElement.classList.toggle("dark", dark); }, [dark]);
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setF((p) => ({ ...p, [k]: e.target.value }));

  const rows = useMemo(() => DATA.filter((s) =>
    (!f.line || s.line === f.line) && (!f.model || s.model === f.model) && (!f.year || String(s.year) === f.year) &&
    (!f.city || s.city === f.city) && (!f.pay || s.pay === f.pay) && (!f.from || s.date >= f.from) && (!f.to || s.date <= f.to) &&
    (f.status === "all" || (f.status === "active" && s.status !== "Cancelled") || (f.status === "delivered" && s.status === "Delivered") || (f.status === "cancelled" && s.status === "Cancelled")) &&
    (f.future !== "exclude" || !s.future)
  ), [f]);

  const revenue = rows.reduce((a, r) => a + r.price, 0);
  const ticket = rows.length ? revenue / rows.length : 0;
  const topModel = leaders(rows, (r) => r.model);
  const topYear = leaders(rows, (r) => r.year);
  const futureCount = rows.filter((r) => r.future).length;
  const models = uniq(DATA.filter((s) => !f.line || s.line === f.line).map((s) => s.model));

  const cities = useMemo(() => {
    const g = new Map<string, Sale[]>();
    rows.forEach((r) => g.set(r.city, [...(g.get(r.city) ?? []), r]));
    return [...g].map(([city, rs]) => ({ city, state: rs[0].state, n: rs.length, rev: rs.reduce((a, r) => a + r.price, 0), top: leaders(rs, (r) => r.model).names as string[] }))
      .sort((a, b) => b.n - a.n || b.rev - a.rev);
  }, [rows]);

  const insights = useMemo(() => {
    if (!rows.length) return [];
    const out: string[] = [];
    const topC = cities.filter((c) => c.n === cities[0].n);
    out.push(topC.length > 3
      ? `${topC.length} cidades empatam na liderança com ${cities[0].n} venda(s) cada — nenhuma se destaca isoladamente.`
      : `Cidade de destaque: ${topC.map((c) => c.city).join(", ")} com ${cities[0].n} venda(s).`);
    const tl = leaders(rows, (r) => r.line);
    out.push(`Linha mais popular: ${tl.names.join(", ")} (${tl.max} vendas, ${Math.round((tl.max / rows.length) * 100)}% do total). Modelo líder: ${topModel.names.join(", ")} (${topModel.max}).`);
    const tp = leaders(rows, (r) => r.pay);
    out.push(`Forma de pagamento preferida: ${tp.names.join(", ")} (${Math.round((tp.max / rows.length) * 100)}% das vendas).`);
    const bt = [...cities].sort((a, b) => b.rev / b.n - a.rev / a.n)[0];
    out.push(`Maior ticket médio por cidade: ${bt.city} (${usd(bt.rev / bt.n)}, ${bt.n} venda${bt.n > 1 ? "s" : ""}).`);
    const avg = rows.length / cities.length;
    out.push(`Pulverização ${avg < 1.6 ? "alta" : avg < 3 ? "moderada" : "baixa"}: ${rows.length} vendas em ${cities.length} cidades (média de ${avg.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} por cidade).`);
    if (cities[0].n <= 3) out.push(`Atenção: a amostra por cidade é pequena (máx. ${cities[0].n} vendas); rankings de cidade não são estatisticamente conclusivos.`);
    if (futureCount) out.push(`${futureCount} venda(s) têm data posterior a ${new Date(TODAY).toLocaleDateString("pt-BR", { timeZone: "UTC" })} e são tratadas como projeção.`);
    return out;
  }, [rows, cities, topModel, futureCount]);

  const lineCards = LINES.map((l) => {
    const rs = rows.filter((r) => r.line === l || (f.line && f.line !== l && false));
    const base = f.line && f.line !== l ? [] : rs;
    return { l, n: base.length, ticket: base.length ? base.reduce((a, r) => a + r.price, 0) / base.length : 0, fuels: uniq(DATA.filter((d) => d.line === l).map((d) => d.fuel)) };
  });

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="fixed inset-x-0 top-0 z-50 border-b border-ink-border bg-ink/80 text-ink-foreground backdrop-blur-md" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-6">
          <span className="w-20 text-[0.65rem] uppercase tracking-[0.3em] text-ink-muted">Dashboard</span>
          <span className="text-lg font-bold tracking-[0.45em]">PORSCHE</span>
          <div className="flex w-20 justify-end gap-4">
            <button aria-label="Alternar tema" onClick={() => setDark((d) => !d)} className="opacity-80 transition hover:opacity-100">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="5" /><path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" /></svg>
            </button>
            <a href="#filtros" aria-label="Buscar" className="opacity-80 transition hover:opacity-100">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
            </a>
            <span aria-label="Conta" className="opacity-80">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>
            </span>
          </div>
        </div>
      </header>

      <section className="relative flex min-h-screen items-end overflow-hidden bg-hero text-ink-foreground">
        <svg className="pointer-events-none absolute -right-40 top-1/4 w-[900px] opacity-[0.07]" viewBox="0 0 900 300" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M40 230c40-10 70-60 160-90 120-40 230-60 330-40 80 16 160 60 230 80 50 14 90 30 100 50" />
          <path d="M60 240h800" /><circle cx="230" cy="240" r="48" /><circle cx="690" cy="240" r="48" />
        </svg>
        <div className="relative mx-auto w-full max-w-7xl px-6 pb-24 pt-32">
          <p className="eyebrow text-ink-muted">Relatório comercial · 2024 – 2027</p>
          <h1 className="mt-6 text-6xl font-black tracking-tight md:text-8xl">Painel de Vendas</h1>
          <p className="mt-6 max-w-xl text-lg text-ink-muted">O que vende, onde e quando — uma leitura precisa do desempenho da rede.</p>
          <a href="#filtros" className="mt-10 inline-flex items-center gap-3 border border-ink-border px-8 py-4 text-xs uppercase tracking-[0.25em] transition duration-500 hover:border-ink-foreground hover:bg-ink-foreground hover:text-ink">
            Explorar vendas <span aria-hidden>→</span>
          </a>
          <div className="mt-20 grid max-w-3xl grid-cols-3 gap-8 border-t border-ink-border pt-8">
            {[["Vendas", rows.length.toString()], ["Receita", usdShort(revenue)], ["Ticket médio", usd(ticket)]].map(([k, v]) => (
              <div key={k}><p className="text-[0.65rem] uppercase tracking-[0.22em] text-ink-muted">{k}</p><p className="mt-2 text-2xl font-bold md:text-3xl">{v}</p></div>
            ))}
          </div>
        </div>
      </section>

      <main className="mx-auto max-w-7xl px-6">
        <section id="filtros" className="scroll-mt-20 py-16">
          <div className="flex items-end justify-between gap-4">
            <div><p className="eyebrow">Filtros</p><h2 className="mt-2 text-3xl font-black tracking-tight">Refine a análise</h2></div>
            <button onClick={() => setF(EMPTY)} className="border border-foreground px-5 py-2.5 text-xs uppercase tracking-[0.2em] transition hover:bg-foreground hover:text-background">Limpar filtros</button>
          </div>
          <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-6 md:grid-cols-4 lg:grid-cols-8">
            <Sel label="Linha" v={f.line} on={(e) => setF((p) => ({ ...p, line: e.target.value, model: "" }))} opts={[...LINES]} />
            <Sel label="Modelo" v={f.model} on={set("model")} opts={models} />
            <Sel label="Ano-modelo" v={f.year} on={set("year")} opts={uniq(DATA.map((d) => String(d.year)))} />
            <Sel label="Cidade" v={f.city} on={set("city")} opts={uniq(DATA.map((d) => d.city))} />
            <Sel label="Pagamento" v={f.pay} on={set("pay")} opts={uniq(DATA.map((d) => d.pay))} />
            <label><span className="eyebrow">De</span><input type="date" className="field" value={f.from} onChange={set("from")} /></label>
            <label><span className="eyebrow">Até</span><input type="date" className="field" value={f.to} onChange={set("to")} /></label>
            <label><span className="eyebrow">Status</span>
              <select className="field" value={f.status} onChange={set("status")}>{Object.entries(STATUS_MODES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
            </label>
          </div>
          <div className="mt-6 flex gap-6 text-xs">
            <span className="eyebrow self-center">Datas futuras</span>
            {[["flag", "Sinalizar como projeção"], ["exclude", "Excluir"]].map(([k, v]) => (
              <button key={k} onClick={() => setF((p) => ({ ...p, future: k }))} className={`border-b pb-1 uppercase tracking-[0.15em] transition ${f.future === k ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>{v}</button>
            ))}
          </div>
        </section>

        <section className="grid grid-cols-2 border-y md:grid-cols-5">
          {[
            ["Total de vendas", rows.length.toString()],
            ["Receita", usdShort(revenue)],
            ["Ticket médio", usd(ticket)],
            ["Modelo líder", rows.length ? topModel.names.slice(0, 2).join(" · ") + (topModel.names.length > 2 ? ` +${topModel.names.length - 2}` : "") : "—"],
            ["Ano-modelo líder", rows.length ? topYear.names.join(" · ") : "—"],
          ].map(([k, v], i) => (
            <div key={k} className={`py-8 pr-4 ${i ? "md:border-l md:pl-6" : ""}`}>
              <p className="eyebrow">{k}</p><p className="mt-3 text-2xl font-black tracking-tight">{v}</p>
            </div>
          ))}
        </section>

        {!rows.length ? (
          <div className="py-32 text-center">
            <p className="eyebrow">Sem resultados</p>
            <p className="mt-4 text-2xl font-bold">Nenhuma venda corresponde aos filtros selecionados.</p>
            <button onClick={() => setF(EMPTY)} className="mt-8 border border-foreground px-6 py-3 text-xs uppercase tracking-[0.2em] transition hover:bg-foreground hover:text-background">Limpar filtros</button>
          </div>
        ) : (
          <>
            <section className="py-20">
              <p className="eyebrow">Linhas</p><h2 className="mt-2 text-3xl font-black tracking-tight">Modelos</h2>
              <div className="mt-10 grid gap-px border bg-border sm:grid-cols-2 lg:grid-cols-3">
                {lineCards.map((c) => (
                  <button key={c.l} onClick={() => setF((p) => ({ ...p, line: p.line === c.l ? "" : c.l, model: "" }))}
                    className={`group relative overflow-hidden bg-background p-8 text-left transition ${f.line === c.l ? "outline outline-2 -outline-offset-2 outline-accent" : ""}`}>
                    <div className="absolute inset-0 bg-card-grad opacity-0 transition duration-500 group-hover:opacity-100" />
                    <div className="relative transition duration-500 group-hover:scale-[1.03]">
                      <div className="flex flex-wrap gap-2">{c.fuels.map((fu) => <span key={fu} className={`border px-2 py-0.5 text-[0.6rem] uppercase tracking-[0.18em] ${fu === "Gasolina" ? "text-muted-foreground" : "border-accent text-accent"}`}>{fu}</span>)}</div>
                      <h3 className="mt-8 text-5xl font-black tracking-tight">{c.l}</h3>
                      <div className="mt-8 flex gap-10">
                        <div><p className="eyebrow">Vendas</p><p className="mt-1 text-xl font-bold">{c.n}</p></div>
                        <div><p className="eyebrow">Ticket médio</p><p className="mt-1 text-xl font-bold">{c.n ? usd(c.ticket) : "—"}</p></div>
                      </div>
                      <p className="mt-8 text-xs uppercase tracking-[0.2em] text-muted-foreground transition group-hover:text-foreground">{f.line === c.l ? "Remover filtro ×" : "Explorar →"}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>

            <section className="grid gap-12 border-t py-20 lg:grid-cols-5">
              <div className="lg:col-span-3"><p className="eyebrow">Evolução</p><h2 className="mt-2 text-2xl font-black tracking-tight">Volume mensal e receita acumulada</h2><MonthlyChart rows={rows} dark={dark} /></div>
              <div className="lg:col-span-2"><p className="eyebrow">Ano-modelo</p><h2 className="mt-2 text-2xl font-black tracking-tight">Vendas por ano-modelo</h2><YearChart rows={rows} dark={dark} leaders={topYear.names as number[]} /></div>
            </section>

            <section className="grid gap-12 border-t py-20 lg:grid-cols-5">
              <div className="lg:col-span-3">
                <p className="eyebrow">Por cidade</p><h2 className="mt-2 text-2xl font-black tracking-tight">Desempenho regional</h2>
                <div className="mt-8 max-h-[520px] overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-background"><tr className="border-b text-left">{["Cidade", "Vendas", "Receita", "Modelo(s) líder(es)"].map((h) => <th key={h} className="eyebrow py-3 pr-4">{h}</th>)}</tr></thead>
                    <tbody>{cities.map((c) => (
                      <tr key={c.city} className="border-b transition hover:bg-muted">
                        <td className="py-3 pr-4 font-semibold">{c.city} <span className="text-xs text-muted-foreground">{c.state}</span></td>
                        <td className="py-3 pr-4">{c.n}</td><td className="py-3 pr-4">{usd(c.rev)}</td>
                        <td className="py-3 text-muted-foreground">{c.top.join(" · ")}{c.top.length > 1 && <span className="ml-2 text-[0.6rem] uppercase tracking-widest text-accent">empate</span>}</td>
                      </tr>))}</tbody>
                  </table>
                </div>
              </div>
              <div className="lg:col-span-2">
                <p className="eyebrow">Insights</p><h2 className="mt-2 text-2xl font-black tracking-tight">Leitura automática</h2>
                <ol className="mt-8 space-y-6">{insights.map((t, i) => (
                  <li key={i} className="flex gap-4 border-b pb-6"><span className="text-xs font-bold text-accent">{String(i + 1).padStart(2, "0")}</span><p className="leading-relaxed">{t}</p></li>
                ))}</ol>
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="bg-ink text-ink-muted">
        <div className="mx-auto grid max-w-7xl gap-8 px-6 py-16 text-sm md:grid-cols-3">
          <div><p className="text-lg font-bold tracking-[0.45em] text-ink-foreground">PORSCHE</p><p className="mt-4">Painel interno de demonstração. Não oficial; sem uso de marcas ou imagens da Porsche AG.</p></div>
          <div><p className="text-[0.65rem] uppercase tracking-[0.22em] text-ink-foreground">Moeda e dados</p><p className="mt-3">Valores em dólares americanos (US$) no formato pt-BR. Base: 100 vendas de 14/03/2024 a 01/10/2027. Canceladas (7) excluídas por padrão, com filtro de status. Datas após 17/10/2026 são sinalizadas como projeção.</p></div>
          <div><p className="text-[0.65rem] uppercase tracking-[0.22em] text-ink-foreground">Classificação</p><p className="mt-3">Linha: prefixo do nome do modelo. Motorização: “E-Hybrid” → Híbrido; “Electric” ou linha Taycan → Elétrico; demais → Gasolina (a planilha não traz essa coluna).</p></div>
        </div>
      </footer>
    </div>
  );
}

function Sel({ label, v, on, opts }: { label: string; v: string; on: (e: { target: { value: string } }) => void; opts: string[] }) {
  return (
    <label><span className="eyebrow">{label}</span>
      <select className="field" value={v} onChange={on}><option value="">Todos</option>{opts.map((o) => <option key={o}>{o}</option>)}</select>
    </label>
  );
}

const cssVar = (n: string) => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

function useChart(build: (C: typeof import("chart.js").Chart) => import("chart.js").ChartConfiguration, deps: unknown[]) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let chart: import("chart.js").Chart | undefined;
    let dead = false;
    import("chart.js/auto").then(({ default: C }) => {
      if (dead || !ref.current) return;
      C.defaults.font.family = "Archivo, sans-serif";
      C.defaults.color = cssVar("--muted-foreground");
      C.defaults.borderColor = cssVar("--border");
      chart = new C(ref.current, build(C));
    });
    return () => { dead = true; chart?.destroy(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return ref;
}

function MonthlyChart({ rows, dark }: { rows: Sale[]; dark: boolean }) {
  const ref = useChart(() => {
    const m = new Map<string, { n: number; rev: number; fut: boolean }>();
    [...rows].sort((a, b) => a.date.localeCompare(b.date)).forEach((r) => {
      const k = r.date.slice(0, 7); const o = m.get(k) ?? { n: 0, rev: 0, fut: false };
      m.set(k, { n: o.n + 1, rev: o.rev + r.price, fut: o.fut || r.future });
    });
    const keys = [...m.keys()]; let acc = 0;
    const fg = cssVar("--foreground"), red = cssVar("--accent"), mute = cssVar("--input");
    return {
      type: "bar",
      data: {
        labels: keys.map((k) => { return `${k.slice(5)}/${k.slice(2, 4)}`; }),
        datasets: [
          { type: "bar", label: "Vendas", data: keys.map((k) => m.get(k)!.n), backgroundColor: keys.map((k) => (m.get(k)!.fut ? mute : fg)), yAxisID: "y", barPercentage: 0.6 },
          { type: "line", label: "Receita acumulada", data: keys.map((k) => (acc += m.get(k)!.rev)), borderColor: red, borderWidth: 2, pointRadius: 0, tension: 0.3, yAxisID: "y1" },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: "index", intersect: false },
        plugins: { legend: { labels: { boxWidth: 10 } }, tooltip: { callbacks: { label: (c) => c.datasetIndex ? `Receita acumulada: ${usd(c.parsed.y ?? 0)}` : `Vendas: ${c.parsed.y}${m.get(keys[c.dataIndex] ?? "")?.fut ? " (projeção)" : ""}` } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } }, y1: { position: "right", grid: { display: false }, ticks: { callback: (v) => usdShort(Number(v)) } } },
      },
    } as import("chart.js").ChartConfiguration;
  }, [rows, dark]);
  return <div className="mt-8 h-80"><canvas ref={ref} /><p className="mt-2 text-xs text-muted-foreground">Barras claras = meses com vendas projetadas (data futura).</p></div>;
}

function YearChart({ rows, dark, leaders: lead }: { rows: Sale[]; dark: boolean; leaders: number[] }) {
  const ref = useChart(() => {
    const m = new Map<number, number>(); rows.forEach((r) => m.set(r.year, (m.get(r.year) ?? 0) + 1));
    const keys = [...m.keys()].sort();
    return {
      type: "bar",
      data: { labels: keys.map(String), datasets: [{ label: "Vendas", data: keys.map((k) => m.get(k)!), backgroundColor: keys.map((k) => (lead.includes(k) ? cssVar("--accent") : cssVar("--foreground"))), barPercentage: 0.6 }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true, ticks: { precision: 0 } } } },
    } as import("chart.js").ChartConfiguration;
  }, [rows, dark, lead.join()]);
  return <div className="mt-8 h-80"><canvas ref={ref} /></div>;
}
