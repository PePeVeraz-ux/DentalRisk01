'use client';
import { useState } from 'react';
import { DateTime } from 'luxon';

type Row = Record<string, any>;
const money = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 2 }).format(
    n / 100,
  );
const number = (n: number) => new Intl.NumberFormat('es-MX', { maximumFractionDigits: 2 }).format(n);
const minutes = (n: number) =>
  new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
function Comparison({ value }: { value?: Row }) {
  if (!value || value.percent === null) return <small className="comparison">Sin base comparable</small>;
  return (
    <small className="comparison">
      {value.percent > 0 ? '+' : ''}
      {number(value.percent)}% frente al periodo anterior
    </small>
  );
}
function Trend({ rows }: { rows: Row[] }) {
  const [metric, setMetric] = useState('patients');
  const max = Math.max(1, ...rows.map((r) => Number(r[metric])));
  const points = rows.map((r, i) => [
    40 + (i * 620) / Math.max(1, rows.length - 1),
    155 - (Number(r[metric]) / max) * 120,
  ]);
  return (
    <section className="panel trend-panel">
      <div className="panel-heading">
        <div>
          <h2>{metric === 'patients' ? 'Pacientes por día' : 'Evolución del periodo'}</h2>
          <p>Cada día de la zona horaria de la clínica.</p>
        </div>
        <div className="tabs compact" aria-label="Métrica del gráfico">
          {[
            ['patients', 'Pacientes distintos'],
            ['revenue_cents', 'Valor de servicios'],
            ['attentions', 'Atenciones'],
          ].map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={metric === key}
              className={metric === key ? 'selected' : ''}
              onClick={() => setMetric(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      <svg
        className="trend-chart"
        viewBox="0 0 700 195"
        role="img"
        aria-label={
          metric === 'revenue_cents'
            ? 'Evolución diaria del valor de servicios en MXN'
            : metric === 'patients'
              ? 'Pacientes distintos por día'
              : 'Evolución diaria de atenciones completadas'
        }
      >
        <line x1="40" y1="155" x2="660" y2="155" stroke="#cbd9e9" />
        <line x1="40" y1="35" x2="660" y2="35" stroke="#e8eff8" />
        <text x="40" y="20" fill="#526b85" fontSize="11">
          {metric === 'revenue_cents' ? money(max) : number(max)}
        </text>
        {points.length > 0 && (
          <>
            {metric !== 'patients' && (
              <polygon
                points={`${points[0][0]},155 ${points.map((p) => p.join(',')).join(' ')} ${points.at(-1)![0]},155`}
                fill="#dbeafe"
              />
            )}
            {metric !== 'patients' && (
              <polyline
                points={points.map((p) => p.join(',')).join(' ')}
                fill="none"
                stroke="#2563eb"
                strokeWidth="3"
              />
            )}
            {points.map(([cx, cy], i) =>
              metric === 'patients' ? (
                <rect
                  key={rows[i].day}
                  x={cx - Math.min(32, 250 / rows.length)}
                  y={cy}
                  width={Math.min(64, 500 / rows.length)}
                  height={155 - cy}
                  rx="3"
                  fill="#60a5fa"
                >
                  <title>
                    {rows[i].day}: {rows[i].patients} pacientes distintos
                  </title>
                </rect>
              ) : (
                <circle key={rows[i].day} cx={cx} cy={cy} r={rows.length > 45 ? 1.8 : 4} fill="#2563eb">
                  <title>
                    {rows[i].day}: {metric === 'revenue_cents' ? money(rows[i][metric]) : rows[i][metric]}
                  </title>
                </circle>
              ),
            )}
          </>
        )}
        {rows
          .filter(
            (_, i) => i === 0 || i === rows.length - 1 || i % Math.max(1, Math.ceil(rows.length / 5)) === 0,
          )
          .map((r) => (
            <text
              key={r.day}
              x={points[rows.indexOf(r)]?.[0]}
              y="183"
              textAnchor="middle"
              fill="#526b85"
              fontSize="11"
            >
              {r.day.slice(5)}
            </text>
          ))}
      </svg>
      <details>
        <summary>Ver datos diarios</summary>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Atenciones</th>
                <th>Pacientes distintos</th>
                <th>Valor MXN</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.day}>
                  <td>{r.day}</td>
                  <td>{r.attentions}</td>
                  <td>{r.patients}</td>
                  <td>{money(r.revenue_cents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}

export function ExecutiveDashboard({
  report,
  from,
  to,
  filters,
  data,
  role,
  page,
  setup,
  onRange,
  onFilter,
  onNavigate,
  exportQuery,
}: {
  report: Row | null;
  from: string;
  to: string;
  filters: Record<string, string>;
  data: Record<string, Row[]>;
  role: string;
  page: string;
  setup: Row | null;
  onRange: (from: string, to: string) => void;
  onFilter: (key: string, value: string) => void;
  onNavigate: (page: string) => void;
  exportQuery: string;
}) {
  const zone = report?.timezone ?? 'America/Tijuana';
  const own = role === 'DENTIST';
  const [exporting, setExporting] = useState('');
  const [exportError, setExportError] = useState('');
  async function download(format: string) {
    setExporting(format);
    setExportError('');
    try {
      const response = await fetch('/api/v1/reports/export?' + exportQuery + '&format=' + format);
      if (!response.ok) throw new Error('No se pudo generar el archivo. Reintenta conservando los filtros.');
      const url = URL.createObjectURL(await response.blob());
      const link = document.createElement('a');
      link.href = url;
      link.download = `DentalRisk-${from}-${to}.${format}`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'No se pudo descargar el reporte.');
    } finally {
      setExporting('');
    }
  }
  const metrics = [
    ['patients', 'Pacientes distintos', 'Personas distintas en el periodo'],
    ['attentions', 'Atenciones completadas', 'Servicios con entrada y salida'],
    ['revenue_cents', 'Valor de servicios', 'MXN · Servicios completados'],
  ];
  const preset = (key: string) => {
    const today = DateTime.now().setZone(zone).startOf('day');
    if (key === 'last-week') {
      const monday = today.startOf('week');
      onRange(monday.minus({ weeks: 1 }).toISODate()!, monday.minus({ days: 1 }).toISODate()!);
      return;
    }
    onRange(
      (key === 'month'
        ? today.startOf('month')
        : key === 'week'
          ? today.minus({ days: 6 })
          : today
      ).toISODate()!,
      today.toISODate()!,
    );
  };
  return (
    <>
      <div className="period-controls">
        <div className="tabs compact">
          {[
            ['today', 'Hoy'],
            ['week', 'Últimos 7 días'],
            ['month', 'Este mes'],
            ['last-week', 'Semana anterior'],
          ].map(([key, label]) => (
            <button key={key} onClick={() => preset(key)}>
              {label}
            </button>
          ))}
        </div>
        <span className="muted small">
          {from} → {to} · {zone}
        </span>
      </div>
      <div className="toolbar report-filters">
        <label>
          Desde
          <input type="date" value={from} onChange={(e) => onRange(e.target.value, to)} />
        </label>
        <label>
          Hasta
          <input type="date" value={to} onChange={(e) => onRange(from, e.target.value)} />
        </label>
        {(
          [
            ['dentist_id', 'dentists', 'Dentista'],
            ['service_id', 'services', 'Servicio'],
            ['station_id', 'stations', 'Estación'],
            ['shift_id', 'shifts', 'Turno'],
          ] as const
        )
          .filter(([key]) => !own || key !== 'dentist_id')
          .map(([key, source, label]) => (
            <label key={key}>
              {label}
              <select value={filters[key] ?? ''} onChange={(e) => onFilter(key, e.target.value)}>
                <option value="">Todos</option>
                {(data[source] ?? []).map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
      </div>
      {!report ? (
        <div className="panel empty" role="status">
          Cargando indicadores del periodo…
        </div>
      ) : (
        <>
          <div className="kpis executive-kpis">
            {metrics.map(([key, label, description]) => (
              <article className="kpi" key={key}>
                <span>{label}</span>
                <strong>
                  {key === 'revenue_cents'
                    ? money(report.summary[key])
                    : key === 'average_minutes'
                      ? `${number(report.summary[key])} min`
                      : number(report.summary[key])}
                </strong>
                <Comparison value={report.comparison[key]} />
                <small>{description}</small>
              </article>
            ))}
          </div>
          <p className="muted small">
            Comparación: {report.previous_period.from} → {report.previous_period.to}. Un aumento de duración o
            tiempo muerto requiere revisión; no implica una mejora.
          </p>
          {page === 'dashboard' && (
            <>
              <Trend rows={report.trend} />
              <div className="dashboard-grid">
                <section className="panel">
                  <div className="panel-heading">
                    <div>
                      <h2>{own ? 'Mis servicios' : 'Actividad del equipo'}</h2>
                      <p>
                        {own
                          ? 'Distribución de tus atenciones completadas.'
                          : 'Pacientes distintos por dentista. Los empates comparten posición.'}
                      </p>
                    </div>
                  </div>
                  {(own ? report.services : report.ranking).length ? (
                    <div className="bar-chart">
                      {(own ? report.services : report.ranking).map((r: Row) => {
                        const value = own ? r.attentions : r.patients;
                        return (
                          <div className="bar-row" key={r.dentist_id ?? r.service_id}>
                            <span>{r.dentist ?? r.service}</span>
                            <div className="bar-track">
                              <div
                                style={{
                                  width: `${(value / Math.max(1, ...(own ? report.services : report.ranking).map((v: Row) => (own ? v.attentions : v.patients)))) * 100}%`,
                                }}
                              />
                            </div>
                            <strong>{value}</strong>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="empty">Sin atenciones completadas en el periodo seleccionado.</div>
                  )}
                </section>
                <section className="panel insights">
                  <h2>Resumen operativo</h2>
                  <div>
                    <span>Duración promedio</span>
                    <strong>{minutes(report.summary.average_minutes)} min</strong>
                    <small>Servicios completados; comparar por tipo de servicio.</small>
                  </div>
                  <div>
                    <span>Tiempo entre consultas</span>
                    <strong>{minutes(report.summary.idle_minutes)} min</strong>
                    <small>Intervalos observados; excluye descansos y periodos no operados.</small>
                  </div>
                  <div>
                    <span>Pacientes por turno</span>
                    <strong>
                      {report.summary.patients_per_shift === null
                        ? 'No calculable'
                        : number(report.summary.patients_per_shift)}
                    </strong>
                    <small>
                      {report.summary.operated_shifts} turnos operados registrados, incluidos los de cero
                      atenciones.
                    </small>
                  </div>
                  <div>
                    <span>Variación de pacientes por turno</span>
                    <strong>
                      {report.comparison.patients_per_shift.percent === null
                        ? 'No calculable'
                        : `${number(report.comparison.patients_per_shift.percent)}%`}
                    </strong>
                    <small>
                      Requiere periodos operativos comparables; el 15% es una meta, no un resultado
                      garantizado.
                    </small>
                  </div>
                </section>
              </div>
            </>
          )}
          {(page === 'team' || (page === 'dashboard' && !own)) && (
            <section className="panel">
              <div className="panel-heading">
                <div>
                  <h2>Desempeño por dentista</h2>
                  <p>Incluye dentistas sin actividad. Selecciona uno para revisar sus servicios.</p>
                </div>
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Posición</th>
                      <th>Dentista</th>
                      <th>Pacientes</th>
                      <th>Atenciones</th>
                      <th>Promedio min</th>
                      <th>Valor MXN</th>
                      <th>Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...report.dentists]
                      .sort((a: Row, b: Row) => b.patients - a.patients || a.dentist.localeCompare(b.dentist))
                      .map((d: Row) => (
                        <tr key={d.id}>
                          <td>{d.rank ?? '—'}</td>
                          <td>
                            <strong>{d.dentist}</strong>
                            <small className="cell-note">
                              {d.specialty}
                              {!d.active ? ' · Inactivo' : ''}
                            </small>
                          </td>
                          <td>{d.patients}</td>
                          <td>{d.attentions}</td>
                          <td>{d.average_minutes === null ? '—' : minutes(d.average_minutes)}</td>
                          <td>{money(d.revenue_cents)}</td>
                          <td>
                            <button
                              onClick={() => {
                                onFilter('dentist_id', d.id);
                                onNavigate('reports');
                              }}
                            >
                              Ver detalle
                            </button>
                          </td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
              {!report.dentists.length && (
                <div className="empty">Sin dentistas para los filtros seleccionados.</div>
              )}
            </section>
          )}
          <section className="panel">
            <div className="panel-heading">
              <div>
                <h2>{own ? 'Mi productividad por servicio' : 'Productividad por servicio'}</h2>
                <p>Los importes representan el valor operativo; no acreditan cobros ni utilidad.</p>
              </div>
              <div className="actions">
                {['csv', 'pdf', 'xlsx'].map((format) => (
                  <button
                    className="button"
                    key={format}
                    disabled={Boolean(exporting)}
                    onClick={() => download(format)}
                  >
                    {exporting === format
                      ? 'Generando…'
                      : format === 'xlsx'
                        ? 'Excel ↓'
                        : format.toUpperCase() + ' ↓'}
                  </button>
                ))}
              </div>
            </div>
            {exporting && <p role="status">Preparando archivo con el periodo y los filtros seleccionados…</p>}
            {exportError && (
              <p className="alert error" role="alert">
                {exportError}
              </p>
            )}
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Dentista</th>
                    <th>Servicio</th>
                    <th>Atenciones</th>
                    <th>Pacientes</th>
                    <th>Promedio min</th>
                    <th>Valor MXN</th>
                  </tr>
                </thead>
                <tbody>
                  {report.groups.map((g: Row) => (
                    <tr key={g.dentist_id + g.service_id}>
                      <td>{g.dentist}</td>
                      <td>{g.service}</td>
                      <td>{g.attentions}</td>
                      <td>{g.patients}</td>
                      <td>{minutes(g.average_minutes)}</td>
                      <td>{money(g.revenue_cents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!report.groups.length && <div className="empty">Sin servicios completados en este periodo.</div>}
          </section>
          <p className="muted small">
            Actualización:{' '}
            {DateTime.fromISO(report.generated_at).setZone(zone).toFormat('dd/MM/yyyy HH:mm:ss')} ·
            Actualización automática cada 4 segundos. {report.interpretation}
          </p>
        </>
      )}
      {!own && page === 'dashboard' && setup && !setup.configured && (
        <section className="panel setup-panel">
          <h2>Preparación de la clínica</h2>
          <p>Completa la configuración con información validada por la clínica.</p>
          <div className="setup-grid">
            {setup.checks.map((c: Row) => (
              <button key={c.key} onClick={() => onNavigate(c.page)}>
                <span>{c.ready ? '✓' : '○'}</span>
                <span>
                  {c.label}
                  <small>
                    {c.count} registrados · Mínimo {c.minimum}
                  </small>
                </span>
              </button>
            ))}
          </div>
          <p className="muted small">{setup.note}</p>
        </section>
      )}
    </>
  );
}
